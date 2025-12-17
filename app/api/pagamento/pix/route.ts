// app/api/pagamento/pix/route.ts

import { NextResponse } from "next/server"
import { createPixTransaction } from "@/lib/payments/ativopay"
import { prisma } from "@/lib/prisma"
import { UNIT_PRICE_CENTS } from "@/app/config/pricing"
import crypto from "crypto"
import { sendPushcutNotification } from "@/lib/pushcut"

const PUSHCUT_ORDER_CREATED_URL = process.env.PUSHCUT_ORDER_CREATED_URL
const isProduction = process.env.NODE_ENV === "production"

// 🔒 Janela de idempotência
const IDEMPOTENCY_WINDOW_MINUTES = 30
const IDEMPOTENCY_WINDOW_MS = IDEMPOTENCY_WINDOW_MINUTES * 60 * 1000

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {}
  const out: Record<string, string> = {}
  cookieHeader.split(";").forEach((part) => {
    const [kRaw, ...vParts] = part.split("=")
    const k = (kRaw || "").trim()
    if (!k) return
    const v = vParts.join("=").trim()
    out[k] = decodeURIComponent(v || "")
  })
  return out
}

function getClientIp(headers: Headers): string | undefined {
  const ipHeader =
    headers.get("x-forwarded-for") ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    ""
  const ip = ipHeader.split(",")[0]?.trim()
  return ip || undefined
}

function buildMetaString(input: {
  fbp?: string
  fbc?: string
  clientIpAddress?: string
  userAgent?: string
  createdFrom: "main" | "upsell"
  provider?: {
    id?: string | null
    gatewayId?: string | null
    externalRef?: string | null
  }
}) {
  const obj: any = {
    ...(input.fbp ? { fbp: input.fbp } : {}),
    ...(input.fbc ? { fbc: input.fbc } : {}),
    ...(input.clientIpAddress ? { clientIpAddress: input.clientIpAddress } : {}),
    ...(input.userAgent ? { clientUserAgent: input.userAgent } : {}),
    createdFrom: input.createdFrom,
    createdAt: new Date().toISOString(),
    ...(input.provider
      ? {
          provider: {
            ...(input.provider.id ? { id: input.provider.id } : {}),
            ...(input.provider.gatewayId ? { gatewayId: input.provider.gatewayId } : {}),
            ...(input.provider.externalRef ? { externalRef: input.provider.externalRef } : {}),
          },
        }
      : {}),
  }

  return JSON.stringify(obj)
}

// ✅ mensagem única pro front (sem expor gateway)
function pixUnavailableResponse(extra?: any) {
  if (!isProduction) {
    console.error("[pix] PIX indisponível agora:", extra)
  }
  return NextResponse.json(
    { ok: false, error: "PIX indisponível no momento. Tente novamente em instantes." },
    { status: 503 },
  )
}

// ✅ MW: garante que o gatewayId usado no banco seja SEMPRE o txid retornado
function resolveGatewayId(resp: any) {
  const txid =
    resp?.transactionId ||
    resp?.txid ||
    resp?.raw?.data?.txid ||
    resp?.raw?.txid ||
    resp?.raw?.data?.transactionId ||
    resp?.raw?.transactionId ||
    null

  const s = String(txid || "").trim()
  return s || null
}

