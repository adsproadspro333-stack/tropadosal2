// lib/payments/ativopay.ts
// ✅ Mantém o mesmo arquivo/nome para não quebrar imports
// ✅ Integra com MWBank
// ✅ Anti PIX fantasma: confirma existência no gateway via GET /pix/{txid} antes de retornar
// ✅ Hardening auth: tenta variações de header (cert_client e access_token) para evitar "Unauthorized" em prod

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

  const GET_TX_PATH_PREFIX = (process.env.MWBANK_GET_TX_PATH_PREFIX || "/pix/").trim()
  const GET_TX_PATH_PREFIX_FALLBACK = (process.env.MWBANK_GET_TX_PATH_PREFIX_FALLBACK || "/pix-in/get-transaction/").trim()

  const TIMEOUT_MS = Number(process.env.MWBANK_TIMEOUT_MS || 12000)

  return {
    BASE_URL,
    CLIENT_ID,
    CLIENT_SECRET,
    CERT_CLIENT_BASE64,
    DEFAULT_WEBHOOK_URL,
    GET_TX_PATH_PREFIX,
    GET_TX_PATH_PREFIX_FALLBACK,
    TIMEOUT_MS,
  }
}

function buildMwUrl(baseUrl: string, prefixRaw: string, txid: string) {
  const prefix = (prefixRaw || "/pix/").trim()
  const p = prefix.startsWith("/") ? prefix : `/${prefix}`
  return `${baseUrl}${p}${encodeURIComponent(String(txid).trim())}`
}

// =====================
// Token Manager (cache + auto-renew + dedupe concorrência)
// =====================

const TOKEN_RENEW_SKEW_MS = 90_000
const MIN_TTL_SEC = 60

type CachedToken = { token: string; expiresAt: number }
let cachedToken: CachedToken | null = null
let inFlightTokenPromise: Promise<string> | null = null

function invalidateTokenCache() {
  cachedToken = null
  inFlightTokenPromise = null
}

async function doAuthRequest(opts: {
  url: string
  clientId: string
  certClient: string
  mode: "no_body" | "json_empty" | "empty_body_with_ct"
  timeoutMs: number
}) {
  const { controller, clear } = withTimeout(opts.timeoutMs)
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      client_id: opts.clientId,
      cert_client: opts.certClient,
    }

    let init: RequestInit = { method: "POST", headers, signal: controller.signal }

    if (opts.mode === "json_empty") {
      init = { ...init, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({}) }
    } else if (opts.mode === "empty_body_with_ct") {
      init = { ...init, headers: { ...headers, "Content-Type": "application/json" }, body: "" }
    }

    const res = await fetch(opts.url, init)
    const text = await res.text()

    let data: any = null
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      return { ok: false, status: res.status, text, data: null }
    }

    return { ok: res.ok, status: res.status, text, data }
  } finally {
    clear()
  }
}

