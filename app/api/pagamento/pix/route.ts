// app/api/pagamento/pix/route.ts

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

function normalizeDigits(v: any) {
  return String(v || "").replace(/\D/g, "")
}

function buildIntentKey(input: {
  createdFrom: "main" | "upsell"
  cpf: string
  amountInCents: number
  qty: number
  baseOrderId?: string | null
  providedOrderId?: string | null
}) {
  const createdFrom = input.createdFrom
  const cpf = normalizeDigits(input.cpf)
  const amountInCents = Math.max(0, Math.round(Number(input.amountInCents || 0)))
  const qty = Math.max(0, Math.round(Number(input.qty || 0)))
  const baseOrderId = String(input.baseOrderId || "").trim()
  const providedOrderId = String(input.providedOrderId || "").trim()

  const raw = `v1|mode:${createdFrom}|cpf:${cpf}|amt:${amountInCents}|qty:${qty}|base:${baseOrderId}|order:${providedOrderId}`
  return sha256Hex(raw)
}

function buildMetaString(input: {
  fbp?: string
  fbc?: string
  clientIpAddress?: string
  userAgent?: string
  createdFrom: "main" | "upsell"
  intentKey: string
  baseOrderId?: string | null
  providedOrderId?: string | null
  requestId: string
  provider?: {
    id?: string | null
    gatewayId?: string | null
    externalRef?: string | null
  }
  debug?: any
}) {
  const obj: any = {
    ...(input.fbp ? { fbp: input.fbp } : {}),
    ...(input.fbc ? { fbc: input.fbc } : {}),
    ...(input.clientIpAddress ? { clientIpAddress: input.clientIpAddress } : {}),
    ...(input.userAgent ? { clientUserAgent: input.userAgent } : {}),

    intentKey: input.intentKey,
    requestId: input.requestId,
    createdFrom: input.createdFrom,
    ...(input.baseOrderId ? { baseOrderId: String(input.baseOrderId) } : {}),
    ...(input.providedOrderId ? { providedOrderId: String(input.providedOrderId) } : {}),
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

    ...(!isProduction && input.debug ? { debug: input.debug } : {}),
  }

  return JSON.stringify(obj)
}

function pixUnavailableResponse(extra?: any) {
  // ✅ agora loga em prod também (sem vazar payload gigante)
  console.error("[pix] PIX indisponível agora:", extra)
  return NextResponse.json(
    { ok: false, error: "PIX indisponível no momento. Tente novamente em instantes." },
    { status: 503 },
  )
}

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

// ✅ DEEP SEARCH: acha BR Code Pix em qualquer lugar do JSON (procura por "000201")
function deepFindPixBrCode(obj: any): string | null {
  const seen = new Set<any>()

  const looksLikePix = (s: string) => {
    const v = String(s || "").trim()
    // Pix "copia e cola" (EMV) quase sempre começa com 000201
    if (!v) return false
    if (v.length < 40) return false
    return v.startsWith("000201") || v.includes("000201")
  }

  const visit = (node: any): string | null => {
    if (node === null || node === undefined) return null
    if (typeof node === "string") {
      const v = node.trim()
      if (looksLikePix(v)) return v.startsWith("000201") ? v : v.slice(v.indexOf("000201"))
      return null
    }
    if (typeof node !== "object") return null
    if (seen.has(node)) return null
    seen.add(node)

    if (Array.isArray(node)) {
      for (const item of node) {
        const found = visit(item)
        if (found) return found
      }
      return null
    }

    for (const k of Object.keys(node)) {
      const found = visit(node[k])
      if (found) return found
    }
    return null
  }

  return visit(obj)
}

// ✅ resolve Copia e Cola em múltiplos formatos + deep search
function resolvePixCopiaECola(resp: any) {
  const v =
    resp?.pixCopiaECola ??
    resp?.copiaECola ??
    resp?.copia_e_cola ??
    resp?.brCode ??
    resp?.br_code ??
    resp?.emv ??
    resp?.payload ??
    resp?.copyPaste ??
    resp?.copy_paste ??
    resp?.pix?.copiaECola ??
    resp?.pix?.copia_e_cola ??
    resp?.pix?.brCode ??
    resp?.pix?.payload ??
    resp?.raw?.data?.pixCopiaECola ??
    resp?.raw?.data?.copia_e_cola ??
    resp?.raw?.data?.brCode ??
    resp?.raw?.data?.br_code ??
    resp?.raw?.data?.emv ??
    resp?.raw?.data?.payload ??
    resp?.raw?.pixCopiaECola ??
    resp?.raw?.copia_e_cola ??
    resp?.raw?.brCode ??
    resp?.raw?.br_code ??
    resp?.raw?.payload ??
    null

  const s = String(v || "").trim()
  if (s) return s

  // ✅ fallback final: caça o BR Code no JSON inteiro
  const deep = deepFindPixBrCode(resp?.raw ?? resp)
  return deep ? String(deep).trim() : null
}