// 🔒 Só reutiliza se houver PIX + gatewayId válido (evita “pix fantasma”)
function canReuseExistingTx(existingTx: any) {
  if (!existingTx) return false
  const pix = String(existingTx.pixCopiaCola || "").trim()
  const gw = String(existingTx.gatewayId || "").trim()

  if (!pix) return false
  if (!gw) return false

  // heurística segura: gatewayId não pode ser igual ao id do registro (cuid)
  if (existingTx.id && String(existingTx.id).trim() === gw) return false

  // txid costuma ter tamanho razoável
  if (gw.length < 8) return false

  return true
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
    const clientIpAddress = getClientIp(headers)

    const cookies = parseCookies(headers.get("cookie"))
    const fbp = cookies["_fbp"] || undefined
    const fbc = cookies["_fbc"] || undefined

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

    if (
      Array.isArray(body.numbers) &&
      body.numbers.length > 0 &&
      body.numbers.length <= quantityFromAmount
    ) {
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
    // USER (CPF DOMINANTE)
    // -------------------------------------------------
    const orConditions: any[] = [{ cpf: documentNumber }]
    if (email) orConditions.push({ email })

    let user = await prisma.user.findFirst({ where: { OR: orConditions } })

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
    // IDEMPOTÊNCIA
    // -------------------------------------------------
    const now = Date.now()
    const since = new Date(now - IDEMPOTENCY_WINDOW_MS)

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

    const recentPending = await prisma.order.findFirst({
      where: {
        userId: user.id,
        status: "pending",
        amount: amountInCents / 100,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      include: { transactions: { orderBy: { createdAt: "desc" } } },
    })

    // -------------------------------------------------
    // REUSO: se tiver um pending com pix + gatewayId válido -> reutiliza
    // (se não tiver gatewayId, NÃO reutiliza — evita PIX fantasma)
    // -------------------------------------------------
    if (recentPending) {
      const existingTx = recentPending.transactions?.[0] || null

      if (canReuseExistingTx(existingTx)) {
        if (!isProduction) {
          console.log("[pix] Reusando tx existente (OK):", {
            orderId: recentPending.id,
            txDbId: existingTx.id,
            gatewayId: existingTx.gatewayId,
          })
        }

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

      if (existingTx?.pixCopiaCola && !isProduction) {
        console.warn("[pix] NÃO reutilizando tx antigo (suspeito/sem gatewayId). Vou regenerar:", {
          orderId: recentPending.id,
          txDbId: existingTx.id,
          gatewayId: existingTx.gatewayId || null,
        })
      }

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

      const { pixCopiaECola, qrCodeBase64, expiresAt, raw } = resp as any

      if (!pixCopiaECola) {
        return pixUnavailableResponse({
          stage: "recreate_pending",
          orderId: recentPending.id,
          gatewayStatus: raw?.status ?? raw?.data?.status ?? null,
          raw: isProduction ? undefined : raw,
        })
      }

      const gatewayId = resolveGatewayId(resp)
      if (!gatewayId) {
        return pixUnavailableResponse({
          stage: "recreate_pending_missing_txid",
          orderId: recentPending.id,
          raw: isProduction ? undefined : raw,
        })
      }

      const meta = buildMetaString({
        fbp,
        fbc,
        clientIpAddress,
        userAgent,
        createdFrom: isUpsell ? "upsell" : "main",
        provider: {
          id: gatewayId,
          gatewayId: gatewayId,
          externalRef: recentPending.id,
        },
      })

      const tx = await prisma.transaction.create({
        data: {
          orderId: recentPending.id,
          value: amountInCents / 100,
          status: "pending",
          gatewayId,
          pixCopiaCola: pixCopiaECola,
          meta,
        },
      })

      return NextResponse.json(
        {
          ok: true,
          reused: true,
          orderId: recentPending.id,
          transactionId: tx.id,
          pixCopiaECola,
          qrCodeBase64,
          expiresAt,
          fbEventId,
        },
        { status: 200 },
      )
    }

    // -------------------------------------------------
    // NOVO PEDIDO
    // -------------------------------------------------
    const fbEventId = crypto.randomUUID()

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        amount: amountInCents / 100,
        status: "pending",
        quantity: effectiveQty,
        metaEventId: fbEventId,
      },
    })

    if (PUSHCUT_ORDER_CREATED_URL) {
      await sendPushcutNotification(PUSHCUT_ORDER_CREATED_URL, {
        title: `+1 ( R$ ${(amountInCents / 100).toFixed(2).replace(".", ",")} ) RF [ P.Z ]`,
        text: isUpsell ? "Upsell PIX gerado ⚡" : "Aguardando Pagamento ⚠️",
        orderId: order.id,
        amount: amountInCents / 100,
        qty: effectiveQty,
      })
    }

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
          externalRef: order.id,
        },
      ],
      expiresInDays: 1,
      traceable: true,
    })

    const { pixCopiaECola, qrCodeBase64, expiresAt, raw } = resp as any

    if (!pixCopiaECola) {
      return pixUnavailableResponse({
        stage: "create_new",
        orderId: order.id,
        gatewayStatus: raw?.status ?? raw?.data?.status ?? null,
        raw: isProduction ? undefined : raw,
      })
    }

    const gatewayId = resolveGatewayId(resp)
    if (!gatewayId) {
      return pixUnavailableResponse({
        stage: "create_new_missing_txid",
        orderId: order.id,
        raw: isProduction ? undefined : raw,
      })
    }

    const meta = buildMetaString({
      fbp,
      fbc,
      clientIpAddress,
      userAgent,
      createdFrom: isUpsell ? "upsell" : "main",
      provider: {
        id: gatewayId,
        gatewayId: gatewayId,
        externalRef: order.id,
      },
    })

    const tx = await prisma.transaction.create({
      data: {
        orderId: order.id,
        value: amountInCents / 100,
        status: "pending",
        gatewayId,
        pixCopiaCola: pixCopiaECola,
        meta,
      },
    })

    return NextResponse.json(
      {
        ok: true,
        orderId: order.id,
        transactionId: tx.id,
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
