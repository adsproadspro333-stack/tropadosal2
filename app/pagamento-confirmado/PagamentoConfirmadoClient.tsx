// app/pagamento-confirmado/PagamentoConfirmadoClient.tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Box,
  Button,
  Container,
  Paper,
  Typography,
  CircularProgress,
} from "@mui/material"
import { Icon } from "@iconify/react"
import { formatBRL } from "@/lib/formatCurrency"
import { useCartStore } from "@/store/cartStore" // ⭐ upsell vai usar o carrinho

type Props = {
  orderIdFromSearch?: string
}

type OrderDTO = {
  id: string
  amount: number
  quantity?: number
  createdAt?: string
  // 🔹 passa a aceitar o metaEventId vindo do backend (Prisma -> API)
  metaEventId?: string | null
}

function formatOrderId(id?: string) {
  if (!id) return ""
  if (id.length <= 12) return id
  return `${id.slice(0, 6)}...${id.slice(-4)}`
}

// 🔥 Config dos UPSELLS desta tela
const UPSELL_OPTIONS = [
  {
    id: "turbo",
    label: "Pacote 10x Mais Sorte",
    ribbon: "ENTRADA PERFEITA",
    qty: 100,
    priceCents: 990, // R$ 9,90
    benefitLine: "10x mais sorte gastando muito pouco.",
    highlight:
      "Pacote ideal para quem quer dar o primeiro salto nas chances assim que o pagamento é aprovado.",
  },
  {
    id: "elite",
    label: "Pacote 20x Mais Sorte",
    ribbon: "MAIS ESCOLHIDO",
    qty: 200,
    priceCents: 1990, // R$ 19,90
    benefitLine: "20x mais sorte com o melhor custo–benefício.",
    highlight:
      "Pacote ideal para quem quer realmente aumentar as chances de mudar de vida sem pesar no bolso.",
  },
  {
    id: "dominator",
    label: "Pacote 50x Mais Sorte",
    ribbon: "CHANCE MÁXIMA",
    qty: 300,
    priceCents: 3990, // R$ 39,90
    benefitLine: "50x mais sorte em um único pedido relâmpago.",
    highlight:
      "Pacote ideal para quem está decidido a jogar pra ganhar e quer chegar muito forte no próximo sorteio.",
  },
]