function canReuseExistingTx(existingTx: any) {
  if (!existingTx) return false
  const pix = String(existingTx.pixCopiaCola || "").trim()
  if (!pix) return false
  return true
}

async function findReusableTxByIntent(intentKey: string, since: Date) {
  if (!intentKey) return null
  const needle = `"intentKey":"${intentKey}"`
  const tx = await prisma.transaction.findFirst({
    where: {
      createdAt: { gte: since },
      meta: { contains: needle },
    },
    orderBy: { createdAt: "desc" },
    include: { order: true },
  })
  if (!tx) return null
  if (!canReuseExistingTx(tx)) return null
  return tx
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function createPixWithRetry(args: any, ctx: { requestId: string; orderId: string; isUpsell: boolean }) {
  const maxAttempts = 2
  let lastErr: any = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await createPixTransaction(args)
      return resp
    } catch (e: any) {
      lastErr = e
      const c = classifyProviderError(e)

      console.error("ERRO MWBANK createPixTransaction (attempt):", {
        requestId: ctx.requestId,
        orderId: ctx.orderId,
        isUpsell: ctx.isUpsell,
        attempt,
        provider: c.isUnauthorized ? "unauthorized" : c.isTimeout ? "timeout" : "other",
        message: c.rawMessage?.slice(0, 400),
      })

      if (c.isUnauthorized) break
      if (attempt < maxAttempts) await sleep(350)
    }
  }

  throw lastErr
}

