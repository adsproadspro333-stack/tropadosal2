// middleware.ts
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const IS_PRODUCTION = process.env.NODE_ENV === "production"

// Janela de rate limit: 60s
const RATE_LIMIT_WINDOW_MS = 60_000

// Limite por IP por minuto na rota de pagamento
// (60/min é bem acima do normal; se quiser mais liberdade, sobe pra 120)
const RATE_LIMIT_MAX_REQUESTS = 60

type RateLimitInfo = {
  count: number
  firstRequestTime: number
  lastSeenTime: number
}

// Memória simples por instância
const rateLimitStore = new Map<string, RateLimitInfo>()

function getClientIp(req: NextRequest): string | null {
  const cf = req.headers.get("cf-connecting-ip")
  if (cf) return cf.trim()

  const xri = req.headers.get("x-real-ip")
  if (xri) return xri.trim()

  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()

  // fallback (nem sempre existe no edge)
  // @ts-ignore
  const ip = (req as any).ip
  if (ip && typeof ip === "string") return ip

  return null
}

function cleanupStore(now: number) {
  // remove entradas velhas (>= 2 janelas)
  const maxAge = RATE_LIMIT_WINDOW_MS * 2
  for (const [key, info] of rateLimitStore.entries()) {
    if (now - info.lastSeenTime > maxAge) {
      rateLimitStore.delete(key)
    }
  }
}

function applyRateLimit(req: NextRequest): NextResponse | null {
  // Não limitar preflight
  if (req.method === "OPTIONS") return null

  const ip = getClientIp(req)
  if (!ip) return null

  const path = req.nextUrl.pathname
  const key = `${ip}:${path}`
  const now = Date.now()

  cleanupStore(now)

  const existing = rateLimitStore.get(key)

  if (!existing) {
    rateLimitStore.set(key, {
      count: 1,
      firstRequestTime: now,
      lastSeenTime: now,
    })
    return null
  }

  existing.lastSeenTime = now

  const elapsed = now - existing.firstRequestTime

  if (elapsed > RATE_LIMIT_WINDOW_MS) {
    // reseta janela
    rateLimitStore.set(key, {
      count: 1,
      firstRequestTime: now,
      lastSeenTime: now,
    })
    return null
  }

  existing.count += 1

  if (existing.count > RATE_LIMIT_MAX_REQUESTS) {
    // Melhor prática: manda Retry-After
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
      {
        ok: false,
        error: "Muitas requisições em um curto período. Tente novamente em instantes.",
      },
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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ⚠️ MUITO IMPORTANTE:
  // NÃO redirecionar HTTPS em rota de API de pagamento (pode quebrar POST / body)
  // Se você quiser forçar https no site, faça isso no domínio/proxy, não aqui.

  // Rate limit APENAS na rota de pagamento
  if (pathname.startsWith("/api/pagamento/pix")) {
    const limited = applyRateLimit(req)
    if (limited) return limited
  }

  return NextResponse.next()
}

// Matcher: roda só no que interessa (e cobre variações)
export const config = {
  matcher: ["/api/pagamento/pix/:path*"],
}
