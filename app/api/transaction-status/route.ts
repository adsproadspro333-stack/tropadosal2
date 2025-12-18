// app/api/transaction-status/route.ts

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import crypto from "crypto"

const FB_PIXEL_ID = process.env.FACEBOOK_PIXEL_ID
const FB_CAPI_TOKEN = process.env.FACEBOOK_CAPI_TOKEN
const FB_TEST_EVENT_CODE = process.env.FB_TEST_EVENT_CODE

const SITE_URL = process.env.SITE_URL || "https://favelapremios.plataformapremios.site"

// tempo de “lock” pra não mandar Purchase duplicado com polling agressivo
const PURCHASE_LOCK_TTL_MS = 90 * 1000 // 90s

// ================= MWBANK (AUTH + GET TX) =================
const MWBANK_BASE_URL = (process.env.MWBANK_BASE_URL || "https://core.mwbank.app").replace(/\/+$/, "")
const MWBANK_CLIENT_ID = (process.env.MWBANK_CLIENT_ID || "").trim()

// base64 (1 linha) - pode vir com aspas, espaços, quebras ou até PEM
const MWBANK_CERT_CLIENT_RAW = process.env.MWBANK_CERT_CLIENT

// Você pode setar UM dos dois abaixo:
// 1) MWBANK_GET_TX_PATH_PREFIX="/pix/"  -> vira /pix/{txid}
// 2) MWBANK_GET_TX_PATH_PREFIX="/pix-in/get-transaction/" -> vira /pix-in/get-transaction/{txid}
const MWBANK_GET_TX_PATH_PREFIX = (process.env.MWBANK_GET_TX_PATH_PREFIX || "/pix/").trim()

// fallback opcional (se o prefix acima falhar)
const MWBANK_GET_TX_PATH_PREFIX_FALLBACK = (process.env.MWBANK_GET_TX_PATH_PREFIX_FALLBACK || "/pix-in/get-transaction/").trim()

const MWBANK_TIMEOUT_MS = Number(process.env.MWBANK_TIMEOUT_MS || 12000)

// =====================
// Token Manager (cache + auto-renew + dedupe concorrência)
// =====================
const TOKEN_RENEW_SKEW_MS = 90_000 // 90s
const MIN_TTL_SEC = 60
type CachedToken = { token: string; expiresAt: number } // ms epoch
let cachedToken: CachedToken | null = null
let inFlightTokenPromise: Promise<string> | null = null

function normalizeBase64OneLine(value?: string) {
  // remove quebras de linha / espaços e aspas acidentais do .env
  let v = (value || "").replace(/[\r\n\s]+/g, "").trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim()
  }
  return v
}

function normalizeCertClient(value?: string) {
  // 1) tira espaços/quebras/aspas
  let v = (value || "").trim()
  if (!v) return ""

  // remove aspas externas
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim()
  }

  // 2) se veio PEM (BEGIN/END), converte para base64 (1 linha)
  // (mwbank doc pede cert_client em base64)
  if (v.includes("-----BEGIN") && v.includes("-----END")) {
    const pem = v.replace(/\r\n/g, "\n")
    const b64 = Buffer.from(pem, "utf8").toString("base64")
    return normalizeBase64OneLine(b64)
  }

  // 3) caso normal: já base64 em 1 linha
  return normalizeBase64OneLine(v)
}

function mask(value: string, keepStart = 6, keepEnd = 4) {
  if (!value) return ""
  if (value.length <= keepStart + keepEnd) return "***"
  return `${value.slice(0, keepStart)}...${value.slice(-keepEnd)}`
}

function withTimeout(ms: number) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), ms)
  return { controller, clear: () => clearTimeout(t) }
}

function buildMwUrl(prefixRaw: string, txid: string) {
  const prefix = (prefixRaw || "/pix/").trim()
  const p = prefix.startsWith("/") ? prefix : `/${prefix}`
  return `${MWBANK_BASE_URL}${p}${encodeURIComponent(String(txid).trim())}`
}

function extractMwStatus(data: any): string | null {
  const payload = data?.data ?? data ?? {}
  const status =
    payload?.status ??
    payload?.statusTransaction ??
    payload?.transactionStatus ??
    payload?.status_transaction ??
    payload?.situacao ??
    null
  return status ? String(status) : null
}

