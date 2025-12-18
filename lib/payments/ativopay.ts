// lib/payments/ativopay.ts
// ✅ Mantém o mesmo arquivo/nome para não quebrar imports
// ✅ Integra com MWBank
// ✅ NÃO trava orderbump
// ✅ Trata "Unauthorized" mesmo quando MW retorna HTTP 200
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

function normalizeOneLine(value?: string) {
  let v = String(value || "").trim()
  if (!v) return ""
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim()
  }
  v = v.replace(/[\r\n\s]+/g, "")
  return v
}

function normalizeBase64Flexible(value?: string) {
  let v = normalizeOneLine(value)
  if (!v) return ""

  // aceita base64url
  v = v.replace(/-/g, "+").replace(/_/g, "/")

  // padding
  const mod = v.length % 4
  if (mod === 2) v += "=="
  else if (mod === 3) v += "="
  else if (mod === 1) return ""

  try {
    const buf = Buffer.from(v, "base64")
    if (!buf || buf.length === 0) return ""
    return buf.toString("base64")
  } catch {
    return ""
  }
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
    return s.includes("000201")
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
      const found = visit((node as any)[key])
      if (found) return found
    }
    return null
  }

  return visit(obj)
}

/* ----------------------------------------------------
   🔑 ENV
---------------------------------------------------- */
function getEnv() {
  const BASE_URL = (process.env.MWBANK_BASE_URL || "https://core.mwbank.app").replace(/\/+$/, "")
  const CLIENT_ID = (process.env.MWBANK_CLIENT_ID || "").trim()
  const CLIENT_SECRET = (process.env.MWBANK_CLIENT_SECRET || "").trim()

  const CERT_RAW = normalizeOneLine(process.env.MWBANK_CERT_CLIENT)
  const CERT_STRIPPED =
    CERT_RAW.toLowerCase().startsWith("cert_client")
      ? CERT_RAW.slice("cert_client".length)
      : CERT_RAW

  const CERT_CLIENT_BASE64 = normalizeBase64Flexible(CERT_STRIPPED)

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

/* ----------------------------------------------------
   🔑 TOKEN CACHE
---------------------------------------------------- */
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

function payloadMessage(data: any) {
  return String(
    data?.error ||
      data?.message ||
      data?.data?.error ||
      data?.data?.message ||
      "",
  )
}

function isUnauthorizedPayload(data: any) {
  const msg = payloadMessage(data).toLowerCase()
  // MW veio com "Unathorized" (typo) no seu log:
  return msg.includes("unauthor") || msg.includes("unathor") || msg.includes("forbidden") || msg.includes("invalid token")
}

async function getAccessToken() {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token
  if (inFlightTokenPromise) return inFlightTokenPromise

  inFlightTokenPromise = (async () => {
    const { BASE_URL, CLIENT_ID, CERT_CLIENT_BASE64, TIMEOUT_MS } = getEnv()
    if (!CLIENT_ID) throw new Error("MWBANK_CLIENT_ID não configurado")
    if (!CERT_CLIENT_BASE64) throw new Error("MWBANK_CERT_CLIENT inválido/ausente (base64 em 1 linha)")

    const url = `${BASE_URL}/auth/token`

    // MW pode aceitar:
    // - base64 puro
    // - "cert_client" + base64
    const certModes = Array.from(
      new Set([CERT_CLIENT_BASE64, `cert_client${CERT_CLIENT_BASE64}`].filter(Boolean)),
    )

    let last: any = null

    for (const cert_client of certModes) {
      // 1) sem body
      last = await mwFetch(
        url,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            client_id: CLIENT_ID,
            cert_client,
          },
        },
        TIMEOUT_MS,
      )

      // 2) fallback com JSON vazio
      if (!last.res.ok || isUnauthorizedPayload(last.data) || last.data?.error) {
        last = await mwFetch(
          url,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              client_id: CLIENT_ID,
              cert_client,
            },
            body: JSON.stringify({}),
          },
          TIMEOUT_MS,
        )
      }

      const token =
        last.data?.access_token ||
        last.data?.token ||
        last.data?.data?.access_token ||
        null

      if (last.res.ok && token && !last.data?.error && !isUnauthorizedPayload(last.data)) {
        const expiresInSecRaw = Number(last.data?.expires_in ?? last.data?.expiresIn ?? 3600)
        const expiresInSec = Number.isFinite(expiresInSecRaw) ? expiresInSecRaw : 3600
        cachedToken = {
          token: String(token),
          expiresAt: Date.now() + Math.max(60, expiresInSec) * 1000,
        }
        return cachedToken.token
      }
    }

    console.error("MWBANK AUTH ERROR:", {
      httpStatus: last?.res?.status,
      payloadPreview: last?.data,
      client_id: mask(getEnv().CLIENT_ID),
    })

    throw new Error("MWBANK auth falhou")
  })()

  try {
    return await inFlightTokenPromise
  } finally {
    inFlightTokenPromise = null
  }
}

