import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Webhook AtivoPay
export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("[AtivoPay Webhook] body:", body);

    // Ajusta conforme o formato REAL da AtivoPay
    const gatewayId =
      body?.id || body?.transactionId || body?.payment_id || null;
    const rawStatus = String(
      body?.status || body?.current_status || ""
    ).toUpperCase();

    if (!gatewayId) {
      console.warn("[AtivoPay Webhook] Sem gatewayId no payload");
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Aqui você pode mapear status conforme a doc:
    const isPaid =
      rawStatus === "PAID" ||
      rawStatus === "APPROVED" ||
      rawStatus === "CONFIRMED";

    if (!isPaid) {
      // Se não estiver pago, só registra e segue
      console.log("[AtivoPay Webhook] Status não pago:", rawStatus);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // 1️⃣ Atualiza transação como paga
    const trx = await prisma.transaction.update({
      where: { gatewayId },
      data: { status: "paid" },
    });

    // 2️⃣ Atualiza pedido ligado à transação como pago
    await prisma.order.update({
      where: { id: trx.orderId },
      data: { status: "paid" },
    });

    console.log("[AtivoPay Webhook] Pedido marcado como pago:", trx.orderId);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[AtivoPay Webhook] Erro:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