async function doAuthRequest(opts: {
  url: string
  client_id: string
  cert_client: string
  mode: "no_body" | "json_empty" | "empty_body_with_ct"
  timeoutMs: number
}) {
  const { controller, clear } = withTimeout(opts.timeoutMs)
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      client_id: opts.client_id,
      cert_client: opts.cert_client,
    }

    // IMPORTANTE:
    // - mode no_body: sem body e sem Content-Type (forma mais compatível)
    // - mode json_empty: seu formato atual (Content-Type + body {})
    // - mode empty_body_with_ct: body vazio, mas com Content-Type
    let fetchInit: RequestInit = {
      method: "POST",
      headers,
      signal: controller.signal,
    }

    if (opts.mode === "json_empty") {
      fetchInit = {
        ...fetchInit,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    } else if (opts.mode === "empty_body_with_ct") {
      fetchInit = {
        ...fetchInit,
        headers: { ...headers, "Content-Type": "application/json" },
        body: "",
      }
    } else {
      // no_body -> não setar Content-Type nem body
    }

    const res = await fetch(opts.url, fetchInit)

    const text = await res.text()
    let data: any = null
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      console.error("[transaction-status] MWBANK AUTH NON-JSON:", {
        httpStatus: res.status,
        mode: opts.mode,
        body: text?.slice?.(0, 500),
        client_id: mask(opts.client_id),
        cert_client_prefix: opts.cert_client ? `${opts.cert_client.slice(0, 12)}...` : "",
        url: opts.url,
      })
      return { ok: false, status: res.status, data: null, text }
    }

    return { ok: res.ok, status: res.status, data, text }
  } finally {
    clear()
  }
}

async function fetchNewAccessToken() {
  if (!MWBANK_CLIENT_ID) throw new Error("MWBANK_CLIENT_ID não configurado")
  if (!MWBANK_BASE_URL) throw new Error("MWBANK_BASE_URL inválida")

  const cert_client = normalizeCertClient(MWBANK_CERT_CLIENT_RAW)
  if (!cert_client) {
    throw new Error("MWBANK_CERT_CLIENT não configurado (base64 do cert_client/pub registrado na MWBank)")
  }

  const url = `${MWBANK_BASE_URL}/auth/token`

  // tentativa 1: mais compatível (sem body / sem content-type)
  const try1 = await doAuthRequest({
    url,
    client_id: MWBANK_CLIENT_ID,
    cert_client,
    mode: "no_body",
    timeoutMs: MWBANK_TIMEOUT_MS,
  })

  // tentativa 2: seu formato atual
  const try2 =
    try1.ok
      ? null
      : await doAuthRequest({
          url,
          client_id: MWBANK_CLIENT_ID,
          cert_client,
          mode: "json_empty",
          timeoutMs: MWBANK_TIMEOUT_MS,
        })

  // tentativa 3: body vazio com content-type (variação comum em gateways)
  const try3 =
    (try1.ok || try2?.ok)
      ? null
      : await doAuthRequest({
          url,
          client_id: MWBANK_CLIENT_ID,
          cert_client,
          mode: "empty_body_with_ct",
          timeoutMs: MWBANK_TIMEOUT_MS,
        })

  const best = (try1.ok ? try1 : try2?.ok ? try2 : try3) || try1

  const data = best.data || {}
  const hasError =
    !!data?.error ||
    !!data?.message?.toLowerCase?.().includes?.("unauthor") ||
    data?.success === false

  if (!best.ok || hasError) {
    console.error("[transaction-status] MWBANK AUTH ERROR:", {
      httpStatus: best.status,
      modeTried: try1.ok ? "no_body" : try2?.ok ? "json_empty" : "empty_body_with_ct",
      payload: { success: data?.success, error: data?.error, message: data?.message },
      client_id: mask(MWBANK_CLIENT_ID),
      url,
    })

    const reason =
      data?.error ||
      data?.message ||
      `HTTP ${best.status} - auth failed`

    throw new Error(`MWBANK auth falhou: ${reason}`)
  }

  const token = data?.access_token || data?.token || data?.data?.access_token || null
  if (!token) throw new Error("MWBANK auth: access_token não veio na resposta")

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

async function mwGet(url: string): Promise<{ ok: boolean; data?: any; text?: string; status: number }> {
  const accessToken = await getAccessToken()
  const { controller, clear } = withTimeout(MWBANK_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        client_id: MWBANK_CLIENT_ID,
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    })

    const text = await res.text()
    if (!res.ok) return { ok: false, status: res.status, text }

    try {
      const data = text ? JSON.parse(text) : {}
      return { ok: true, status: res.status, data }
    } catch {
      return { ok: false, status: res.status, text }
    }
  } finally {
    clear()
  }
}

