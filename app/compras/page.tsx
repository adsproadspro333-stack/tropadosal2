"use client"

import { useState, useEffect, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { useCartStore } from "@/store/cartStore"

type TransactionDTO = {
  id: string
  status: string
  value: number
  gatewayId: string
  pixCopiaCola?: string
}

type OrderDTO = {
  id: string
  displayOrderCode: string
  amount: number
  status: string
  createdAt: string | null
  quantity: number
  numbers: number[]
  transactions: TransactionDTO[]
}

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
const ORDER_PENDING_LIMIT_SECONDS = 20 * 60 // 20 minutos pra bilhete pendente

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
    numbers: 100,
    price: 14.9,
    description: "Perfeito pra quem quer dar um salto real nas chances.",
  },
  {
    id: "reforco-3500",
    label: "Modo Blindagem",
    numbers: 200,
    price: 24.9,
    badge: "Mais escolhido",
    description:
      "Equilíbrio perfeito entre investimento e quantidade de números.",
  },
  {
    id: "reforco-10000",
    label: "Modo Insano",
    numbers: 500,
    price: 49.9,
    badge: "Chance máxima",
    description: "Pra quem quer vir muito forte pra cima nesse sorteio.",
  },
]

// gera números determinísticos
function generateDeterministicNumbers(orderId: string, count: number): number[] {
  let seed = 0

  for (let i = 0; i < orderId.length; i++) {
    seed = (seed * 31 + orderId.charCodeAt(i)) >>> 0
  }

  const result: number[] = []
  const used = new Set<number>()

  while (result.length < count) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const n = (seed % 9_000_000) + 1_000_000

    if (!used.has(n)) {
      used.add(n)
      result.push(n)
    }
  }

  return result
}

function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)

  if (digits.length <= 3) return digits
  if (digits.length <= 6) {
    return digits.replace(/(\d{3})(\d{0,3})/, "$1.$2")
  }
  if (digits.length <= 9) {
    return digits.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3")
  }

  return digits.replace(
    /(\d{3})(\d{3})(\d{3})(\d{0,2}).*/,
    "$1.$2.$3-$4",
  )
}

