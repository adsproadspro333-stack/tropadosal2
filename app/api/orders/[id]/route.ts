// app/api/orders/[id]/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { UNIT_PRICE_CENTS } from "@/app/config/pricing"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const { id } = await params

    if (!id || id === "undefined" || id === "null") {
      return NextResponse.json({ ok: false, error: "order id obrigatório" }, { status: 400 })
    }

    const order = await prisma.order.findUnique({
      where: { id },
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

    return NextResponse.json(
      {
        id: order.id,
        amount: order.amount, // em reais, como está salvo no banco
        quantity: quantity ?? 0,
        createdAt: (order as any).createdAt ?? null,
      },
      { status: 200 },
    )
  } catch (err: any) {
    console.error("ERRO /api/orders/[id]:", err)
    return NextResponse.json({ ok: false, error: err?.message || "Erro inesperado" }, { status: 500 })
  }
}
