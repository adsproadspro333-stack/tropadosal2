// app/api/dash/orders/route.ts
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

function pickUserName(u: any) {
  const first = String(u?.firstName || "").trim()
  const last = String(u?.lastName || "").trim()
  const full = `${first} ${last}`.trim()
  return full || null
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    const q = String(searchParams.get("q") || "").trim()
    const status = String(searchParams.get("status") || "all").toLowerCase()
    const range = String(searchParams.get("range") || "today").toLowerCase()

    const limitRaw = Number(searchParams.get("limit") || 100)
    const limit = Math.max(10, Math.min(300, Math.round(limitRaw)))

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

    const whereTx: any = {}
    if (timeFilter) whereTx.createdAt = timeFilter

    if (status !== "all") {
      whereTx.status = status
    }

    if (q) {
      const qDigits = q.replace(/\D/g, "")
      whereTx.OR = [
        { id: { contains: q, mode: "insensitive" } },
        { gatewayId: { contains: q, mode: "insensitive" } },
        { orderId: { contains: q, mode: "insensitive" } },
        ...(qDigits
          ? [
              {
                order: {
                  user: {
                    cpf: { contains: qDigits },
                  },
                },
              },
              {
                order: {
                  user: {
                    phone: { contains: qDigits },
                  },
                },
              },
            ]
          : []),
        ...(q.includes("@")
          ? [
              {
                order: {
                  user: {
                    email: { contains: q, mode: "insensitive" },
                  },
                },
              },
            ]
          : []),
      ]
    }

    const txs = await prisma.transaction.findMany({
      where: whereTx,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        order: {
          include: {
            user: true,
          },
        },
      },
    })

    const rows = txs.map((t) => {
      const u = (t as any)?.order?.user
      return {
        transactionId: t.id,
        createdAt: t.createdAt,
        status: t.status,
        value: t.value,
        gatewayId: t.gatewayId || null,
        orderId: t.orderId,

        name: pickUserName(u),
        cpf: u?.cpf || null,
        phone: u?.phone || null,
        email: u?.email || null,
      }
    })

    const res = NextResponse.json({ ok: true, rows }, { status: 200 })
    res.headers.set("Cache-Control", "no-store")
    return res
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Falha ao carregar transações" }, { status: 500 })
  }
}
