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
  { name: "Bruna S.", city: "Duque de Caxias", state: "RJ", prize: "R$ 50.000,00 no PIX" },
  { name: "Rafael M.", city: "Guarulhos", state: "SP", prize: "R$ 50.000,00 no PIX" },
  { name: "Thainá L.", city: "Recife", state: "PE", prize: "R$ 50.000,00 no PIX" },
  { name: "Carlos H.", city: "Contagem", state: "MG", prize: "R$ 50.000,00 no PIX" },
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
    description: "Equilíbrio perfeito entre investimento e quantidade de números.",
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
  if (digits.length <= 6) return digits.replace(/(\d{3})(\d{0,3})/, "$1.$2")
  if (digits.length <= 9) return digits.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3")

  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2}).*/, "$1.$2.$3-$4")
}

export default function MinhasComprasPage() {
  const router = useRouter()
  const { prepareUpsellOrder } = useCartStore()

  const [cpf, setCpf] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orders, setOrders] = useState<OrderDTO[]>([])
  const [searched, setSearched] = useState(false)

  const [remainingSeconds, setRemainingSeconds] = useState(INITIAL_TIMER_SECONDS)
  const [currentWinnerIndex, setCurrentWinnerIndex] = useState(0)

  const [showUpsellSection, setShowUpsellSection] = useState(false)
  const [showUpsell, setShowUpsell] = useState(true) // ✅ já abre as oportunidades quando a seção abrir

  const [isMobile, setIsMobile] = useState(false)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null)

  // timer dos pedidos pendentes
  const [pendingTimers, setPendingTimers] = useState<Record<string, number>>({})

  // ---------- TOKENS VISUAIS (mesmo DNA do resto) ----------
  const BG = "#0B0F19"
  const GLASS = "rgba(255,255,255,0.06)"
  const GLASS_SOFT = "rgba(255,255,255,0.04)"
  const BORDER = "rgba(255,255,255,0.10)"
  const TXT = "rgba(255,255,255,0.92)"
  const MUTED = "rgba(255,255,255,0.68)"
  const GREEN = "#22C55E"
  const GREEN_DARK = "#16A34A"
  const RED = "#DC2626"
  const RED_DARK = "#B91C1C"
  const AMBER = "#F59E0B"

  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== "undefined") setIsMobile(window.innerWidth <= 480)
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
          if (seconds > 1) next[orderId] = seconds - 1
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

      const filteredOrders = rawOrders.filter((o) => {
        if (o.status !== "pending") return true
        if (!o.createdAt) return false
        const createdMs = new Date(o.createdAt).getTime()
        const diffSec = Math.floor((now - createdMs) / 1000)
        return diffSec < ORDER_PENDING_LIMIT_SECONDS
      })

      const timers: Record<string, number> = {}
      filteredOrders.forEach((o) => {
        if (o.status === "pending" && o.createdAt) {
          const createdMs = new Date(o.createdAt).getTime()
          const diffSec = Math.floor((now - createdMs) / 1000)
          const remaining = ORDER_PENDING_LIMIT_SECONDS - (diffSec > 0 ? diffSec : 0)
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
          backgroundColor: BG,
          padding: isMobile ? "16px 10px" : "28px 16px",
          backgroundImage:
            "radial-gradient(1200px 600px at 20% 10%, rgba(34,197,94,0.14), transparent 60%), radial-gradient(900px 500px at 90% 0%, rgba(220,38,38,0.10), transparent 55%)",
        }}
      >
        <div
          style={{
            maxWidth: 920,
            margin: "0 auto",
            borderRadius: 18,
            padding: isMobile ? "18px 14px 22px" : "24px 24px 28px",
            backgroundColor: GLASS,
            border: `1px solid ${BORDER}`,
            boxShadow: "0 18px 40px rgba(0,0,0,0.42)",
            backdropFilter: "blur(10px)",
          }}
        >
          {/* ✅ ORDERBUMP NOVO (copy direta) */}
          <div style={{ marginBottom: isMobile ? 18 : 22 }}>
            {!showUpsellSection ? (
              <button
                type="button"
                onClick={() => {
                  setShowUpsellSection(true)
                  setShowUpsell(true)
                }}
                className="oportunidade-extra-btn"
                style={{
                  width: "100%",
                  borderRadius: 16,
                  border: `1px solid rgba(220,38,38,0.70)`,
                  padding: isMobile ? "12px 12px" : "14px 16px",
                  background:
                    "linear-gradient(90deg, rgba(220,38,38,0.16), rgba(220,38,38,0.06))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden",
                  boxShadow: "0 14px 32px rgba(220,38,38,0.16)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      color: "rgba(255,255,255,0.86)",
                      textTransform: "uppercase",
                      letterSpacing: 0.8,
                    }}
                  >
                    🔥 Você pode ganhar R$ 50.000 no PIX
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.92)",
                      fontWeight: 700,
                      marginTop: 2,
                    }}
                  >
                    Clique aqui para resgatar
                  </span>
                </div>

                <span style={{ fontSize: 16, color: "rgba(255,255,255,0.85)" }}>▼</span>
              </button>
            ) : (
              <div
                style={{
                  borderRadius: 18,
                  padding: isMobile ? "16px 14px 18px" : "18px 20px 20px",
                  background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
                  color: "#fff",
                  position: "relative",
                  overflow: "hidden",
                  border: `1px solid ${BORDER}`,
                  boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "4px 10px",
                        borderRadius: 999,
                        backgroundColor: "rgba(34,197,94,0.14)",
                        border: "1px solid rgba(34,197,94,0.26)",
                        color: "rgba(34,197,94,0.95)",
                        fontWeight: 900,
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                      }}
                    >
                      Sorteio em andamento
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "3px 9px",
                        borderRadius: 999,
                        border: "1px solid rgba(245,158,11,0.45)",
                        backgroundColor: "rgba(245,158,11,0.16)",
                        color: "rgba(255,255,255,0.84)",
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                        fontWeight: 800,
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
                      color: MUTED,
                      cursor: "pointer",
                    }}
                  >
                    Fechar
                  </button>
                </div>

                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: isMobile ? 13 : 14, color: MUTED }}>
                      Você já está concorrendo ao prêmio:
                    </p>
                    <h2
                      style={{
                        margin: "4px 0 0",
                        fontSize: isMobile ? 22 : 26,
                        fontWeight: 1000,
                        color: "#fff",
                        letterSpacing: 0.3,
                      }}
                    >
                      <span style={{ color: RED }}>R$ 50.000,00</span> no PIX
                    </h2>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: isMobile ? "column" : "row",
                      alignItems: isMobile ? "flex-start" : "center",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        padding: "7px 12px",
                        borderRadius: 999,
                        backgroundColor: "rgba(17,24,39,0.65)",
                        border: `1px solid ${BORDER}`,
                        fontSize: 12,
                        fontWeight: 800,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        color: "#F9FAFB",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          width: 9,
                          height: 9,
                          borderRadius: 999,
                          backgroundColor: GREEN,
                          boxShadow: "0 0 0 4px rgba(34,197,94,0.25)",
                        }}
                      />
                      Próximo sorteio em{" "}
                      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 1000 }}>
                        {formatTimer(remainingSeconds)}
                      </span>
                    </div>

                    <div style={{ textAlign: isMobile ? "left" : "right", fontSize: 11, color: MUTED }}>
                      <div style={{ opacity: 0.9, marginBottom: 2 }}>Último ganhador exibido:</div>
                      <div style={{ fontWeight: 900, color: TXT }}>
                        {currentWinner.name} • {currentWinner.city}/{currentWinner.state}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(220,38,38,0.95)" }}>{currentWinner.prize}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setShowUpsell((prev) => !prev)}
                      style={{
                        width: "100%",
                        padding: isMobile ? "11px 13px" : "12px 16px",
                        borderRadius: 999,
                        border: "none",
                        background: `linear-gradient(90deg, ${RED}, ${RED_DARK}, ${RED})`,
                        backgroundSize: "200% 100%",
                        color: "#FFF",
                        fontWeight: 1000,
                        fontSize: 14,
                        cursor: "pointer",
                        boxShadow: "0 14px 28px rgba(220,38,38,0.30)",
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                      }}
                    >
                      {showUpsell ? "Esconder oportunidades" : "Ver oportunidades agora"}
                    </button>

                    <span style={{ fontSize: 11, color: MUTED }}>
                      Escolha um pacote e você entra com{" "}
                      <strong style={{ color: "#fff" }}>mais números</strong> nessa edição.
                    </span>
                  </div>

                  {showUpsell && (
                    <div
                      style={{
                        marginTop: 12,
                        paddingTop: 10,
                        borderTop: `1px dashed ${BORDER}`,
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      {UPSELL_OFFERS.map((offer) => (
                        <div
                          key={offer.id}
                          style={{
                            borderRadius: 14,
                            padding: isMobile ? "10px 12px" : "12px 14px",
                            backgroundColor: "rgba(255,255,255,0.04)",
                            border: `1px solid ${BORDER}`,
                            display: "flex",
                            flexDirection: isMobile ? "column" : "row",
                            alignItems: isMobile ? "flex-start" : "center",
                            justifyContent: "space-between",
                            gap: isMobile ? 8 : 12,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 14, fontWeight: 1000, color: "#fff" }}>
                                {offer.label}
                              </span>

                              {offer.badge && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    backgroundColor: "rgba(245,158,11,0.16)",
                                    border: "1px solid rgba(245,158,11,0.40)",
                                    color: "rgba(255,255,255,0.86)",
                                    textTransform: "uppercase",
                                    letterSpacing: 0.4,
                                    fontWeight: 900,
                                  }}
                                >
                                  {offer.badge}
                                </span>
                              )}
                            </div>

                            <div style={{ fontSize: 12, color: TXT, marginBottom: 4 }}>
                              + <strong style={{ color: RED }}>{offer.numbers.toLocaleString("pt-BR")} números extras</strong>
                            </div>

                            <div style={{ fontSize: 11, color: MUTED }}>{offer.description}</div>
                          </div>

                          <div style={{ minWidth: isMobile ? "100%" : 160, textAlign: isMobile ? "left" : "right" }}>
                            <div style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>por apenas</div>
                            <div style={{ fontSize: 18, fontWeight: 1000, color: "#fff", marginBottom: 8 }}>
                              R$ {offer.price.toFixed(2).replace(".", ",")}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSelectUpsell(offer)}
                              style={{
                                width: "100%",
                                padding: "9px 12px",
                                borderRadius: 999,
                                border: `1px solid rgba(220,38,38,0.70)`,
                                backgroundColor: "rgba(220,38,38,0.10)",
                                color: "#fff",
                                fontSize: 11,
                                fontWeight: 900,
                                cursor: "pointer",
                                textTransform: "uppercase",
                                letterSpacing: 0.7,
                                boxShadow: "0 12px 24px rgba(220,38,38,0.18)",
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

          {/* ✅ TÍTULO + BUSCA (agora acompanha o resto) */}
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <h1 style={{ fontSize: 28, margin: 0, fontWeight: 1000, color: "#fff" }}>
              Minhas Compras
            </h1>
            <p style={{ marginTop: 8, color: MUTED, fontSize: 14 }}>
              Consulte seus pedidos usando seu CPF.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              gap: 10,
              justifyContent: "center",
              marginBottom: 18,
            }}
          >
            <input
              value={cpf}
              onChange={handleCpfChange}
              placeholder="Digite seu CPF"
              style={{
                flex: 1,
                maxWidth: 420,
                padding: "11px 14px",
                borderRadius: 999,
                border: `1px solid ${BORDER}`,
                fontSize: 14,
                outline: "none",
                backgroundColor: "rgba(255,255,255,0.04)",
                color: "#fff",
              }}
            />

            <button
              type="button"
              onClick={handleSearch}
              disabled={loading}
              style={{
                padding: "11px 22px",
                borderRadius: 999,
                border: "none",
                backgroundColor: loading ? "rgba(34,197,94,0.55)" : GREEN_DARK,
                color: "#0B0F19",
                fontWeight: 1000,
                fontSize: 14,
                cursor: "pointer",
                whiteSpace: "nowrap",
                width: isMobile ? "100%" : "auto",
                boxShadow: "0 14px 28px rgba(34,197,94,0.18)",
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
                borderRadius: 12,
                backgroundColor: "rgba(220,38,38,0.10)",
                border: "1px solid rgba(220,38,38,0.35)",
                color: "rgba(255,255,255,0.88)",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {!loading && searched && orders.length === 0 && !error && (
            <p style={{ textAlign: "center", color: MUTED, fontSize: 14, marginTop: 10 }}>
              Nenhum pedido encontrado para esse CPF.
            </p>
          )}

          {!loading &&
            orders.map((order) => {
              const totalNumbers =
                order.quantity && order.quantity > 0 ? order.quantity : order.numbers?.length || 0

              const isPaid = order.status === "paid"
              const isPending = order.status === "pending"
              const isExpanded = expandedOrderId === order.id
              const canShowNumbers = isPaid && totalNumbers > 0

              const mainTransaction = order.transactions?.[0]
              const pixCode = mainTransaction?.pixCopiaCola || ""

              if (isPending && pendingTimers[order.id] === undefined) return null

              const pendingSeconds = pendingTimers[order.id] ?? 0
              const pendingTimerLabel = pendingSeconds > 0 ? formatTimer(pendingSeconds) : "00:00"

              const MAX_VISIBLE = 120
              const visibleCount = Math.min(totalNumbers, MAX_VISIBLE)

              const visibleNumbers =
                isPaid && totalNumbers > 0
                  ? order.numbers && order.numbers.length > 0
                    ? order.numbers.slice(0, visibleCount)
                    : generateDeterministicNumbers(order.id, visibleCount)
                  : []

              const remainingCount = isPaid && totalNumbers > MAX_VISIBLE ? totalNumbers - MAX_VISIBLE : 0

              return (
                <div
                  key={order.id}
                  style={{
                    marginTop: 12,
                    borderRadius: 16,
                    border: `1px solid ${BORDER}`,
                    backgroundColor: GLASS_SOFT,
                    padding: "14px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    boxShadow: "0 14px 28px rgba(0,0,0,0.26)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>
                        Pedido: <span style={{ fontWeight: 900, color: TXT }}>{order.displayOrderCode}</span>
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12, color: TXT }}>
                        <div>
                          <span style={{ fontWeight: 900 }}>Status: </span>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 999,
                              fontSize: 11,
                              textTransform: "uppercase",
                              letterSpacing: 0.3,
                              backgroundColor: isPaid
                                ? "rgba(34,197,94,0.14)"
                                : order.status === "pending"
                                ? "rgba(245,158,11,0.16)"
                                : "rgba(255,255,255,0.08)",
                              border: `1px solid ${
                                isPaid
                                  ? "rgba(34,197,94,0.26)"
                                  : order.status === "pending"
                                  ? "rgba(245,158,11,0.38)"
                                  : "rgba(255,255,255,0.10)"
                              }`,
                              color: isPaid ? "rgba(34,197,94,0.95)" : order.status === "pending" ? "#FBBF24" : TXT,
                              fontWeight: 900,
                            }}
                          >
                            {getStatusLabel(order.status)}
                          </span>
                        </div>

                        <div>
                          <span style={{ fontWeight: 900 }}>Data: </span>
                          <span style={{ color: MUTED }}>{formatDateTime(order.createdAt)}</span>
                        </div>

                        <div>
                          <span style={{ fontWeight: 900 }}>Qtde: </span>
                          <span style={{ color: TXT }}>{totalNumbers}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: "right", minWidth: 150, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>Valor</div>
                        <div style={{ fontWeight: 1000, fontSize: 16, color: "#fff" }}>{formatBRL(order.amount)}</div>
                      </div>

                      {canShowNumbers && (
                        <button
                          type="button"
                          onClick={() => toggleOrderDetails(order.id)}
                          style={{
                            padding: "7px 12px",
                            borderRadius: 999,
                            border: `1px solid ${BORDER}`,
                            backgroundColor: "rgba(255,255,255,0.04)",
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                        >
                          {isExpanded ? "Esconder números" : "Ver números"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* PENDENTE */}
                  {isPending && pixCode && pendingSeconds > 0 && (
                    <div
                      style={{
                        marginTop: 2,
                        paddingTop: 10,
                        borderTop: `1px dashed rgba(245,158,11,0.45)`,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.86)", fontWeight: 900 }}>
                          Pagamento ainda não identificado.
                        </span>

                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 999,
                            backgroundColor: "rgba(245,158,11,0.16)",
                            border: "1px solid rgba(245,158,11,0.38)",
                            color: "#FBBF24",
                            fontWeight: 1000,
                          }}
                        >
                          Expira em {pendingTimerLabel}
                        </span>
                      </div>

                      <span style={{ fontSize: 11, color: MUTED }}>
                        Copie o código PIX abaixo e conclua o pagamento para liberar seus números nessa edição.
                      </span>

                      <button
                        type="button"
                        onClick={() => handleCopyPix(order.id, pixCode)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 999,
                          border: "1px solid rgba(245,158,11,0.45)",
                          backgroundColor: "rgba(245,158,11,0.16)",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 1000,
                          cursor: "pointer",
                          width: isMobile ? "100%" : "fit-content",
                        }}
                      >
                        Copiar código PIX
                      </button>

                      {copiedOrderId === order.id && (
                        <span style={{ fontSize: 11, color: "rgba(34,197,94,0.95)" }}>
                          Código PIX copiado. Assim que o pagamento confirmar, seus números ficam salvos aqui.
                        </span>
                      )}
                    </div>
                  )}

                  {/* Números (PAGO) */}
                  {isExpanded && isPaid && totalNumbers > 0 && (
                    <div style={{ marginTop: 6, paddingTop: 10, borderTop: `1px dashed ${BORDER}` }}>
                      <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>Números dessa edição:</div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 160, overflowY: "auto" }}>
                        {visibleNumbers.map((n, idx) => (
                          <span
                            key={`${order.id}-${idx}`}
                            style={{
                              fontSize: 11,
                              padding: "4px 9px",
                              borderRadius: 999,
                              backgroundColor: "rgba(255,255,255,0.06)",
                              color: "#fff",
                              border: `1px solid ${BORDER}`,
                              fontVariantNumeric: "tabular-nums",
                              fontWeight: 900,
                            }}
                          >
                            {String(n).padStart(7, "0")}
                          </span>
                        ))}

                        {remainingCount > 0 && (
                          <span style={{ fontSize: 11, color: MUTED, padding: "4px 6px" }}>
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

      <style jsx>{`
        .oportunidade-extra-btn::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 16px;
          border: 1px solid rgba(220, 38, 38, 0.65);
          box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.45);
          pointer-events: none;
          animation: pulse-ring 1.7s infinite;
        }

        @keyframes pulse-ring {
          0% {
            transform: scale(1);
            opacity: 0.65;
            box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.45);
          }
          70% {
            transform: scale(1.02);
            opacity: 0;
            box-shadow: 0 0 0 12px rgba(220, 38, 38, 0);
          }
          100% {
            transform: scale(1);
            opacity: 0;
            box-shadow: 0 0 0 0 rgba(220, 38, 38, 0);
          }
        }
      `}</style>
    </>
  )
}
