import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/transaction-status?id=TRANSACTION_ID
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      console.error("[transaction-status] Sem ID na query")
      return NextResponse.json(
        { ok: false, error: "Missing transaction id" },
        { status: 400 },
      )
    }

    // Busca a transação no banco
    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: {
        order: true,
      },
    })

    if (!tx) {
      console.error("[transaction-status] Transação não encontrada:", id)
      return NextResponse.json(
        { ok: false, error: "Transaction not found" },
        { status: 404 },
      )
    }

    const status = tx.status
    const orderId = tx.orderId ?? tx.order?.id ?? null

    console.log("[transaction-status] ->", {
      id,
      status,
      orderId,
    })

    return NextResponse.json({
      ok: true,
      status,   // ex: "pending", "paid", "PAID"
      orderId,
    })
  } catch (err: any) {
    console.error("ERRO /api/transaction-status:", err)
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro inesperado" },
      { status: 500 },
    )
  }
}