export default function PagamentoConfirmadoClient({ orderIdFromSearch }: Props) {
  const router = useRouter()
  const [order, setOrder] = useState<OrderDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 🔒 controle pra não disparar Purchase mais de 1x
  const [purchaseSent, setPurchaseSent] = useState(false)

  // 🧠 acesso ao carrinho pra montar o NOVO pedido do upsell
  const { prepareUpsellOrder } = useCartStore()

  // ✅ novo: qual pacote está selecionado visualmente
  const [selectedUpsellId, setSelectedUpsellId] = useState<string>(
    UPSELL_OPTIONS[1]?.id || UPSELL_OPTIONS[0].id, // por padrão, o pacote do meio
  )

  useEffect(() => {
    async function loadOrder() {
      try {
        let finalOrderId = orderIdFromSearch || null

        if (!finalOrderId && typeof window !== "undefined") {
          finalOrderId =
            localStorage.getItem("lastPaidOrderId") ||
            localStorage.getItem("lastOrderId")
        }

        if (!finalOrderId) {
          setError("Não encontramos os dados do seu pedido.")
          setLoading(false)
          return
        }

        if (typeof window !== "undefined") {
          localStorage.setItem("lastPaidOrderId", finalOrderId)
        }

        const res = await fetch(`/api/orders/${finalOrderId}`, {
          cache: "no-store",
        })

        if (!res.ok) {
          setError("Falha ao carregar pedido")
          setLoading(false)
          return
        }

        const data: OrderDTO = await res.json()

        // 🔹 se o backend já estiver retornando metaEventId, aproveita e guarda
        if (typeof window !== "undefined" && data?.metaEventId) {
          try {
            window.localStorage.setItem("lastFbEventId", data.metaEventId)
          } catch (e) {
            console.warn(
              "Não foi possível salvar lastFbEventId no localStorage:",
              e,
            )
          }
        }

        setOrder(data)
        setLoading(false)
      } catch (err) {
        console.error("Erro ao carregar pedido:", err)
        setError("Falha ao carregar pedido")
        setLoading(false)
      }
    }

    loadOrder()
  }, [orderIdFromSearch])

  // ✅ PURCHASE no navegador (com deduplicação via eventID sempre que possível)
  useEffect(() => {
    if (!order) return
    if (purchaseSent) return
    if (typeof window === "undefined") return

    const w = window as any
    const fbq = w.fbq as ((...args: any[]) => void) | undefined
    if (!fbq) {
      console.warn(
        "fbq não encontrado no window, não foi possível disparar Purchase client-side",
      )
      return
    }

    // prioridade 1: metaEventId vindo do backend
    // prioridade 2: lastFbEventId salvo no localStorage
    let fbEventId: string | undefined

    if (order.metaEventId) {
      fbEventId = String(order.metaEventId)
    } else {
      try {
        fbEventId =
          window.localStorage?.getItem("lastFbEventId") || undefined
      } catch {
        fbEventId = undefined
      }
    }

    const value = order.amount ?? 0

    console.log("📦 Disparando Purchase (browser):", {
      value,
      currency: "BRL",
      eventID: fbEventId,
      orderId: order.id,
    })

    if (fbEventId) {
      fbq(
        "track",
        "Purchase",
        {
          value,
          currency: "BRL",
        },
        { eventID: fbEventId },
      )
    } else {
      // fallback: dispara sem eventID (pode não deduplicar com o servidor)
      fbq("track", "Purchase", {
        value,
        currency: "BRL",
      })
    }

    setPurchaseSent(true)
  }, [order, purchaseSent])

  // ⭐ Handler do UPSELL: monta novo pedido no carrinho e volta pra /confirmacao
  const handleUpsellClick = (quantity: number, priceCents: number) => {
    try {
      prepareUpsellOrder(quantity, priceCents)
      router.push("/confirmacao")
    } catch (e) {
      console.error("Erro ao aplicar upsell:", e)
    }
  }

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress />
      </Box>
    )
  }

  if (error || !order) {
    return (
      <Box sx={{ bgcolor: "background.default", minHeight: "100vh", pb: 6 }}>
        <Container maxWidth="md" sx={{ py: 6, textAlign: "center" }}>
          <Typography variant="h5" color="error" fontWeight={700} gutterBottom>
            Ops, houve um problema.
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {error || "Não encontramos os dados do seu pedido."}
          </Typography>
          <Button
            variant="contained"
            sx={{ mt: 3 }}
            onClick={() => router.push("/")}
          >
            Voltar ao início
          </Button>
        </Container>
      </Box>
    )
  }

  const quantidade = order.quantity ?? 0
  const total = order.amount

  return (
    <Box sx={{ bgcolor: "#F2F2F2", minHeight: "100vh", pb: 6 }}>
      <Container maxWidth="md" sx={{ py: 6 }}>
        {/* CARD DE SUCESSO COM ANIMAÇÃO */}
        <Paper
          elevation={3}
          sx={{
            p: { xs: 3, sm: 4 },
            mb: 4,
            textAlign: "center",
            borderRadius: 3,
            bgcolor: "#FFFFFF",
          }}
        >
          {/* círculo animado */}
          <Box
            sx={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 2.5,
              "&::before": {
                content: '""',
                position: "absolute",
                width: 64,
                height: 64,
                borderRadius: "50%",
                bgcolor: "rgba(34,197,94,0.18)",
                animation: "pulse 1.8s ease-out infinite",
              },
              "@keyframes pulse": {
                "0%": { transform: "scale(0.9)", opacity: 0.7 },
                "70%": { transform: "scale(1.15)", opacity: 0 },
                "100%": { transform: "scale(1.15)", opacity: 0 },
              },
            }}
          >
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                bgcolor: "#16A34A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                boxShadow: "0 10px 25px rgba(22,163,74,0.45)",
              }}
            >
              <Icon icon="mdi:check-bold" width={26} />
            </Box>
          </Box>

          <Typography
            variant="h5"
            fontWeight={700}
            color="success.main"
            gutterBottom
          >
            Pagamento aprovado!
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ maxWidth: 420, mx: "auto" }}
          >
            Seu PIX foi confirmado e seus números já estão reservados para o
            próximo sorteio. Você pode visualizar tudo em{" "}
            <strong>“Minhas compras”</strong>.
          </Typography>

          {/* TAG TOTAL PAGO */}
          <Box
            sx={{
              mt: 3,
              display: "inline-flex",
              alignItems: "center",
              px: 2.5,
              py: 0.8,
              borderRadius: 999,
              bgcolor: "#F0FDF4",
              border: "1px solid #BBF7D0",
            }}
          >
            <Typography
              variant="caption"
              sx={{ color: "#166534", fontWeight: 500, mr: 1 }}
            >
              Total pago:
            </Typography>
            <Typography
              variant="subtitle1"
              sx={{ color: "#166534", fontWeight: 700 }}
            >
              {formatBRL(total)}
            </Typography>
          </Box>
        </Paper>

        {/* 🔥 UPSELL PÓS-PAGAMENTO – 3 PACOTES NO ESTILO DO ORDER BUMP */}
        <Paper
          elevation={2}
          sx={{
            mb: 3.5,
            borderRadius: 3,
            overflow: "hidden",
            border: "1px solid #FED7AA",
            boxShadow: "0 18px 45px rgba(248,113,22,0.22)",
            bgcolor: "#FFF7ED",
          }}
        >
          {/* HEADER LARANJA */}
          <Box
            sx={{
              px: 2.4,
              py: 1.4,
              background:
                "linear-gradient(135deg,#FB923C 0%,#F97316 40%,#EF4444 100%)",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Box>
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 800, letterSpacing: 0.4, fontSize: "0.78rem" }}
              >
                🍀 Essa é a hora de multiplicar suas chances de mudança de vida.
              </Typography>
              <Typography
                variant="caption"
                sx={{ opacity: 0.95, fontSize: "0.72rem" }}
              >
                
              </Typography>
            </Box>

            <Box
              sx={{
                px: 1.4,
                py: 0.3,
                borderRadius: 999,
                bgcolor: "rgba(15,23,42,0.14)",
                display: "flex",
                alignItems: "center",
                gap: 0.4,
                fontSize: "0.7rem",
                fontWeight: 700,
              }}
            >
              <Icon icon="mdi:shield-check" width={16} />
              Verificado
            </Box>
          </Box>

          {/* CORPO COM OS 3 PACOTES */}
          <Box sx={{ px: 2.4, py: 2.4, bgcolor: "#FFFBEB" }}>
            <Typography
              variant="subtitle1"
              sx={{
                mb: 1.4,
                fontWeight: 800,
                color: "#111827",
                fontSize: "0.95rem",
              }}
            >
              Escolha o pacote que mais combina com o tamanho do seu sonho.
            </Typography>
            <Typography variant="body2" sx={{ color: "#4B5563", mb: 2 }}>
              Cada pacote aumenta suas chances de forma absurda com poucos
              cliques.
            </Typography>

            {UPSELL_OPTIONS.map((opt, index) => {
              const price = opt.priceCents / 100
              const isMiddle = index === 1
              const isSelected = opt.id === selectedUpsellId

              return (
                <Box
                  key={opt.id}
                  onClick={() => setSelectedUpsellId(opt.id)}
                  sx={{
                    mb: index === UPSELL_OPTIONS.length - 1 ? 0 : 1.8,
                    borderRadius: 2,
                    bgcolor: "#FFFFFF",
                    border: isSelected
                      ? "2px solid #22C55E"
                      : "1px solid #E5E7EB",
                    boxShadow: isSelected
                      ? "0 14px 35px rgba(34,197,94,0.28)"
                      : "0 6px 18px rgba(15,23,42,0.04)",
                    position: "relative",
                    overflow: "hidden",
                    cursor: "pointer",
                    transition: "box-shadow 0.18s ease, border-color 0.18s ease",
                  }}
                >
                  {/* linha superior com título + selo */}
                  <Box
                    sx={{
                      px: 1.8,
                      pt: 1.4,
                      pb: 1,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Box>
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: 800, color: "#111827" }}
                      >
                        {opt.label}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: "#6B7280", display: "block", mt: 0.2 }}
                      >
                        +{opt.qty.toLocaleString("pt-BR")} números extras
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        px: 1.2,
                        py: 0.3,
                        borderRadius: 999,
                        bgcolor: isMiddle ? "#DCFCE7" : "#EFF6FF",
                        color: isMiddle ? "#166534" : "#1D4ED8",
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                      }}
                    >
                      {opt.ribbon}
                    </Box>
                  </Box>

                  {/* preço + textos de benefício */}
                  <Box
                    sx={{
                      px: 1.8,
                      pb: 1.2,
                      display: "flex",
                      flexDirection: "column",
                      gap: 0.3,
                    }}
                  >
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 900,
                        color: "#16A34A",
                        display: "flex",
                        alignItems: "baseline",
                        gap: 0.4,
                      }}
                    >
                      {formatBRL(price)}
                    </Typography>

                    <Typography
                      variant="caption"
                      sx={{ color: "#16A34A", fontWeight: 700 }}
                    >
                      {opt.benefitLine}
                    </Typography>

                    <Typography
                      variant="caption"
                      sx={{ color: "#6B7280" }}
                    >
                      {opt.highlight}
                    </Typography>
                  </Box>

                  {/* botão */}
                  <Box sx={{ px: 1.8, pb: 1.6 }}>
                    <Button
                      fullWidth
                      onClick={(e) => {
                        e.stopPropagation()
                        handleUpsellClick(opt.qty, opt.priceCents)
                      }}
                      variant={isSelected ? "contained" : "outlined"}
                      sx={{
                        position: "relative",
                        borderRadius: 999,
                        fontWeight: 800,
                        py: 1,
                        textTransform: "none",
                        fontSize: "0.88rem",
                        bgcolor: isSelected ? "#16A34A" : "#FFFFFF",
                        color: isSelected ? "#FFFFFF" : "#16A34A",
                        borderColor: "#16A34A",
                        "&:hover": {
                          bgcolor: isSelected ? "#15803D" : "#F0FDF4",
                        },
                        ...(isSelected && {
                          "@keyframes pulseGreen": {
                            "0%": {
                              boxShadow: "0 0 0 0 rgba(22,163,74,0.65)",
                            },
                            "70%": {
                              boxShadow:
                                "0 0 0 14px rgba(22,163,74,0)",
                            },
                            "100%": {
                              boxShadow:
                                "0 0 0 0 rgba(22,163,74,0)",
                            },
                          },
                          animation: "pulseGreen 1.6s ease-out infinite",
                        }),
                      }}
                    >
                      <Icon
                        icon="mdi:plus-circle"
                        width={18}
                        style={{ marginRight: 6 }}
                      />
                      ESCOLHER ESTE PACOTE
                    </Button>
                  </Box>
                </Box>
              )
            })}

            <Typography
              variant="caption"
              sx={{
                mt: 1.6,
                display: "block",
                textAlign: "center",
                color: "#92400E",
                fontSize: "0.7rem",
              }}
            >
              Oferta liberada só para quem acabou de ter o pagamento aprovado.
              Se sair desta página, não será exibida novamente.
            </Typography>
          </Box>
        </Paper>

        {/* LINHA DE STATUS / ETAPAS */}
        <Paper
          elevation={1}
          sx={{
            p: 2.5,
            mb: 3,
            borderRadius: 3,
            bgcolor: "#FFFFFF",
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{ mb: 1.5, fontWeight: 700, color: "#111827" }}
          >
            Status do pedido
          </Typography>

          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              gap: 1.5,
            }}
          >
            {/* Etapa 1 */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  bgcolor: "#22C55E",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: 12,
                }}
              >
                <Icon icon="mdi:check" width={14} />
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: "#111827" }}
                >
                  Pagamento
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ display: "block", color: "#6B7280" }}
                >
                  Aprovado via PIX
                </Typography>
              </Box>
            </Box>

            {/* Etapa 2 */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  bgcolor: "#22C55E",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: 12,
                }}
              >
                <Icon icon="mdi:check" width={14} />
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: "#111827" }}
                >
                  Números liberados
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ display: "block", color: "#6B7280" }}
                >
                  Disponíveis em “Minhas compras”
                </Typography>
              </Box>
            </Box>
          </Box>
        </Paper>

        {/* RESUMO DO PEDIDO */}
        <Paper
          elevation={1}
          sx={{
            p: 3,
            mb: 4,
            borderRadius: 3,
            bgcolor: "#FFFFFF",
          }}
        >
          <Typography
            variant="subtitle1"
            fontWeight={700}
            sx={{ mb: 2, color: "#111827" }}
          >
            Resumo do seu pedido
          </Typography>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
              gap: 2,
            }}
          >
            <Box>
              <Typography variant="caption" color="text.secondary">
                Quantidade de números
              </Typography>
              <Typography variant="h6" fontWeight={700}>
                {quantidade}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Total pago
              </Typography>
              <Typography variant="h6" fontWeight={700}>
                {formatBRL(total)}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                ID do pedido
              </Typography>
              <Typography
                variant="body2"
                fontWeight={600}
                sx={{ wordBreak: "break-all" }}
              >
                {formatOrderId(order.id)}
              </Typography>
            </Box>
          </Box>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 2 }}
          >
            A qualquer momento, você pode consultar esse pedido em{" "}
            <strong>“Minhas compras”</strong>.
          </Typography>
        </Paper>

        {/* BOTÕES FINAIS */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Button
            variant="contained"
            color="success"
            size="large"
            onClick={() => router.push("/compras")}
            sx={{ fontWeight: 700 }}
          >
            Ver minhas compras e números
          </Button>

          <Button
            variant="outlined"
            size="large"
            onClick={() => router.push("/")}
            sx={{ fontWeight: 600 }}
          >
            Voltar ao início
          </Button>
        </Box>
      </Container>
    </Box>
  )
}
