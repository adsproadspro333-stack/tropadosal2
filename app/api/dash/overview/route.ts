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

function clampRange(raw: string) {
  const r = String(raw || "").toLowerCase().trim()
  if (r === "today" || r === "24h" || r === "all") return r
  return "today"
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const range = clampRange(searchParams.get("range") || "today")

    let timeFilter: { gte: Date; lt: Date } | undefined

    if (range === "today") {
      const { startUtc, endUtc } = getSaoPauloDayRangeUtc()
      timeFilter = { gte: startUtc, lt: endUtc }
    } else if (range === "24h") {
      const now = new Date()
      const from = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      timeFilter = { gte: from, lt: now }
    } else {
      timeFilter = undefined // all
    }

    const orderWhere = timeFilter ? { createdAt: timeFilter } : {}
    const txWhere = timeFilter ? { createdAt: timeFilter } : {}

    const [
      ordersCreated,
      paidOrders,
      pendingOrders,
      transactionsTotal,
      paidTransactions,
      revenuePaidAgg,
    ] = await Promise.all([
      prisma.order.count({ where: orderWhere }),
      prisma.order.count({ where: { ...orderWhere, status: "paid" } }),
      prisma.order.count({ where: { ...orderWhere, status: "pending" } }),
      prisma.transaction.count({ where: txWhere }),
      prisma.transaction.count({ where: { ...txWhere, status: "paid" } }),
      prisma.transaction.aggregate({
        where: { ...txWhere, status: "paid" },
        _sum: { value: true },
      }),
    ])

    const revenuePaid = Number(revenuePaidAgg?._sum?.value || 0)
    const conversion = ordersCreated > 0 ? paidOrders / ordersCreated : 0

    const res = NextResponse.json(
      {
        ok: true,
        range,
        ordersCreated,
        paidOrders,
        pendingOrders,
        transactionsTotal,
        paidTransactions,
        revenuePaid, // soma de Transaction.value (status=paid)
        conversion, // 0..1
      },
      { status: 200 },
    )

    res.headers.set("Cache-Control", "no-store")
    return res
  } catch (e: any) {
    console.error("[dash/overview] error:", String(e?.message || e || "").slice(0, 400))
    return NextResponse.json({ ok: false, error: "Falha ao carregar overview" }, { status: 500 })
  }
}
