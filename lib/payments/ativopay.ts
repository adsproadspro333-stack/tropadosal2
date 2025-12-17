// lib/payments/ativopay.ts
// ✅ Mantém o mesmo arquivo/nome para não quebrar imports
// ✅ Integra com MWBank
// ✅ Anti PIX fantasma: confirma existência no gateway via GET /pix/{txid} antes de retornar

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
  // evita float estranho: sempre 2 casas
  const v = Math.round(Number(amountCents || 0))
  return Number((v / 100).toFixed(2))
}

function normalizeOneLine(value?: string) {
  let v = (value || "").trim()

  // remove aspas envolvendo o valor (muito comum no .env)
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim()
  }

  // remove quebras e espaços
  v = v.replace(/[\r\n\s]+/g, "").trim()
  return v
}

function normalizeBase64Flexible(value?: string) {
  // Aceita:
  // - base64 normal (com + /)
  // - base64url (com - _)
  // - com ou sem padding =
  let v = normalizeOneLine(value)
  if (!v) return ""

  // base64url -> base64
  v = v.replace(/-/g, "+").replace(/_/g, "/")

  // adiciona padding se faltar
  const mod = v.length % 4
  if (mod === 2) v += "=="
  else if (mod === 3) v += "="
  else if (mod === 1) {
    // inválido, não “inventar”
    return ""
  }

  // valida (sem expor conteúdo)
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
  const CERT_CLIENT = normalizeBase64Flexible(process.env.MWBANK_CERT_CLIENT)

  const SITE_URL = (process.env.SITE_URL || "").replace(/\/+$/, "")
  const DEFAULT_WEBHOOK_URL =
    (process.env.MWBANK_WEBHOOK_URL || "").trim() ||
    (SITE_URL ? `${SITE_URL}/api/webhook/ativopay` : "")

  // paths (mantém compatível com o que você já usa no transaction-status)
  const GET_TX_PATH_PREFIX = (process.env.MWBANK_GET_TX_PATH_PREFIX || "/pix/").trim()
  const GET_TX_PATH_PREFIX_FALLBACK = (process.env.MWBANK_GET_TX_PATH_PREFIX_FALLBACK || "/pix-in/get-transaction/").trim()

  const TIMEOUT_MS = Number(process.env.MWBANK_TIMEOUT_MS || 12000)

  return {
    BASE_URL,
    CLIENT_ID,
    CERT_CLIENT,
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

const TOKEN_RENEW_SKEW_MS = 90_000 // 90s
const MIN_TTL_SEC = 60

type CachedToken = { token: string; expiresAt: number } // expiresAt em ms epoch
let cachedToken: CachedToken | null = null
let inFlightTokenPromise: Promise<string> | null = null

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

    // Alguns proxies/gateways dão 404 quando vem JSON/body no auth.
    if (opts.mode === "json_empty") {
      init = { ...init, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({}) }
    } else if (opts.mode === "empty_body_with_ct") {
      init = { ...init, headers: { ...headers, "Content-Type": "application/json" }, body: "" }
    } else {
      // no_body: sem body e sem content-type
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
  const { BASE_URL, CLIENT_ID, CERT_CLIENT, TIMEOUT_MS } = getEnv()

  if (!CLIENT_ID) throw new Error("MWBANK_CLIENT_ID não configurado")
  if (!BASE_URL) throw new Error("MWBANK_BASE_URL inválida")
  if (!CERT_CLIENT) {
    throw new Error("MWBANK_CERT_CLIENT inválido/ausente (precisa ser base64 válido em 1 linha, sem aspas/quebras)")
  }

  const url = `${BASE_URL}/auth/token`

  // tenta do jeito mais compatível primeiro
  const a = await doAuthRequest({ url, clientId: CLIENT_ID, certClient: CERT_CLIENT, mode: "no_body", timeoutMs: TIMEOUT_MS })
  const b = a.ok ? null : await doAuthRequest({ url, clientId: CLIENT_ID, certClient: CERT_CLIENT, mode: "json_empty", timeoutMs: TIMEOUT_MS })
  const c = (a.ok || b?.ok) ? null : await doAuthRequest({ url, clientId: CLIENT_ID, certClient: CERT_CLIENT, mode: "empty_body_with_ct", timeoutMs: TIMEOUT_MS })

  const best = (a.ok ? a : b?.ok ? b : c) || a
  const data = best.data || {}

  const success = data?.success
  const hasError =
    !!data?.error ||
    !!data?.message?.toLowerCase?.().includes?.("unauthor") ||
    success === false

  if (!best.ok || hasError) {
    console.error("MWBANK AUTH ERROR:", {
      httpStatus: best.status,
      payload: { success: data?.success, error: data?.error, message: data?.message },
      client_id: mask(CLIENT_ID),
      cert_client_prefix: CERT_CLIENT ? `${CERT_CLIENT.slice(0, 12)}...` : "",
      tried: a.ok ? "no_body" : b?.ok ? "json_empty" : "empty_body_with_ct",
    })
    const reason = data?.error || data?.message || `HTTP ${best.status} - auth failed`
    throw new Error(`MWBANK auth falhou: ${reason}`)
  }

  const token = data?.access_token || data?.token || data?.data?.access_token || null
  if (!token) {
    console.error("MWBANK auth: payload inesperado (sem access_token):", {
      httpStatus: best.status,
      keys: Object.keys(data || {}),
      payloadPreview: data,
    })
    throw new Error("MWBANK auth: access_token não veio na resposta")
  }

  const expiresInSecRaw = Number(data?.expires_in ?? data?.expiresIn ?? 3600)
  const expiresInSec = Number.isFinite(expiresInSecRaw) ? expiresInSecRaw : 3600
  const ttlSec = Math.max(MIN_TTL_SEC, expiresInSec)

  cachedToken = { token: String(token), expiresAt: Date.now() + ttlSec * 1000 }
  return String(token)
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

function pickCreatedPix(data: any) {
  // Aqui a gente fica mais “estrito”:
  // - Os campos oficiais do MWBank pix-in são txid, pixCopiaECola e qrCode.
  // - NÃO aceitar "emv/qr_code" como substituto silencioso, porque isso é fonte de PIX fantasma.
  const root = data || {}
  const d = root.data || root

  const txid =
    d?.txid ||
    root?.txid ||
    d?.transactionId ||
    root?.transactionId ||
    null

  const copia =
    d?.pixCopiaECola ||
    root?.pixCopiaECola ||
    null

  const qr =
    d?.qrCode ||
    root?.qrCode ||
    null

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
  const { BASE_URL, CLIENT_ID, GET_TX_PATH_PREFIX, GET_TX_PATH_PREFIX_FALLBACK, TIMEOUT_MS } = getEnv()

  if (!CLIENT_ID) throw new Error("MWBANK_CLIENT_ID não configurado")
  if (!BASE_URL) throw new Error("MWBANK_BASE_URL inválida")

  const accessToken = await getAccessToken()

  const url1 = buildMwUrl(BASE_URL, GET_TX_PATH_PREFIX, txid)
  const r1 = await mwFetch(
    url1,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        client_id: CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
      },
    },
    TIMEOUT_MS,
  )

  if (r1.res.ok && r1.data) return { ok: true, status: r1.res.status, data: r1.data, url: url1 }

  // fallback de path
  const url2 = buildMwUrl(BASE_URL, GET_TX_PATH_PREFIX_FALLBACK, txid)
  const r2 = await mwFetch(
    url2,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        client_id: CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
      },
    },
    TIMEOUT_MS,
  )

  if (r2.res.ok && r2.data) return { ok: true, status: r2.res.status, data: r2.data, url: url2 }

  return {
    ok: false,
    status: r2.res.status || r1.res.status,
    data: r2.data || r1.data,
    text: (r2.text || r1.text || "").slice(0, 1200),
    urlTried: { url1, url2 },
  }
}

