// lib/payments/ativopay.ts
// ✅ Mantém o mesmo arquivo/nome para não quebrar imports
// ✅ Integra com MWBank
// ✅ NÃO trava orderbump
// ✅ Parser blindado contra mudanças do gateway

type CreatePixParams = {
  amount: number // em centavos
  customer: {
    name: string
    email: string
    phone: string
    document: { type: "CPF" | "CNPJ"; number: string }
  }
  items: {
    title: string
    quantity: number
    unitPrice: number // em centavos
    tangible: boolean
    externalRef?: string
  }[]
  expiresInDays: number
  traceable?: boolean
  postbackUrl?: string
}

function mask(value: string, keepStart = 6, keepEnd = 4) {
  if (!value) return ""
  if (value.length <= keepStart + keepEnd) return "***"
  return `${value.slice(0, keepStart)}...${value.slice(-keepEnd)}`
}

function centsToBRL(amountCents: number) {
  const v = Math.round(Number(amountCents || 0))
  return Number((v / 100).toFixed(2))
}

function withTimeout(ms: number) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), ms)
  return { controller, clear: () => clearTimeout(t) }
}

/* ----------------------------------------------------
   🔍 DEEP SEARCH PIX (BR CODE 000201)
---------------------------------------------------- */
function deepFindPixBrCode(obj: any): string | null {
  const seen = new Set<any>()

  const looksLikePix = (v: string) => {
    const s = String(v || "").trim()
    if (!s) return false
    if (s.length < 40) return false
    return s.startsWith("000201") || s.includes("000201")
  }

  const visit = (node: any): string | null => {
    if (node === null || node === undefined) return null
    if (typeof node === "string") {
      if (looksLikePix(node)) {
        const idx = node.indexOf("000201")
        return idx >= 0 ? node.slice(idx).trim() : node.trim()
      }
      return null
    }
    if (typeof node !== "object") return null
    if (seen.has(node)) return null
    seen.add(node)

    if (Array.isArray(node)) {
      for (const item of node) {
        const found = visit(item)
        if (found) return found
      }
      return null
    }

    for (const key of Object.keys(node)) {
      const found = visit(node[key])
      if (found) return found
    }
    return null
  }

  return visit(obj)
}

/* ----------------------------------------------------
   🔑 AUTH / FETCH
---------------------------------------------------- */
function getEnv() {
  const BASE_URL = (process.env.MWBANK_BASE_URL || "https://core.mwbank.app").replace(/\/+$/, "")
  const CLIENT_ID = (process.env.MWBANK_CLIENT_ID || "").trim()
  const CLIENT_SECRET = (process.env.MWBANK_CLIENT_SECRET || "").trim()
  const CERT_CLIENT_BASE64 = (process.env.MWBANK_CERT_CLIENT || "").replace(/\s+/g, "")
  const SITE_URL = (process.env.SITE_URL || "").replace(/\/+$/, "")
  const DEFAULT_WEBHOOK_URL =
    (process.env.MWBANK_WEBHOOK_URL || "").trim() ||
    (SITE_URL ? `${SITE_URL}/api/webhook/ativopay` : "")
  const TIMEOUT_MS = Number(process.env.MWBANK_TIMEOUT_MS || 12000)

  return {
    BASE_URL,
    CLIENT_ID,
    CLIENT_SECRET,
    CERT_CLIENT_BASE64,
    DEFAULT_WEBHOOK_URL,
    TIMEOUT_MS,
  }
}

type CachedToken = { token: string; expiresAt: number }
let cachedToken: CachedToken | null = null
let inFlightTokenPromise: Promise<string> | null = null

function invalidateTokenCache() {
  cachedToken = null
  inFlightTokenPromise = null
}

async function mwFetch(url: string, init: RequestInit, timeoutMs: number) {
  const { controller, clear } = withTimeout(timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const text = await res.text()
    let data: any = null
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = null
    }
    return { res, text, data }
  } finally {
    clear()
  }
}

async function getAccessToken() {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token
  if (inFlightTokenPromise) return inFlightTokenPromise

  inFlightTokenPromise = (async () => {
    const { BASE_URL, CLIENT_ID, CERT_CLIENT_BASE64, TIMEOUT_MS } = getEnv()
    const url = `${BASE_URL}/auth/token`

    const res = await mwFetch(
      url,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          client_id: CLIENT_ID,
          cert_client: CERT_CLIENT_BASE64,
        },
      },
      TIMEOUT_MS,
    )

    const token =
      res.data?.access_token ||
      res.data?.token ||
      res.data?.data?.access_token ||
      null

    if (!res.res.ok || !token) {
      throw new Error("MWBANK auth falhou")
    }

    cachedToken = {
      token: String(token),
      expiresAt: Date.now() + 60 * 60 * 1000,
    }

    return cachedToken.token
  })()

  return inFlightTokenPromise
}

/* ----------------------------------------------------
   🎯 CREATE PIX
---------------------------------------------------- */
export async function createPixTransaction(params: CreatePixParams) {
  const { BASE_URL, CLIENT_ID, CLIENT_SECRET, CERT_CLIENT_BASE64, DEFAULT_WEBHOOK_URL, TIMEOUT_MS } = getEnv()

  const accessToken = await getAccessToken()
  const url = `${BASE_URL}/pix`

  const externalRef = params.items?.[0]?.externalRef || `order-${Date.now()}`
  const amountBRL = centsToBRL(params.amount)

  const postbackUrl = params.postbackUrl || DEFAULT_WEBHOOK_URL
  if (!postbackUrl?.startsWith("https://")) {
    throw new Error("Webhook inválido (precisa https)")
  }

  const body = {
    code: externalRef,
    amount: amountBRL,
    email: params.customer.email,
    document: params.customer.document.number.replace(/\D/g, ""),
    url: postbackUrl,
  }

  const created = await mwFetch(
    url,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        client_id: CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
        access_token: accessToken,
        ...(CERT_CLIENT_BASE64 ? { cert_client: CERT_CLIENT_BASE64 } : {}),
        ...(CLIENT_SECRET ? { client_secret: CLIENT_SECRET } : {}),
      },
      body: JSON.stringify(body),
    },
    TIMEOUT_MS,
  )

  if (!created.res.ok) {
    console.error("MWBANK CREATE PIX ERROR:", {
      status: created.res.status,
      payload: created.data,
      body: created.text?.slice(0, 800),
      code: externalRef,
      amount: amountBRL,
      client_id: mask(CLIENT_ID),
    })
    throw new Error("Falha ao gerar PIX (MWBANK)")
  }

  // 🔥 PARSER BLINDADO
  const raw = created.data
  const pixCopiaECola =
    raw?.pixCopiaECola ||
    raw?.copiaECola ||
    raw?.brCode ||
    raw?.payload ||
    raw?.data?.pixCopiaECola ||
    raw?.data?.copiaECola ||
    raw?.data?.brCode ||
    raw?.data?.payload ||
    deepFindPixBrCode(raw)

  const txid =
    raw?.txid ||
    raw?.transactionId ||
    raw?.data?.txid ||
    raw?.data?.transactionId ||
    null

  return {
    raw,
    transactionId: txid ? String(txid) : null,
    amount: amountBRL,
    status: raw?.status || raw?.data?.status || null,
    pixCopiaECola: pixCopiaECola ? String(pixCopiaECola) : null,
    qrCodeBase64: null,
    expiresAt: null,
  }
}
