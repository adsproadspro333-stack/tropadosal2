import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { cpf, amount, numbers } = await req.json();

    if (!cpf || !amount || !numbers?.length) {
      return NextResponse.json(
        { error: "cpf, amount e numbers são obrigatórios" },
        { status: 400 }
      );
    }

    // Buscar ou criar usuário
    const user = await prisma.user.upsert({
      where: { cpf },
      update: {},
      create: { cpf },
    });

    // Criar pedido
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        amount,
      },
    });

    // Criar tickets
    await prisma.ticket.createMany({
      data: numbers.map((num: number) => ({
        orderId: order.id,
        number: num,
      })),
    });

    return NextResponse.json(
      {
        ok: true,
        orderId: order.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("ERRO AO CRIAR PEDIDO:", error);
    return NextResponse.json(
      { error: "Erro interno ao criar pedido" },
      { status: 500 }
    );
  }
}