async function registerFailedTransaction(params: {
  orderId: string
  amountInCents: number
  createdFrom: "main" | "upsell"
  intentKey: string
  requestId: string
  fbp?: string
  fbc?: string
  clientIpAddress?: string
  userAgent?: string
  baseOrderId?: string | null
  providedOrderId?: string | null
  stage: string
  err: any
}) {
  try {
    const c = classifyProviderError(params.err)

    const meta = buildMetaString({
      fbp: params.fbp,
      fbc: params.fbc,
      clientIpAddress: params.clientIpAddress,
      userAgent: params.userAgent,
      createdFrom: params.createdFrom,
      intentKey: params.intentKey,
      baseOrderId: params.baseOrderId || null,
      providedOrderId: params.providedOrderId || null,
      requestId: params.requestId,
      provider: {
        id: null,
        gatewayId: null,
        externalRef: params.orderId,
      },
      debug: {
        stage: params.stage,
        providerClass: c.isUnauthorized ? "unauthorized" : c.isTimeout ? "timeout" : "other",
        message: String(c.rawMessage || "").slice(0, 900),
      },
    })

    const tx = await prisma.transaction.create({
      data: {
        orderId: params.orderId,
        value: params.amountInCents / 100,
        status: "failed",
        gatewayId: null,
        pixCopiaCola: "",
        meta,
      },
    })

    return tx
  } catch (e) {
    console.error("[pix] Falha ao registrar Transaction.failed:", {
      orderId: params.orderId,
      requestId: params.requestId,
      message: String((e as any)?.message || e || "").slice(0, 400),
    })
    return null
  }
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID()

  try {
    const body = await req.json()

    if (!isProduction) console.log("REQUEST /api/pagamento/pix BODY:", body)
    else console.log("REQUEST /api/pagamento/pix RECEIVED", { requestId })

    const headers = req.headers
    const userAgent = headers.get("user-agent") || undefined
    const clientIpAddress = getClientIp(headers)

    const cookies = parseCookies(headers.get("cookie"))
    const fbp = cookies["_fbp"] || undefined
    const fbc = cookies["_fbc"] || undefined

    const isUpsell =
      body?.isUpsell === true ||
      body?.upsell === true ||
      body?.mode === "upsell" ||
      body?.createdFrom === "upsell" ||
      String(body?.upsell || "") === "1"

    const createdFrom: "main" | "upsell" = isUpsell ? "upsell" : "main"

    const upsellSource = String(body?.source || body?.origin || body?.context || body?.from || "").toLowerCase()
    const allowUpsellReuse = Boolean(body?.allowUpsellReuse === true || body?.dedupeUpsell === true)

    const baseOrderIdRaw =
      body?.baseOrderId ??
      body?.base_order_id ??
      body?.baseOrder ??
      body?.base_order ??
      null

    const providedOrderIdRaw = body?.orderId ?? body?.order_id ?? null
    const providedOrderIdStr = String(providedOrderIdRaw || "").trim() || null

    const baseOrderIdStr = String(baseOrderIdRaw || "").trim() || null
    const baseOrderId = isUpsell ? (baseOrderIdStr || providedOrderIdStr) : baseOrderIdStr
    const providedOrderId = !isUpsell ? providedOrderIdStr : null

    if (isUpsell && !baseOrderId) {
      return NextResponse.json(
        { ok: false, error: "Upsell precisa do orderId/baseOrderId do pedido base." },
        { status: 400 },
      )
    }

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

    const upsellQtyRaw =
      body?.upsellQty ??
      body?.bumpQty ??
      body?.extraNumbers ??
      body?.qty ??
      null
    const upsellQty = Math.round(Number(upsellQtyRaw || 0))

    if (isUpsell) {
      if (numbersLen > 0) effectiveQty = numbersLen
      else if (bodyQty > 0) effectiveQty = bodyQty
      else if (upsellQty > 0) effectiveQty = upsellQty
      else effectiveQty = 1
    } else {
      const quantityFromAmount =
        UNIT_PRICE_CENTS > 0 ? Math.max(0, Math.floor(amountInCents / UNIT_PRICE_CENTS)) : 0

      if (!quantityFromAmount || quantityFromAmount <= 0) {
        return NextResponse.json(
          { ok: false, error: "Valor insuficiente para gerar números válidos." },
          { status: 400 },
        )
      }

      effectiveQty = quantityFromAmount
      if (numbersLen > 0 && numbersLen <= quantityFromAmount) effectiveQty = numbersLen
      if (bodyQty > 0 && bodyQty <= quantityFromAmount) effectiveQty = bodyQty
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
        if (err?.code === "P2002") user = await prisma.user.findFirst({ where: { OR: orConditions } })
        else throw err
      }
    }
    if (!user) throw new Error("Usuário não encontrado")

    const now = Date.now()
    const since = new Date(now - IDEMPOTENCY_WINDOW_MS)

    const intentKey = buildIntentKey({
      createdFrom,
      cpf: documentNumber,
      amountInCents,
      qty: effectiveQty,
      baseOrderId: isUpsell ? baseOrderId : null,
      providedOrderId: !isUpsell ? providedOrderId : null,
    })

    // ✅ REUSO por intentKey: SOMENTE MAIN
    if (!isUpsell) {
      const reusableByIntent = await findReusableTxByIntent(intentKey, since)
      if (reusableByIntent) {
        return NextResponse.json(
          {
            ok: true,
            reused: true,
            orderId: reusableByIntent.orderId,
            transactionId: reusableByIntent.id,
            gatewayId: reusableByIntent.gatewayId || null,
            pixCopiaECola: reusableByIntent.pixCopiaCola,
            qrCodeBase64: null,
            expiresAt: null,
            fbEventId: reusableByIntent.order?.metaEventId || null,
          },
          { status: 200 },
        )
      }
    }

    // -------------------------------------------------
    // MAIN: já pago, se o front estiver tentando pagar um pedido específico
    // -------------------------------------------------
    if (!isUpsell && providedOrderId) {
      const paidSameOrder = await prisma.order.findFirst({
        where: {
          userId: user.id,
          status: "paid",
          id: providedOrderId,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
      })

      if (paidSameOrder) {
        return NextResponse.json(
          {
            ok: true,
            alreadyPaid: true,
            status: "paid",
            orderId: paidSameOrder.id,
            fbEventId: paidSameOrder.metaEventId || null,
          },
          { status: 200 },
        )
      }
    }

    // -------------------------------------------------
    // REUSO pending:
    // - MAIN: pode reutilizar pending recente (refresh)
    // - UPSELL: por padrão NÃO reutiliza. Só se allowUpsellReuse=true
    // -------------------------------------------------
    if (!isUpsell || allowUpsellReuse) {
      const baseNeedle = isUpsell && baseOrderId ? `"baseOrderId":"${baseOrderId}"` : null

      const recentPending = await prisma.order.findFirst({
        where: {
          userId: user.id,
          status: "pending",
          amount: amountInCents / 100,
          quantity: effectiveQty,
          createdAt: { gte: since },
          ...(isUpsell && baseNeedle
            ? { transactions: { some: { meta: { contains: baseNeedle } } } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        include: { transactions: { orderBy: { createdAt: "desc" } } },
      })

      if (recentPending) {
        const existingTx = recentPending.transactions?.[0] || null

        if (canReuseExistingTx(existingTx)) {
          return NextResponse.json(
            {
              ok: true,
              reused: true,
              orderId: recentPending.id,
              transactionId: existingTx.id,
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
          resp = await createPixWithRetry(
            {
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
            },
            { requestId, orderId: recentPending.id, isUpsell },
          )
        } catch (e: any) {
          await registerFailedTransaction({
            orderId: recentPending.id,
            amountInCents,
            createdFrom,
            intentKey,
            requestId,
            fbp,
            fbc,
            clientIpAddress,
            userAgent,
            baseOrderId: isUpsell ? baseOrderId : null,
            providedOrderId: !isUpsell ? providedOrderId : null,
            stage: "recreate_pending_provider_error",
            err: e,
          })

          const c = classifyProviderError(e)
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

        if (!pixCopiaECola) {
          await registerFailedTransaction({
            orderId: recentPending.id,
            amountInCents,
            createdFrom,
            intentKey,
            requestId,
            fbp,
            fbc,
            clientIpAddress,
            userAgent,
            baseOrderId: isUpsell ? baseOrderId : null,
            providedOrderId: !isUpsell ? providedOrderId : null,
            stage: "recreate_pending_missing_copia",
            err: new Error("PIX sem copia e cola (parser)"),
          })

          // ✅ log mínimo em prod (ajuda achar o campo real do MWBank)
          console.error("[pix] missing copia (pending recreate):", {
            requestId,
            orderId: recentPending.id,
            isUpsell,
            upsellSource,
            keys: raw ? Object.keys(raw).slice(0, 40) : null,
          })

          return pixUnavailableResponse({
            stage: "recreate_pending_missing_copia",
            orderId: recentPending.id,
            requestId,
            isUpsell,
            upsellSource,
            gatewayStatus: raw?.status ?? raw?.data?.status ?? null,
          })
        }

        const gatewayId = resolveGatewayId(resp)

        const meta = buildMetaString({
          fbp,
          fbc,
          clientIpAddress,
          userAgent,
          createdFrom,
          intentKey,
          baseOrderId: isUpsell ? baseOrderId : null,
          providedOrderId: !isUpsell ? providedOrderId : null,
          requestId,
          provider: {
            id: gatewayId || null,
            gatewayId: gatewayId || null,
            externalRef: recentPending.id,
          },
          debug: { upsellSource },
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
            transactionId: tx.id,
            gatewayId: gatewayId || null,
            pixCopiaECola,
            qrCodeBase64,
            expiresAt,
            fbEventId,
          },
          { status: 200 },
        )
      }
    }

    // -------------------------------------------------
    // NOVO PEDIDO (MAIN e UPSELL)
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
      resp = await createPixWithRetry(
        {
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
        },
        { requestId, orderId: order.id, isUpsell },
      )
    } catch (e: any) {
      await registerFailedTransaction({
        orderId: order.id,
        amountInCents,
        createdFrom,
        intentKey,
        requestId,
        fbp,
        fbc,
        clientIpAddress,
        userAgent,
        baseOrderId: isUpsell ? baseOrderId : null,
        providedOrderId: !isUpsell ? providedOrderId : null,
        stage: "create_new_provider_error",
        err: e,
      })

      const c = classifyProviderError(e)
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
      await registerFailedTransaction({
        orderId: order.id,
        amountInCents,
        createdFrom,
        intentKey,
        requestId,
        fbp,
        fbc,
        clientIpAddress,
        userAgent,
        baseOrderId: isUpsell ? baseOrderId : null,
        providedOrderId: !isUpsell ? providedOrderId : null,
        stage: "create_new_missing_copia",
        err: new Error("PIX sem copia e cola (parser)"),
      })

      console.error("[pix] missing copia (new order):", {
        requestId,
        orderId: order.id,
        isUpsell,
        upsellSource,
        gatewayStatus: raw?.status ?? raw?.data?.status ?? null,
        rawKeys: raw ? Object.keys(raw).slice(0, 40) : null,
      })

      return pixUnavailableResponse({
        stage: "create_new_missing_copia",
        orderId: order.id,
        requestId,
        isUpsell,
        upsellSource,
        gatewayStatus: raw?.status ?? raw?.data?.status ?? null,
      })
    }

    const gatewayId = resolveGatewayId(resp)

    const meta = buildMetaString({
      fbp,
      fbc,
      clientIpAddress,
      userAgent,
      createdFrom,
      intentKey,
      baseOrderId: isUpsell ? baseOrderId : null,
      providedOrderId: !isUpsell ? providedOrderId : null,
      requestId,
      provider: {
        id: gatewayId || null,
        gatewayId: gatewayId || null,
        externalRef: order.id,
      },
      debug: { upsellSource },
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
        transactionId: tx.id,
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

    if (c.isUnauthorized || c.isTimeout) {
      return pixUnavailableResponse({
        stage: "catch_provider_error",
        requestId,
        provider: c.isUnauthorized ? "unauthorized" : "timeout",
      })
    }

    return NextResponse.json({ ok: false, error: "Erro ao processar pagamento" }, { status: 500 })
  }
}
