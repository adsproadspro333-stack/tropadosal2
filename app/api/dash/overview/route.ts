// app/api/dash/overview/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TZ_OFFSET_MIN = -180 // America/Sao_Paulo (sem DST)
function getSaoPauloDayRangeUtc() {
  const nowUtc = new Date()
  const localMs = nowUtc.getTime() + TZ_OFFSET_MIN * 60_000
  const local = new Date(localMs)

  const startLocal = new Date(local)
  startLocal.setHours(0, 0, 0, 0)

  const endLocal = new Date(startLocal)
  endLocal.setDate(endLocal.getDate() + 1)

  const startUtc = new Date(startLocal.getTime() - TZ_OFFSET_MIN * 60_000)
  const endUtc = new Date(endLocal.getTime() - TZ_OFFSET_MIN * 60_000)

  return { startUtc, endUtc }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const range = String(searchParams.get("range") || "today").toLowerCase()

    let timeFilter: { gte: Date; lt: Date } | undefined

    if (range === "today") {
      const { startUtc, endUtc } = getSaoPauloDayRangeUtc()
      timeFilter = { gte: startUtc, lt: endUtc }
    } else if (range === "24h") {
      const now = new Date()
      const from = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      timeFilter = { gte: from, lt: now }
    }

    const [ordersCreated, transactionsTotal, paidOrders] = await Promise.all([
      prisma.order.count({
        where: timeFilter ? { createdAt: timeFilter } : undefined,
      }),
      prisma.transaction.count({
        where: timeFilter ? { createdAt: timeFilter } : undefined,
      }),
      prisma.order.count({
        where: {
          ...(timeFilter ? { createdAt: timeFilter } : {}),
          status: "paid",
        },
      }),
    ])

    const res = NextResponse.json(
      {
        ok: true,
        range,
        ordersCreated,
        transactionsTotal,
        paidOrders,
      },
      { status: 200 },
    )
    res.headers.set("Cache-Control", "no-store")
    return res
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Falha ao carregar overview" }, { status: 500 })
  }
}