type MwTxResult = { ok: boolean; status?: string | null; raw?: any; error?: string }

async function fetchMwTransactionStatus(txid: string): Promise<MwTxResult> {
  if (!MWBANK_CLIENT_ID) return { ok: false, error: "missing_mwbank_client_id" }
  if (!MWBANK_CERT_CLIENT_RAW) return { ok: false, error: "missing_mwbank_cert_client" }

  const cleanTxid = String(txid || "").trim()
  if (!cleanTxid) return { ok: false, error: "missing_txid" }

  const url1 = buildMwUrl(MWBANK_GET_TX_PATH_PREFIX, cleanTxid)
  try {
    const r1 = await mwGet(url1)
    if (r1.ok) {
      const status = extractMwStatus(r1.data)
      return { ok: true, status, raw: r1.data }
    }

    const url2 = buildMwUrl(MWBANK_GET_TX_PATH_PREFIX_FALLBACK, cleanTxid)
    const r2 = await mwGet(url2)
    if (r2.ok) {
      const status = extractMwStatus(r2.data)
      return { ok: true, status, raw: r2.data }
    }

    console.error("[transaction-status] MWBANK GET ERROR:", {
      url1,
      r1: { status: r1.status, text: r1.text?.slice?.(0, 500) },
      url2,
      r2: { status: r2.status, text: r2.text?.slice?.(0, 500) },
    })

    return { ok: false, error: `mwbank_http_${r2.status || r1.status}`, raw: { r1, r2 } }
  } catch (err: any) {
    const aborted = err?.name === "AbortError"
    console.error("[transaction-status] MWBANK GET EXCEPTION:", aborted ? "timeout" : err)
    return { ok: false, error: aborted ? "mwbank_timeout" : "mwbank_exception" }
  }
}

function mapMwStatusToInternal(statusRaw: string | null | undefined) {
  const s = String(statusRaw || "").trim().toLowerCase()

  // pago
  if (
    s === "pago" ||
    s === "paid" ||
    s === "sucesso" ||
    s === "success" ||
    s === "aprovado" ||
    s === "approved" ||
    s === "confirmado" ||
    s === "confirmed" ||
    s === "completed" ||
    s === "concluido" ||
    s === "concluído"
  ) return "paid"

  // pendente
  if (
    s === "ativo" ||
    s === "active" ||
    s === "pending" ||
    s === "waiting_payment" ||
    s === "aguardando" ||
    s === "awaiting_payment" ||
    s === "created" ||
    s === "criado"
  ) return "pending"

  // expirado / cancelado
  if (s === "expirado" || s === "expired") return "expired"
  if (s === "cancelado" || s === "canceled" || s === "cancelled") return "canceled"

  return "unknown"
}

// ================= utils atuais (mantidos) =================
function sha256(value: string) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex")
}
function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}
function normalizePhone(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "")
  if (!digits) return ""
  if (digits.startsWith("55")) return digits
  if (digits.length >= 10) return `55${digits}`
  return digits
}
function normalizeCpf(cpf: string) {
  return String(cpf || "").replace(/\D/g, "")
}
function safeJsonParse(input: any) {
  try {
    if (!input) return null
    if (typeof input === "object") return input
    if (typeof input === "string") return JSON.parse(input)
    return null
  } catch {
    return null
  }
}
function safeStringify(obj: any) {
  try {
    return JSON.stringify(obj ?? {})
  } catch {
    return "{}"
  }
}

function hasPurchaseSentInOrder(transactions: Array<{ meta: any }>) {
  for (const t of transactions || []) {
    const metaObj = safeJsonParse((t as any)?.meta) || {}
    if (metaObj?.purchaseSentAt) return true
  }
  return false
}

function hasActivePurchaseLock(metaObj: any) {
  const ts = metaObj?.purchasePendingAt
  if (!ts) return false
  const t = new Date(ts).getTime()
  if (!Number.isFinite(t)) return false
  return Date.now() - t <= PURCHASE_LOCK_TTL_MS
}

