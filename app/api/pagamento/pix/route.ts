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
            // ✅ gatewayId agora é opcional
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

// ✅ classifica erro do provedor pra não mascarar "Unauthorized"
function classifyProviderError(err: any) {
  const msg = String(err?.message || err || "").toLowerCase()

  const isUnauthorized =
    msg.includes("unauthor") ||
    msg.includes("auth falhou") ||
    msg.includes("forbidden") ||
    msg.includes("invalid token") ||
    (msg.includes("token") && msg.includes("fail"))

  const isTimeout =
    msg.includes("aborted") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("etimedout")

  return {
    isUnauthorized,
    isTimeout,
    rawMessage: String(err?.message || err || ""),
  }
}

// ✅ MW: tenta descobrir gatewayId/txid se vier
function resolveGatewayId(resp: any) {
  const txid =
    resp?.gatewayId ||
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

// ✅ resolve Copia e Cola em múltiplos formatos
function resolvePixCopiaECola(resp: any) {
  const v =
    resp?.pixCopiaECola ??
    resp?.copiaECola ??
    resp?.copia_e_cola ??
    resp?.brCode ??
    resp?.payload ??
    resp?.pix?.copiaECola ??
    resp?.pix?.copia_e_cola ??
    resp?.raw?.data?.pixCopiaECola ??
    resp?.raw?.data?.copia_e_cola ??
    resp?.raw?.data?.brCode ??
    resp?.raw?.pixCopiaECola ??
    resp?.raw?.copia_e_cola ??
    null

  const s = String(v || "").trim()
  return s || null
}

// ✅ REUSO: agora só precisa do Copia e Cola.
// (REMOVIDO: exigência de gatewayId/txid — isso era o "pix fantasma")
function canReuseExistingTx(existingTx: any) {
  if (!existingTx) return false
  const pix = String(existingTx.pixCopiaCola || "").trim()
  if (!pix) return false
  return true
}

export async function POST(req: Request) {
  // id por request pra rastrear em log (sem expor dados)
  const requestId = crypto.randomUUID()

  try {
    const body = await req.json()

    if (!isProduction) {
      console.log("REQUEST /api/pagamento/pix BODY:", body)
    } else {
      console.log("REQUEST /api/pagamento/pix RECEIVED", { requestId })
    }

    const headers = req.headers
    const userAgent = headers.get("user-agent") || undefined
    const clientIpAddress = getClientIp(headers)

    const cookies = parseCookies(headers.get("cookie"))
    const fbp = cookies["_fbp"] || undefined
    const fbc = cookies["_fbc"] || undefined

    // ✅ UPSSELL: aceitar TODOS os formatos (front manda isUpsell/baseOrderId etc)
    const isUpsell =
      body?.isUpsell === true ||
      body?.upsell === true ||
      body?.mode === "upsell" ||
      body?.createdFrom === "upsell" ||
      String(body?.upsell || "") === "1"

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

    const amountInCents = Math.round(totalInCents)

    // -------------------------------------------------
    // QTD (ANTI-BURLO)
    // -------------------------------------------------
    let effectiveQty = 0

    const bodyQty = Math.round(Number(body?.quantity || 0))
    const numbersLen = Array.isArray(body?.numbers) ? body.numbers.length : 0

    if (isUpsell) {
      if (numbersLen > 0) effectiveQty = numbersLen
      else if (bodyQty > 0) effectiveQty = bodyQty
      else effectiveQty = 0

      if (!effectiveQty || effectiveQty <= 0) {
        return NextResponse.json({ ok: false, error: "Quantidade inválida para upsell." }, { status: 400 })
      }
    } else {
      const quantityFromAmount =
        UNIT_PRICE_CENTS > 0 ? Math.max(0, Math.floor(amountInCents / UNIT_PRICE_CENTS)) : 0

      if (!quantityFromAmount || quantityFromAmount <= 0) {
        return NextResponse.json({ ok: false, error: "Valor insuficiente para gerar números válidos." }, { status: 400 })
      }

      effectiveQty = quantityFromAmount

      if (numbersLen > 0 && numbersLen <= quantityFromAmount) {
        effectiveQty = numbersLen
      }

      if (bodyQty > 0 && bodyQty <= quantityFromAmount) {
        effectiveQty = bodyQty
      }
    }

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
    // IDEMPOTÊNCIA (somente MAIN)
    // -------------------------------------------------
    const now = Date.now()
    const since = new Date(now - IDEMPOTENCY_WINDOW_MS)

    if (!isUpsell) {
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
    // REUSO: se tiver pending com Copia e Cola -> reutiliza
    // -------------------------------------------------
    if (recentPending) {
      const existingTx = recentPending.transactions?.[0] || null

      if (canReuseExistingTx(existingTx)) {
        if (!isProduction) {
          console.log("[pix] Reusando tx existente (OK):", {
            orderId: recentPending.id,
            txDbId: existingTx.id,
            gatewayId: existingTx.gatewayId || null,
          })
        }

        return NextResponse.json(
          {
            ok: true,
            reused: true,
            orderId: recentPending.id,

            // ✅ PARA O FRONT: transactionId = DB ID (prisma.transaction.id)
            transactionId: existingTx.id,

            // ✅ opcional
            gatewayId: existingTx.gatewayId || null,

            pixCopiaECola: existingTx.pixCopiaCola,
            qrCodeBase64: null,
            expiresAt: null,
            fbEventId: recentPending.metaEventId || null,
          },
          { status: 200 },
        )
      }

      const fbEventId = recentPending.metaEventId || crypto.randomUUID()

      let resp: any
      try {
        resp = await createPixTransaction({
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
      } catch (e: any) {
        const c = classifyProviderError(e)
        console.error("ERRO MWBANK createPixTransaction (recreate_pending):", {
          requestId,
          orderId: recentPending.id,
          isUpsell,
          amount: amountInCents / 100,
          providerError: c.rawMessage?.slice(0, 500),
        })
        return pixUnavailableResponse({
          stage: "recreate_pending_provider_error",
          orderId: recentPending.id,
          requestId,
          provider: c.isUnauthorized ? "unauthorized" : c.isTimeout ? "timeout" : "other",
        })
      }

      const pixCopiaECola = resolvePixCopiaECola(resp)
      const qrCodeBase64 = (resp as any)?.qrCodeBase64 ?? null
      const expiresAt = (resp as any)?.expiresAt ?? null
      const raw = (resp as any)?.raw

      // ✅ Se não veio Copia e Cola, aí sim é "indisponível"
      if (!pixCopiaECola) {
        return pixUnavailableResponse({
          stage: "recreate_pending_missing_copia",
          orderId: recentPending.id,
          gatewayStatus: raw?.status ?? raw?.data?.status ?? null,
          requestId,
          raw: isProduction ? undefined : raw,
        })
      }

      // ✅ gatewayId/txid agora é opcional (não bloqueia)
      const gatewayId = resolveGatewayId(resp)

      const meta = buildMetaString({
        fbp,
        fbc,
        clientIpAddress,
        userAgent,
        createdFrom: isUpsell ? "upsell" : "main",
        provider: {
          id: gatewayId || null,
          gatewayId: gatewayId || null,
          externalRef: recentPending.id,
        },
      })

      const tx = await prisma.transaction.create({
        data: {
          orderId: recentPending.id,
          value: amountInCents / 100,
          status: "pending",
          gatewayId: gatewayId || null,
          pixCopiaCola: pixCopiaECola,
          meta,
        },
      })

      return NextResponse.json(
        {
          ok: true,
          reused: true,
          orderId: recentPending.id,

          // ✅ PARA O FRONT: DB ID sempre
          transactionId: tx.id,

          // ✅ opcional
          gatewayId: gatewayId || null,

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

    let resp: any
    try {
      resp = await createPixTransaction({
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
    } catch (e: any) {
      const c = classifyProviderError(e)
      console.error("ERRO MWBANK createPixTransaction (create_new):", {
        requestId,
        orderId: order.id,
        isUpsell,
        amount: amountInCents / 100,
        providerError: c.rawMessage?.slice(0, 500),
      })
      return pixUnavailableResponse({
        stage: "create_new_provider_error",
        orderId: order.id,
        requestId,
        provider: c.isUnauthorized ? "unauthorized" : c.isTimeout ? "timeout" : "other",
      })
    }

    const pixCopiaECola = resolvePixCopiaECola(resp)
    const qrCodeBase64 = (resp as any)?.qrCodeBase64 ?? null
    const expiresAt = (resp as any)?.expiresAt ?? null
    const raw = (resp as any)?.raw

    if (!pixCopiaECola) {
      return pixUnavailableResponse({
        stage: "create_new_missing_copia",
        orderId: order.id,
        gatewayStatus: raw?.status ?? raw?.data?.status ?? null,
        requestId,
        raw: isProduction ? undefined : raw,
      })
    }

    // ✅ gatewayId opcional
    const gatewayId = resolveGatewayId(resp)

    const meta = buildMetaString({
      fbp,
      fbc,
      clientIpAddress,
      userAgent,
      createdFrom: isUpsell ? "upsell" : "main",
      provider: {
        id: gatewayId || null,
        gatewayId: gatewayId || null,
        externalRef: order.id,
      },
    })

    const tx = await prisma.transaction.create({
      data: {
        orderId: order.id,
        value: amountInCents / 100,
        status: "pending",
        gatewayId: gatewayId || null,
        pixCopiaCola: pixCopiaECola,
        meta,
      },
    })

    return NextResponse.json(
      {
        ok: true,
        orderId: order.id,

        // ✅ PARA O FRONT: DB ID sempre (isso destrava seu /pagamento/page.tsx)
        transactionId: tx.id,

        // ✅ opcional
        gatewayId: gatewayId || null,

        pixCopiaECola,
        qrCodeBase64,
        expiresAt,
        fbEventId,
      },
      { status: 200 },
    )
  } catch (err: any) {
    const c = classifyProviderError(err)

    console.error("ERRO /api/pagamento/pix:", {
      requestId,
      message: String(err?.message || err || "").slice(0, 800),
      provider: c.isUnauthorized ? "unauthorized" : c.isTimeout ? "timeout" : "other",
    })

    // ✅ Se for erro do MWBank/auth/etc: devolve 503 (front mostra card “tente novamente”)
    if (c.isUnauthorized || c.isTimeout) {
      return pixUnavailableResponse({
        stage: "catch_provider_error",
        requestId,
        provider: c.isUnauthorized ? "unauthorized" : "timeout",
      })
    }

    return NextResponse.json(
      { ok: false, error: "Erro ao processar pagamento" },
      { status: 500 },
    )
  }
}