/* ----------------------------------------------------
   🎯 CREATE PIX
---------------------------------------------------- */
export async function createPixTransaction(params: CreatePixParams) {
  const { BASE_URL, CLIENT_ID, CLIENT_SECRET, CERT_CLIENT_BASE64, DEFAULT_WEBHOOK_URL, TIMEOUT_MS } = getEnv()

  if (!CLIENT_ID) throw new Error("MWBANK_CLIENT_ID não configurado")
  if (!BASE_URL) throw new Error("MWBANK_BASE_URL inválida")

  let accessToken = await getAccessToken()
  const url = `${BASE_URL}/pix`

  const externalRef = params.items?.[0]?.externalRef || `order-${Date.now()}`
  const amountBRL = centsToBRL(params.amount)

  const postbackUrl = (params.postbackUrl || DEFAULT_WEBHOOK_URL || "").trim()
  if (!postbackUrl.startsWith("https://")) {
    throw new Error("Webhook inválido (precisa https)")
  }

  const body = {
    code: externalRef,
    amount: amountBRL,
    email: params.customer.email,
    document: String(params.customer.document.number || "").replace(/\D/g, ""),
    url: postbackUrl,
  }

  const certModes = Array.from(
    new Set([CERT_CLIENT_BASE64, `cert_client${CERT_CLIENT_BASE64}`].filter(Boolean)),
  )

  const doCreate = async (cert_client?: string) => {
    return await mwFetch(
      url,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          client_id: CLIENT_ID,
          Authorization: `Bearer ${accessToken}`,
          access_token: accessToken,
          ...(cert_client ? { cert_client } : {}),
          ...(CLIENT_SECRET ? { client_secret: CLIENT_SECRET } : {}),
        },
        body: JSON.stringify(body),
      },
      TIMEOUT_MS,
    )
  }

  // ✅ retry inteligente:
  // - se vier HTTP 401/403 -> retry
  // - se vier HTTP 200 com {"error":"Unathorized"} -> retry (seu caso)
  let created: any = null
  let lastUnauthorizedPayload: any = null

  for (const cert_client of certModes.length ? certModes : [undefined]) {
    created = await doCreate(cert_client)

    const unauthorized =
      created?.res?.status === 401 ||
      created?.res?.status === 403 ||
      isUnauthorizedPayload(created?.data)

    if (unauthorized) {
      lastUnauthorizedPayload = created?.data
      invalidateTokenCache()
      accessToken = await getAccessToken()
      created = await doCreate(cert_client)

      const unauthorized2 =
        created?.res?.status === 401 ||
        created?.res?.status === 403 ||
        isUnauthorizedPayload(created?.data)

      if (unauthorized2) {
        lastUnauthorizedPayload = created?.data
        continue
      }
    }

    // se não for unauthorized e ok, para
    if (created?.res?.ok && !created?.data?.error) break
  }

  // Se depois de retries ainda estiver "unauthorized" (mesmo 200), mata aqui com erro explícito
  if (isUnauthorizedPayload(created?.data)) {
    console.error("MWBANK PIX UNAUTHORIZED (mesmo HTTP ok):", {
      httpStatus: created?.res?.status,
      payload: created?.data,
      rawPreview: created?.text?.slice(0, 1200),
      client_id: mask(CLIENT_ID),
    })
    throw new Error("MWBANK_UNAUTHORIZED")
  }

  if (!created?.res?.ok || created?.data?.error) {
    console.error("MWBANK CREATE PIX ERROR:", {
      status: created?.res?.status,
      payload: created?.data,
      body: created?.text?.slice(0, 1200),
      code: externalRef,
      amount: amountBRL,
      client_id: mask(CLIENT_ID),
      has_client_secret: !!CLIENT_SECRET,
      has_cert_client: !!CERT_CLIENT_BASE64,
      lastUnauthorizedPayload,
    })
    throw new Error("Falha ao gerar PIX (MWBANK)")
  }

  // 🔥 PARSER BLINDADO
  const raw = created.data
  const d = raw?.data ?? raw

  const pixCopiaECola =
    d?.pixCopiaECola ||
    d?.copiaECola ||
    d?.copia_e_cola ||
    d?.brCode ||
    d?.payload ||
    d?.emv ||
    d?.copyPaste ||
    d?.copy_paste ||
    d?.pix?.emv ||
    d?.pix?.brCode ||
    d?.pix?.payload ||
    raw?.pixCopiaECola ||
    raw?.copiaECola ||
    raw?.brCode ||
    raw?.payload ||
    raw?.emv ||
    deepFindPixBrCode(raw)

  const txid =
    d?.txid ||
    d?.transactionId ||
    raw?.txid ||
    raw?.transactionId ||
    null

  return {
    raw,
    transactionId: txid ? String(txid).trim() : null,
    amount: amountBRL,
    status: d?.status || raw?.status || null,
    pixCopiaECola: pixCopiaECola ? String(pixCopiaECola).trim() : null,
    qrCodeBase64: null,
    expiresAt: null,
  }
}
