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

function normalizeDigits(v: any) {
  return String(v || "").replace(/\D/g, "")
}

function normalizePhoneBR(raw: any) {
  const d = normalizeDigits(raw)
  if (!d) return ""
  // Se já tiver 55 + DDD + número
  if (d.length >= 12 && d.startsWith("55")) return d
  // Se vier DDD + número (10/11 dígitos), prefixa 55
  if (d.length === 10 || d.length === 11) return `55${d}`
  // Se vier maior/menor, devolve como está (melhor que quebrar)
  return d
}

function sha256Short(input: string) {
  try {
    return crypto.createHash("sha256").update(input).digest("hex").slice(0, 12)
  } catch {
    return "hashfail"
  }
}

function isLikelyInstagramOrFbWebView(ua?: string) {
  const s = String(ua || "")
  if (!s) return false
  // Instagram WebView costuma conter "Instagram"
  // Facebook/FBAN/FBAV costuma aparecer em webview do app
  return (
    s.includes("Instagram") ||
    s.includes("FBAN") ||
    s.includes("FBAV") ||
    s.includes("FB_IAB") ||
    s.includes("FB4A") ||
    s.includes("FBIOS")
  )
}

function normalizeMetaId(v: any) {
  const s = String(v || "").trim()
  return s || undefined
}

// ✅ Gera _fbc a partir do fbclid (padrão: fb.1.<ts>.<fbclid>)
function buildFbcFromFbclid(fbclid?: string, eventTime?: number) {
  const c = String(fbclid || "").trim()
  if (!c) return undefined
  const ts = Number(eventTime || Math.floor(Date.now() / 1000))
  if (!Number.isFinite(ts) || ts <= 0) return undefined
  return `fb.1.${ts}.${c}`
}

