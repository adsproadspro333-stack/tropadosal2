"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useCartStore } from "@/store/cartStore"

type TransactionDTO = {
  id: string
  status: string
  value: number
  gatewayId: string
}

type OrderDTO = {
  id: string
  displayOrderCode: string // 👈 bate com o campo que vem da API
  amount: number
  status: string
  createdAt: string | null
  quantity: number
  numbers: number[]
  transactions: TransactionDTO[]
}

// 👇 Dados fake de ganhadores para o sorteio em tempo real (apenas front)
const LIVE_WINNERS = [
  {
    name: "Bruna S.",
    city: "Duque de Caxias",
    state: "RJ",
    prize: "R$ 50.000,00 no PIX",
  },
  {
    name: "Rafael M.",
    city: "Guarulhos",
    state: "SP",
    prize: "R$ 50.000,00 no PIX",
  },
  {
    name: "Thainá L.",
    city: "Recife",
    state: "PE",
    prize: "R$ 50.000,00 no PIX",
  },
  {
    name: "Carlos H.",
    city: "Contagem",
    state: "MG",
    prize: "R$ 50.000,00 no PIX",
  },
]

const INITIAL_TIMER_SECONDS = 30 * 60 // 30 minutos

type UpsellOffer = {
  id: string
  label: string
  numbers: number
  price: number
  badge?: string
  description: string
}

const UPSELL_OFFERS: UpsellOffer[] = [
  {
    id: "reforco-2000",
    label: "Reforço Intenso",
    numbers: 2000,
    price: 14.9,
    description: "Perfeito pra quem quer dar um salto real nas chances.",
  },
  {
    id: "reforco-3500",
    label: "Modo Blindagem",
    numbers: 3500,
    price: 24.9,
    badge: "Mais escolhido",
    description:
      "Equilíbrio perfeito entre investimento e quantidade de números.",
  },
  {
    id: "reforco-10000",
    label: "Modo Insano",
    numbers: 10000,
    price: 49.9,
    badge: "Chance máxima",
    description: "Pra quem quer vir muito forte pra cima nesse sorteio.",
  },
]

