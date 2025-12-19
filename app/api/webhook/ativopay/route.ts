// app/api/webhook/ativopay/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import crypto from "crypto"
import { sendPushcutNotification } from "@/lib/pushcut"

export const runtime = "nodejs"

const IS_PRODUCTION = process.env.NODE_ENV === "production"

const FB_PIXEL_ID = process.env.FACEBOOK_PIXEL_ID
const FB_CAPI_TOKEN = process.env.FACEBOOK_CAPI_TOKEN
const FB_TEST_EVENT_CODE = process.env.FB_TEST_EVENT_CODE

const SITE_URL = (process.env.SITE_URL || "https://favelapremios.plataformapremios.site").replace(/\/+$/, "")
const PUSHCUT_ORDER_PAID_URL = process.env.PUSHCUT_ORDER_PAID_URL

// 🔒 IMPORTANTÍSSIMO: webhook NUNCA deve devolver 500 pro gateway.
const SAFE_OK = () => NextResponse.json({ ok: true }, { status: 200 })

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

function stringifyMeta(obj: any) {
  try {
    return JSON.stringify(obj ?? {})
  } catch {
    return "{}"
  }
}

function getEventTimeFromTx(tx: any) {
  const raw =
    tx?.paidAt ||
    tx?.paid_at ||
    tx?.approvedAt ||
    tx?.approved_at ||
    tx?.confirmedAt ||
    tx?.confirmed_at ||
    tx?.updatedAt ||
    tx?.updated_at ||
    tx?.createdAt ||
    tx?.created_at ||
    tx?.date ||
    tx?.timestamp ||
    null

  if (!raw) return Math.floor(Date.now() / 1000)
  const t = new Date(raw).getTime()
  if (Number.isNaN(t)) return Math.floor(Date.now() / 1000)
  return Math.floor(t / 1000)
}

function buildFbcFromFbclid(fbclid?: string, eventTime?: number) {
  const c = (fbclid || "").trim()
  if (!c) return null
  const ts = eventTime ? Number(eventTime) : Math.floor(Date.now() / 1000)
  if (!Number.isFinite(ts)) return null
  return `fb.1.${ts}.${c}`
}

function extractOrderIdFromTx(tx: any): string | null {
  const candidate =
    tx?.code ||
    tx?.externalRef ||
    tx?.external_ref ||
    tx?.reference ||
    tx?.orderId ||
    tx?.order_id ||
    null

  if (!candidate) return null
  const s = String(candidate).trim()
  return s ? s : null
}

function isPaidStatus(tx: any) {
  const raw =
    tx?.statusTransaction ??
    tx?.status_transaction ??
    tx?.status ??
    tx?.paymentStatus ??
    tx?.transactionStatus ??
    null

  const s = String(raw || "").trim().toLowerCase()
  if (!s) return false

  return (
    s === "sucesso" ||
    s === "success" ||
    s === "paid" ||
    s === "pago" ||
    s === "approved" ||
    s === "confirmado" ||
    s === "confirmed" ||
    s === "completed"
  )
}

function extractGatewayId(tx: any, json: any) {
  const id =
    tx?.idTransaction ||
    tx?.id_transaction ||
    tx?.txid ||
    tx?.transactionId ||
    tx?.id ||
    json?.idTransaction ||
    json?.txid ||
    json?.transactionId ||
    json?.id ||
    null

  const s = String(id || "").trim()
  return s || null
}

