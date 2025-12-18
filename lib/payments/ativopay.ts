// lib/payments/ativopay.ts
// ✅ Mantém o mesmo arquivo/nome para não quebrar imports
// ✅ Integra com MWBank
// ✅ REMOVIDO: anti "PIX fantasma" (sem GET /pix/{txid}, sem bloqueio rígido)
// ✅ Objetivo: NÃO travar orderbump e NÃO ficar carregando infinito

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

function normalizeOneLine(value?: string) {
  let v = (value || "").trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim()
  }
  v = v.replace(/[\r\n\s]+/g, "").trim()
  return v
}

function normalizeBase64Flexible(value?: string) {
  let v = normalizeOneLine(value)
  if (!v) return ""
  v = v.replace(/-/g, "+").replace(/_/g, "/")
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

function withTimeout(ms: number) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), ms)
  return { controller, clear: () => clearTimeout(t) }
}

function getEnv() {
  const BASE_URL = (process.env.MWBANK_BASE_URL || "https://core.mwbank.app").replace(/\/+$/, "")
  const CLIENT_ID = (process.env.MWBANK_CLIENT_ID || "").trim()
  const CLIENT_SECRET = (process.env.MWBANK_CLIENT_SECRET || "").trim()

  const CERT_CLIENT_BASE64 = normalizeBase64Flexible(process.env.MWBANK_CERT_CLIENT)

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

const TOKEN_RENEW_SKEW_MS = 90_000
const MIN_TTL_SEC = 60

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

function isUnauthorizedPayload(resStatus: number, data: any) {
  const msg = (data?.error || data?.message || data?.data?.error || data?.data?.message || "")
  return resStatus === 401 || String(msg).toLowerCase().includes("unauthor")
}

// 🔑 Auth token (cache + retry modos)
async function doAuthRequest(opts: {
  url: string
  clientId: string
  certClient: string
  mode: "no_body" | "json_empty" | "empty_body_with_ct"
  timeoutMs: number
}) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    client_id: opts.clientId,
    cert_client: opts.certClient,
  }

  let init: RequestInit = { method: "POST", headers }

  if (opts.mode === "json_empty") {
    init = { ...init, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({}) }
  } else if (opts.mode === "empty_body_with_ct") {
    init = { ...init, headers: { ...headers, "Content-Type": "application/json" }, body: "" }
  }

  return await mwFetch(opts.url, init, opts.timeoutMs)
}

async function fetchNewAccessToken() {
  const { BASE_URL, CLIENT_ID, CERT_CLIENT_BASE64, TIMEOUT_MS } = getEnv()

  if (!CLIENT_ID) throw new Error("MWBANK_CLIENT_ID não configurado")
  if (!BASE_URL) throw new Error("MWBANK_BASE_URL inválida")
  if (!CERT_CLIENT_BASE64) throw new Error("MWBANK_CERT_CLIENT inválido/ausente (base64 em 1 linha)")

  const url = `${BASE_URL}/auth/token`

  // alguns ambientes querem "cert_client" + base64
  const certModes = [CERT_CLIENT_BASE64, `cert_client${CERT_CLIENT_BASE64}`].filter(Boolean)

  let last: any = null

  for (const cert_client of certModes) {
    const a = await doAuthRequest({ url, clientId: CLIENT_ID, certClient: cert_client, mode: "no_body", timeoutMs: TIMEOUT_MS })
    if (a.res.ok) {
      last = a
    } else {
      const b = await doAuthRequest({ url, clientId: CLIENT_ID, certClient: cert_client, mode: "json_empty", timeoutMs: TIMEOUT_MS })
      last = b.res.ok ? b : await doAuthRequest({ url, clientId: CLIENT_ID, certClient: cert_client, mode: "empty_body_with_ct", timeoutMs: TIMEOUT_MS })
    }

    const data = last.data || {}
    if (!last.res.ok || data?.error || (data?.message && String(data.message).toLowerCase().includes("unauthor"))) continue

    const token = data?.access_token || data?.token || data?.data?.access_token || null
    if (!token) continue

    const expiresInSecRaw = Number(data?.expires_in ?? data?.expiresIn ?? 3600)
    const expiresInSec = Number.isFinite(expiresInSecRaw) ? expiresInSecRaw : 3600
    const ttlSec = Math.max(MIN_TTL_SEC, expiresInSec)

    cachedToken = { token: String(token), expiresAt: Date.now() + ttlSec * 1000 }
    return String(token)
  }

  console.error("MWBANK AUTH ERROR:", {
    httpStatus: last?.res?.status,
    payloadPreview: last?.data,
    client_id: mask(getEnv().CLIENT_ID),
  })

  const reason = last?.data?.error || last?.data?.message || `HTTP ${last?.res?.status}`
  throw new Error(`MWBANK auth falhou: ${reason}`)
}

