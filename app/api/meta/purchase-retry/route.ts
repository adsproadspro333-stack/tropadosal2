// app/api/meta/purchase-retry/route.ts

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import crypto from "crypto"

const FB_PIXEL_ID = process.env.FACEBOOK_PIXEL_ID
const FB_CAPI_TOKEN = process.env.FACEBOOK_CAPI_TOKEN
const FB_TEST_EVENT_CODE = process.env.FB_TEST_EVENT_CODE

const SITE_URL =
  process.env.SITE_URL || "https://favelapremios.plataformapremios.site"

function sha256(value: string) {
  return crypto
    .createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex")
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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "")
  if (!digits) return ""
  if (digits.startsWith("55")) return digits
  if (digits.length >= 10) return `55${digits}`
  return digits
}

function normalizeCpf(cpf: string) {
  return cpf.replace(/\D/g, "")
}

function getEventTimeFallback(order: any) {
  const raw = order?.paidAt || order?.updatedAt || order?.createdAt || null
  if (!raw) return Math.floor(Date.now() / 1000)
  const t = new Date(raw).getTime()
  if (Number.isNaN(t)) return Math.floor(Date.now() / 1000)
  return Math.floor(t / 1000)
}

export async function POST(req: Request) {
  try {
    if (!FB_PIXEL_ID || !FB_CAPI_TOKEN) {
      return NextResponse.json(
        { ok: false, error: "Missing FACEBOOK_PIXEL_ID or FACEBOOK_CAPI_TOKEN" },
        { status: 500 },
      )
    }

    const body = await req.json().catch(() => ({}))
    const orderId = String(body?.orderId || "").trim()

    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 })
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        transactions: { orderBy: { createdAt: "desc" } },
      },
    })

    if (!order) {
      return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 })
    }

    // só faz sentido em pedido pago
    if (order.status !== "paid") {
      return NextResponse.json({ ok: true, skipped: "order_not_paid" })
    }

    // pega a transação mais recente (idealmente paid)
    const tx = order.transactions?.[0]
    if (!tx) {
      return NextResponse.json({ ok: true, skipped: "no_transaction" })
    }

    const metaObj = safeJsonParse((tx as any).meta) || {}
    const alreadySent = Boolean(metaObj?.purchaseSentAt)
    if (alreadySent) {
      return NextResponse.json({ ok: true, skipped: "already_sent" })
    }

    const eventId = String((order as any).metaEventId || tx.id)
    const eventTime = getEventTimeFallback(order)

    const valueNumber = Number((tx as any).value) || Number((order as any).amount) || 0

    const userData: any = {}
    if (order.user?.email) userData.em = [sha256(normalizeEmail(order.user.email))]
    if (order.user?.phone) {
      const ph = normalizePhone(order.user.phone)
      if (ph) userData.ph = [sha256(ph)]
    }
    if (order.user?.cpf) {
      const cpf = normalizeCpf(order.user.cpf)
      if (cpf) userData.external_id = [sha256(cpf)]
    }

    // sinais do browser (preferência total)
    const uaFromMeta = metaObj?.clientUserAgent || metaObj?.client_user_agent
    const ipFromMeta = metaObj?.clientIpAddress || metaObj?.client_ip_address
    const fbpFromMeta = metaObj?.fbp
    const fbcFromMeta = metaObj?.fbc

    if (uaFromMeta) userData.client_user_agent = uaFromMeta
    if (ipFromMeta) userData.client_ip_address = ipFromMeta
    if (fbpFromMeta) userData.fbp = fbpFromMeta
    if (fbcFromMeta) userData.fbc = fbcFromMeta

    const capiBody: any = {
      data: [
        {
          event_name: "Purchase",
          event_time: eventTime,
          action_source: "website",
          event_id: eventId,
          event_source_url: `${SITE_URL}/pagamento-confirmado?orderId=${order.id}`,
          custom_data: {
            currency: "BRL",
            value: valueNumber,
            order_id: order.id,
            contents: [
              {
                id: String(order.id),
                quantity: (order as any).quantity ?? 1,
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
    const nowIso = new Date().toISOString()

    const res = await fetch(capiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(capiBody),
    })

    const text = await res.text()

    const mergedMeta = {
      ...(metaObj || {}),
      purchaseLastAttemptAt: nowIso,
      purchaseAttemptCount: attemptNow,
      capiEventId: eventId,
      capiStatus: res.status,
      capiResponse: text?.slice(0, 2000),
      purchaseLastError: res.ok ? null : `CAPI_NOT_OK_${res.status}`,
      ...(res.ok ? { purchaseSentAt: nowIso } : {}),
    }

    await prisma.transaction.update({
      where: { id: tx.id },
      data: { meta: mergedMeta as any },
    })

    return NextResponse.json({
      ok: true,
      sent: Boolean(res.ok),
      status: res.status,
    })
  } catch (err: any) {
    console.error("purchase-retry error:", err)
    return NextResponse.json(
      { ok: false, error: String(err?.message || err || "unknown") },
      { status: 500 },
    )
  }
}