function extractPaidValueBRL(tx: any, json: any) {
  const raw =
    tx?.paid_amount ??
    tx?.paidAmount ??
    tx?.amountPaid ??
    tx?.amount_paid ??
    tx?.amount ??
    tx?.value ??
    json?.paid_amount ??
    json?.paidAmount ??
    json?.amount ??
    null

  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function extractTx(json: any) {
  return json?.data || json?.payload || json?.pix || json
}

// ✅ event_id determinístico (o mais importante pro Meta dedupar)
function buildDeterministicPurchaseEventId(input: {
  orderMetaEventId?: string | null
  transactionId: string
}) {
  const fromOrder = String(input.orderMetaEventId || "").trim()
  if (fromOrder) return fromOrder
  return `purchase_${String(input.transactionId)}`
}

export async function POST(req: Request) {
  try {
    const bodyText = await req.text()

    if (!IS_PRODUCTION) console.log("MW WEBHOOK RAW BODY (dev):", bodyText)
    else console.log("MW WEBHOOK RECEBIDO (prod): body length=", bodyText?.length ?? 0)

    const json = safeJsonParse(bodyText) || {}
    const tx = extractTx(json)

    if (!tx) {
      console.error("MW WEBHOOK: payload inválido:", json)
      return SAFE_OK()
    }

    const gatewayId = extractGatewayId(tx, json)
    const orderIdFromCode = extractOrderIdFromTx(tx)
    const statusRaw =
      tx?.statusTransaction ??
      tx?.status_transaction ??
      tx?.status ??
      tx?.transactionStatus ??
      null

    if (IS_PRODUCTION) {
      console.log("MW WEBHOOK (prod) parsed:", {
        gatewayId: gatewayId || null,
        orderIdFromCode: orderIdFromCode || null,
        status: statusRaw ? String(statusRaw).slice(0, 80) : null,
      })
    }

    if (!isPaidStatus(tx)) {
      console.log("MW WEBHOOK: status ignorado:", statusRaw)
      return SAFE_OK()
    }

    if (!gatewayId && !orderIdFromCode) {
      console.error("MW WEBHOOK: sem idTransaction/txid e sem code:", tx)
      return SAFE_OK()
    }

    const paidValueFromWebhook = extractPaidValueBRL(tx, json)
    const nowIso = new Date().toISOString()

    // 1) tenta achar por gatewayId
    let transaction =
      gatewayId
        ? await prisma.transaction.findFirst({
            where: { gatewayId },
            orderBy: { createdAt: "desc" },
          })
        : null

    // 2) fallback: tenta achar por orderId (code)
    if (!transaction && orderIdFromCode) {
      transaction = await prisma.transaction.findFirst({
        where: { orderId: orderIdFromCode },
        orderBy: { createdAt: "desc" },
      })
    }

    // ✅ webhook pode chegar ANTES de criar a Transaction.
    if (!transaction && orderIdFromCode) {
      const order = await prisma.order.findUnique({
        where: { id: orderIdFromCode },
        include: { user: true, transactions: { orderBy: { createdAt: "desc" } } },
      })

      if (!order) {
        console.error("MW WEBHOOK: order não encontrada pelo code:", { orderIdFromCode, gatewayId })
        return SAFE_OK()
      }

      const alreadyPaidTx = order.transactions?.find((t) => t.status === "paid") || null
      if (alreadyPaidTx) {
        console.log("MW WEBHOOK: order já tem transaction paid, ignorando criação:", {
          orderId: order.id,
          existingPaidTxId: alreadyPaidTx.id,
          gatewayId,
        })
        return SAFE_OK()
      }

      const valueToUse = Number(paidValueFromWebhook) || Number((order as any).amount) || 0

      try {
        const result = await prisma.$transaction(async (txp) => {
          const createdTx = await txp.transaction.create({
            data: {
              orderId: order.id,
              value: valueToUse,
              status: "paid",
              gatewayId: gatewayId || null,
              pixCopiaCola: null,
              meta: stringifyMeta({
                createdBy: "webhook_early_fix",
                receivedAt: nowIso,
                gatewayId: gatewayId || null,
                orderIdFromCode: orderIdFromCode,
                paidValueFromWebhook: paidValueFromWebhook ?? null,
                raw: IS_PRODUCTION ? undefined : json,
              }),
            },
          })

          if (order.status !== "paid") {
            await txp.order.update({
              where: { id: order.id },
              data: { status: "paid" },
            })
          }

          return { createdTx, orderId: order.id, firstTimePaid: true }
        })

        console.log("MW WEBHOOK: early-fix aplicado (tx criada + order paid):", {
          orderId: result.orderId,
          createdTxId: result.createdTx.id,
          gatewayId: gatewayId || null,
        })

        const ack = SAFE_OK()

        if (PUSHCUT_ORDER_PAID_URL) {
          setTimeout(() => {
            ;(async () => {
              try {
                await sendPushcutNotification(PUSHCUT_ORDER_PAID_URL, {
                  type: "order_paid",
                  orderId: result.orderId,
                  transactionId: result.createdTx.id,
                  amount: valueToUse,
                  paidAt: nowIso,
                })
              } catch (err) {
                console.error("Erro ao enviar Pushcut de pedido pago (early-fix):", err)
              }
            })()
          }, 0)
        }

        return ack
      } catch (e) {
        console.error("MW WEBHOOK: falha no early-fix (não bloqueando gateway):", e)
        return SAFE_OK()
      }
    }

    if (!transaction) {
      console.error("MW WEBHOOK: transação não encontrada:", { gatewayId, orderIdFromCode })
      return SAFE_OK()
    }

    const shouldUpdatePaid = transaction.status !== "paid"

    // ✅ Se achou por orderId e o gatewayId no banco está vazio/diferente, corrige
    if (gatewayId && transaction.gatewayId !== gatewayId) {
      try {
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { gatewayId },
        })
        ;(transaction as any).gatewayId = gatewayId
      } catch (e) {
        console.error("MW WEBHOOK: falha ao atualizar gatewayId na transaction:", e)
      }
    }

    // ✅ Atualiza paid (núcleo) + garante order paid ATOMICAMENTE
    let updatedTransaction = transaction
    let updatedOrderId = transaction.orderId

    try {
      const result = await prisma.$transaction(async (txp) => {
        let txUpdated = transaction

        if (transaction.status !== "paid") {
          const nextValue =
            Number(paidValueFromWebhook) && Number(paidValueFromWebhook) > 0 ? Number(paidValueFromWebhook) : undefined

          txUpdated = await txp.transaction.update({
            where: { id: transaction.id },
            data: {
              status: "paid",
              ...(nextValue !== undefined ? { value: nextValue } : {}),
            },
          })
        }

        const orderBefore = await txp.order.findUnique({
          where: { id: transaction.orderId },
          select: { id: true, status: true },
        })

        if (orderBefore && orderBefore.status !== "paid") {
          await txp.order.update({
            where: { id: transaction.orderId },
            data: { status: "paid" },
          })
        }

        return { txUpdated, orderId: transaction.orderId }
      })

      updatedTransaction = result.txUpdated
      updatedOrderId = result.orderId
    } catch (e) {
      console.error("MW WEBHOOK: falha ao atualizar paid/order (mas ack ok):", e)
      return SAFE_OK()
    }

    const orderWithUser = await prisma.order.findUnique({
      where: { id: updatedOrderId },
      include: { user: true, transactions: { orderBy: { createdAt: "desc" } } },
    })

    console.log("MW WEBHOOK: pagamento confirmado (ou já pago):", {
      gatewayId: gatewayId || transaction.gatewayId,
      orderId: updatedOrderId,
      transactionId: updatedTransaction.id,
      firstTimePaid: shouldUpdatePaid,
    })

    const ack = SAFE_OK()

    // PUSHCUT (não bloqueia)
    if (PUSHCUT_ORDER_PAID_URL && shouldUpdatePaid) {
      setTimeout(() => {
        ;(async () => {
          try {
            await sendPushcutNotification(PUSHCUT_ORDER_PAID_URL, {
              type: "order_paid",
              orderId: updatedOrderId,
              transactionId: updatedTransaction.id,
              amount: (updatedTransaction as any).value ?? (orderWithUser as any)?.amount ?? null,
              paidAt: nowIso,
            })
          } catch (err) {
            console.error("Erro ao enviar Pushcut de pedido pago:", err)
          }
        })()
      }, 0)
    }

    // META CAPI PURCHASE (não bloqueia)
    // ✅ Envia CAPI preferencialmente só no "first time paid" (reduz ruído)
    if (FB_PIXEL_ID && FB_CAPI_TOKEN && orderWithUser && shouldUpdatePaid) {
      setTimeout(() => {
        ;(async () => {
          try {
            const txForSignals =
              orderWithUser.transactions?.find((t) => t.id === updatedTransaction.id) ||
              orderWithUser.transactions?.[0] ||
              updatedTransaction

            const metaObj = safeJsonParse((txForSignals as any).meta) || {}

            // ✅ dedupe interno (nosso)
            if (metaObj?.purchaseSentAt) {
              console.log("META CAPI: Purchase já enviado antes, pulando:", {
                orderId: updatedOrderId,
                transactionId: updatedTransaction.id,
              })
              return
            }

            const eventTime = getEventTimeFromTx(tx)

            const valueNumber =
              Number((updatedTransaction as any).value) ||
              Number((orderWithUser as any)?.amount) ||
              0

            const userData: any = {}
            const dbUser = orderWithUser.user

            if (dbUser?.email) userData.em = [sha256(normalizeEmail(dbUser.email))]
            if (dbUser?.phone) {
              const ph = normalizePhone(dbUser.phone)
              if (ph) userData.ph = [sha256(ph)]
            }
            if (dbUser?.cpf) {
              const cpf = normalizeCpf(dbUser.cpf)
              if (cpf) userData.external_id = [sha256(cpf)]
            }

            // ✅ Sinais do browser (salvos quando gerou o pix)
            const uaFromMeta = metaObj?.clientUserAgent || metaObj?.client_user_agent
            const ipFromMeta = metaObj?.clientIpAddress || metaObj?.client_ip_address
            const fbpFromMeta = metaObj?.fbp
            const fbcFromMeta = metaObj?.fbc
            const fbclidFromMeta = metaObj?.fbclid

            if (uaFromMeta) userData.client_user_agent = uaFromMeta
            if (ipFromMeta) userData.client_ip_address = ipFromMeta

            const fbp = fbpFromMeta
            const fbc = fbcFromMeta || buildFbcFromFbclid(fbclidFromMeta, eventTime)

            if (fbp) userData.fbp = fbp
            if (fbc) userData.fbc = fbc

            // ✅ EVENT_ID FIXO = base da dedupe do Meta
            // prioridade: order.metaEventId (se você já salva) -> purchase_${transaction.id}
            const eventId = buildDeterministicPurchaseEventId({
              orderMetaEventId: (orderWithUser as any).metaEventId || metaObj?.metaEventId || null,
              transactionId: updatedTransaction.id,
            })

            const capiBody: any = {
              data: [
                {
                  event_name: "Purchase",
                  event_time: eventTime,
                  action_source: "website",
                  event_id: String(eventId),
                  event_source_url: `${SITE_URL}/pagamento-confirmado?orderId=${updatedOrderId}`,
                  custom_data: {
                    currency: "BRL",
                    value: valueNumber,
                    order_id: updatedOrderId,
                    contents: [
                      {
                        id: String(updatedOrderId),
                        quantity: (orderWithUser as any).quantity ?? 1,
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
            const nowIso2 = new Date().toISOString()

            const capiRes = await fetch(capiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(capiBody),
            })

            const capiText = await capiRes.text()
            console.log("META CAPI RESPONSE (Purchase):", capiRes.status, capiText)

            const mergedMetaBase = {
              ...(metaObj || {}),
              // ✅ grava o event_id usado (pra você sincronizar com o Pixel do browser também)
              metaEventId: String(eventId),
              purchaseLastAttemptAt: nowIso2,
              purchaseAttemptCount: attemptNow,
              capiEventId: String(eventId),
              capiStatus: capiRes.status,
              capiResponse: String(capiText || "").slice(0, 2000),
              purchaseLastError: capiRes.ok ? null : `CAPI_NOT_OK_${capiRes.status}`,
            }

            const mergedMeta = capiRes.ok ? { ...mergedMetaBase, purchaseSentAt: nowIso2 } : mergedMetaBase

            await prisma.transaction.update({
              where: { id: updatedTransaction.id },
              data: { meta: stringifyMeta(mergedMeta) },
            })
          } catch (err: any) {
            console.error("Erro ao enviar Purchase para Meta:", err)
          }
        })()
      }, 0)
    }

    return ack
  } catch (err: any) {
    console.error("ERRO WEBHOOK (mas respondendo OK pro gateway):", err)
    return SAFE_OK()
  }
}
