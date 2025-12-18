// middleware.ts
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const IS_PRODUCTION = process.env.NODE_ENV === "production"

// ================================
// 1) RATE LIMIT (PIX)
// ================================
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 60

type RateLimitInfo = {
  count: number
  firstRequestTime: number
  lastSeenTime: number
}

const rateLimitStore = new Map<string, RateLimitInfo>()

function getClientIp(req: NextRequest): string | null {
  const cf = req.headers.get("cf-connecting-ip")
  if (cf) return cf.trim()

  const xri = req.headers.get("x-real-ip")
  if (xri) return xri.trim()

  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()

  // @ts-ignore
  const ip = (req as any).ip
  if (ip && typeof ip === "string") return ip

  return null
}

function cleanupStore(now: number) {
  const maxAge = RATE_LIMIT_WINDOW_MS * 2
  for (const [key, info] of rateLimitStore.entries()) {
    if (now - info.lastSeenTime > maxAge) {
      rateLimitStore.delete(key)
    }
  }
}

function applyRateLimit(req: NextRequest): NextResponse | null {
  if (req.method === "OPTIONS") return null

  const ip = getClientIp(req)
  if (!ip) return null

  const path = req.nextUrl.pathname
  const key = `${ip}:${path}`
  const now = Date.now()

  cleanupStore(now)

  const existing = rateLimitStore.get(key)

  if (!existing) {
    rateLimitStore.set(key, { count: 1, firstRequestTime: now, lastSeenTime: now })
    return null
  }

  existing.lastSeenTime = now
  const elapsed = now - existing.firstRequestTime

  if (elapsed > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { count: 1, firstRequestTime: now, lastSeenTime: now })
    return null
  }

  existing.count += 1

  if (existing.count > RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSec = Math.ceil((RATE_LIMIT_WINDOW_MS - elapsed) / 1000)

    if (!IS_PRODUCTION) {
      console.warn("RATE LIMIT atingido em /api/pagamento/pix:", {
        ip,
        path,
        count: existing.count,
        windowMs: RATE_LIMIT_WINDOW_MS,
        retryAfterSec,
      })
    }

    return NextResponse.json(
      { ok: false, error: "Muitas requisições em um curto período. Tente novamente em instantes." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
          "Cache-Control": "no-store",
        },
      },
    )
  }

  return null
}

// ================================
// 2) AUTH /DASH (COOKIE ASSINADO) - EDGE SAFE
// ================================
const DASH_COOKIE_NAME = "dash_admin"

function base64UrlToBytes(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4)
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let hex = ""
  for (let i = 0; i < u8.length; i++) hex += u8[i].toString(16).padStart(2, "0")
  return hex
}

function timingSafeEqualHex(aHex: string, bHex: string) {
  if (!aHex || !bHex) return false
  if (aHex.length !== bHex.length) return false
  let out = 0
  for (let i = 0; i < aHex.length; i++) out |= aHex.charCodeAt(i) ^ bHex.charCodeAt(i)
  return out === 0
}

async function hmacSha256Hex(payloadB64Url: string, secret: string) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64Url))
  return bytesToHex(sig)
}

async function verifyDashToken(token: string, secret: string) {
  try {
    const [payloadB64, sigHex] = String(token || "").split(".")
    if (!payloadB64 || !sigHex) return null

    const expectedHex = await hmacSha256Hex(payloadB64, secret)
    if (!timingSafeEqualHex(expectedHex, sigHex)) return null

    const payloadBytes = base64UrlToBytes(payloadB64)
    const json = new TextDecoder().decode(payloadBytes)
    const data = JSON.parse(json) as { u: string; exp: number; iat: number }

    if (!data?.exp || Date.now() > Number(data.exp)) return null
    return data
  } catch {
    return null
  }
}

async function protectDash(req: NextRequest): Promise<NextResponse | null> {
  const { pathname } = req.nextUrl

  const isDash = pathname.startsWith("/dash")
  const isDashLogin = pathname === "/dash/login"
  const isDashApiLogin = pathname === "/api/dash/login"
  const isDashApi = pathname.startsWith("/api/dash")

  if (!isDash && !isDashApi) return null
  if (isDashLogin || isDashApiLogin) return null

  const secret = String(process.env.DASH_TOKEN_SECRET || "").trim()
  if (!secret) {
    const url = req.nextUrl.clone()
    url.pathname = "/dash/login"
    url.searchParams.set("e", "missing_secret")
    return NextResponse.redirect(url)
  }

  const token = req.cookies.get(DASH_COOKIE_NAME)?.value || ""
  const decoded = await verifyDashToken(token, secret)

  if (!decoded) {
    const url = req.nextUrl.clone()
    url.pathname = "/dash/login"
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  return null
}

// ================================
// MIDDLEWARE
// ================================
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith("/api/pagamento/pix")) {
    const limited = applyRateLimit(req)
    if (limited) return limited
  }

  const dashProtected = await protectDash(req)
  if (dashProtected) return dashProtected

  return NextResponse.next()
}

export const config = {
  matcher: ["/api/pagamento/pix/:path*", "/dash/:path*", "/api/dash/:path*"],
}
