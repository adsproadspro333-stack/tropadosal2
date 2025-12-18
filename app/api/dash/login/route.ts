// app/api/dash/login/route.ts
import { NextResponse } from "next/server"
import crypto from "crypto"

export const runtime = "nodejs"

const COOKIE_NAME = "dash_admin"
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias

function sha256Hex(v: string) {
  return crypto.createHash("sha256").update(String(v || ""), "utf8").digest("hex")
}

// ✅ comparação constante (sempre mesmo tamanho)
function safeEqual(a: string, b: string) {
  const aH = sha256Hex(a)
  const bH = sha256Hex(b)
  return crypto.timingSafeEqual(Buffer.from(aH, "utf8"), Buffer.from(bH, "utf8"))
}

// ✅ base64url (cookie-safe)
function base64UrlEncode(obj: any) {
  const json = JSON.stringify(obj)
  return Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function signToken(payload: any, secret: string) {
  const payloadB64 = base64UrlEncode(payload)
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("hex")
  return `${payloadB64}.${sig}`
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))

    const user = String(body?.user || "").trim()
    const pass = String(body?.pass || "")

    const envUser = String(process.env.DASH_USER || "").trim()
    const envPass = String(process.env.DASH_PASS || "").trim()
    const secret = String(process.env.DASH_TOKEN_SECRET || "").trim()

    if (!envUser || !envPass || !secret) {
      return NextResponse.json(
        { ok: false, error: "DASH envs não configuradas (DASH_USER/DASH_PASS/DASH_TOKEN_SECRET)" },
        { status: 500 },
      )
    }

    // ✅ validação constante
    const okUser = safeEqual(user, envUser)
    const okPass = safeEqual(pass, envPass)

    if (!okUser || !okPass) {
      return NextResponse.json({ ok: false, error: "Login inválido" }, { status: 401 })
    }

    const now = Date.now()
    const exp = now + TOKEN_TTL_MS

    const token = signToken(
      {
        u: envUser,
        iat: now,
        exp,
      },
      secret,
    )

    const res = NextResponse.json(
      { ok: true, u: envUser, exp }, // ✅ ajuda debug (não vaza segredo)
      { status: 200 },
    )

    // ✅ importantíssimo: sem cache
    res.headers.set("Cache-Control", "no-store")

    res.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "strict", // ✅ dashboard não precisa ser cross-site
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(TOKEN_TTL_MS / 1000),
    })

    return res
  } catch {
    return NextResponse.json({ ok: false, error: "Erro ao logar" }, { status: 500 })
  }
}
