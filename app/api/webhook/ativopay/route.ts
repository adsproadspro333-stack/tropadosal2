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
  process.env.SITE_URL ||
  "https://mcpoze.plataformapremios.site"

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

export async function POST(req: Request) {
  try {
    const bodyText = await req.text()

    // ❌ NÃO LOGAR MAIS O CORPO INTEIRO EM PRODUÇÃO
    if (!IS_PRODUCTION) {
      console.log("WEBHOOK RAW BODY (dev):", bodyText)
    } else {
      console.log(
        "WEBHOOK RECEBIDO (prod): body length=",
        bodyText?.length ?? 0,
      )
    }

    let json: any
    try {
      json = bodyText ? JSON.parse(bodyText) : {}
    } catch (e) {
      console.error("WEBHOOK: body não é JSON válido:", e)
      return NextResponse.json(
        { ok: false, error: "Invalid JSON" },
        { status: 400 },
      )
    }

    const tx =
      json?.data ||
      json?.transaction ||
      json?.object ||
      json?.payload ||
      json

    if (!tx) {
      console.error("WEBHOOK: payload inválido:", json)
      return NextResponse.json(
        { ok: false, error: "Invalid payload" },
        { status: 400 },
      )
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

    if (!IS_PRODUCTION) {
      console.log("WEBHOOK NORMALIZADO:", {
        gatewayId,
        rawStatus,
        statusUpper,
      })
    } else {
      console.log("WEBHOOK NORMALIZADO (prod):", {
        gatewayId,
        statusUpper,
      })
    }

    if (!gatewayId || !rawStatus) {
      console.error("WEBHOOK: faltando gatewayId ou status", {
        gatewayId,
        rawStatus,
      })
      return NextResponse.json(
        { ok: false, error: "Missing fields" },
        { status: 400 },
      )
    }

    // 🔎 Se NÃO for status de pagamento aprovado, apenas ignora
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
      console.log(
        "WEBHOOK: transação já estava paga, ignorando duplicado:",
        {
          transactionId: transaction.id,
          orderId: transaction.orderId,
        },
      )
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
        const eventTime = Math.floor(Date.now() / 1000)

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

        if (tx?.ip) userData.client_ip_address = tx.ip

        // ✅ EVENT_ID ÚNICO SALVO NO PEDIDO (deduplicate real)
        const eventIdFromOrder =
          orderWithUser.metaEventId || updatedTransaction.id

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

        if (FB_TEST_EVENT_CODE) {
          capiBody.test_event_code = FB_TEST_EVENT_CODE
        }

        const capiUrl = `https://graph.facebook.com/v21.0/${FB_PIXEL_ID}/events?access_token=${FB_CAPI_TOKEN}`

        const capiRes = await fetch(capiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(capiBody),
        })

        const capiText = await capiRes.text()
        console.log(
          "META CAPI RESPONSE (Purchase):",
          capiRes.status,
          capiText,
        )
      } catch (err) {
        console.error("Erro ao enviar Purchase para Meta:", err)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("ERRO WEBHOOK:", err)

    // Não expor detalhes internos pro caller (gateway)
    return NextResponse.json(
      {
        ok: false,
        error: SAFE_ERROR_MESSAGE,
      },
      { status: 500 },
    )
  }
}
