import { NextResponse } from "next/server"
import { createPixTransaction } from "@/lib/payments/ativopay"
import { prisma } from "@/lib/prisma"
import { UNIT_PRICE_CENTS } from "@/app/config/pricing"
import crypto from "crypto"
import { sendPushcutNotification } from "@/lib/pushcut"

const PUSHCUT_ORDER_CREATED_URL = process.env.PUSHCUT_ORDER_CREATED_URL
const isProduction = process.env.NODE_ENV === "production"

// 🔒 Janela de idempotência (evita duplicar pedidos por impaciência/refresh/voltar)
const IDEMPOTENCY_WINDOW_MINUTES = 30
const IDEMPOTENCY_WINDOW_MS = IDEMPOTENCY_WINDOW_MINUTES * 60 * 1000

function sha256(value: string) {
  return crypto
    .createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex")
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    if (!isProduction) {
      console.log("REQUEST /api/pagamento/pix BODY:", body)
    } else {
      console.log("REQUEST /api/pagamento/pix RECEIVED")
    }

    const headers = req.headers
    const userAgent = headers.get("user-agent") || undefined
    const ipHeader = headers.get("x-forwarded-for") || headers.get("x-real-ip") || ""
    const clientIpAddress = ipHeader.split(",")[0]?.trim() || undefined

    const isUpsell = body?.upsell === true

    // -------------------------------------------------
    // VALOR TOTAL
    // -------------------------------------------------
    let totalInCents = Number(body?.totalInCents ?? 0)

    if (!Number.isFinite(totalInCents) || totalInCents <= 0) {
      const rawAmount = body?.amountInCents ?? body?.amount
      const amountNum = Number(rawAmount)
      totalInCents = Number.isFinite(amountNum) && amountNum > 0 ? Math.round(amountNum) : 0
    }

    if (!totalInCents || totalInCents <= 0) {
      return NextResponse.json({ ok: false, error: "Valor do pedido inválido" }, { status: 400 })
    }

    // -------------------------------------------------
    // ANTI-BURLO POR VALOR
    // -------------------------------------------------
    const quantityFromAmount =
      UNIT_PRICE_CENTS > 0 ? Math.max(0, Math.floor(totalInCents / UNIT_PRICE_CENTS)) : 0

    if (!quantityFromAmount || quantityFromAmount <= 0) {
      return NextResponse.json(
        { ok: false, error: "Valor insuficiente para gerar números válidos." },
        { status: 400 },
      )
    }

    let effectiveQty = quantityFromAmount

    if (Array.isArray(body.numbers) && body.numbers.length > 0 && body.numbers.length <= quantityFromAmount) {
      effectiveQty = body.numbers.length
    }

    if (Number(body?.quantity) > 0 && Number(body.quantity) <= quantityFromAmount) {
      effectiveQty = Number(body.quantity)
    }

    const amountInCents = Math.round(totalInCents)

    // -------------------------------------------------
    // CLIENTE
    // -------------------------------------------------
    const customer = body?.customer || {}
    const documentNumber = String(customer?.documentNumber || "").replace(/\D/g, "")
    const phone = String(customer?.phone || "").replace(/\D/g, "")
    const email: string | null = customer?.email || null
    const fullName: string | null = customer?.name || null

    if (!documentNumber) {
      return NextResponse.json({ ok: false, error: "CPF obrigatório" }, { status: 400 })
    }

    // -------------------------------------------------
    // USER (CPF SEMPRE DOMINANTE)
    // -------------------------------------------------
    const orConditions: any[] = [{ cpf: documentNumber }]
    if (email) orConditions.push({ email })

    let user = await prisma.user.findFirst({
      where: { OR: orConditions },
    })

    if (!user) {
      try {
        const firstName = fullName?.split(" ")[0] || null
        const lastName = fullName?.split(" ").slice(1).join(" ") || null

        user = await prisma.user.create({
          data: {
            cpf: documentNumber,
            email,
            phone: phone || null,
            firstName,
            lastName,
          },
        })
      } catch (err: any) {
        if (err?.code === "P2002") {
          user = await prisma.user.findFirst({ where: { OR: orConditions } })
        } else {
          throw err
        }
      }
    }

    if (!user) throw new Error("Usuário não encontrado")

    // -------------------------------------------------
    // IDEMPOTÊNCIA (SEM MIGRATION):
    // - Reaproveita pedido PENDENTE recente (mesmo CPF + mesmo valor)
    // - Se já tiver PAGO recente, retorna "paid" (front redireciona)
    // -------------------------------------------------
    const now = Date.now()
    const since = new Date(now - IDEMPOTENCY_WINDOW_MS)

    // 1) Se tiver pedido PAGO recente com esse valor, evita gerar novo
    const recentPaid = await prisma.order.findFirst({
      where: {
        userId: user.id,
        status: "paid",
        amount: amountInCents / 100,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
    })

    if (recentPaid) {
      return NextResponse.json(
        {
          ok: true,
          alreadyPaid: true,
          status: "paid",
          orderId: recentPaid.id,
          fbEventId: recentPaid.metaEventId || null,
        },
        { status: 200 },
      )
    }

    // 2) Se tiver pedido PENDENTE recente com esse valor, reaproveita (não cria outro)
    const recentPending = await prisma.order.findFirst({
      where: {
        userId: user.id,
        status: "pending",
        amount: amountInCents / 100,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      include: { transactions: { orderBy: { createdAt: "desc" } } as any },
    })

    if (recentPending) {
      const existingTx = (recentPending as any).transactions?.[0] || null

      // Se já existe transaction com pix, retorna a mesma
      if (existingTx?.pixCopiaCola) {
        return NextResponse.json(
          {
            ok: true,
            reused: true,
            orderId: recentPending.id,
            transactionId: existingTx.id,
            pixCopiaECola: existingTx.pixCopiaCola,
            qrCodeBase64: null,
            expiresAt: null,
            fbEventId: recentPending.metaEventId || null,
          },
          { status: 200 },
        )
      }

      // Se existe pedido pendente mas sem transação/pix, cria só a transação e reaproveita o pedido
      const fbEventId = recentPending.metaEventId || crypto.randomUUID()

      const resp = await createPixTransaction({
        amount: amountInCents,
        customer: {
          name: fullName || "Cliente",
          email: email || "cliente@example.com",
          phone,
          document: { type: "CPF", number: documentNumber },
        },
        items: [
          {
            title: `${effectiveQty} números`,
            quantity: 1,
            tangible: false,
            unitPrice: amountInCents,
            externalRef: recentPending.id,
          },
        ],
        expiresInDays: 1,
        traceable: true,
      })

      const { pixCopiaECola, qrCodeBase64, expiresAt, transactionId: gatewayTransactionId, raw } = resp as any

      const gatewayId = gatewayTransactionId || raw?.data?.id || raw?.transactionId || ""

      const transaction = await prisma.transaction.create({
        data: {
          orderId: recentPending.id,
          value: amountInCents / 100,
          status: "pending",
          gatewayId,
          pixCopiaCola: pixCopiaECola || null,
        },
      })

      return NextResponse.json(
        {
          ok: true,
          reused: true,
          orderId: recentPending.id,
          transactionId: transaction.id,
          pixCopiaECola,
          qrCodeBase64,
          expiresAt,
          fbEventId,
        },
        { status: 200 },
      )
    }

    // -------------------------------------------------
    // META EVENT ID (novo pedido)
    // -------------------------------------------------
    const fbEventId = crypto.randomUUID()

    // -------------------------------------------------
    // ORDER (novo)
    // -------------------------------------------------
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        amount: amountInCents / 100,
        status: "pending",
        quantity: effectiveQty,
        metaEventId: fbEventId,
      },
    })

    // -------------------------------------------------
    // PUSHCUT – PEDIDO GERADO (somente se for novo)
    // -------------------------------------------------
    if (PUSHCUT_ORDER_CREATED_URL) {
      await sendPushcutNotification(PUSHCUT_ORDER_CREATED_URL, {
        title: `+1 ( R$ ${(amountInCents / 100).toFixed(2).replace(".", ",")} ) RF [ P.Z ]`,
        text: isUpsell ? "Upsell PIX gerado ⚡" : "Aguardando Pagamento ⚠️",
        orderId: order.id,
        amount: amountInCents / 100,
        qty: effectiveQty,
      })
    }

    // -------------------------------------------------
    // ATIVOPAY
    // -------------------------------------------------
    const resp = await createPixTransaction({
      amount: amountInCents,
      customer: {
        name: fullName || "Cliente",
        email: email || "cliente@example.com",
        phone,
        document: {
          type: "CPF",
          number: documentNumber,
        },
      },
      items: [
        {
          title: `${effectiveQty} números`,
          quantity: 1,
          tangible: false,
          unitPrice: amountInCents,
          externalRef: order.id,
        },
      ],
      expiresInDays: 1,
      traceable: true,
    })

    const { pixCopiaECola, qrCodeBase64, expiresAt, transactionId: gatewayTransactionId, raw } = resp as any

    const gatewayId = gatewayTransactionId || raw?.data?.id || raw?.transactionId || ""

    // -------------------------------------------------
    // TRANSACTION (CRÍTICO)
    // -------------------------------------------------
    const transaction = await prisma.transaction.create({
      data: {
        orderId: order.id,
        value: amountInCents / 100,
        status: "pending",
        gatewayId,
        pixCopiaCola: pixCopiaECola || null,
      },
    })

    // -------------------------------------------------
    // RESPONSE PARA O FRONT
    // -------------------------------------------------
    return NextResponse.json(
      {
        ok: true,
        orderId: order.id,
        transactionId: transaction.id, // 🔥 ESSENCIAL
        pixCopiaECola,
        qrCodeBase64,
        expiresAt,
        fbEventId,
      },
      { status: 200 },
    )
  } catch (err) {
    console.error("ERRO /api/pagamento/pix:", err)
    return NextResponse.json({ ok: false, error: "Erro ao processar pagamento" }, { status: 500 })
  }
}
