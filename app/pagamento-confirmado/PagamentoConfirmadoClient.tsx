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
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import { Icon } from "@iconify/react"
import { formatBRL } from "@/lib/formatCurrency"
import { useCartStore } from "@/store/cartStore"

type Props = {
  orderIdFromSearch?: string
}

type OrderDTO = {
  id: string
  amount: number
  quantity?: number
  metaEventId?: string | null
}

const UPSELL_OPTIONS = [
  {
    id: "turbo",
    label: "10x Mais Sorte",
    qty: 100,
    priceCents: 990,
    note: "Mais chances com pouco investimento.",
  },
  {
    id: "elite",
    label: "20x Mais Sorte",
    qty: 200,
    priceCents: 1990,
    note: "Melhor custo-benefício do dia.",
  },
  {
    id: "dominator",
    label: "50x Mais Sorte",
    qty: 300,
    priceCents: 3990,
    note: "Para quem quer chegar muito forte.",
  },
]

export default function PagamentoConfirmadoClient({ orderIdFromSearch }: Props) {
  const router = useRouter()
  const { prepareUpsellOrder } = useCartStore()

  const [order, setOrder] = useState<OrderDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState("dominator")

  // ⏱️ Timer moderno (3:30)
  const [secondsLeft, setSecondsLeft] = useState(210)

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = String(secondsLeft % 60).padStart(2, "0")

  useEffect(() => {
    async function load() {
      const orderId =
        orderIdFromSearch ||
        localStorage.getItem("lastPaidOrderId") ||
        localStorage.getItem("lastOrderId")

      if (!orderId) return

      localStorage.setItem("lastPaidOrderId", orderId)

      const res = await fetch(`/api/orders/${orderId}`, {
        cache: "no-store",
      })

      const data = await res.json()
      setOrder(data)
      setLoading(false)
    }

    load()
  }, [orderIdFromSearch])

  if (loading || !order) {
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

  return (
    <Box sx={{ bgcolor: "#F2F2F2", minHeight: "100vh", pb: 6 }}>
      <Container maxWidth="sm" sx={{ py: 4 }}>
        {/* CONFIRMAÇÃO */}
        <Paper sx={{ p: 3, borderRadius: 3, textAlign: "center", mb: 3 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              mx: "auto",
              mb: 1.5,
              borderRadius: "50%",
              bgcolor: "#16A34A",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              boxShadow: "0 12px 30px rgba(22,163,74,0.45)",
            }}
          >
            <Icon icon="mdi:check-bold" width={28} />
          </Box>

          <Typography fontWeight={900} fontSize="1.1rem" color="#16A34A">
            Pagamento aprovado
          </Typography>

          <Typography variant="body2" sx={{ mt: 0.5, color: "#374151" }}>
            Seus números já estão concorrendo.
          </Typography>

          {/* DETALHES MINIMIZADOS */}
          <Accordion
            sx={{
              mt: 2,
              boxShadow: "none",
              border: "1px solid #E5E7EB",
              borderRadius: 2,
              "&:before": { display: "none" },
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={700}>Ver detalhes do pedido</Typography>
            </AccordionSummary>

            <AccordionDetails>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-around",
                  pt: 1,
                }}
              >
                <Box>
                  <Typography variant="caption">Números</Typography>
                  <Typography fontWeight={800}>{order.quantity}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption">Total pago</Typography>
                  <Typography fontWeight={800} color="#16A34A">
                    {formatBRL(order.amount)}
                  </Typography>
                </Box>
              </Box>
            </AccordionDetails>
          </Accordion>
        </Paper>

        {/* UPSELL */}
        <Paper sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
          <Typography fontWeight={900}>Última chance antes do sorteio</Typography>
          <Typography variant="caption" color="text.secondary">
            A maioria dos ganhadores entra com mais de um pacote.
          </Typography>

          {/* TIMER MODERNO */}
          <Box
            sx={{
              mt: 1.5,
              mb: 2,
              mx: "auto",
              width: "fit-content",
              px: 2.5,
              py: 0.8,
              borderRadius: 999,
              bgcolor: "#111827",
              color: "#FFFFFF",
              fontSize: "0.75rem",
              fontWeight: 800,
              letterSpacing: 0.5,
              display: "flex",
              alignItems: "center",
              gap: 0.6,
              animation: "pulse 1.4s infinite",
              "@keyframes pulse": {
                "0%": { boxShadow: "0 0 0 0 rgba(239,68,68,0.6)" },
                "70%": { boxShadow: "0 0 0 10px rgba(239,68,68,0)" },
                "100%": { boxShadow: "0 0 0 0 rgba(239,68,68,0)" },
              },
            }}
          >
            ⏳ Oferta expira em
            <span style={{ color: "#EF4444" }}>
              {minutes}:{seconds}
            </span>
          </Box>

          {UPSELL_OPTIONS.map((opt) => {
            const active = selected === opt.id
            const isDominator = opt.id === "dominator"

            return (
              <Box
                key={opt.id}
                onClick={() => setSelected(opt.id)}
                sx={{
                  borderRadius: 2,
                  p: 2,
                  mb: 1.2,
                  cursor: "pointer",
                  border: active ? "2px solid #DC2626" : "1px solid #E5E7EB",
                  bgcolor: active ? "#FEF2F2" : "#FFFFFF",
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography fontWeight={900}>{opt.label}</Typography>
                  <Typography fontWeight={900} color="#DC2626">
                    {formatBRL(opt.priceCents / 100)}
                  </Typography>
                </Box>

                <Typography variant="caption" color="text.secondary">
                  {opt.note}
                </Typography>

                {active && (
                  <Button
                    fullWidth
                    onClick={() => {
                      prepareUpsellOrder(opt.qty, opt.priceCents)
                      router.push("/pagamento")
                    }}
                    sx={{
                      mt: 1.4,
                      borderRadius: 999,
                      bgcolor: "#DC2626",
                      color: "#FFFFFF",
                      fontWeight: 900,
                      py: 1,
                      animation: isDominator
                        ? "pulseRed 1.6s ease-out infinite"
                        : "none",
                      "@keyframes pulseRed": {
                        "0%": { boxShadow: "0 0 0 0 rgba(220,38,38,0.6)" },
                        "70%": {
                          boxShadow: "0 0 0 14px rgba(220,38,38,0)",
                        },
                        "100%": {
                          boxShadow: "0 0 0 0 rgba(220,38,38,0)",
                        },
                      },
                      "&:hover": { bgcolor: "#B91C1C" },
                    }}
                  >
                    AUMENTAR CHANCE
                  </Button>
                )}
              </Box>
            )
          })}

          <Typography
            variant="caption"
            sx={{ display: "block", mt: 1, textAlign: "center", color: "#6B7280" }}
          >
            Essa oferta não aparecerá novamente.
          </Typography>
        </Paper>

        <Button
          fullWidth
          variant="contained"
          color="success"
          onClick={() => router.push("/compras")}
          sx={{ fontWeight: 900 }}
        >
          Ver minhas compras
        </Button>
      </Container>
    </Box>
  )
}