export default function MinhasComprasPage() {
  const router = useRouter()
  const { prepareUpsellOrder } = useCartStore()

  const [cpf, setCpf] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orders, setOrders] = useState<OrderDTO[]>([])
  const [searched, setSearched] = useState(false)

  const [remainingSeconds, setRemainingSeconds] = useState(
    INITIAL_TIMER_SECONDS,
  )
  const [currentWinnerIndex, setCurrentWinnerIndex] = useState(0)

  const [showUpsellSection, setShowUpsellSection] = useState(false)
  const [showUpsell, setShowUpsell] = useState(false)

  const [isMobile, setIsMobile] = useState(false)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null)

  // timer dos pedidos pendentes
  const [pendingTimers, setPendingTimers] = useState<Record<string, number>>({})

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

  // tick dos timers dos pedidos pendentes
  useEffect(() => {
    const interval = setInterval(() => {
      setPendingTimers((prev) => {
        const next: Record<string, number> = {}
        Object.entries(prev).forEach(([orderId, seconds]) => {
          if (seconds > 1) {
            next[orderId] = seconds - 1
          }
          // se chegou em 0, some do map => some da tela
        })
        return next
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
    setPendingTimers({})

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

      const rawOrders: OrderDTO[] = data.orders || []
      const now = Date.now()

      // filtra pendentes com mais de 20 minutos (somem da página)
      const filteredOrders = rawOrders.filter((o) => {
        if (o.status !== "pending") return true
        if (!o.createdAt) return false
        const createdMs = new Date(o.createdAt).getTime()
        const diffSec = Math.floor((now - createdMs) / 1000)
        return diffSec < ORDER_PENDING_LIMIT_SECONDS
      })

      // inicializa timers dos pendentes
      const timers: Record<string, number> = {}
      filteredOrders.forEach((o) => {
        if (o.status === "pending" && o.createdAt) {
          const createdMs = new Date(o.createdAt).getTime()
          const diffSec = Math.floor((now - createdMs) / 1000)
          const remaining =
            ORDER_PENDING_LIMIT_SECONDS - (diffSec > 0 ? diffSec : 0)
          timers[o.id] = remaining > 0 ? remaining : 0
        }
      })

      setOrders(filteredOrders)
      setPendingTimers(timers)
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

  const handleSelectUpsell = (offer: UpsellOffer) => {
    try {
      const priceCents = Math.round(offer.price * 100)
      prepareUpsellOrder(offer.numbers, priceCents)
      router.push(`/dados?from=compras&reforco=${offer.id}`)
    } catch (err) {
      console.error("Erro ao aplicar upsell de compras:", err)
    }
  }

  const toggleOrderDetails = (orderId: string) => {
    setExpandedOrderId((current) => (current === orderId ? null : orderId))
  }

  const handleCpfChange = (e: ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value
    const masked = maskCpf(inputValue)
    setCpf(masked)
  }

  const handleCopyPix = async (orderId: string, pixCode: string) => {
    if (!pixCode) return
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(pixCode)
        setCopiedOrderId(orderId)
        setTimeout(() => setCopiedOrderId(null), 2000)
      }
    } catch (err) {
      console.error("Erro ao copiar código PIX:", err)
    }
  }

  return (
    <>
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
          {/* Oportunidade extra (com pulse) */}
          <div style={{ marginBottom: isMobile ? 20 : 24 }}>
            {!showUpsellSection && (
              <button
                type="button"
                onClick={() => setShowUpsellSection(true)}
                className="oportunidade-extra-btn"
                style={{
                  width: "100%",
                  borderRadius: 16,
                  border: "1px solid #22C55E",
                  padding: isMobile ? "10px 12px" : "12px 16px",
                  background:
                    "linear-gradient(90deg, rgba(34,197,94,0.08), rgba(22,163,74,0.03))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#166534",
                      textTransform: "uppercase",
                      letterSpacing: 0.7,
                    }}
                  >
                    ⚡ Oportunidade extra
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: "#065F46",
                      fontWeight: 600,
                    }}
                  >
                    Quero aumentar minhas chances no sorteio
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 18,
                    color: "#166534",
                    transform: "translateY(1px)",
                  }}
                >
                  ▼
                </span>
              </button>
            )}

            {showUpsellSection && (
              <div
                style={{
                  marginTop: isMobile ? 0 : 4,
                  borderRadius: 18,
                  padding: isMobile ? "16px 14px 18px" : "18px 20px 20px",
                  background:
                    "linear-gradient(180deg, #FFFFFF 0%, #F9FAFB 55%, #FFF7ED 100%)",
                  color: "#111827",
                  position: "relative",
                  overflow: "hidden",
                  border: "1px solid #E5E7EB",
                  boxShadow: "0 12px 28px rgba(15,23,42,0.12)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    background:
                      "radial-gradient(circle at 20% -20%, rgba(250,250,250,0.4), transparent 60%)",
                    opacity: 0.8,
                  }}
                />

                <div style={{ position: "relative", zIndex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                      gap: 8,
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
                          backgroundColor: "#DCFCE7",
                          color: "#166534",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: 0.6,
                          border: "1px solid #4ADE80",
                        }}
                      >
                        Sorteio em andamento
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "3px 9px",
                          borderRadius: 999,
                          border: "1px solid #FACC15",
                          textTransform: "uppercase",
                          letterSpacing: 0.4,
                          backgroundColor: "#FEF3C7",
                          color: "#92400E",
                        }}
                      >
                        Exclusivo pra quem já está participando
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowUpsellSection(false)}
                      style={{
                        border: "none",
                        background: "transparent",
                        fontSize: 11,
                        color: "#6B7280",
                        cursor: "pointer",
                      }}
                    >
                      Fechar
                    </button>
                  </div>

                  {!isMobile && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "#6B7280",
                        opacity: 0.9,
                        display: "block",
                        marginBottom: 8,
                      }}
                    >
                      Essa área é só pra reforçar suas chances, sem refazer
                      cadastro.
                    </span>
                  )}

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
                          color: "#6B7280",
                        }}
                      >
                        Você já está participando do sorteio:
                      </p>
                      <h2
                        style={{
                          margin: "4px 0 0",
                          fontSize: isMobile ? 22 : 24,
                          fontWeight: 800,
                          color: "#16A34A",
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
                        justifyContent: isMobile
                          ? "flex-start"
                          : "space-between",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            padding: "6px 11px",
                            borderRadius: 999,
                            backgroundColor: "#111827",
                            border: "1px solid #0F172A",
                            fontSize: 12,
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            color: "#F9FAFB",
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

                      <div
                        style={{
                          textAlign: isMobile ? "left" : "right",
                          fontSize: 11,
                          color: "#4B5563",
                        }}
                      >
                        <div style={{ opacity: 0.9, marginBottom: 2 }}>
                          Último ganhador exibido:
                        </div>
                        <div style={{ fontWeight: 700, color: "#111827" }}>
                          {currentWinner.name} • {currentWinner.city}/
                          {currentWinner.state}
                        </div>
                        <div style={{ fontSize: 11, color: "#8B0000" }}>
                          {currentWinner.prize}
                        </div>
                      </div>
                    </div>
                  </div>

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
                        boxShadow: "0 14px 28px rgba(22,163,74,0.45)",
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                      }}
                    >
                      {showUpsell
                        ? "Esconder opções de reforço"
                        : "Aumentar minhas chances agora"}
                    </button>
                    <span
                      style={{
                        fontSize: 11,
                        color: "#6B7280",
                        opacity: 0.95,
                      }}
                    >
                      Sem novo cadastro, sem dor de cabeça. É só reforçar seus
                      números e entrar ainda mais forte nesse prêmio.
                    </span>
                  </div>

                  {showUpsell && (
                    <div
                      style={{
                        marginTop: 14,
                        paddingTop: 10,
                        borderTop: "1px dashed #E5E7EB",
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
                            backgroundColor: "#FFFFFF",
                            border: "1px solid #E5E7EB",
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
                                  color: "#111827",
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
                                    backgroundColor: "#FEF3C7",
                                    border: "1px solid #FACC15",
                                    color: "#92400E",
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
                                color: "#111827",
                                marginBottom: 3,
                              }}
                            >
                              +{" "}
                              <strong style={{ color: "#8B0000" }}>
                                {offer.numbers.toLocaleString("pt-BR")} números
                                extras
                              </strong>
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#6B7280",
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
                                color: "#6B7280",
                                marginBottom: 2,
                              }}
                            >
                              por apenas
                            </div>
                            <div
                              style={{
                                fontSize: 17,
                                fontWeight: 800,
                                color: "#111827",
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
                                backgroundColor: "rgba(22,163,74,0.06)",
                                color: "#166534",
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
            )}
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
              onChange={handleCpfChange}
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
              const totalNumbers =
                order.quantity && order.quantity > 0
                  ? order.quantity
                  : order.numbers?.length || 0

              const isPaid = order.status === "paid"
              const isPending = order.status === "pending"
              const isExpanded = expandedOrderId === order.id
              const canShowNumbers = isPaid && totalNumbers > 0

              const mainTransaction = order.transactions?.[0]
              const pixCode = mainTransaction?.pixCopiaCola || ""

              // se é pendente mas já expirou (sem timer), não renderiza
              if (isPending && pendingTimers[order.id] === undefined) {
                return null
              }

              const pendingSeconds = pendingTimers[order.id] ?? 0
              const pendingTimerLabel =
                pendingSeconds > 0 ? formatTimer(pendingSeconds) : "00:00"

              const MAX_VISIBLE = 120
              const visibleCount = Math.min(totalNumbers, MAX_VISIBLE)

              const visibleNumbers =
                isPaid && totalNumbers > 0
                  ? order.numbers && order.numbers.length > 0
                    ? order.numbers.slice(0, visibleCount)
                    : generateDeterministicNumbers(order.id, visibleCount)
                  : []

              const remainingCount =
                isPaid && totalNumbers > MAX_VISIBLE
                  ? totalNumbers - MAX_VISIBLE
                  : 0

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
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 16,
                    }}
                  >
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
                                : order.status === "pending"
                                ? "#FEF3C7"
                                : "#F3F4F6",
                              color: isPaid
                                ? "#166534"
                                : order.status === "pending"
                                ? "#92400E"
                                : "#111827",
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
                          {totalNumbers}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        textAlign: "right",
                        minWidth: 160,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 6,
                      }}
                    >
                      <div>
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

                      {canShowNumbers && (
                        <button
                          type="button"
                          onClick={() => toggleOrderDetails(order.id)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid #E5E7EB",
                            backgroundColor: "#F9FAFB",
                            color: "#111827",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {isExpanded ? "Esconder números" : "Ver números"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* PENDENTE – enxuto com timer e CTA */}
                  {isPending && pixCode && pendingSeconds > 0 && (
                    <div
                      style={{
                        marginTop: 4,
                        paddingTop: 8,
                        borderTop: "1px dashed #FCD34D",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: "#92400E",
                            fontWeight: 600,
                          }}
                        >
                          Pagamento ainda não identificado.
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 999,
                            backgroundColor: "#FEF3C7",
                            border: "1px solid #FACC15",
                            color: "#92400E",
                            fontWeight: 700,
                          }}
                        >
                          Expira em {pendingTimerLabel}
                        </span>
                      </div>

                      <span
                        style={{
                          fontSize: 11,
                          color: "#6B7280",
                        }}
                      >
                        Copie o código PIX abaixo e conclua o pagamento agora
                        pra liberar seus números nessa edição.
                      </span>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: isMobile ? "stretch" : "flex-start",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleCopyPix(order.id, pixCode)}
                          style={{
                            padding: "9px 14px",
                            borderRadius: 999,
                            border: "1px solid #FACC15",
                            backgroundColor: "#FEF3C7",
                            color: "#92400E",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            width: isMobile ? "100%" : "auto",
                          }}
                        >
                          Copiar código PIX
                        </button>
                      </div>

                      {copiedOrderId === order.id && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "#16A34A",
                          }}
                        >
                          Código PIX copiado. Assim que o pagamento for
                          confirmado, seus números pagos ficam salvos aqui.
                        </span>
                      )}
                    </div>
                  )}

                  {/* Números (somente PAGO) */}
                  {isExpanded && isPaid && totalNumbers > 0 && (
                    <div
                      style={{
                        marginTop: 6,
                        paddingTop: 10,
                        borderTop: "1px dashed #E5E7EB",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "#6B7280",
                          marginBottom: 6,
                        }}
                      >
                        Números dessa edição:
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          maxHeight: 160,
                          overflowY: "auto",
                        }}
                      >
                        {visibleNumbers.map((n, idx) => (
                          <span
                            key={`${order.id}-${idx}`}
                            style={{
                              fontSize: 11,
                              padding: "3px 8px",
                              borderRadius: 999,
                              backgroundColor: "#F3F4F6",
                              color: "#111827",
                              border: "1px solid #E5E7EB",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {String(n).padStart(7, "0")}
                          </span>
                        ))}

                        {remainingCount > 0 && (
                          <span
                            style={{
                              fontSize: 11,
                              color: "#6B7280",
                              padding: "3px 4px",
                            }}
                          >
                            + {remainingCount} números...
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </div>

      {/* CSS do efeito pulse no botão de oportunidade extra */}
      <style jsx>{`
        .oportunidade-extra-btn::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 16px;
          border: 1px solid rgba(34, 197, 94, 0.6);
          box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5);
          pointer-events: none;
          animation: pulse-ring 1.8s infinite;
        }

        @keyframes pulse-ring {
          0% {
            transform: scale(1);
            opacity: 0.7;
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5);
          }
          70% {
            transform: scale(1.02);
            opacity: 0;
            box-shadow: 0 0 0 12px rgba(34, 197, 94, 0);
          }
          100% {
            transform: scale(1);
            opacity: 0;
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
          }
        }
      `}</style>
    </>
  )
}
