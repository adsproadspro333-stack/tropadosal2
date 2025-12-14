import { NextResponse } from "next/server"
import { createPixTransaction } from "@/lib/payments/ativopay"
import { prisma } from "@/lib/prisma"
import { UNIT_PRICE_CENTS } from "@/app/config/pricing"
import crypto from "crypto"
import { sendPushcutNotification } from "@/lib/pushcut"

const MIN_NUMBERS = 100
const PUSHCUT_ORDER_CREATED_URL = process.env.PUSHCUT_ORDER_CREATED_URL

const isProduction = process.env.NODE_ENV === "production"

function sha256(value: string) {
  return crypto
    .createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex")
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    // Em produção evitamos logar o body completo (contém CPF, email, etc.)
    if (!isProduction) {
      console.log("REQUEST /api/pagamento/pix BODY:", body)
    } else {
      console.log("REQUEST /api/pagamento/pix RECEIVED")
    }

    const headers = req.headers
    const userAgent = headers.get("user-agent") || undefined
    const ipHeader =
      headers.get("x-forwarded-for") || headers.get("x-real-ip") || ""
    const clientIpAddress = ipHeader.split(",")[0]?.trim() || undefined

    // -------------------------------------------------
    // VALOR TOTAL EM CENTAVOS
    // -------------------------------------------------
    let totalInCents = Number(body?.totalInCents ?? 0)

    if (!Number.isFinite(totalInCents) || totalInCents <= 0) {
      const rawAmount = body?.amountInCents ?? body?.amount
      const amountNum = Number(rawAmount)
      totalInCents =
        Number.isFinite(amountNum) && amountNum > 0
          ? Math.round(amountNum)
          : 0
    }

    if (!totalInCents || totalInCents <= 0) {
      return NextResponse.json(
        { ok: false, error: "Valor do pedido inválido" },
        { status: 400 },
      )
    }

    // -------------------------------------------------
    // QUANTIDADE REAL DE NÚMEROS (ANTI-BURLO)
    // -------------------------------------------------
    const quantityFromNumbersArray =
      Array.isArray(body.numbers) && body.numbers.length > 0
        ? body.numbers.length
        : 0

    const quantityFromBody = Number(body?.quantity) || 0

    // Quantidade máxima que o VALOR enviado permite,
    // usando o preço de referência UNIT_PRICE_CENTS.
    const quantityFromAmount =
      UNIT_PRICE_CENTS > 0
        ? Math.max(0, Math.floor(totalInCents / UNIT_PRICE_CENTS))
        : 0

    if (!quantityFromAmount || quantityFromAmount <= 0) {
      // Se o valor não paga nem 1 número pelo preço de referência,
      // não deixamos criar pedido "quase de graça".
      console.warn(
        "[SEC] Valor muito baixo para gerar quantidade, totalInCents=",
        totalInCents,
        "UNIT_PRICE_CENTS=",
        UNIT_PRICE_CENTS,
      )
      return NextResponse.json(
        {
          ok: false,
          error: "Valor insuficiente para gerar números válidos.",
        },
        { status: 400 },
      )
    }

    // 🔐 Regra:
    // - A quantidade efetiva NUNCA pode ser maior do que quantityFromAmount.
    // - Se o front mandar uma quantidade maior (ou manipulada), ignoramos.
    let effectiveQty = quantityFromAmount

    // se veio um array de números explícitos, respeitamos APENAS se couber no valor
    if (
      quantityFromNumbersArray > 0 &&
      quantityFromNumbersArray <= quantityFromAmount
    ) {
      effectiveQty = quantityFromNumbersArray
    }

    // se veio "quantity" no body, também só usamos se for <= ao permitido
    if (
      quantityFromBody > 0 &&
      quantityFromBody <= quantityFromAmount
    ) {
      effectiveQty = quantityFromBody
    }

    // ainda garantimos um mínimo razoável (se você quiser manter esse conceito)
    if (effectiveQty < MIN_NUMBERS) {
      // aqui você pode escolher:
      // - OU força para MIN_NUMBERS (se não quiser menos de 100)
      // - OU simplesmente deixa como está. Vou só logar para você analisar.
      console.warn(
        "[SEC] effectiveQty menor que MIN_NUMBERS:",
        effectiveQty,
        "MIN_NUMBERS=",
        MIN_NUMBERS,
      )
      // effectiveQty = MIN_NUMBERS
    }

    const amountInCents = Math.round(totalInCents)

    // -------------------------------------------------
    // DADOS DO CLIENTE
    // -------------------------------------------------
    const customer = body?.customer || {}
    const documentNumber = String(customer?.documentNumber || "").replace(
      /\D/g,
      "",
    )
    const phone = String(customer?.phone || "").replace(/\D/g, "")
    const email: string | null = customer?.email || null
    const fullName: string | null = customer?.name || null

    if (!documentNumber) {
      return NextResponse.json(
        { ok: false, error: "CPF/CNPJ obrigatório" },
        { status: 400 },
      )
    }

    // -------------------------------------------------
    // GERA EVENT ID ÚNICO (Meta)
    // -------------------------------------------------
    const fbEventId = crypto.randomUUID()

    // -------------------------------------------------
    // USUÁRIO (EVITA DUPLICIDADE DE EMAIL/CPF)
    // -------------------------------------------------
    const orConditions: any[] = [{ cpf: documentNumber }]
    if (email) {
      orConditions.push({ email })
    }

    let user = await prisma.user.findFirst({
      where: { OR: orConditions },
    })

    try {
      if (!user) {
        // cria novo usuário
        const firstName =
          fullName?.split(" ").filter(Boolean)[0] || null
        const lastName =
          fullName?.split(" ").filter(Boolean).slice(1).join(" ") || null

        user = await prisma.user.create({
          data: {
            cpf: documentNumber,
            email,
            phone: phone || null,
            firstName,
            lastName,
          },
        })
      } else {
        // atualiza dados faltantes, sem sobrescrever o que já existe
        const firstNameExisting = user.firstName
        const lastNameExisting = user.lastName

        const firstNameNew =
          firstNameExisting ||
          (fullName
            ? fullName.split(" ").filter(Boolean)[0]
            : undefined)

        const lastNameNew =
          lastNameExisting ||
          (fullName
            ? fullName.split(" ").filter(Boolean).slice(1).join(" ")
            : undefined)

        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            email: user.email || email || undefined,
            phone: user.phone || phone || undefined,
            firstName: firstNameNew,
            lastName: lastNameNew,
          },
        })
      }
    } catch (err: any) {
      // Se der P2002 (unique), reaproveita o usuário já existente
      if (err?.code === "P2002") {
        console.warn(
          "P2002 em user.create/update, reaproveitando usuário:",
          err,
        )

        user = await prisma.user.findFirst({
          where: { OR: orConditions },
        })

        if (!user) {
          throw err
        }
      } else {
        throw err
      }
    }

    if (!user) {
      throw new Error("Não foi possível criar/encontrar o usuário")
    }

    // -------------------------------------------------
    // ORDER
    // -------------------------------------------------
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        amount: amountInCents / 100,
        status: "pending",
        quantity: effectiveQty,
        metaEventId: fbEventId, // usado para deduplicar Purchase no servidor
      },
    })

    if (Array.isArray(body.numbers) && body.numbers.length > 0) {
      await prisma.ticket.createMany({
        data: body.numbers.map((n: number) => ({
          orderId: order.id,
          number: n,
        })),
      })
    }

    // -------------------------------------------------
    // PUSHCUT – PEDIDO GERADO (TICKET)
    // -------------------------------------------------
    if (PUSHCUT_ORDER_CREATED_URL) {
      try {
        const amountReais = amountInCents / 100

        await sendPushcutNotification(PUSHCUT_ORDER_CREATED_URL, {
          // Título aparece no Pushcut
          title: `+1 ( R$ ${amountReais
            .toFixed(2)
            .replace(".", ",")} ) RF  [ P.Z ]`,
          // Texto da notificação
          text: "Aguardando Pagamento⚠️",

          // Extras pra usar na automação, se quiser
          orderId: order.id,
          amount: amountReais,
          qty: effectiveQty,
        })
      } catch (err) {
        console.error("Erro ao enviar Pushcut de pedido gerado:", err)
      }
    }

    // -------------------------------------------------
    // CHAMA ATIVOPAY
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
      metadata: String(body?.metadata ?? ""),
      traceable: true,
    })

    // resp vem formatado pelo nosso lib:
    // {
    //   raw,
    //   transactionId,
    //   amount,
    //   status,
    //   pixCopiaECola,
    //   qrCodeBase64,
    //   expiresAt,
    // }
    const {
      raw,
      transactionId: gwTransactionId,
      status: gwStatus,
      pixCopiaECola,
      qrCodeBase64,
      expiresAt,
    } = resp as any

    const data = raw?.data ?? raw ?? {}

    const gatewayId =
      gwTransactionId ||
      data?.transactionId ||
      data?.id ||
      ""

    const transactionStatus =
      gwStatus || data?.status || "pending"

    const transaction = await prisma.transaction.create({
      data: {
        orderId: order.id,
        value: amountInCents / 100,
        status: transactionStatus,
        gatewayId,
        pixCopiaCola: pixCopiaECola || null,
      },
    })

    // -------------------------------------------------
    // FACEBOOK CAPI - InitiateCheckout (SERVER-SIDE)
    // -------------------------------------------------
    const fbPixelId = process.env.FACEBOOK_PIXEL_ID || ""
    const fbAccessToken = process.env.FACEBOOK_CAPI_TOKEN || ""

    if (fbPixelId && fbAccessToken) {
      const payload = {
        data: [
          {
            event_name: "InitiateCheckout",
            event_time: Math.floor(Date.now() / 1000),
            event_id: fbEventId,
            action_source: "website",
            user_data: {
              em: email ? [sha256(email)] : undefined,
              ph: phone ? [sha256(phone)] : undefined,
              external_id: [sha256(documentNumber)],
              client_ip_address: clientIpAddress,
              client_user_agent: userAgent,
            },
            custom_data: {
              value: amountInCents / 100,
              currency: "BRL",
              num_items: effectiveQty,
              order_id: order.id,
            },
          },
        ],
      }

      try {
        await fetch(
          `https://graph.facebook.com/v21.0/${fbPixelId}/events?access_token=${fbAccessToken}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        )
      } catch (err) {
        console.error("Erro ao enviar InitiateCheckout para Meta:", err)
      }
    }

    // -------------------------------------------------
    // RESPOSTA PARA O FRONT
    // -------------------------------------------------
    return NextResponse.json(
      {
        ok: true,
        orderId: order.id,
        transactionId: transaction.id,
        pixCopiaECola,
        qrCodeBase64,
        expiresAt,
        fbEventId,
      },
      { status: 200 },
    )
  } catch (err: any) {
    console.error("ERRO /api/pagamento:", err)

    // Não expor detalhes internos pro cliente
    const safeMessage =
      "Erro ao processar o pagamento. Tente novamente em instantes."

    return NextResponse.json(
      {
        ok: false,
        error: safeMessage,
      },
      { status: 500 },
    )
  }
}
