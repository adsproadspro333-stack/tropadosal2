// app/api/dash/overview/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TZ_OFFSET_MIN = -180 // America/Sao_Paulo

function getSaoPauloDayRangeUtc() {
  const nowUtc = new Date()
  const localMs = nowUtc.getTime() + TZ_OFFSET_MIN * 60_000
  const local = new Date(localMs)

  const startLocal = new Date(local)
  startLocal.setHours(0, 0, 0, 0)

  const endLocal = new Date(startLocal)
  endLocal.setDate(endLocal.getDate() + 1)

  return {
    startUtc: new Date(startLocal.getTime() - TZ_OFFSET_MIN * 60_000),
    endUtc: new Date(endLocal.getTime() - TZ_OFFSET_MIN * 60_000),
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const range = String(searchParams.get("range") || "today")

    let timeFilter: any = undefined

    if (range === "today") {
      const { startUtc, endUtc } = getSaoPauloDayRangeUtc()
      timeFilter = { createdAt: { gte: startUtc, lt: endUtc } }
    }

    const [ordersCreated, transactionsTotal, paidOrders, sums] =
      await Promise.all([
        prisma.order.count({ where: timeFilter }),
        prisma.transaction.count({ where: timeFilter }),
        prisma.order.count({ where: { ...timeFilter, status: "paid" } }),
        prisma.transaction.groupBy({
          by: ["status"],
          where: timeFilter,
          _sum: { value: true },
        }),
      ])

    const paidAmount =
      sums.find((s) => s.status === "paid")?._sum.value ?? 0

    const pendingAmount =
      sums.find((s) => s.status === "pending")?._sum.value ?? 0

    return NextResponse.json(
      {
        ok: true,
        ordersCreated,
        transactionsTotal,
        paidOrders,
        paidAmount,
        pendingAmount,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch {
    return NextResponse.json(
      { ok: false, error: "Falha ao carregar overview" },
      { status: 500 },
    )
  }
}
