import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const IS_PRODUCTION = process.env.NODE_ENV === "production"

// Janela de rate limit: 60 segundos
const RATE_LIMIT_WINDOW_MS = 60_000

// Limite por IP por minuto na rota de pagamento
// 60 requisições/min por IP é BEM acima do uso normal
const RATE_LIMIT_MAX_REQUESTS = 60

type RateLimitInfo = {
  count: number
  firstRequestTime: number
}

// Memória simples em runtime (protege contra flood básico por instância)
const rateLimitStore = new Map<string, RateLimitInfo>()

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) {
    return xff.split(",")[0].trim()
  }

  // fallback
  // @ts-ignore
  const ip = (req as any).ip || "unknown"
  return ip
}

function applyRateLimit(req: NextRequest): NextResponse | null {
  const ip = getClientIp(req)
  const path = req.nextUrl.pathname

  if (!ip || ip === "unknown") {
    // Sem IP confiável → não limita, deixa passar
    return null
  }

  const key = `${ip}:${path}`
  const now = Date.now()

  const existing = rateLimitStore.get(key)

  if (!existing) {
    rateLimitStore.set(key, {
      count: 1,
      firstRequestTime: now,
    })
    return null
  }

  const elapsed = now - existing.firstRequestTime

  if (elapsed > RATE_LIMIT_WINDOW_MS) {
    // Reseta janela
    rateLimitStore.set(key, {
      count: 1,
      firstRequestTime: now,
    })
    return null
  }

  existing.count += 1

  if (existing.count > RATE_LIMIT_MAX_REQUESTS) {
    console.warn("RATE LIMIT atingido em /api/pagamento/pix:", {
      ip,
      path,
      count: existing.count,
      windowMs: RATE_LIMIT_WINDOW_MS,
    })

    return NextResponse.json(
      {
        ok: false,
        error:
          "Muitas requisições em um curto período. Tente novamente em instantes.",
      },
      {
        status: 429,
      },
    )
  }

  return null
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 🔐 Força HTTPS em produção (boa prática pra qualquer operação grande)
  if (IS_PRODUCTION) {
    const proto = req.headers.get("x-forwarded-proto")
    if (proto === "http") {
      const url = req.nextUrl.clone()
      url.protocol = "https:"
      return NextResponse.redirect(url, 301)
    }
  }

  // 🛡️ Aplica rate limit APENAS na rota de pagamento
  if (pathname.startsWith("/api/pagamento/pix")) {
    const limited = applyRateLimit(req)
    if (limited) return limited
  }

  return NextResponse.next()
}

// Matcher: middleware só roda onde interessa
export const config = {
  matcher: ["/api/pagamento/pix"],
}
