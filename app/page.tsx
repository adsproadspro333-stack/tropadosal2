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
import QuantitySelector from "./components/QuantitySelector"
import NumbersAdder from "./components/NumbersAdder"
import WinnersList from "./components/WinnersList"
import SocialProofNotifications from "./components/SocialProofNotifications"
import FooterLegal from "./components/FooterLegal"

import { trackViewContent } from "@/lib/fbq"
import { useCartStore } from "@/store/cartStore"
import { formatBRL } from "@/lib/formatCurrency"

export default function HomePage() {
  // 🔹 1) Evento de ViewContent (já existia)
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

  // 🔹 2) Lê upsell vindo de /compras (?reforco=&n=&v=) e monta o carrinho
  useEffect(() => {
    if (typeof window === "undefined") return

    const params = new URLSearchParams(window.location.search)

    const qtyParam = params.get("n")
    const priceParam = params.get("v")

    if (!qtyParam || !priceParam) return

    const qtyNum = Number(qtyParam)
    const priceNum = Number(priceParam) // v vem como "14.90"

    if (
      !Number.isFinite(qtyNum) ||
      qtyNum <= 0 ||
      !Number.isFinite(priceNum) ||
      priceNum <= 0
    ) {
      return
    }

    const priceCents = Math.round(priceNum * 100)

    // monta um pedido só com o pacote de reforço
    useCartStore.getState().prepareUpsellOrder(qtyNum, priceCents)

    console.log(
      "[Upsell] Carrinho ajustado a partir da URL:",
      qtyNum,
      "números,",
      priceCents,
      "centavos",
    )
  }, [])

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#F2F2F2", // fundo claro único
        pb: 18, // espaço pro CTA fixo
      }}
    >
      {/* Banner topo (flyer) */}
      <HeroBanner />

      {/* Conteúdo central estilo app de rifa */}
      <Container
        maxWidth="sm"
        sx={{
          px: { xs: 2, sm: 0 },
          pt: 2,
        }}
      >
        {/* 1) COMBOS – logo depois do flyer */}
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
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            mb={1}
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
        </Paper>

        {/* 2) Quantidade personalizada */}
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
            Quantidade personalizada
          </Typography>
          <Typography
            variant="body2"
            sx={{
              mb: 1.4,
              fontSize: "0.8rem",
              color: "#6B7280",
            }}
          >
            Ajuste manualmente quantos números você quer garantir nesta edição.
          </Typography>

          <Divider sx={{ mb: 1.4 }} />

          <QuantitySelector />
        </Paper>

        {/* 3) COMO FUNCIONA */}
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
                  Use os combos prontos ou personalize a quantidade ideal pra você.
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
                  O pagamento é instantâneo e 100% seguro, direto no seu banco.
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
                  Seus números são enviados na hora e você acompanha tudo pelos
                  canais oficiais.
                </Typography>
              </Box>
            </Stack>
          </Stack>
        </Paper>

        {/* 4) Ganhadores recentes */}
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
            Confira alguns dos últimos prêmios entregues pela POZE PRÊMIOS.
          </Typography>

          <WinnersList initialCount={4} />
        </Paper>

        {/* 5) Escassez / Progresso de vendas */}
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
            Restam apenas <strong>1,9% dos títulos disponíveis</strong>. Garanta
            sua participação enquanto ainda há números liberados.
          </Typography>
        </Paper>

        {/* 6) Texto legal SUSEP */}
        <FooterLegal />
      </Container>

      {/* Notificações flutuantes */}
      <SocialProofNotifications />

      {/* CTA fixo com seletor + valor + botão Concorrer */}
      <StickyCTA />
    </Box>
  )
}

/**
 * CTA fixo no rodapé: quantidade + valor + seletor + botão "Concorrer".
 */
function StickyCTA() {
  const router = useRouter()
  const { qty, totalInCents, handleChangeQuantity } = useCartStore()
  const disabled = qty < 100
  const MIN_QTY = 100

  const inc = () => {
    handleChangeQuantity(qty + 1)
  }

  const dec = () => {
    if (qty <= MIN_QTY) return
    handleChangeQuantity(qty - 1)
  }

  const handleClick = () => {
    if (disabled) return
    router.push("/dados")
  }

  return (
    <Box
      sx={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1300,
        bgcolor: "#FFFFFF",
        boxShadow: "0 -8px 24px rgba(15,23,42,0.16)",
        borderTop: "1px solid #E5E7EB",
        py: 1,
      }}
    >
      <Container maxWidth="sm" sx={{ px: { xs: 2, sm: 0 } }}>
        <Stack spacing={1}>
          {/* linha com quantidade / valor / seletor */}
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <Box>
              <Typography
                variant="caption"
                sx={{ fontSize: "0.78rem", color: "#6B7280" }}
              >
                {qty} Números
              </Typography>
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 700,
                  fontSize: "1rem",
                  color: "#111827",
                }}
              >
                {formatBRL(totalInCents / 100)}
              </Typography>
            </Box>

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              <Button
                onClick={dec}
                variant="outlined"
                size="small"
                sx={{
                  minWidth: 36,
                  borderRadius: 999,
                  px: 0,
                  fontWeight: 700,
                  borderColor: "#D1D5DB",
                  color: "#4B5563",
                }}
              >
                −
              </Button>

              <Box
                sx={{
                  px: 2,
                  py: 0.7,
                  borderRadius: 999,
                  border: "1px solid #D1D5DB",
                  minWidth: 64,
                  textAlign: "center",
                  bgcolor: "#F9FAFB",
                }}
              >
                <Typography
                  sx={{
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    color: "#111827",
                  }}
                >
                  {qty}
                </Typography>
              </Box>

              <Button
                onClick={inc}
                variant="outlined"
                size="small"
                sx={{
                  minWidth: 36,
                  borderRadius: 999,
                  px: 0,
                  fontWeight: 700,
                  borderColor: "#D1D5DB",
                  color: "#4B5563",
                }}
              >
                +
              </Button>
            </Box>
          </Stack>

          {/* botão principal */}
          <Button
            onClick={handleClick}
            variant="contained"
            fullWidth
            disabled={disabled}
            sx={{
              fontWeight: 800,
              borderRadius: 999,
              py: 1.1,
              fontSize: "0.98rem",
              textTransform: "none",
              letterSpacing: 0.3,
              bgcolor: disabled ? "#9CA3AF" : "#16A34A",
              color: "#ffffff",
              boxShadow: disabled
                ? "0 0 0 rgba(0,0,0,0)"
                : "0px 8px 18px rgba(0,0,0,0.18)",
              transform: "translateY(0)",
              transition:
                "transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease",
              "&:hover": {
                bgcolor: disabled ? "#9CA3AF" : "#15803D",
                transform: disabled ? "none" : "translateY(-2px)",
                boxShadow: disabled
                  ? "0 0 0 rgba(0,0,0,0)"
                  : "0px 12px 26px rgba(0,0,0,0.25)",
              },
              "&:active": {
                transform: disabled ? "none" : "scale(0.97)",
                boxShadow: disabled
                  ? "0 0 0 rgba(0,0,0,0)"
                  : "0px 6px 14px rgba(0,0,0,0.2)",
              },
            }}
          >
            {disabled ? "Selecione pelo menos 100 números" : "Concorrer"}
          </Button>
        </Stack>
      </Container>
    </Box>
  )
}
