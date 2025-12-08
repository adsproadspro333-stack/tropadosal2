// app/api/minhas-compras/route.ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const IS_PRODUCTION = process.env.NODE_ENV === "production"

const normalizeCpf = (value: string) => value.replace(/\D/g, "")

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
    const cpf = normalizeCpf(cpfRaw)

    // Em dev, loga CPF completo; em prod, loga só final pra não expor dado sensível em logs
    if (!IS_PRODUCTION) {
      console.log("🔎 BUSCA MINHAS COMPRAS CPF:", cpf)
    } else {
      const masked =
        cpf && cpf.length >= 4 ? cpf.slice(-4) : "unknown"
      console.log("🔎 BUSCA MINHAS COMPRAS (prod) CPF final:", masked)
    }

    if (!cpf || cpf.length < 11) {
      return NextResponse.json(
        { ok: false, error: "CPF inválido" },
        { status: 400 },
      )
    }

    const user = await prisma.user.findUnique({
      where: { cpf },
    })

    if (!user) {
      return NextResponse.json({ ok: true, orders: [] })
    }

    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        transactions: true,
        tickets: true,
      },
    })

    const result = orders.map((o) => {
      const qFromOrder = o.quantity ?? 0
      const qFromTickets = o.tickets?.length ?? 0
      const quantity = qFromOrder || qFromTickets || 0

      const rawId = (o.id ?? "").replace(/-/g, "")
      const displayOrderCode = "#" + rawId.slice(-6).toUpperCase()

      return {
        id: o.id,
        displayOrderCode,
        amount: o.amount,
        status: o.status,
        createdAt: o.createdAt?.toISOString() ?? null,
        quantity,
        numbers: o.tickets?.map((t) => t.number) ?? [],
        transactions:
          o.transactions?.map((t) => ({
            id: t.id,
            status: t.status,
            value: t.value,
            gatewayId: t.gatewayId,
            pixCopiaCola: t.pixCopiaCola, // 👈 agora vindo pra frente
          })) ?? [],
      }
    })

    console.log("✅ Pedidos encontrados:", result.length)

    return NextResponse.json({ ok: true, orders: result })
  } catch (err: any) {
    console.error("ERRO /api/minhas-compras:", err)
    return NextResponse.json(
      { ok: false, error: "Erro ao buscar pedidos" },
      { status: 500 },
    )
  }
}
