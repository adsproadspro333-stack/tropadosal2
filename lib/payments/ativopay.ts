// lib/payments/ativopay.ts

// Garante que a BASE_URL sempre aponte para .../api
const RAW_BASE_URL =
  process.env.ATIVO_PAY_BASE_URL ?? "https://api-gateway.umbrellapag.com"

const BASE_URL = (() => {
  let url = RAW_BASE_URL.trim().replace(/\/+$/, "")
  // se não terminar com /api, força
  if (!url.endsWith("/api")) {
    url = `${url}/api`
  }
  return url
})()

const API_KEY =
  process.env.ATIVO_PAY_API_KEY ||
  process.env.ATIVOPAY_API_KEY ||
  process.env.UMBRELLA_API_KEY

// Flag simples pra reduzir logs sensíveis em produção
const IS_PRODUCTION = process.env.NODE_ENV === "production"

if (!IS_PRODUCTION) {
  console.log("ATIVOPAY API KEY FINAL (exists?):", !!API_KEY)
}

// Padrão oficial da Umbrella (e pode ser sobrescrito pelo .env)
const USER_AGENT = process.env.ATIVO_PAY_USER_AGENT ?? "UMBRELLAB2B/1.0"

// Webhook configurado no .env / Railway
const WEBHOOK_URL = process.env.ATIVO_PAY_WEBHOOK_URL

type CreatePixParams = {
  amount: number // em centavos
  customer: {
    name: string
    email: string
    phone: string
    document: {
      type: "CPF" | "CNPJ"
      number: string
    }
  }
  items: {
    title: string
    quantity: number
    unitPrice: number // em centavos
    tangible: boolean
    externalRef?: string
  }[]
  expiresInDays: number
  metadata?: string
  traceable?: boolean
  postbackUrl?: string
}

export async function createPixTransaction(params: CreatePixParams) {
  if (!IS_PRODUCTION) {
    console.log("ATIVOPAY RAW_BASE_URL:", RAW_BASE_URL)
    console.log("ATIVOPAY BASE_URL NORMALIZADA:", BASE_URL)
    console.log("ATIVOPAY API_KEY setada?:", !!API_KEY)
    console.log("ATIVOPAY USER_AGENT:", USER_AGENT)
    console.log("ATIVOPAY WEBHOOK_URL (.env):", WEBHOOK_URL)
  } else {
    console.log("ATIVOPAY CALL (prod):", {
      hasApiKey: !!API_KEY,
      baseUrl: BASE_URL,
      hasWebhookUrl: !!WEBHOOK_URL,
    })
  }

  if (!BASE_URL || !API_KEY) {
    throw new Error("ATIVO_PAY_BASE_URL ou ATIVO_PAY_API_KEY não configurados")
  }

  // endpoint padrão da Umbrella / AtivoPay
  const url = `${BASE_URL}/user/transactions`

  // prioriza URL passada na chamada, depois .env, sempre exigindo https
  const candidatePostback = params.postbackUrl || WEBHOOK_URL || undefined

  const safePostbackUrl =
    candidatePostback && candidatePostback.startsWith("https://")
      ? candidatePostback
      : undefined

  const body: any = {
    pix: {
      expiresInDays: params.expiresInDays,
    },
    items: params.items,
    amount: params.amount,
    currency: "BRL",
    customer: {
      name: params.customer.name,
      email: params.customer.email,
      phone: params.customer.phone,
      document: {
        type: params.customer.document.type,
        number: params.customer.document.number,
      },
    },
    metadata: params.metadata ?? "",
    traceable: params.traceable ?? true,
    paymentMethod: "PIX",
  }

  if (safePostbackUrl) {
    body.postbackUrl = safePostbackUrl
  }

  if (!IS_PRODUCTION) {
    console.log("PAYLOAD PARA ATIVOPAY:", JSON.stringify(body, null, 2))
  } else {
    console.log("PAYLOAD PARA ATIVOPAY (prod, resumido):", {
      amount: body.amount,
      expiresInDays: body.pix?.expiresInDays,
      itemsCount: Array.isArray(body.items) ? body.items.length : 0,
      hasPostbackUrl: !!body.postbackUrl,
    })
  }

  const headers = {
    "x-api-key": API_KEY,
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
    Accept: "application/json",
  }

  if (!IS_PRODUCTION) {
    console.log("HEADERS PARA ATIVOPAY (sem API key):", {
      ...headers,
      "x-api-key": "*****",
    })
  } else {
    console.log("HEADERS PARA ATIVOPAY (prod, resumido):", {
      hasApiKey: !!headers["x-api-key"],
      userAgent: headers["User-Agent"],
      contentType: headers["Content-Type"],
    })
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })

  const text = await res.text()

  if (!IS_PRODUCTION) {
    console.log("ATIVOPAY RAW TEXT:", text)
  } else {
    console.log("ATIVOPAY RESPONSE (prod):", {
      status: res.status,
      bodyLength: text?.length ?? 0,
    })
  }

  if (!res.ok) {
    console.error("ERRO ATIVOPAY STATUS:", res.status)

    if (!IS_PRODUCTION) {
      console.error("ERRO ATIVOPAY BODY:", text)
    } else {
      console.error("ERRO ATIVOPAY BODY (prod, truncado):", text.slice(0, 500))
    }

    // Mantém a mesma mensagem de erro para quem chamou (rota /api/pagamento)
    throw new Error(`Erro AtivoPay: ${text}`)
  }

  let data: any = {}
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("Resposta da AtivoPay não é um JSON válido")
  }

  if (!IS_PRODUCTION) {
    console.log("ATIVOPAY JSON PARSED:", JSON.stringify(data, null, 2))
  } else {
    console.log("ATIVOPAY JSON PARSED (prod, resumo):", {
      hasDataField: !!data?.data,
      keys: Object.keys(data || {}),
    })
  }

  // algumas APIs retornam em data.data, outras direto em data
  const tx = data.data ?? data ?? {}

  const pixObj: any = tx.pix || {}

  // Tentativas de localizar o código copia-e-cola em diferentes formatos
  const pixCopiaECola =
    tx.qrCode || // raiz CamelCase
    tx.qrcode || // raiz minúscula
    tx.pixCode || // outro nome comum
    pixObj.qrCode || // dentro de pix CamelCase
    pixObj.qrcode || // dentro de pix minúsculo
    pixObj.emv || // código EMV
    pixObj.brCode || // BR Code
    pixObj.pixCopy || // nome alternativo
    null

  const qrCodeBase64 =
    pixObj.qrCodeBase64 || tx.qrCodeBase64 || null

  const expiresAt =
    pixObj.expirationDate ||
    tx.expiresAt ||
    tx.expirationDate ||
    null

  return {
    raw: data,
    transactionId: tx.id ?? null,
    amount: tx.amount ?? null,
    status: tx.status ?? null,
    pixCopiaECola,
    qrCodeBase64,
    expiresAt,
  }
}
