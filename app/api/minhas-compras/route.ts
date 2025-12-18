// app/api/minhas-compras/route.ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const IS_PRODUCTION = process.env.NODE_ENV === "production"

const normalizeCpf = (value: string) => String(value || "").replace(/\D/g, "")

// ✅ GET (para chamadas como /api/minhas-compras?cpf=...)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const cpfRaw = String(searchParams.get("cpf") || "").trim()
  return handleRequest(cpfRaw)
}

// ✅ POST (para chamadas via fetch com body)
export async function POST(req: Request) {
  const body = await req.json()
  const cpfRaw = String(body?.cpf || "").trim()
  return handleRequest(cpfRaw)
}

// Lógica central reutilizada
async function handleRequest(cpfRaw: string) {
  try {
    const cpfDigits = normalizeCpf(cpfRaw)

    if (!IS_PRODUCTION) {
      console.log("🔎 BUSCA MINHAS COMPRAS CPF:", cpfDigits, "(raw:", cpfRaw, ")")
    } else {
      const masked = cpfDigits && cpfDigits.length >= 4 ? cpfDigits.slice(-4) : "unknown"
      console.log("🔎 BUSCA MINHAS COMPRAS (prod) CPF final:", masked)
    }

    if (!cpfDigits || cpfDigits.length < 11) {
      return NextResponse.json({ ok: false, error: "CPF inválido" }, { status: 400 })
    }

    // ✅ Busca pedidos direto pelo relacionamento do usuário
    // Isso evita depender de cpf ser @unique e cobre casos onde cpf antigo foi salvo com máscara.
    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { user: { cpf: cpfDigits } },
          { user: { cpf: cpfRaw } }, // fallback caso algum registro antigo tenha máscara
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        transactions: true,
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

    console.log("✅ Pedidos encontrados:", result.length)

    return NextResponse.json({ ok: true, orders: result })
  } catch (err: any) {
    console.error("ERRO /api/minhas-compras:", err)
    return NextResponse.json({ ok: false, error: "Erro ao buscar pedidos" }, { status: 500 })
  }
}
