import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const IS_PRODUCTION = process.env.NODE_ENV === "production"

// Janela de rate limit: 60 segundos
const RATE_LIMIT_WINDOW_MS = 60_000
// Limite por IP por minuto na rota de pagamento
const RATE_LIMIT_MAX_REQUESTS = 60

type RateLimitInfo = {
  count: number
  firstRequestTime: number
}

// Memória simples por instância (ok p/ flood básico)
const rateLimitStore = new Map<string, RateLimitInfo>()

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()

  const realIp = req.headers.get("x-real-ip")
  if (realIp) return realIp.trim()

  const cf = req.headers.get("cf-connecting-ip")
  if (cf) return cf.trim()

  // @ts-ignore
  const ip = (req as any).ip
  return ip ? String(ip) : null
}

function applyRateLimit(req: NextRequest): NextResponse | null {
  const ip = getClientIp(req)
  if (!ip) return null

  const path = req.nextUrl.pathname
  const key = `${ip}:${path}`
  const now = Date.now()

  const existing = rateLimitStore.get(key)

  if (!existing) {
    rateLimitStore.set(key, { count: 1, firstRequestTime: now })
    return null
  }

  const elapsed = now - existing.firstRequestTime

  if (elapsed > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { count: 1, firstRequestTime: now })
    return null
  }

  existing.count += 1

  if (existing.count > RATE_LIMIT_MAX_REQUESTS) {
    return NextResponse.json(
      { ok: false, error: "Muitas requisições em um curto período. Tente novamente em instantes." },
      { status: 429 }
    )
  }

  return null
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ✅ NÃO redireciona HTTPS para /api (isso pode quebrar POST/fetch)
  const isApiRoute = pathname.startsWith("/api")

  // 🔐 Força HTTPS só para rotas de PÁGINA (não API)
  if (IS_PRODUCTION && !isApiRoute) {
    const proto = req.headers.get("x-forwarded-proto")
    if (proto === "http") {
      const url = req.nextUrl.clone()
      url.protocol = "https:"
      return NextResponse.redirect(url, 308) // 308 mantém método melhor que 301
    }
  }

  // 🛡️ Rate limit APENAS na rota de pagamento PIX
  if (pathname === "/api/pagamento/pix") {
    const limited = applyRateLimit(req)
    if (limited) return limited
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/api/pagamento/pix"],
}
