// app/api/webhook/ativopay/route.ts

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import crypto from "crypto"
import { sendPushcutNotification } from "@/lib/pushcut"

// 🔐 flag simples pra evitar log sensível em produção
const IS_PRODUCTION = process.env.NODE_ENV === "production"

const PAID_STATUSES = [
  "PAID",
  "APPROVED",
  "CONFIRMED",
  "SUCCESS",
  "COMPLETED",
  "SUCCEEDED",
]

const FB_PIXEL_ID = process.env.FACEBOOK_PIXEL_ID
const FB_CAPI_TOKEN = process.env.FACEBOOK_CAPI_TOKEN
const FB_TEST_EVENT_CODE = process.env.FB_TEST_EVENT_CODE

const SITE_URL =
  process.env.SITE_URL || "https://favelapremios.plataformapremios.site"

const PUSHCUT_ORDER_PAID_URL = process.env.PUSHCUT_ORDER_PAID_URL

// Mensagem genérica pra não expor erro interno
const SAFE_ERROR_MESSAGE =
  "Erro ao processar confirmação de pagamento. Se o pagamento foi realizado, ele será reprocessado automaticamente."

function sha256(value: string) {
  return crypto
    .createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex")
}

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) {
    // x-forwarded-for pode vir "ip, ip, ip"
    const first = xff.split(",")[0]?.trim()
    if (first) return first
  }
  const xRealIp = req.headers.get("x-real-ip")
  if (xRealIp) return xRealIp.trim()
  return null
}

function parseCookies(cookieHeader: string | null) {
  const out: Record<string, string> = {}
  if (!cookieHeader) return out
  cookieHeader.split(";").forEach((part) => {
    const [k, ...v] = part.trim().split("=")
    if (!k) return
    out[k] = decodeURIComponent(v.join("=") || "")
  })
  return out
}

// tenta inferir event_time do payload (quando existir)
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
    null

  if (!raw) return Math.floor(Date.now() / 1000)

  const t = new Date(raw).getTime()
  if (Number.isNaN(t)) return Math.floor(Date.now() / 1000)

  return Math.floor(t / 1000)
}

export async function POST(req: Request) {
  try {
    const bodyText = await req.text()

    if (!IS_PRODUCTION) {
      console.log("WEBHOOK RAW BODY (dev):", bodyText)
    } else {
      console.log("WEBHOOK RECEBIDO (prod): body length=", bodyText?.length ?? 0)
    }

    let json: any
    try {
      json = bodyText ? JSON.parse(bodyText) : {}
    } catch (e) {
      console.error("WEBHOOK: body não é JSON válido:", e)
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 })
    }

    const tx =
      json?.data ||
      json?.transaction ||
      json?.object ||
      json?.payload ||
      json

    if (!tx) {
      console.error("WEBHOOK: payload inválido:", json)
      return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 })
    }

    const gatewayId: string | null =
      tx.id ||
      tx.objectId ||
      tx.transactionId ||
      tx.externalRef ||
      null

    const rawStatus: string | null =
      tx.status ||
      tx.paymentStatus ||
      tx.transactionStatus ||
      json?.status ||
      json?.event ||
      null

    const statusUpper = rawStatus ? String(rawStatus).toUpperCase() : null

    if (!gatewayId || !rawStatus) {
      console.error("WEBHOOK: faltando gatewayId ou status", { gatewayId, rawStatus })
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 })
    }

    if (!statusUpper || !PAID_STATUSES.includes(statusUpper)) {
      console.log("WEBHOOK: status ignorado:", statusUpper)
      return NextResponse.json({ ok: true, ignored: true })
    }

    const transaction = await prisma.transaction.findFirst({
      where: { gatewayId },
    })

    if (!transaction) {
      console.error("WEBHOOK: transação não encontrada:", gatewayId)
      return NextResponse.json({ ok: true, notFound: true })
    }

    // 🔁 IDEMPOTÊNCIA: se já está paga, não faz mais nada
    if (transaction.status === "paid") {
      console.log("WEBHOOK: transação já estava paga (duplicado):", {
        transactionId: transaction.id,
        orderId: transaction.orderId,
      })
      return NextResponse.json({ ok: true, alreadyPaid: true })
    }

    // ✅ Atualiza transaction e order pra "paid"
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: "paid" },
    })

    const updatedOrder = await prisma.order.update({
      where: { id: transaction.orderId },
      data: { status: "paid" },
    })

    const orderWithUser = await prisma.order.findUnique({
      where: { id: updatedOrder.id },
      include: { user: true },
    })

    console.log("WEBHOOK: pagamento confirmado:", {
      transactionId: updatedTransaction.id,
      orderId: updatedOrder.id,
    })

    // ================= PUSHCUT =================
    if (PUSHCUT_ORDER_PAID_URL) {
      try {
        await sendPushcutNotification(PUSHCUT_ORDER_PAID_URL, {
          type: "order_paid",
          orderId: updatedOrder.id,
          transactionId: updatedTransaction.id,
          amount: updatedTransaction.value ?? updatedOrder.amount ?? null,
          paidAt: new Date().toISOString(),
        })
      } catch (err) {
        console.error("Erro ao enviar Pushcut de pedido pago:", err)
      }
    }

    // ================= META CAPI PURCHASE =================
    if (FB_PIXEL_ID && FB_CAPI_TOKEN && orderWithUser) {
      try {
        const eventTime = getEventTimeFromTx(tx)

        const valueNumber =
          Number(updatedTransaction.value) ||
          Number(updatedOrder.amount) ||
          0

        const userData: any = {}
        const dbUser = orderWithUser.user

        if (dbUser?.email) userData.em = [sha256(dbUser.email)]
        if (dbUser?.phone) userData.ph = [sha256(dbUser.phone)]
        if (dbUser?.cpf) userData.external_id = [sha256(dbUser.cpf)]

        const ua = req.headers.get("user-agent")
        if (ua) userData.client_user_agent = ua

        const ip = getClientIp(req)
        if (ip) userData.client_ip_address = ip

        // ✅ pega cookies do navegador (melhora MUITO a atribuição)
        const cookies = parseCookies(req.headers.get("cookie"))
        const fbp = cookies["_fbp"]
        const fbc = cookies["_fbc"]
        if (fbp) userData.fbp = fbp
        if (fbc) userData.fbc = fbc

        // ✅ EVENT_ID ÚNICO (dedupe real)
        const eventIdFromOrder = orderWithUser.metaEventId || updatedTransaction.id

        const capiBody: any = {
          data: [
            {
              event_name: "Purchase",
              event_time: eventTime,
              action_source: "website",
              event_id: String(eventIdFromOrder),
              event_source_url: `${SITE_URL}/pagamento-confirmado?orderId=${updatedOrder.id}`,
              custom_data: {
                currency: "BRL",
                value: valueNumber,
                order_id: updatedOrder.id,
                contents: [
                  {
                    id: String(updatedOrder.id),
                    quantity: updatedOrder.quantity ?? 1,
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

        const capiRes = await fetch(capiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(capiBody),
        })

        const capiText = await capiRes.text()
        console.log("META CAPI RESPONSE (Purchase):", capiRes.status, capiText)
      } catch (err) {
        console.error("Erro ao enviar Purchase para Meta:", err)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("ERRO WEBHOOK:", err)
    return NextResponse.json(
      { ok: false, error: SAFE_ERROR_MESSAGE },
      { status: 500 },
    )
  }
}