async function getAccessToken() {
  const now = Date.now()
  if (cachedToken?.token && cachedToken.expiresAt > now + TOKEN_RENEW_SKEW_MS) return cachedToken.token
  if (inFlightTokenPromise) return inFlightTokenPromise

  inFlightTokenPromise = (async () => {
    try {
      return await fetchNewAccessToken()
    } finally {
      inFlightTokenPromise = null
    }
  })()

  return inFlightTokenPromise
}

function buildMwHeaders(opts: {
  clientId: string
  accessToken?: string
  certClient?: string
  clientSecret?: string
  contentTypeJson?: boolean
}) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    client_id: opts.clientId,
  }

  // alguns ambientes aceitam Bearer; outros aceitam access_token header
  if (opts.accessToken) {
    headers.Authorization = `Bearer ${opts.accessToken}`
    headers.access_token = String(opts.accessToken)
  }

  // alguns ambientes exigem esses headers também no /pix
  if (opts.certClient) headers.cert_client = opts.certClient
  if (opts.clientSecret) headers.client_secret = opts.clientSecret

  if (opts.contentTypeJson) headers["Content-Type"] = "application/json"
  return headers
}

function pickCreatedPix(data: any) {
  const root = data || {}
  const d = root.data || root

  const txid = d?.txid || root?.txid || d?.transactionId || root?.transactionId || null

  const copia =
    d?.pixCopiaECola ||
    root?.pixCopiaECola ||
    d?.copiaECola ||
    root?.copiaECola ||
    d?.brCode ||
    root?.brCode ||
    d?.payload ||
    root?.payload ||
    null

  const qr = d?.qrCode || root?.qrCode || null
  const status = d?.status || root?.status || null

  return {
    txid: txid ? String(txid).trim() : null,
    copia: copia ? String(copia).trim() : null,
    qr: qr ? String(qr).trim() : null,
    status,
    raw: data,
  }
}

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
    throw new Error("MWBANK webhook/url inválida (precisa https://)")
  }

  const body: any = {
    code: externalRef,
    amount: amountBRL,
    email: params.customer?.email,
    document: String(params.customer?.document?.number || "").replace(/\D/g, ""),
    url: postbackUrl,
  }

  const certModes = [CERT_CLIENT_BASE64, `cert_client${CERT_CLIENT_BASE64}`].filter(Boolean)

  const doCreate = async (cert_client?: string) => {
    return await mwFetch(
      url,
      {
        method: "POST",
        headers: buildMwHeaders({
          clientId: CLIENT_ID,
          accessToken,
          certClient: cert_client,
          clientSecret: CLIENT_SECRET || undefined,
          contentTypeJson: true,
        }),
        body: JSON.stringify(body),
      },
      TIMEOUT_MS,
    )
  }

  let created: any = null

  // tenta com variações de cert_client (alguns ambientes mudam a exigência)
  for (const cert_client of certModes.length ? certModes : [undefined]) {
    created = await doCreate(cert_client)

    // retry 1x em unauthorized
    if (!created.res.ok && isUnauthorizedPayload(created.res.status, created.data)) {
      invalidateTokenCache()
      accessToken = await getAccessToken()
      created = await doCreate(cert_client)
    }

    if (created.res.ok) break
  }

  // ❗️não bloquear por "pix fantasma": apenas reportar erro do gateway
  if (!created?.res?.ok) {
    console.error("MWBANK CREATE PIX ERROR:", {
      status: created?.res?.status,
      payload: created?.data,
      body: created?.text?.slice(0, 1200),
      code: externalRef,
      amount: amountBRL,
      client_id: mask(CLIENT_ID),
      has_client_secret: !!CLIENT_SECRET,
      has_cert_client: !!CERT_CLIENT_BASE64,
    })

    // mantém mensagem genérica pro route.ts tratar (ele já devolve 500/503)
    throw new Error("Falha ao gerar PIX (MWBANK).")
  }

  const picked = pickCreatedPix(created.data)

  // ✅ aqui não bloqueia mais o fluxo inteiro com lógica rígida:
  // se vier sem copia/txid, a rota /pagamento/pix vai tratar e mostrar “tente novamente”
  return {
    raw: { created: created.data },
    transactionId: picked.txid, // pode ser null
    amount: amountBRL,
    status: picked.status || null,
    pixCopiaECola: picked.copia, // pode ser null
    qrCodeBase64: null,
    expiresAt: null,
  }
}
