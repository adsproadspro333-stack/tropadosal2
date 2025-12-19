// app/api/orders/[id]/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { UNIT_PRICE_CENTS } from "@/app/config/pricing"

type RouteContext = {
  params: Promise<{ id: string }>
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

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const { id } = await params

    if (!id || id === "undefined" || id === "null") {
      return NextResponse.json({ ok: false, error: "order id obrigatório" }, { status: 400 })
    }

    // ✅ inclui transactions pra devolver metaEventId consistente (dedupe fbq + CAPI)
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            meta: true,
            createdAt: true,
          },
        },
      },
    })

    if (!order) {
      return NextResponse.json({ ok: false, error: "Pedido não encontrado" }, { status: 404 })
    }

    const pricePerNumber = UNIT_PRICE_CENTS / 100

    // Se seu modelo Order já tiver "quantity", usamos ele.
    let quantity: number | null = (order as any).quantity ?? null

    // Se não tiver, estimamos: quantidade = valor total / preço unitário
    if ((quantity == null || Number.isNaN(quantity)) && pricePerNumber > 0) {
      quantity = Math.round(order.amount / pricePerNumber)
    }

    // ✅ metaEventId (pra dedupe):
    // prioridade:
    // 1) order.metaEventId (se existir no seu model)
    // 2) transaction.meta.capiEventId (que você grava no webhook)
    // 3) fallback: transaction.id (ainda consistente)
    const orderMetaEventId =
      ((order as any).metaEventId && String((order as any).metaEventId).trim()) || null

    const paidTx =
      order.transactions?.find((t: any) => String(t.status || "").toLowerCase() === "paid") ||
      order.transactions?.[0] ||
      null

    const txMetaObj = paidTx ? safeJsonParse((paidTx as any).meta) || {} : {}
    const txCapiEventId =
      (txMetaObj?.capiEventId && String(txMetaObj.capiEventId).trim()) || null

    const metaEventId =
      orderMetaEventId ||
      txCapiEventId ||
      (paidTx?.id ? String(paidTx.id) : null)

    return NextResponse.json(
      {
        id: order.id,
        amount: order.amount, // em reais, como está salvo no banco
        quantity: quantity ?? 0,
        createdAt: (order as any).createdAt ?? null,

        // ✅ ESSENCIAL: pro client usar como eventID no fbq e dedupar com CAPI
        metaEventId,
      },
      { status: 200 },
    )
  } catch (err: any) {
    console.error("ERRO /api/orders/[id]:", err)
    return NextResponse.json({ ok: false, error: err?.message || "Erro inesperado" }, { status: 500 })
  }
}