async function fetchNewAccessToken() {
  const { BASE_URL, CLIENT_ID, CERT_CLIENT_BASE64, TIMEOUT_MS } = getEnv()

  if (!CLIENT_ID) throw new Error("MWBANK_CLIENT_ID não configurado")
  if (!BASE_URL) throw new Error("MWBANK_BASE_URL inválida")
  if (!CERT_CLIENT_BASE64) {
    throw new Error("MWBANK_CERT_CLIENT inválido/ausente (precisa ser base64 válido em 1 linha, sem aspas/quebras)")
  }

  const url = `${BASE_URL}/auth/token`

  // ✅ tenta 2 formatos de cert_client: puro e com prefixo "cert_client"
  const certModes = [CERT_CLIENT_BASE64, `cert_client${CERT_CLIENT_BASE64}`]

  let last: any = null

  for (const cert_client of certModes) {
    const a = await doAuthRequest({ url, clientId: CLIENT_ID, certClient: cert_client, mode: "no_body", timeoutMs: TIMEOUT_MS })
    const b = a.ok ? null : await doAuthRequest({ url, clientId: CLIENT_ID, certClient: cert_client, mode: "json_empty", timeoutMs: TIMEOUT_MS })
    const c = (a.ok || b?.ok) ? null : await doAuthRequest({ url, clientId: CLIENT_ID, certClient: cert_client, mode: "empty_body_with_ct", timeoutMs: TIMEOUT_MS })

    const best = (a.ok ? a : b?.ok ? b : c) || a
    last = best

    const data = best.data || {}
    const success = data?.success
    const hasError =
      !!data?.error ||
      !!data?.message?.toLowerCase?.().includes?.("unauthor") ||
      success === false

    if (!best.ok || hasError) continue

    const token = data?.access_token || data?.token || data?.data?.access_token || null
    if (!token) continue

    const expiresInSecRaw = Number(data?.expires_in ?? data?.expiresIn ?? 3600)
    const expiresInSec = Number.isFinite(expiresInSecRaw) ? expiresInSecRaw : 3600
    const ttlSec = Math.max(MIN_TTL_SEC, expiresInSec)

    cachedToken = { token: String(token), expiresAt: Date.now() + ttlSec * 1000 }
    return String(token)
  }

  const data = last?.data || {}
  console.error("MWBANK AUTH ERROR:", {
    httpStatus: last?.status,
    payload: { success: data?.success, error: data?.error, message: data?.message },
    client_id: mask(getEnv().CLIENT_ID),
    triedCertModes: ["base64", "cert_client+base64"],
  })

  const reason = data?.error || data?.message || `HTTP ${last?.status} - auth failed`
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

  // ✅ manda ambos pra matar proxy/gateway chato
  if (opts.accessToken) {
    headers.Authorization = `Bearer ${opts.accessToken}`
    headers.access_token = String(opts.accessToken)
  }

  if (opts.certClient) headers.cert_client = opts.certClient
  if (opts.clientSecret) headers.client_secret = opts.clientSecret
  if (opts.contentTypeJson) headers["Content-Type"] = "application/json"

  return headers
}

