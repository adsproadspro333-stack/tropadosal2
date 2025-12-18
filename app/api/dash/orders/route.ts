// app/api/dash/orders/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TZ_OFFSET_MIN = -180 // America/Sao_Paulo (sem DST)

// range "today" usando o dia de SP (convertendo pra UTC)
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

function clampInt(n: any, min: number, max: number, fallback: number) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return fallback
  return Math.max(min, Math.min(max, v))
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    const q = String(searchParams.get("q") || "").trim()
    const statusRaw = String(searchParams.get("status") || "all").toLowerCase().trim()
    const range = String(searchParams.get("range") || "today").toLowerCase().trim()

    // ✅ paginado
    const limit = clampInt(searchParams.get("limit"), 10, 200, 50) // recomendado: 50
    const page = clampInt(searchParams.get("page"), 1, 10_000, 1)
    const skip = (page - 1) * limit

    // ✅ valida status permitido (evita filtro maluco)
    const allowedStatus = new Set(["all", "pending", "paid", "failed"])
    const status = allowedStatus.has(statusRaw) ? statusRaw : "all"

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
    if (status !== "all") whereTx.status = status

    if (q) {
      const qDigits = q.replace(/\D/g, "")

      whereTx.OR = [
        { id: { contains: q, mode: "insensitive" } },
        { gatewayId: { contains: q, mode: "insensitive" } },
        { orderId: { contains: q, mode: "insensitive" } },

        ...(qDigits
          ? [
              { order: { user: { cpf: { contains: qDigits } } } },
              { order: { user: { phone: { contains: qDigits } } } },
            ]
          : []),

        ...(q.includes("@")
          ? [{ order: { user: { email: { contains: q, mode: "insensitive" } } } }]
          : []),
      ]
    }

    // ✅ (opcional) total para paginação — em bases enormes, dá pra desligar depois
    const total = await prisma.transaction.count({ where: whereTx })

    const txs = await prisma.transaction.findMany({
      where: whereTx,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        createdAt: true,
        status: true,
        value: true,
        gatewayId: true,
        orderId: true,
        order: {
          select: {
            id: true,
            amount: true,
            status: true,
            quantity: true,
            createdAt: true,
            user: {
              select: {
                cpf: true,
                phone: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    })

    const rows = txs.map((t) => {
      const u = (t as any)?.order?.user
      return {
        transactionId: t.id,
        createdAt: t.createdAt.toISOString(),
        status: t.status,
        value: t.value,
        gatewayId: t.gatewayId || null,
        orderId: t.orderId,

        // extras úteis pro dash
        orderAmount: (t as any)?.order?.amount ?? null,
        orderStatus: (t as any)?.order?.status ?? null,
        quantity: (t as any)?.order?.quantity ?? null,
        orderCreatedAt: (t as any)?.order?.createdAt
          ? (t as any).order.createdAt.toISOString()
          : null,

        name: pickUserName(u),
        cpf: u?.cpf || null,
        phone: u?.phone || null,
        email: u?.email || null,
      }
    })

    const res = NextResponse.json(
      {
        ok: true,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        rows,
      },
      { status: 200 },
    )

    res.headers.set("Cache-Control", "no-store")
    return res
  } catch (e: any) {
    console.error("[dash/orders] error:", String(e?.message || e || "").slice(0, 400))
    return NextResponse.json({ ok: false, error: "Falha ao carregar transações" }, { status: 500 })
  }
}