function buildMetaString(input: {
  fbp?: string
  fbc?: string
  fbclid?: string
  clientIpAddress?: string
  userAgent?: string
  createdFrom: "main" | "upsell"
  requestId: string
  baseOrderId?: string | null
  providedOrderId?: string | null
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
    ...(input.fbclid ? { fbclid: input.fbclid } : {}),
    ...(input.clientIpAddress ? { clientIpAddress: input.clientIpAddress } : {}),
    ...(input.userAgent ? { clientUserAgent: input.userAgent } : {}),

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
  if (!isProduction) {
    console.error("[pix] PIX indisponível agora:", extra)
  } else {
    // Em produção, loga só o essencial (sem vazar payload)
    if (extra?.requestId) {
      console.error("[pix] PIX indisponível:", {
        requestId: extra.requestId,
        stage: extra.stage,
        orderId: extra.orderId,
        provider: extra.provider,
      })
    }
  }

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

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function createPixWithRetry(
  args: any,
  ctx: { requestId: string; orderId: string; isUpsell: boolean },
) {
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
  requestId: string
  fbp?: string
  fbc?: string
  fbclid?: string
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
      fbclid: params.fbclid,
      clientIpAddress: params.clientIpAddress,
      userAgent: params.userAgent,
      createdFrom: params.createdFrom,
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

    const headers = req.headers
    const userAgent = headers.get("user-agent") || undefined
    const clientIpAddress = getClientIp(headers)

    const cookies = parseCookies(headers.get("cookie"))

    // ✅ Prioridade de sinais (porque WebView/cookie pode falhar):
    // 1) body (enviado pelo /pagamento/page.tsx)
    // 2) cookie
    // 3) deriva fbc do fbclid quando possível
    const fbpFromBody = normalizeMetaId(body?.fbp)
    const fbcFromBody = normalizeMetaId(body?.fbc)
    const fbclidFromBody = normalizeMetaId(body?.fbclid)

    const fbpFromCookie = normalizeMetaId(cookies["_fbp"])
    const fbcFromCookie = normalizeMetaId(cookies["_fbc"])

    const fbclid = fbclidFromBody
    const fbp = fbpFromBody || fbpFromCookie || undefined

    // se já veio fbc pelo body/cookie, usa; senão tenta derivar do fbclid
    const derivedFbc = buildFbcFromFbclid(fbclid, Math.floor(Date.now() / 1000))
    const fbc = fbcFromBody || fbcFromCookie || derivedFbc || undefined

    const referer = headers.get("referer") || undefined
    const origin = headers.get("origin") || undefined

    const webview = isLikelyInstagramOrFbWebView(userAgent)

    if (!isProduction) {
      console.log("REQUEST /api/pagamento/pix BODY:", body)
    } else {
      console.log("[pix-request]", {
        requestId,
        webview,
        hasFbp: Boolean(fbp),
        hasFbc: Boolean(fbc),
        hasFbclid: Boolean(fbclid),
        ipHash: clientIpAddress ? sha256Short(clientIpAddress) : null,
        origin: origin ? origin.slice(0, 140) : null,
        referer: referer ? referer.slice(0, 180) : null,
        ua: userAgent ? userAgent.slice(0, 180) : null,
      })
      console.log("REQUEST /api/pagamento/pix RECEIVED", { requestId })
    }

    const isUpsell =
      body?.isUpsell === true ||
      body?.upsell === true ||
      body?.mode === "upsell" ||
      body?.createdFrom === "upsell" ||
      String(body?.upsell || "") === "1"

    const createdFrom: "main" | "upsell" = isUpsell ? "upsell" : "main"

    const upsellSource = String(
      body?.source || body?.origin || body?.context || body?.from || "",
    ).toLowerCase()

    const baseOrderIdRaw =
      body?.baseOrderId ??
      body?.base_order_id ??
      body?.baseOrder ??
      body?.base_order ??
      null

    const providedOrderIdRaw = body?.orderId ?? body?.order_id ?? null
    const providedOrderIdStr = String(providedOrderIdRaw || "").trim() || null

    // ✅ IMPORTANTÍSSIMO:
    // - no upsell do "Minhas Compras", geralmente vem só orderId => usamos isso como baseOrderId
    const baseOrderIdStr = String(baseOrderIdRaw || "").trim() || null
    const baseOrderId = isUpsell ? baseOrderIdStr || providedOrderIdStr : baseOrderIdStr

    // para main pode vir orderId amarrado pela URL
    const providedOrderId = !isUpsell ? providedOrderIdStr : null

    // ✅ upsell PRECISA de baseOrderId (pra não misturar pedidos)
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
    const documentNumber = normalizeDigits(customer?.documentNumber || "")
    const phone = normalizePhoneBR(customer?.phone || "")
    const fullName: string | null = customer?.name || null

    // Evita email placeholder genérico (alguns gateways rejeitam / penalizam)
    const emailFromBody: string | null = customer?.email || null
    const email: string | null = emailFromBody || (documentNumber ? `${documentNumber}@noemail.local` : null)

    if (!documentNumber) {
      return NextResponse.json({ ok: false, error: "CPF obrigatório" }, { status: 400 })
    }

    // -------------------------------------------------
    // USER (CPF DOMINANTE)
    // -------------------------------------------------
    const orConditions: any[] = [{ cpf: documentNumber }]
    if (emailFromBody) orConditions.push({ email: emailFromBody })

    let user = await prisma.user.findFirst({ where: { OR: orConditions } })

    if (!user) {
      try {
        const firstName = fullName?.split(" ")[0] || null
        const lastName = fullName?.split(" ").slice(1).join(" ") || null

        user = await prisma.user.create({
          data: {
            cpf: documentNumber,
            email: emailFromBody || null,
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

    // -------------------------------------------------
    // (SEM DEDUPE) - LOG INCOMING (ajuda debug)
    // -------------------------------------------------
    if (!isProduction) {
      console.log("[pix] incoming:", {
        requestId,
        createdFrom,
        isUpsell,
        upsellSource,
        baseOrderId,
        providedOrderId,
        amountInCents,
        effectiveQty,
        cpf: documentNumber ? "***" + documentNumber.slice(-4) : null,
        hasFbp: Boolean(fbp),
        hasFbc: Boolean(fbc),
        hasFbclid: Boolean(fbclid),
      })
    } else {
      console.log("[pix-incoming]", {
        requestId,
        createdFrom,
        isUpsell,
        amountInCents,
        effectiveQty,
        baseOrderId: baseOrderId || null,
        providedOrderId: providedOrderId || null,
        cpfLast4: documentNumber ? documentNumber.slice(-4) : null,
        webview,
        hasFbp: Boolean(fbp),
        hasFbc: Boolean(fbc),
        hasFbclid: Boolean(fbclid),
      })
    }

    // -------------------------------------------------
    // MAIN: se vier providedOrderId, tentamos pagar ESSE pedido
    // - se já estiver pago: retorna ok
    // - se estiver pending e for do user: cria TX nova nesse order
    // -------------------------------------------------
    if (!isUpsell && providedOrderId) {
      const existingOrder = await prisma.order.findFirst({
        where: { id: providedOrderId, userId: user.id },
      })

      if (!existingOrder) {
        return NextResponse.json({ ok: false, error: "Pedido não encontrado" }, { status: 404 })
      }

      if (existingOrder.status === "paid") {
        return NextResponse.json(
          {
            ok: true,
            alreadyPaid: true,
            status: "paid",
            orderId: existingOrder.id,
            fbEventId: existingOrder.metaEventId || null,
          },
          { status: 200 },
        )
      }

      // ⚠️ mantém coerência do pedido existente:
      // se quiser permitir “pagar com outro valor”, aí teria que mudar regra. Aqui mantém seguro:
      if (Number(existingOrder.amount || 0) !== amountInCents / 100) {
        return NextResponse.json(
          { ok: false, error: "Valor não confere com o pedido. Gere um novo pagamento." },
          { status: 400 },
        )
      }

      const fbEventId = existingOrder.metaEventId || crypto.randomUUID()

      let resp: any
      try {
        resp = await createPixWithRetry(
          {
            amount: amountInCents,
            customer: {
              name: fullName || "Cliente",
              email: email || "noemail.local",
              phone,
              document: { type: "CPF", number: documentNumber },
            },
            items: [
              {
                title: `${effectiveQty} números`,
                quantity: 1,
                tangible: false,
                unitPrice: amountInCents,
                externalRef: existingOrder.id,
              },
            ],
            expiresInDays: 1,
            traceable: true,
          },
          { requestId, orderId: existingOrder.id, isUpsell: false },
        )
      } catch (e: any) {
        await registerFailedTransaction({
          orderId: existingOrder.id,
          amountInCents,
          createdFrom,
          requestId,
          fbp,
          fbc,
          fbclid,
          clientIpAddress,
          userAgent,
          baseOrderId: null,
          providedOrderId,
          stage: "pay_existing_order_provider_error",
          err: e,
        })

        const c = classifyProviderError(e)
        console.error("[pix-create-fail]", {
          requestId,
          orderId: existingOrder.id,
          mode: "pay_existing_order",
          provider: c.isUnauthorized ? "unauthorized" : c.isTimeout ? "timeout" : "other",
          message: c.rawMessage?.slice(0, 220),
        })

        return pixUnavailableResponse({
          stage: "pay_existing_order_provider_error",
          requestId,
          orderId: existingOrder.id,
          provider: c.isUnauthorized ? "unauthorized" : c.isTimeout ? "timeout" : "other",
        })
      }

      const pixCopiaECola = resolvePixCopiaECola(resp)
      const qrCodeBase64 = (resp as any)?.qrCodeBase64 ?? null
      const expiresAt = (resp as any)?.expiresAt ?? null
      const raw = (resp as any)?.raw

      const gatewayId = resolveGatewayId(resp)

      console.log("[pix-create-ok]", {
        requestId,
        orderId: existingOrder.id,
        mode: "pay_existing_order",
        gatewayId: gatewayId || null,
        hasCopiaECola: Boolean(pixCopiaECola),
        webview,
      })

      if (!pixCopiaECola) {
        await registerFailedTransaction({
          orderId: existingOrder.id,
          amountInCents,
          createdFrom,
          requestId,
          fbp,
          fbc,
          fbclid,
          clientIpAddress,
          userAgent,
          baseOrderId: null,
          providedOrderId,
          stage: "pay_existing_order_missing_copia",
          err: new Error("PIX sem copia e cola"),
        })

        return pixUnavailableResponse({
          stage: "pay_existing_order_missing_copia",
          orderId: existingOrder.id,
          requestId,
          gatewayStatus: raw?.status ?? raw?.data?.status ?? null,
          raw: isProduction ? undefined : raw,
        })
      }

      const meta = buildMetaString({
        fbp,
        fbc,
        fbclid,
        clientIpAddress,
        userAgent,
        createdFrom: "main",
        requestId,
        baseOrderId: null,
        providedOrderId,
        provider: {
          id: gatewayId || null,
          gatewayId: gatewayId || null,
          externalRef: existingOrder.id,
        },
      })

      const tx = await prisma.transaction.create({
        data: {
          orderId: existingOrder.id,
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
          orderId: existingOrder.id,
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

    // -------------------------------------------------
    // (SEM DEDUPE) - SEMPRE cria NOVO pedido:
    // - MAIN normal: cria order + tx
    // - UPSELL: cria order + tx (meta carrega baseOrderId)
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
            email: email || "noemail.local",
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
        requestId,
        fbp,
        fbc,
        fbclid,
        clientIpAddress,
        userAgent,
        baseOrderId: isUpsell ? baseOrderId : null,
        providedOrderId: null,
        stage: "create_new_provider_error",
        err: e,
      })

      const c = classifyProviderError(e)
      console.error("[pix-create-fail]", {
        requestId,
        orderId: order.id,
        mode: "create_new",
        isUpsell,
        provider: c.isUnauthorized ? "unauthorized" : c.isTimeout ? "timeout" : "other",
        message: c.rawMessage?.slice(0, 220),
        webview,
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

    const gatewayId = resolveGatewayId(resp)

    console.log("[pix-create-ok]", {
      requestId,
      orderId: order.id,
      mode: "create_new",
      isUpsell,
      gatewayId: gatewayId || null,
      hasCopiaECola: Boolean(pixCopiaECola),
      webview,
    })

    if (!pixCopiaECola) {
      await registerFailedTransaction({
        orderId: order.id,
        amountInCents,
        createdFrom,
        requestId,
        fbp,
        fbc,
        fbclid,
        clientIpAddress,
        userAgent,
        baseOrderId: isUpsell ? baseOrderId : null,
        providedOrderId: null,
        stage: "create_new_missing_copia",
        err: new Error("PIX sem copia e cola"),
      })

      return pixUnavailableResponse({
        stage: "create_new_missing_copia",
        orderId: order.id,
        requestId,
        isUpsell,
        upsellSource,
        gatewayStatus: raw?.status ?? raw?.data?.status ?? null,
        raw: isProduction ? undefined : raw,
      })
    }

    const meta = buildMetaString({
      fbp,
      fbc,
      fbclid,
      clientIpAddress,
      userAgent,
      createdFrom,
      requestId,
      baseOrderId: isUpsell ? baseOrderId : null,
      providedOrderId: null,
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