async function trySendPurchaseFallback(opts: { orderId: string; txId: string }) {
  if (!FB_PIXEL_ID || !FB_CAPI_TOKEN) return { sent: false, reason: "no_capi_env" }

  const txDb = await prisma.transaction.findUnique({
    where: { id: opts.txId },
    select: {
      id: true,
      value: true,
      status: true,
      meta: true,
      order: {
        select: {
          id: true,
          amount: true,
          quantity: true,
          metaEventId: true,
          user: { select: { email: true, phone: true, cpf: true } },
          transactions: {
            orderBy: { createdAt: "desc" },
            select: { id: true, meta: true },
          },
        },
      },
    },
  })

  if (!txDb?.order) return { sent: false, reason: "missing_order" }

  if (String(txDb.status || "").toLowerCase() !== "paid") {
    return { sent: false, reason: "tx_not_paid" }
  }

  if (hasPurchaseSentInOrder(txDb.order.transactions || [])) {
    return { sent: false, reason: "already_sent_in_order" }
  }

  const metaObj =
    safeJsonParse(txDb.meta) ||
    safeJsonParse(txDb.order.transactions?.[0]?.meta) ||
    {}

  if (hasActivePurchaseLock(metaObj)) {
    return { sent: false, reason: "locked" }
  }

  const nowIso = new Date().toISOString()
  const lockMeta = {
    ...(metaObj || {}),
    purchasePendingAt: nowIso,
    purchaseLastError: metaObj?.purchaseLastError || null,
  }

  await prisma.transaction.update({
    where: { id: txDb.id },
    data: { meta: safeStringify(lockMeta) },
  })

  const valueNumber = Number(txDb.value) || Number(txDb.order.amount) || 0

  const userData: any = {}
  const dbUser = txDb.order.user

  if (dbUser?.email) userData.em = [sha256(normalizeEmail(dbUser.email))]
  if (dbUser?.phone) {
    const ph = normalizePhone(dbUser.phone)
    if (ph) userData.ph = [sha256(ph)]
  }
  if (dbUser?.cpf) {
    const cpf = normalizeCpf(dbUser.cpf)
    if (cpf) userData.external_id = [sha256(cpf)]
  }

  const uaFromMeta = metaObj?.clientUserAgent || metaObj?.client_user_agent
  const ipFromMeta = metaObj?.clientIpAddress || metaObj?.client_ip_address
  const fbp = metaObj?.fbp
  const fbc = metaObj?.fbc

  if (uaFromMeta) userData.client_user_agent = uaFromMeta
  if (ipFromMeta) userData.client_ip_address = ipFromMeta
  if (fbp) userData.fbp = fbp
  if (fbc) userData.fbc = fbc

  const eventId = txDb.order.metaEventId || txDb.id
  const eventTime = Math.floor(Date.now() / 1000)

  const capiBody: any = {
    data: [
      {
        event_name: "Purchase",
        event_time: eventTime,
        action_source: "website",
        event_id: String(eventId),
        event_source_url: `${SITE_URL}/pagamento-confirmado?orderId=${opts.orderId}`,
        custom_data: {
          currency: "BRL",
          value: valueNumber,
          order_id: opts.orderId,
          contents: [
            {
              id: String(opts.orderId),
              quantity: txDb.order.quantity ?? 1,
              item_price: valueNumber,
            },
          ],
          content_type: "product",
        },
        user_data: userData,
      },
    ],
  }

  if (FB_TEST_EVENT_CODE) capiBody.test_event_code = FB_TEST_EVENT_CODE

  const capiUrl = `https://graph.facebook.com/v21.0/${FB_PIXEL_ID}/events?access_token=${FB_CAPI_TOKEN}`

  const prevAttempts = Number(metaObj?.purchaseAttemptCount || 0) || 0
  const attemptNow = prevAttempts + 1

  const capiRes = await fetch(capiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(capiBody),
  })

  const capiText = await capiRes.text()
  console.log("[transaction-status] META CAPI RESPONSE (Purchase):", capiRes.status, capiText)

  const mergedMeta = {
    ...(metaObj || {}),
    purchasePendingAt: nowIso,
    purchaseLastAttemptAt: nowIso,
    purchaseAttemptCount: attemptNow,
    capiEventId: String(eventId),
    capiStatus: capiRes.status,
    capiResponse: String(capiText || "").slice(0, 2000),
    purchaseLastError: capiRes.ok ? null : `CAPI_NOT_OK_${capiRes.status}`,
    ...(capiRes.ok ? { purchaseSentAt: nowIso } : {}),
  }

  if (!capiRes.ok) {
    delete (mergedMeta as any).purchasePendingAt
  }

  await prisma.transaction.update({
    where: { id: txDb.id },
    data: { meta: safeStringify(mergedMeta) },
  })

  return { sent: capiRes.ok, reason: capiRes.ok ? "ok" : "capi_not_ok" }
}