export default function MinhasComprasPage() {
  const router = useRouter()
  const { prepareUpsellOrder } = useCartStore()

  const [cpf, setCpf] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orders, setOrders] = useState<OrderDTO[]>([])
  const [searched, setSearched] = useState(false)

  // 🔥 Estados do sorteio em tempo real
  const [remainingSeconds, setRemainingSeconds] = useState(
    INITIAL_TIMER_SECONDS,
  )
  const [currentWinnerIndex, setCurrentWinnerIndex] = useState(0)
  const [showUpsell, setShowUpsell] = useState(false)

  // 📱 Responsividade simples via JS
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== "undefined") {
        setIsMobile(window.innerWidth <= 480)
      }
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          // reseta timer e troca o "ganhador"
          setCurrentWinnerIndex((oldIndex) => {
            const nextIndex = oldIndex + 1
            return nextIndex >= LIVE_WINNERS.length ? 0 : nextIndex
          })
          return INITIAL_TIMER_SECONDS
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const formatTimer = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    const mStr = String(minutes).padStart(2, "0")
    const sStr = String(seconds).padStart(2, "0")
    return `${mStr}:${sStr}`
  }

  const currentWinner = LIVE_WINNERS[currentWinnerIndex]

  const handleSearch = async () => {
    const cleanCpf = cpf.replace(/\D/g, "")
    if (!cleanCpf) {
      setError("Digite um CPF válido")
      return
    }

    setLoading(true)
    setError(null)
    setOrders([])
    setSearched(false)

    try {
      const res = await fetch("/api/minhas-compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: cleanCpf }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Falha ao buscar pedidos")
      }

      setOrders(data.orders || [])
      setSearched(true)
    } catch (err: any) {
      console.error("Erro ao buscar pedidos:", err)
      setError(err.message || "Erro inesperado ao buscar pedidos")
      setSearched(true)
    } finally {
      setLoading(false)
    }
  }

  const formatDateTime = (value: string | null) => {
    if (!value) return "-"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return "-"
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const formatBRL = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    })

  // 👇 Helper só pra traduzir o status visualmente
  const getStatusLabel = (status: string) => {
    switch (status) {
      case "paid":
        return "PAGO"
      case "pending":
        return "PENDENTE"
      case "canceled":
        return "CANCELADO"
      default:
        return status?.toUpperCase?.() || status
    }
  }

  // 🔗 Ação ao clicar em uma oferta de reforço
  // Agora montando o carrinho via cartStore e levando pra /dados
  const handleSelectUpsell = (offer: UpsellOffer) => {
    try {
      const priceCents = Math.round(offer.price * 100)

      // monta um NOVO pedido com esse reforço
      prepareUpsellOrder(offer.numbers, priceCents)

      // segue o fluxo normal do checkout a partir da /dados
      router.push(`/dados?from=compras&reforco=${offer.id}`)
    } catch (err) {
      console.error("Erro ao aplicar upsell de compras:", err)
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f5f5f5",
        padding: isMobile ? "16px 8px" : "32px 16px",
      }}
    >
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          backgroundColor: "#fff",
          borderRadius: 18,
          padding: isMobile ? "18px 14px 28px" : "24px 24px 40px",
          boxShadow: "0 18px 40px rgba(15,23,42,0.15)",
        }}
      >
        {/* 🔥 Bloco de sorteio em tempo real + reforço de chances */}
        <div
          style={{
            marginBottom: isMobile ? 24 : 28,
            borderRadius: 18,
            padding: isMobile ? "16px 14px 18px" : "18px 20px 20px",
            background:
              "radial-gradient(circle at 0% 0%, rgba(250,204,21,0.15), transparent 55%), radial-gradient(circle at 100% 0%, rgba(34,197,94,0.18), transparent 55%), linear-gradient(135deg, #111827, #450a0a)",
            color: "#F9FAFB",
            position: "relative",
            overflow: "hidden",
            border: "1px solid rgba(148,163,184,0.45)",
          }}
        >
          {/* brilho suave no canto */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "radial-gradient(circle at 20% -20%, rgba(250,250,250,0.18), transparent 55%)",
              opacity: 0.8,
            }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            {/* faixa superior */}
            <div
              style={{
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                alignItems: isMobile ? "flex-start" : "center",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background:
                      "linear-gradient(90deg, #16A34A, #22C55E, #16A34A)",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    boxShadow: "0 0 0 1px rgba(15,23,42,0.7)",
                    color: "#ECFDF3",
                  }}
                >
                  Sorteio em andamento
                </span>
                <span
                  style={{
                    fontSize: 11,
                    padding: "3px 9px",
                    borderRadius: 999,
                    border: "1px solid rgba(248,250,252,0.4)",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    backgroundColor: "rgba(15,23,42,0.65)",
                  }}
                >
                  Exclusivo pra quem já está participando
                </span>
              </div>

              {!isMobile && (
                <span
                  style={{
                    fontSize: 11,
                    color: "#D1D5DB",
                    opacity: 0.85,
                  }}
                >
                  Essa área é só pra reforçar suas chances, sem refazer
                  cadastro.
                </span>
              )}
            </div>

            {/* texto principal + timer */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: isMobile ? 10 : 12,
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: isMobile ? 13 : 14,
                    color: "#E5E7EB",
                  }}
                >
                  Você já está participando do sorteio:
                </p>
                <h2
                  style={{
                    margin: "4px 0 0",
                    fontSize: isMobile ? 22 : 24,
                    fontWeight: 800,
                    color: "#FACC15",
                    letterSpacing: 0.3,
                  }}
                >
                  R$ 50.000,00 no PIX
                </h2>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: isMobile ? "column" : "row",
                  alignItems: isMobile ? "flex-start" : "center",
                  justifyContent: isMobile ? "flex-start" : "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                {/* Timer */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      padding: "6px 11px",
                      borderRadius: 999,
                      backgroundColor: "rgba(15,23,42,0.7)",
                      border: "1px solid rgba(248,250,252,0.22)",
                      fontSize: 12,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        width: 9,
                        height: 9,
                        borderRadius: 999,
                        backgroundColor: "#22C55E",
                        boxShadow: "0 0 0 4px rgba(34,197,94,0.35)",
                      }}
                    />
                    Próximo sorteio em{" "}
                    <span
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 800,
                        color: "#F9FAFB",
                      }}
                    >
                      {formatTimer(remainingSeconds)}
                    </span>
                  </div>
                </div>

                {/* Último ganhador */}
                <div
                  style={{
                    textAlign: isMobile ? "left" : "right",
                    fontSize: 11,
                    color: "#E5E7EB",
                  }}
                >
                  <div style={{ opacity: 0.9, marginBottom: 2 }}>
                    Último ganhador exibido:
                  </div>
                  <div style={{ fontWeight: 700 }}>
                    {currentWinner.name} • {currentWinner.city}/
                    {currentWinner.state}
                  </div>
                  <div style={{ fontSize: 11, color: "#FACC15" }}>
                    {currentWinner.prize}
                  </div>
                </div>
              </div>
            </div>

            {/* CTA aumentar chances */}
            <div
              style={{
                marginTop: 14,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <button
                type="button"
                onClick={() => setShowUpsell((prev) => !prev)}
                style={{
                  width: "100%",
                  padding: isMobile ? "10px 13px" : "11px 16px",
                  borderRadius: 999,
                  border: "none",
                  background:
                    "linear-gradient(90deg, #16A34A, #22C55E, #16A34A)",
                  backgroundSize: "200% 100%",
                  color: "#F9FAFB",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                  boxShadow: "0 14px 28px rgba(22,163,74,0.65)",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                Aumentar minhas chances agora
              </button>
              <span
                style={{
                  fontSize: 11,
                  color: "#E5E7EB",
                  opacity: 0.95,
                }}
              >
                Sem novo cadastro, sem dor de cabeça. É só reforçar seus números
                e entrar ainda mais forte nesse prêmio.
              </span>
            </div>

            {/* Ofertas de upsell visíveis somente quando abrir */}
            {showUpsell && (
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 10,
                  borderTop: "1px dashed rgba(248,250,252,0.22)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {UPSELL_OFFERS.map((offer) => (
                  <div
                    key={offer.id}
                    style={{
                      borderRadius: 12,
                      padding: isMobile ? "9px 10px 10px" : "10px 14px",
                      background:
                        "linear-gradient(135deg, rgba(15,23,42,0.92), rgba(15,23,42,0.75))",
                      border: "1px solid rgba(148,163,184,0.55)",
                      display: "flex",
                      flexDirection: isMobile ? "column" : "row",
                      alignItems: isMobile ? "flex-start" : "center",
                      justifyContent: isMobile
                        ? "flex-start"
                        : "space-between",
                      gap: isMobile ? 6 : 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 3,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          {offer.label}
                        </span>
                        {offer.badge && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: "2px 6px",
                              borderRadius: 999,
                              backgroundColor: "rgba(250,204,21,0.12)",
                              border:
                                "1px solid rgba(250,204,21,0.7)",
                              color: "#FACC15",
                              textTransform: "uppercase",
                              letterSpacing: 0.4,
                              fontWeight: 700,
                            }}
                          >
                            {offer.badge}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#E5E7EB",
                          marginBottom: 3,
                        }}
                      >
                        +{" "}
                        <strong style={{ color: "#BBF7D0" }}>
                          {offer.numbers.toLocaleString("pt-BR")} números
                          extras
                        </strong>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#D1D5DB",
                        }}
                      >
                        {offer.description}
                      </div>
                    </div>

                    <div
                      style={{
                        minWidth: isMobile ? "100%" : 130,
                        textAlign: isMobile ? "left" : "right",
                        marginTop: isMobile ? 6 : 0,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: "#D1D5DB",
                          marginBottom: 2,
                        }}
                      >
                        por apenas
                      </div>
                      <div
                        style={{
                          fontSize: 17,
                          fontWeight: 800,
                          color: "#F9FAFB",
                          marginBottom: 6,
                        }}
                      >
                        R$ {offer.price.toFixed(2).replace(".", ",")}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectUpsell(offer)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 999,
                          border: "1px solid #16A34A",
                          backgroundColor: "rgba(22,163,74,0.09)",
                          color: "#BBF7D0",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          textTransform: "uppercase",
                          letterSpacing: 0.7,
                        }}
                      >
                        Aumentar minhas chances
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1
            style={{
              fontSize: 28,
              margin: 0,
              fontWeight: 700,
              color: "#111827",
            }}
          >
            Minhas Compras
          </h1>
          <p style={{ marginTop: 8, color: "#6B7280", fontSize: 14 }}>
            Consulte seus pedidos usando seu CPF.
          </p>
        </div>

        {/* Form CPF */}
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            gap: 8,
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <input
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            placeholder="Digite seu CPF"
            style={{
              flex: 1,
              maxWidth: 420,
              padding: "10px 12px",
              borderRadius: 999,
              border: "1px solid #D1D5DB",
              fontSize: 14,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            style={{
              padding: "10px 20px",
              borderRadius: 999,
              border: "none",
              backgroundColor: loading ? "#059669aa" : "#059669",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              whiteSpace: "nowrap",
              width: isMobile ? "100%" : "auto",
            }}
          >
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>

        {/* Mensagens de erro */}
        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: "10px 12px",
              borderRadius: 6,
              backgroundColor: "#FEE2E2",
              color: "#991B1B",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Lista de pedidos */}
        {!loading && searched && orders.length === 0 && !error && (
          <p
            style={{
              textAlign: "center",
              color: "#6B7280",
              fontSize: 14,
              marginTop: 12,
            }}
          >
            Nenhum pedido encontrado para esse CPF.
          </p>
        )}

        {!loading &&
          orders.map((order) => {
            const qtdNumeros =
              order.quantity && order.quantity > 0
                ? order.quantity
                : order.numbers?.length || 0

            const isPaid = order.status === "paid"

            return (
              <div
                key={order.id}
                style={{
                  marginTop: 12,
                  borderRadius: 10,
                  border: "1px solid #E5E7EB",
                  backgroundColor: "#FFFFFF",
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                {/* Esquerda */}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#6B7280",
                      marginBottom: 4,
                    }}
                  >
                    ID do pedido:{" "}
                    <span
                      style={{ fontWeight: 600, color: "#111827" }}
                    >
                      {order.displayOrderCode}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 12,
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600 }}>Status: </span>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: 0.3,
                          backgroundColor: isPaid
                            ? "#DCFCE7"
                            : "#FEF3C7",
                          color: isPaid ? "#166534" : "#92400E",
                        }}
                      >
                        {getStatusLabel(order.status)}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontWeight: 600 }}>Data: </span>
                      {formatDateTime(order.createdAt)}
                    </div>
                    <div>
                      <span style={{ fontWeight: 600 }}>
                        Qtde de números:{" "}
                      </span>
                      {qtdNumeros}
                    </div>
                  </div>
                </div>

                {/* Direita - valor */}
                <div style={{ textAlign: "right", minWidth: 120 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#6B7280",
                      marginBottom: 4,
                    }}
                  >
                    Valor pago
                  </div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 16,
                      color: "#111827",
                    }}
                  >
                    {formatBRL(order.amount)}
                  </div>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