export async function createPixTransaction(params: CreatePixParams) {
  const { BASE_URL, CLIENT_ID, DEFAULT_WEBHOOK_URL, TIMEOUT_MS } = getEnv()

  if (!CLIENT_ID) throw new Error("MWBANK_CLIENT_ID não configurado")
  if (!BASE_URL) throw new Error("MWBANK_BASE_URL inválida")

  const accessToken = await getAccessToken()
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

  const created = await mwFetch(
    url,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        client_id: CLIENT_ID,
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    },
    TIMEOUT_MS,
  )

  if (!created.res.ok) {
    console.error("MWBANK CREATE PIX ERROR:", {
      status: created.res.status,
      body: created.text?.slice(0, 1200),
      code: externalRef,
      amount: amountBRL,
      client_id: mask(CLIENT_ID),
    })
    throw new Error(`Falha ao gerar PIX (MWBANK) (HTTP ${created.res.status}): ${created.text}`)
  }

  const picked = pickCreatedPix(created.data)

  // 🔒 PRIMEIRO BLOQUEIO: sem txid + sem copia e cola = inválido
  if (!picked.txid || !picked.copia) {
    console.error("MWBANK CREATE PIX: resposta sem TXID/pixCopiaECola (bloqueado):", {
      keys: Object.keys(created.data || {}),
      dataPreview: created.data,
      code: externalRef,
      amount: amountBRL,
    })
    throw new Error("MWBANK: PIX não retornou txid/pixCopiaECola. Transação não confirmada.")
  }

  // ✅ SEGUNDO BLOQUEIO (DEFINITIVO): confirmar existência no gateway antes de retornar
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

  // exige que o txid exista de fato no payload do GET (ou bate pelo próprio parâmetro)
  if (!gw.txid || String(gw.txid).trim() !== String(picked.txid).trim()) {
    console.error("MWBANK GET TX: retorno inconsistente (bloqueado):", {
      expected: picked.txid,
      got: gw.txid,
      url: (check as any)?.url,
      dataPreview: check.data,
    })
    throw new Error("MWBANK: retorno inconsistente ao confirmar transação. Bloqueado.")
  }

  // Preferir sempre o pixCopiaECola/qrCode confirmados do GET (fonte da verdade)
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
    transactionId: picked.txid, // ✅ txid oficial
    amount: amountBRL,
    status: gw.status || picked.status || null,
    pixCopiaECola: finalCopia,
    qrCodeBase64: null, // MWBank usa qrCode (string), não base64. Mantemos compatível com seu front.
    // Se o seu front precisar de base64 no futuro, a gente gera a imagem a partir do qrCode (sem quebrar nada).
    expiresAt: null,
    // compat: se você já consome qrCodeBase64, você já retorna null hoje.
    // o "qr" confirmado fica dentro do raw.confirmed e pode ser usado no /pagamento (sem expor gateway no front).
  }
}