function pickCreatedPix(data: any) {
  const root = data || {}
  const d = root.data || root

  const txid = d?.txid || root?.txid || d?.transactionId || root?.transactionId || null
  const copia = d?.pixCopiaECola || root?.pixCopiaECola || null
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

function pickGetTx(data: any) {
  const root = data || {}
  const d = root.data || root

  const txid = d?.txid || root?.txid || null
  const status = d?.status || root?.status || d?.statusTransaction || root?.statusTransaction || null
  const copia = d?.pixCopiaECola || root?.pixCopiaECola || null
  const qr = d?.qrCode || root?.qrCode || null

  return {
    txid: txid ? String(txid).trim() : null,
    status: status ? String(status) : null,
    copia: copia ? String(copia).trim() : null,
    qr: qr ? String(qr).trim() : null,
    raw: data,
  }
}

async function getTransactionFromGateway(txid: string) {
  const { BASE_URL, CLIENT_ID, CLIENT_SECRET, CERT_CLIENT_BASE64, GET_TX_PATH_PREFIX, GET_TX_PATH_PREFIX_FALLBACK, TIMEOUT_MS } = getEnv()

  if (!CLIENT_ID) throw new Error("MWBANK_CLIENT_ID não configurado")
  if (!BASE_URL) throw new Error("MWBANK_BASE_URL inválida")

  let accessToken = await getAccessToken()

  const certModes = [CERT_CLIENT_BASE64, `cert_client${CERT_CLIENT_BASE64}`].filter(Boolean)

  const doGet = async (url: string, cert_client?: string) => {
    return await mwFetch(
      url,
      {
        method: "GET",
        headers: buildMwHeaders({
          clientId: CLIENT_ID,
          accessToken,
          certClient: cert_client,
          clientSecret: CLIENT_SECRET || undefined,
        }),
      },
      TIMEOUT_MS,
    )
  }

  const tryUrl = async (url: string) => {
    let last: any = null
    for (const cert_client of certModes) {
      let r = await doGet(url, cert_client)

      if (!r.res.ok && isUnauthorizedPayload(r.res.status, r.data)) {
        invalidateTokenCache()
        accessToken = await getAccessToken()
        r = await doGet(url, cert_client)
      }

      last = r
      if (r.res.ok && r.data) return r
    }
    return last
  }

  const url1 = buildMwUrl(BASE_URL, GET_TX_PATH_PREFIX, txid)
  const r1 = await tryUrl(url1)
  if (r1?.res?.ok && r1.data) return { ok: true, status: r1.res.status, data: r1.data, url: url1 }

  const url2 = buildMwUrl(BASE_URL, GET_TX_PATH_PREFIX_FALLBACK, txid)
  const r2 = await tryUrl(url2)
  if (r2?.res?.ok && r2.data) return { ok: true, status: r2.res.status, data: r2.data, url: url2 }

  return {
    ok: false,
    status: r2?.res?.status || r1?.res?.status,
    data: r2?.data || r1?.data,
    text: (r2?.text || r1?.text || "").slice(0, 1200),
    urlTried: { url1, url2 },
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
  for (const cert_client of certModes) {
    created = await doCreate(cert_client)

    if (!created.res.ok && isUnauthorizedPayload(created.res.status, created.data)) {
      invalidateTokenCache()
      accessToken = await getAccessToken()
      created = await doCreate(cert_client)
    }

    if (created.res.ok) break
  }

  if (!created?.res?.ok) {
    console.error("MWBANK CREATE PIX ERROR:", {
      status: created?.res?.status,
      body: created?.text?.slice(0, 1200),
      code: externalRef,
      amount: amountBRL,
      client_id: mask(CLIENT_ID),
      has_client_secret: !!CLIENT_SECRET,
      has_cert_client: !!CERT_CLIENT_BASE64,
      triedCertModes: ["base64", "cert_client+base64"],
    })
    throw new Error(`Falha ao gerar PIX (MWBANK) (HTTP ${created?.res?.status}): ${created?.text}`)
  }

  const picked = pickCreatedPix(created.data)

  if (!picked.txid || !picked.copia) {
    console.error("MWBANK CREATE PIX: resposta sem TXID/pixCopiaECola (bloqueado):", {
      keys: Object.keys(created.data || {}),
      dataPreview: created.data,
      code: externalRef,
      amount: amountBRL,
    })
    throw new Error("MWBANK: PIX não retornou txid/pixCopiaECola. Transação não confirmada.")
  }

  const check = await getTransactionFromGateway(picked.txid)

  if (!check.ok) {
    console.error("MWBANK CREATE PIX: txid não confirmado no gateway (bloqueado):", {
      txid: picked.txid,
      code: externalRef,
      amount: amountBRL,
      httpStatus: check.status,
      text: (check as any)?.text,
      urlTried: (check as any)?.urlTried,
    })
    throw new Error("MWBANK: PIX não confirmado no gateway. Bloqueado para evitar PIX fantasma.")
  }

  const gw = pickGetTx(check.data)

  if (!gw.txid || String(gw.txid).trim() !== String(picked.txid).trim()) {
    console.error("MWBANK GET TX: retorno inconsistente (bloqueado):", {
      expected: picked.txid,
      got: gw.txid,
      url: (check as any)?.url,
      dataPreview: check.data,
    })
    throw new Error("MWBANK: retorno inconsistente ao confirmar transação. Bloqueado.")
  }

  const finalCopia = gw.copia || picked.copia
  const finalQr = gw.qr || picked.qr || null

  if (!finalCopia) {
    console.error("MWBANK GET TX: sem pixCopiaECola mesmo após confirmar (bloqueado):", {
      txid: picked.txid,
      url: (check as any)?.url,
      dataPreview: check.data,
    })
    throw new Error("MWBANK: transação confirmada mas sem pixCopiaECola. Bloqueado.")
  }

  return {
    raw: { created: created.data, confirmed: check.data },
    transactionId: picked.txid,
    amount: amountBRL,
    status: gw.status || picked.status || null,
    pixCopiaECola: finalCopia,
    qrCodeBase64: null,
    expiresAt: null,
    // (finalQr fica no raw.confirmed se você quiser usar depois)
  }
}
