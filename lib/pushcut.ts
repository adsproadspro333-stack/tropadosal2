// lib/pushcut.ts

type PushcutPayload = {
  title?: string
  text?: string
  orderId?: string
  amount?: number
  qty?: number
}

export async function sendPushcutNotification(
  url: string | undefined,
  payload: PushcutPayload,
) {
  if (!url) {
    console.warn("⚠️ PUSHCUT url não configurada, notificações desativadas.")
    return
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },

      // Pushcut prioriza title + text
      body: JSON.stringify({
        title: payload.title,
        text: payload.text,
        orderId: payload.orderId,
        amount: payload.amount,
        qty: payload.qty,
      }),
    })

    const responseText = await res.text()
    console.log("✅ PUSHCUT resposta:", res.status, responseText)
  } catch (err) {
    console.error("❌ Erro ao enviar notificação Pushcut:", err)
  }
}

/* =========================================================
   NOTIFICAÇÕES PADRÃO DA SUA RIFA (FORMATO PREMIUM)
   ========================================================= */

// Quando gera o pedido (aguardando pagamento)
export async function pushNovoPedido(data: {
  orderId: string
  amount: number
  qty: number
}) {
  const ticket = data.orderId.slice(0, 6).toUpperCase()

  return sendPushcutNotification(
    process.env.PUSHCUT_NOVO_PEDIDO_URL,
    {
      title: `+1 ( ${ticket} ) RF  [ ${data.qty} ]`,
      text: `Aguardando Pagamento⚠️`,
      orderId: data.orderId,
      amount: data.amount,
      qty: data.qty,
    }
  )
}

// Quando o pagamento é confirmado
export async function pushPagamentoAprovado(data: {
  orderId: string
  amount: number
  qty: number
}) {
  const ticket = data.orderId.slice(0, 6).toUpperCase()

  return sendPushcutNotification(
    process.env.PUSHCUT_PAGAMENTO_PAGO_URL,
    {
      title: `+1 ( ${ticket} ) RF  [ ${data.qty} ]`,
      text: `Pagamento Finalizado ✅`,
      orderId: data.orderId,
      amount: data.amount,
      qty: data.qty,
    }
  )
}
