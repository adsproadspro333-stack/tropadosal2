"use client"

import { useEffect } from "react"
import {
  Box,
  Container,
  Paper,
  Typography,
  Stack,
  Button,
  Divider,
} from "@mui/material"
import { useRouter } from "next/navigation"

import HeroBanner from "./components/HeroBanner"
import SalesProgress from "./components/SalesProgress"
import NumbersAdder from "./components/NumbersAdder"
import WinnersList from "./components/WinnersList"
import SocialProofNotifications from "./components/SocialProofNotifications"
import FooterLegal from "./components/FooterLegal"
import ActionPrizesCard from "./components/ActionPrizesCard"

import { trackViewContent } from "@/lib/fbq"
import { useCartStore } from "@/store/cartStore"
import { formatBRL } from "@/lib/formatCurrency"

export default function HomePage() {
  const router = useRouter()

  const {
    qty,
    totalInCents,
    handleChangeQuantity,
    clearCart,
    comboQty,
  } = useCartStore()

  // 🔁 Mínimo agora SEMPRE é o combo atual (3, 5, 10, 15...)
  const currentMinQty = comboQty || 0
  const disabledInline = qty < currentMinQty

  // 🔹 1) Evento de ViewContent
  useEffect(() => {
    const eventId =
      Date.now().toString() + "-" + Math.random().toString(36).slice(2)

    try {
      trackViewContent({
        content_name: "CHRYS Prêmios - Rifa Principal",
        content_category: "rifa",
        content_ids: ["rifa_chrys_principal"],
        content_type: "product_group",
        currency: "BRL",
        value: 0.1,
        event_id: eventId,
      })

      console.log("✅ ViewContent enviado com sucesso:", eventId)
    } catch (err) {
      console.warn("⚠️ Erro ao disparar ViewContent:", err)
    }
  }, [])

  // 🔹 2) Upsell vindo de /compras (?reforco=&n=&v=)
  useEffect(() => {
    if (typeof window === "undefined") return

    const params = new URLSearchParams(window.location.search)

    const qtyParam = params.get("n")
    const priceParam = params.get("v")

    if (!qtyParam || !priceParam) return

    const qtyNum = Number(qtyParam)
    const priceNum = Number(priceParam)

    if (
      !Number.isFinite(qtyNum) ||
      qtyNum <= 0 ||
      !Number.isFinite(priceNum) ||
      priceNum <= 0
    ) {
      return
    }

    const priceCents = Math.round(priceNum * 100)

    useCartStore.getState().prepareUpsellOrder(qtyNum, priceCents)

    console.log(
      "[Upsell] Carrinho ajustado a partir da URL:",
      qtyNum,
      "números,",
      priceCents,
      "centavos",
    )
  }, [])

  // handlers seletor inline
  const incInline = () => {
    handleChangeQuantity(qty + 1)
  }

  const decInline = () => {
    if (qty <= 0) return
    handleChangeQuantity(qty - 1)
  }

  const resetInline = () => {
    clearCart()
  }

  const handleInlineBuy = () => {
    if (disabledInline) return
    router.push("/dados")
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#F3F4F6",
        display: "flex",
        justifyContent: "center",
      }}
    >
      {/* Miolo central */}
      <Box
        sx={{
          width: "100%",
          maxWidth: 480,
          mx: "auto",
          pb: { xs: 4, sm: 5 },
        }}
      >
        <Container
          maxWidth="sm"
          sx={{
            px: { xs: 2, sm: 0 },
            pt: { xs: 2, sm: 3 },
            position: "relative",
            zIndex: 2,
          }}
        >
          {/* CARD PRINCIPAL */}
          <Paper
            elevation={4}
            sx={{
              mb: 2,
              borderRadius: 2.5,
              bgcolor: "#FFFFFF",
              border: "1px solid #E5E7EB",
              boxShadow: "0 18px 40px rgba(15,23,42,0.25)",
              overflow: "hidden",
            }}
          >
            <Box sx={{ bgcolor: "#FFFFFF" }}>
              <HeroBanner />
            </Box>

            <Box sx={{ p: 1.8, pt: 1.4 }}>
              {/* Combos de números */}
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                mb={1.5}
              >
                <Box>
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 700,
                      fontSize: "0.98rem",
                      color: "#111827",
                    }}
                  >
                    Combos de números
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.8rem",
                      color: "#6B7280",
                    }}
                  >
                    Selecione um combo pronto para acelerar suas chances.
                  </Typography>
                </Box>
              </Stack>

              <NumbersAdder />

              <Divider sx={{ my: 2 }} />

              {/* Seletor [-] qty [+] + CTA inline */}
              <Box>
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="center"
                  sx={{ mb: 1.6 }}
                  spacing={1.8}
                >
                  <Button
                    onClick={decInline}
                    variant="outlined"
                    size="medium"
                    sx={{
                      minWidth: 56,
                      height: 48,
                      borderRadius: 1.5,
                      px: 0,
                      fontWeight: 700,
                      fontSize: "1.2rem",
                      borderColor: "#E5E7EB",
                      color: "#4B5563",
                    }}
                  >
                    −
                  </Button>

                  <Box
                    sx={{
                      flex: 1,
                      maxWidth: 200,
                      px: 2,
                      py: 1,
                      borderRadius: 1.5,
                      border: "2px solid #E5E7EB",
                      textAlign: "center",
                      bgcolor: "#FFFFFF",
                    }}
                  >
                    <Typography
                      sx={{
                        fontWeight: 600,
                        fontSize: "1.2rem",
                        color: "#111827",
                      }}
                    >
                      {qty}
                    </Typography>
                  </Box>

                  <Button
                    onClick={incInline}
                    variant="outlined"
                    size="medium"
                    sx={{
                      minWidth: 56,
                      height: 48,
                      borderRadius: 1.5,
                      px: 0,
                      fontWeight: 700,
                      fontSize: "1.2rem",
                      borderColor: "#E5E7EB",
                      color: "#4B5563",
                    }}
                  >
                    +
                  </Button>
                </Stack>

                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{
                    mt: 0.5,
                  }}
                >
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: "0.78rem",
                        color: "#6B7280",
                      }}
                    >
                      {qty} Números
                    </Typography>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 700,
                        fontSize: "0.96rem",
                        color: "#111827",
                      }}
                    >
                      {formatBRL(totalInCents / 100)}
                    </Typography>
                  </Box>

                  <Button
                    variant="contained"
                    onClick={handleInlineBuy}
                    disabled={disabledInline}
                    sx={{
                      minWidth: 160,
                      height: 44,
                      borderRadius: 1.5,
                      fontWeight: 700,
                      fontSize: "0.9rem",
                      textTransform: "none",
                      bgcolor: disabledInline ? "#9CA3AF" : "#16A34A",
                      color: "#FFFFFF",
                      boxShadow: disabledInline
                        ? "0 0 0 rgba(0,0,0,0)"
                        : "0px 6px 14px rgba(22,163,74,0.35)",
                      "&:hover": {
                        bgcolor: disabledInline ? "#9CA3AF" : "#15803D",
                      },
                    }}
                  >
                    {disabledInline
                      ? `Mínimo de ${currentMinQty} números`
                      : "Comprar"}
                  </Button>
                </Stack>

                <Button
                  variant="text"
                  fullWidth
                  size="small"
                  onClick={resetInline}
                  sx={{
                    mt: 0.8,
                    borderRadius: 999,
                    fontWeight: 500,
                    fontSize: "0.78rem",
                    color: "#6B7280",
                    textTransform: "none",
                  }}
                >
                  Zerar seleção
                </Button>
              </Box>
            </Box>
          </Paper>

          {/* Área do cliente */}
          <Paper
            elevation={3}
            sx={{
              mb: 2,
              p: 1.8,
              borderRadius: 2,
              bgcolor: "#FFFFFF",
              border: "1px solid #E5E7EB",
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 700,
                mb: 0.6,
                fontSize: "0.98rem",
                color: "#111827",
              }}
            >
              Área do cliente
            </Typography>
            <Typography
              variant="body2"
              sx={{
                mb: 1.4,
                fontSize: "0.8rem",
                color: "#6B7280",
              }}
            >
              Consulte suas compras, números e comprovantes sempre que quiser.
            </Typography>

            <Button
              variant="outlined"
              fullWidth
              sx={{
                borderRadius: 999,
                fontWeight: 600,
                fontSize: "0.9rem",
                textTransform: "none",
              }}
              onClick={() => router.push("/compras")}
            >
              Minhas compras
            </Button>
          </Paper>

          {/* Prêmios da ação */}
          <Paper
            elevation={3}
            sx={{
              mb: 2,
              p: 1.8,
              borderRadius: 2,
              bgcolor: "#FFFFFF",
              border: "1px solid #E5E7EB",
            }}
          >
            <ActionPrizesCard />
          </Paper>

          {/* Como funciona */}
          <Paper
            elevation={3}
            sx={{
              mb: 2,
              p: 1.8,
              borderRadius: 2,
              bgcolor: "#FFFFFF",
              border: "1px solid #E5E7EB",
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 700,
                mb: 0.6,
                fontSize: "0.98rem",
                color: "#111827",
              }}
            >
              Como funciona a ação
            </Typography>

            <Typography
              variant="body2"
              sx={{
                mb: 1.2,
                fontSize: "0.8rem",
                color: "#6B7280",
              }}
            >
              É simples e rápido para participar. Veja os passos:
            </Typography>

            <Stack spacing={1.1} sx={{ fontSize: "0.8rem", color: "#374151" }}>
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <Box
                  sx={{
                    mt: "3px",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: "#16A34A",
                  }}
                />
                <Box>
                  <Typography sx={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    1. Escolha a quantidade de números
                  </Typography>
                  <Typography sx={{ fontSize: "0.78rem", color: "#6B7280" }}>
                    Use os combos prontos ou ajuste a quantidade ideal pra você.
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={1} alignItems="flex-start">
                <Box
                  sx={{
                    mt: "3px",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: "#16A34A",
                  }}
                />
                <Box>
                  <Typography sx={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    2. Confirme e pague via Pix
                  </Typography>
                  <Typography sx={{ fontSize: "0.78rem", color: "#6B7280" }}>
                    O pagamento é instantâneo e 100% seguro, direto no seu
                    banco.
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={1} alignItems="flex-start">
                <Box
                  sx={{
                    mt: "3px",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: "#16A34A",
                  }}
                />
                <Box>
                  <Typography sx={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    3. Receba os números e acompanhe o sorteio
                  </Typography>
                  <Typography sx={{ fontSize: "0.78rem", color: "#6B7280" }}>
                    Seus números são enviados na hora e você acompanha tudo
                    pelos canais oficiais.
                  </Typography>
                </Box>
              </Stack>
            </Stack>
          </Paper>

          {/* Ganhadores recentes */}
          <Paper
            elevation={3}
            sx={{
              mb: 2,
              p: 1.8,
              borderRadius: 2,
              bgcolor: "#FFFFFF",
              border: "1px solid #E5E7EB",
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 700,
                mb: 0.6,
                fontSize: "0.98rem",
                color: "#111827",
              }}
            >
              Ganhadores recentes
            </Typography>
            <Typography
              variant="body2"
              sx={{
                mb: 1.4,
                fontSize: "0.8rem",
                color: "#6B7280",
              }}
            >
              Confira alguns dos últimos prêmios entregues pelo Carlinhos Maia.
            </Typography>

            <WinnersList initialCount={4} />
          </Paper>

          {/* Progresso de vendas */}
          <Paper
            elevation={3}
            sx={{
              mb: 3,
              p: 1.8,
              borderRadius: 2,
              bgcolor: "#FFFFFF",
              border: "1px solid #E5E7EB",
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 700,
                mb: 0.8,
                fontSize: "0.98rem",
                color: "#111827",
              }}
            >
              Progresso de vendas
            </Typography>

            <SalesProgress percent={76.3} />

            <Typography
              variant="caption"
              sx={{
                mt: 1,
                display: "block",
                fontSize: "0.75rem",
                color: "#6B7280",
              }}
            >
              Restam apenas <strong>1,9% dos títulos disponíveis</strong>.
              Garanta sua participação enquanto ainda há números liberados.
            </Typography>
          </Paper>

          <FooterLegal />
        </Container>
      </Box>

      {/* Notificações flutuantes */}
      <SocialProofNotifications />
      {/* <StickyCTA /> */}
    </Box>
  )
}
