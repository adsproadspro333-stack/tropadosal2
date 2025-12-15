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

  const { qty, totalInCents, handleChangeQuantity, clearCart } = useCartStore()

  // ✅ Regra do DNA do funil: CTA só libera com 3+
  const MIN_QTY = 3
  const disabledInline = qty < MIN_QTY

  // 🔹 1) Evento de ViewContent
  useEffect(() => {
    const eventId =
      Date.now().toString() + "-" + Math.random().toString(36).slice(2)

    try {
      trackViewContent({
        content_name: "FAVELA Prêmios - Rifa Principal",
        content_category: "rifa",
        content_ids: ["rifa_favela_principal"],
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
    // proteção extra (o store já segura os mínimos/regras)
    const next = Math.max(0, qty - 1)
    handleChangeQuantity(next)
  }

  const resetInline = () => {
    clearCart()
  }

  const handleInlineBuy = () => {
    if (disabledInline) return
    router.push("/dados")
  }

  // ---------- TOKENS VISUAIS (mesmo idioma do /pagamento) ----------
  const BG = "#0B0F19"
  const GLASS = "rgba(255,255,255,0.06)"
  const GLASS_SOFT = "rgba(255,255,255,0.04)"
  const BORDER = "rgba(255,255,255,0.10)"
  const TXT = "rgba(255,255,255,0.92)"
  const MUTED = "rgba(255,255,255,0.68)"
  const GREEN = "#22C55E"
  const GREEN_DARK = "#16A34A"

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: BG,
        display: "flex",
        justifyContent: "center",
        backgroundImage:
          "radial-gradient(1200px 600px at 20% 10%, rgba(34,197,94,0.16), transparent 60%), radial-gradient(900px 500px at 90% 0%, rgba(245,158,11,0.12), transparent 55%)",
      }}
    >
      {/* Miolo central */}
      <Box
        sx={{
          width: "100%",
          maxWidth: 480,
          mx: "auto",
          pb: { xs: 5, sm: 6 },
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
            elevation={0}
            sx={{
              mb: 2,
              borderRadius: 3,
              bgcolor: GLASS,
              border: `1px solid ${BORDER}`,
              backdropFilter: "blur(10px)",
              boxShadow: "0 18px 42px rgba(0,0,0,0.38)",
              overflow: "hidden",
            }}
          >
            {/* HERO (não mexe no componente, só no container) */}
            <Box
              sx={{
                bgcolor: "rgba(0,0,0,0.15)",
                borderBottom: `1px solid ${BORDER}`,
              }}
            >
              <HeroBanner />
            </Box>

            <Box sx={{ p: 1.8, pt: 1.5 }}>
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
                      fontWeight: 900,
                      fontSize: "1.02rem",
                      color: "#fff",
                      letterSpacing: "-0.2px",
                    }}
                  >
                    Escolha seus números
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.82rem",
                      color: MUTED,
                      mt: 0.2,
                    }}
                  >
                    Selecione um combo pronto para acelerar suas chances.
                  </Typography>
                </Box>
              </Stack>

              {/* Wrapper dark pro componente não “sumir” tanto */}
              <Box
                sx={{
                  borderRadius: 2,
                  bgcolor: GLASS_SOFT,
                  border: `1px solid ${BORDER}`,
                  p: 1.2,
                }}
              >
                <NumbersAdder />
              </Box>

              <Divider sx={{ my: 2, borderColor: BORDER }} />

              {/* Seletor [-] qty [+] + CTA inline */}
              <Box>
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="center"
                  sx={{ mb: 1.6 }}
                  spacing={1.4}
                >
                  <Button
                    onClick={decInline}
                    variant="outlined"
                    size="medium"
                    sx={{
                      minWidth: 56,
                      height: 48,
                      borderRadius: 2,
                      px: 0,
                      fontWeight: 900,
                      fontSize: "1.15rem",
                      borderColor: BORDER,
                      color: "rgba(255,255,255,0.88)",
                      bgcolor: "rgba(255,255,255,0.04)",
                      "&:hover": {
                        bgcolor: "rgba(255,255,255,0.06)",
                        borderColor: "rgba(255,255,255,0.18)",
                      },
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
                      borderRadius: 2,
                      border: `1px solid ${BORDER}`,
                      textAlign: "center",
                      bgcolor: "rgba(255,255,255,0.04)",
                    }}
                  >
                    <Typography
                      sx={{
                        fontWeight: 1000,
                        fontSize: "1.25rem",
                        color: "#fff",
                        letterSpacing: "-0.2px",
                      }}
                    >
                      {qty}
                    </Typography>
                    <Typography sx={{ fontSize: "0.72rem", color: MUTED, mt: 0.15 }}>
                      Números selecionados
                    </Typography>
                  </Box>

                  <Button
                    onClick={incInline}
                    variant="outlined"
                    size="medium"
                    sx={{
                      minWidth: 56,
                      height: 48,
                      borderRadius: 2,
                      px: 0,
                      fontWeight: 900,
                      fontSize: "1.15rem",
                      borderColor: BORDER,
                      color: "rgba(255,255,255,0.88)",
                      bgcolor: "rgba(255,255,255,0.04)",
                      "&:hover": {
                        bgcolor: "rgba(255,255,255,0.06)",
                        borderColor: "rgba(255,255,255,0.18)",
                      },
                    }}
                  >
                    +
                  </Button>
                </Stack>

                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ mt: 0.3 }}
                >
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: "0.78rem",
                        color: MUTED,
                      }}
                    >
                      Total
                    </Typography>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 1000,
                        fontSize: "1.06rem",
                        color: "#fff",
                        letterSpacing: "-0.2px",
                      }}
                    >
                      {formatBRL(totalInCents / 100)}
                    </Typography>

                    {!disabledInline && (
                      <Typography
                        sx={{
                          fontSize: "0.75rem",
                          color: "rgba(34,197,94,0.95)",
                          mt: 0.2,
                          fontWeight: 800,
                        }}
                      >
                        Pronto pra gerar o PIX ✅
                      </Typography>
                    )}
                  </Box>

                  <Button
                    variant="contained"
                    onClick={handleInlineBuy}
                    disabled={disabledInline}
                    sx={{
                      minWidth: 170,
                      height: 46,
                      borderRadius: 999,
                      fontWeight: 1000,
                      fontSize: "0.95rem",
                      textTransform: "none",
                      bgcolor: disabledInline ? "rgba(255,255,255,0.18)" : GREEN,
                      color: disabledInline
                        ? "rgba(255,255,255,0.65)"
                        : "#0B0F19",
                      boxShadow: disabledInline
                        ? "0 0 0 rgba(0,0,0,0)"
                        : "0px 10px 22px rgba(34,197,94,0.25)",
                      "&:hover": {
                        bgcolor: disabledInline
                          ? "rgba(255,255,255,0.18)"
                          : GREEN_DARK,
                      },
                    }}
                  >
                    {disabledInline ? `Mínimo ${MIN_QTY}` : "Concorrer agora"}
                  </Button>
                </Stack>

                <Button
                  variant="text"
                  fullWidth
                  size="small"
                  onClick={resetInline}
                  sx={{
                    mt: 0.9,
                    borderRadius: 999,
                    fontWeight: 800,
                    fontSize: "0.78rem",
                    color: "rgba(255,255,255,0.60)",
                    textTransform: "none",
                    "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
                  }}
                >
                  Zerar seleção
                </Button>
              </Box>
            </Box>
          </Paper>

          {/* Área do cliente */}
          <Paper
            elevation={0}
            sx={{
              mb: 2,
              p: 1.8,
              borderRadius: 3,
              bgcolor: GLASS,
              border: `1px solid ${BORDER}`,
              backdropFilter: "blur(10px)",
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 900,
                mb: 0.6,
                fontSize: "1.0rem",
                color: "#fff",
              }}
            >
              Área do cliente
            </Typography>
            <Typography
              variant="body2"
              sx={{
                mb: 1.4,
                fontSize: "0.82rem",
                color: MUTED,
              }}
            >
              Consulte suas compras, números e comprovantes sempre que quiser.
            </Typography>

            <Button
              variant="outlined"
              fullWidth
              sx={{
                borderRadius: 999,
                fontWeight: 900,
                fontSize: "0.92rem",
                textTransform: "none",
                borderColor: "rgba(255,255,255,0.22)",
                color: "rgba(255,255,255,0.88)",
                bgcolor: "rgba(255,255,255,0.04)",
                "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
              }}
              onClick={() => router.push("/compras")}
            >
              Minhas compras
            </Button>
          </Paper>

          {/* Prêmios da ação */}
          <Paper
            elevation={0}
            sx={{
              mb: 2,
              p: 1.8,
              borderRadius: 3,
              bgcolor: GLASS,
              border: `1px solid ${BORDER}`,
              backdropFilter: "blur(10px)",
            }}
          >
            <ActionPrizesCard />
          </Paper>

          {/* Como funciona */}
          <Paper
            elevation={0}
            sx={{
              mb: 2,
              p: 1.8,
              borderRadius: 3,
              bgcolor: GLASS,
              border: `1px solid ${BORDER}`,
              backdropFilter: "blur(10px)",
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 900,
                mb: 0.6,
                fontSize: "1.0rem",
                color: "#fff",
              }}
            >
              Como funciona a ação
            </Typography>

            <Typography
              variant="body2"
              sx={{
                mb: 1.2,
                fontSize: "0.82rem",
                color: MUTED,
              }}
            >
              É simples e rápido para participar. Veja os passos:
            </Typography>

            <Stack spacing={1.1} sx={{ fontSize: "0.8rem", color: TXT }}>
              {[
                {
                  t: "1. Escolha a quantidade de números",
                  d: "Use os combos prontos ou ajuste a quantidade ideal pra você.",
                },
                {
                  t: "2. Confirme e pague via Pix",
                  d: "O pagamento é instantâneo e 100% seguro, direto no seu banco.",
                },
                {
                  t: "3. Receba os números e acompanhe o sorteio",
                  d: "Seus números são enviados na hora e você acompanha tudo pelos canais oficiais.",
                },
              ].map((item, idx) => (
                <Stack key={idx} direction="row" spacing={1} alignItems="flex-start">
                  <Box
                    sx={{
                      mt: "5px",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: GREEN,
                      boxShadow: "0 0 0 6px rgba(34,197,94,0.08)",
                      flexShrink: 0,
                    }}
                  />
                  <Box>
                    <Typography sx={{ fontSize: "0.86rem", fontWeight: 900, color: "#fff" }}>
                      {item.t}
                    </Typography>
                    <Typography sx={{ fontSize: "0.80rem", color: MUTED, mt: 0.2 }}>
                      {item.d}
                    </Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Paper>

          {/* ✅ Progresso de vendas (MOVIDO PARA CIMA: agora vem ANTES de Ganhadores recentes) */}
          <Paper
            elevation={0}
            sx={{
              mb: 2,
              p: 1.8,
              borderRadius: 3,
              bgcolor: GLASS,
              border: `1px solid ${BORDER}`,
              backdropFilter: "blur(10px)",
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 900,
                mb: 0.8,
                fontSize: "1.0rem",
                color: "#fff",
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
                fontSize: "0.78rem",
                color: MUTED,
              }}
            >
              Restam apenas{" "}
              <strong style={{ color: "#fff" }}>1,9% dos títulos disponíveis</strong>.
              Garanta sua participação enquanto ainda há números liberados.
            </Typography>
          </Paper>

          {/* Ganhadores recentes */}
          <Paper
            elevation={0}
            sx={{
              mb: 2,
              p: 1.8,
              borderRadius: 3,
              bgcolor: GLASS,
              border: `1px solid ${BORDER}`,
              backdropFilter: "blur(10px)",
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 900,
                mb: 0.6,
                fontSize: "1.0rem",
                color: "#fff",
              }}
            >
              Ganhadores recentes
            </Typography>
            <Typography
              variant="body2"
              sx={{
                mb: 1.4,
                fontSize: "0.82rem",
                color: MUTED,
              }}
            >
              Confira alguns dos últimos prêmios entregues pelo Mc Poze e o Mc Oruam.
            </Typography>

            <WinnersList initialCount={4} />
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