// GET /api/transaction-status?id=TRANSACTION_ID_OR_TXID
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const idRaw = searchParams.get("id")

    const id = String(idRaw || "").trim()

    if (!id) {
      console.error("[transaction-status] Sem ID na query")
      return NextResponse.json({ ok: false, error: "Missing transaction id" }, { status: 400 })
    }

    // ==========================================================
    // ✅ SUPORTE DUPLO:
    // - id do Prisma (tx.id)
    // - txid/gatewayId (tx.gatewayId)
    //
    // Importante: NÃO retornar 404 aqui, porque o front faz:
    // if (!res.ok) return
    // e mata o polling/redirect.
    // ==========================================================

    // 1) tenta por gatewayId (txid) primeiro (pode ter múltiplas, pega a mais recente)
    let tx = await prisma.transaction.findFirst({
      where: { gatewayId: id },
      include: { order: true },
      orderBy: { createdAt: "desc" },
    })

    // 2) fallback: tenta como id do banco (prisma)
    if (!tx) {
      tx = await prisma.transaction.findUnique({
        where: { id },
        include: { order: true },
      })
    }

    if (!tx) {
      console.warn("[transaction-status] Transação não encontrada (id pode ser txid ou db id):", id)

      // ✅ devolve 200 pra não quebrar o polling
      return NextResponse.json(
        {
          ok: true,
          status: "pending",
          orderId: null,
          notFound: true,
        },
        { status: 200 },
      )
    }

    const orderId = tx.orderId ?? tx.order?.id ?? null
    const statusLower = String(tx.status || "").toLowerCase()

    // ====== resolve txid para consultar MW (gatewayId OU meta.provider) ======
    const metaObj = safeJsonParse((tx as any)?.meta) || {}
    const metaGatewayId =
      metaObj?.provider?.gatewayId ||
      metaObj?.provider?.id ||
      metaObj?.gatewayId ||
      metaObj?.txid ||
      null

    const txidToCheck = String(tx.gatewayId || metaGatewayId || "").trim() || null

    // =================== SYNC COM MW (somente se ainda não estiver paid) ===================
    if (statusLower !== "paid" && txidToCheck) {
      const mw = await fetchMwTransactionStatus(txidToCheck)

      if (mw.ok) {
        const mapped = mapMwStatusToInternal(mw.status)

        if (mapped === "paid") {
          console.log("[transaction-status] MW -> PAID. Atualizando DB.", {
            txId: tx.id,
            gatewayId: txidToCheck,
            mwStatus: mw.status,
            orderId,
          })

          tx = await prisma.transaction.update({
            where: { id: tx.id },
            data: {
              status: "paid",
              // se estava vazio, preenche (ajuda demais)
              gatewayId: tx.gatewayId || txidToCheck,
            },
            include: { order: true },
          })

          if (orderId) {
            const orderBefore = await prisma.order.findUnique({
              where: { id: orderId },
              select: { id: true, status: true },
            })

            if (orderBefore && orderBefore.status !== "paid") {
              await prisma.order.update({
                where: { id: orderId },
                data: { status: "paid" },
              })
            }
          }
        }
      } else {
        console.log("[transaction-status] MW sync falhou (não bloqueia):", {
          txId: tx.id,
          gatewayId: txidToCheck,
          reason: mw.error,
        })
      }
    }

    // ✅ Fallback: se tá paid, tenta mandar Purchase aqui (idempotente)
    const finalStatusLower = String(tx.status || "").toLowerCase()

    if (finalStatusLower === "paid" && orderId) {
      try {
        const result = await trySendPurchaseFallback({ orderId, txId: tx.id })
        console.log("[transaction-status] purchase fallback:", { orderId, txId: tx.id, ...result })
      } catch (e) {
        console.error("[transaction-status] Falha no fallback do Purchase:", e)
      }
    }

    console.log("[transaction-status] ->", { id, status: tx.status, orderId, gatewayId: tx.gatewayId })

    return NextResponse.json({
      ok: true,
      // ✅ mantém compatível com seu front (ele espera "paid")
      status: String(tx.status || "").toLowerCase(),
      orderId,
    })
  } catch (err: any) {
    console.error("ERRO /api/transaction-status:", err)
    return NextResponse.json({ ok: false, error: err?.message || "Erro inesperado" }, { status: 500 })
  }
}
