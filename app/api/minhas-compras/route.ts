// app/api/minhas-compras/route.ts
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const IS_PRODUCTION = process.env.NODE_ENV === "production"

const normalizeCpf = (value: string) => String(value || "").replace(/\D/g, "")

function maskCpf(digits: string) {
  const d = normalizeCpf(digits)
  if (d.length !== 11) return ""
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`
}

// ✅ GET (para chamadas como /api/minhas-compras?cpf=...)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const cpfRaw = String(searchParams.get("cpf") || "").trim()
  return handleRequest(cpfRaw)
}

// ✅ POST (para chamadas via fetch com body)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const cpfRaw = String(body?.cpf || "").trim()
  return handleRequest(cpfRaw)
}

async function handleRequest(cpfRaw: string) {
  try {
    const cpfDigits = normalizeCpf(cpfRaw)
    const cpfMasked = maskCpf(cpfDigits)

    if (!cpfDigits || cpfDigits.length !== 11) {
      return NextResponse.json({ ok: false, error: "CPF inválido" }, { status: 400 })
    }

    if (!IS_PRODUCTION) {
      console.log("🔎 MINHAS COMPRAS CPF:", { cpfRaw, cpfDigits, cpfMasked })
    } else {
      console.log("🔎 MINHAS COMPRAS (prod) CPF final:", cpfDigits.slice(-4))
    }

    // ✅ PEGADA CERTA: pega TODOS os users que batem (evita “findFirst” pegar o user errado)
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { cpf: cpfDigits },
          ...(cpfMasked ? [{ cpf: cpfMasked }] : []),
        ],
      },
      select: { id: true, cpf: true },
      take: 10,
    })

    if (!users.length) {
      return NextResponse.json({ ok: true, orders: [] }, { status: 200 })
    }

    const userIds = users.map((u) => u.id)

    const orders = await prisma.order.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: "desc" },
      include: {
        transactions: { orderBy: { createdAt: "desc" } },
        tickets: true,
      },
    })

    const result = orders.map((o) => {
      const qFromOrder = (o as any).quantity ?? 0
      const qFromTickets = o.tickets?.length ?? 0
      const quantity = qFromOrder || qFromTickets || 0

      const rawId = String(o.id || "").replace(/-/g, "")
      const displayOrderCode = "#" + rawId.slice(-6).toUpperCase()

      return {
        id: o.id,
        displayOrderCode,
        amount: o.amount,
        status: o.status,
        createdAt: (o as any).createdAt?.toISOString?.() ?? null,
        quantity,
        numbers: o.tickets?.map((t) => (t as any).number) ?? [],
        transactions:
          o.transactions?.map((t) => ({
            id: t.id,
            status: t.status,
            value: t.value,
            gatewayId: t.gatewayId,
            pixCopiaCola: t.pixCopiaCola,
          })) ?? [],
      }
    })

    if (!IS_PRODUCTION) {
      console.log("✅ Users encontrados:", users.map((u) => u.cpf))
      console.log("✅ Pedidos encontrados:", result.length)
    }

    return NextResponse.json({ ok: true, orders: result }, { status: 200 })
  } catch (err: any) {
    console.error("ERRO /api/minhas-compras:", err)
    return NextResponse.json({ ok: false, error: "Erro ao buscar pedidos" }, { status: 500 })
  }
}
