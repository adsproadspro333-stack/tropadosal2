"use client"

import { useEffect, useMemo, useState, useCallback, memo } from "react"
import dynamic from "next/dynamic"
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
import NumbersAdder from "./components/NumbersAdder"

import { trackViewContent } from "@/lib/fbq"
import { useCartStore } from "@/store/cartStore"
import { formatBRL } from "@/lib/formatCurrency"

// -----------------------------
// ✅ Conteúdo estático (fora do render)
// -----------------------------
const MIN_QTY = 3

const HOW_IT_WORKS = [
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
] as const

// -----------------------------
// ✅ Dynamic imports (abaixo da dobra)
// -----------------------------
const WinnersList = dynamic(() => import("./components/WinnersList"), {
  ssr: false,
  loading: () => (
    <Box sx={{ py: 2 }}>
      <Typography sx={{ fontSize: "0.82rem", opacity: 0.7 }}>
        Carregando ganhadores...
      </Typography>
    </Box>
  ),
})

const SalesProgress = dynamic(() => import("./components/SalesProgress"), {
  ssr: false,
  loading: () => (
    <Box sx={{ py: 2 }}>
      <Typography sx={{ fontSize: "0.82rem", opacity: 0.7 }}>
        Carregando progresso...
      </Typography>
    </Box>
  ),
})

const ActionPrizesCard = dynamic(() => import("./components/ActionPrizesCard"), {
  ssr: false,
  loading: () => (
    <Box sx={{ py: 2 }}>
      <Typography sx={{ fontSize: "0.82rem", opacity: 0.7 }}>
        Carregando prêmios...
      </Typography>
    </Box>
  ),
})

const FooterLegal = dynamic(() => import("./components/FooterLegal"), {
  ssr: false,
  loading: () => (
    <Box sx={{ py: 2 }}>
      <Typography sx={{ fontSize: "0.78rem", opacity: 0.55 }}>
        Carregando...
      </Typography>
    </Box>
  ),
})

const SocialProofNotifications = dynamic(
  () => import("./components/SocialProofNotifications"),
  {
    ssr: false,
    loading: () => null,
  },
)

// -----------------------------
// ✅ Util: modo leve automático
// -----------------------------
function getAutoLiteMode(): boolean {
  if (typeof window === "undefined") return false

  try {
    const nav = navigator as any

    const dm = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null
    const hc =
      typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null

    const saveData =
      typeof nav.connection?.saveData === "boolean" ? nav.connection.saveData : false

    const reducedMotion =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")?.matches
        : false

    return Boolean(
      (dm !== null && dm <= 3) ||
        (hc !== null && hc <= 4) ||
        saveData ||
        reducedMotion,
    )
  } catch {
    return false
  }
}

// -----------------------------
// ✅ Seções memorizadas
// -----------------------------
type Tokens = {
  BG: string
  GLASS: string
  GLASS_SOFT: string
  BORDER: string
  TXT: string
  MUTED: string
  GREEN: string
  GREEN_DARK: string
  isLite: boolean
}

const CustomerAreaCard = memo(function CustomerAreaCard({
  tokens,
  onGoPurchases,
}: {
  tokens: Tokens
  onGoPurchases: () => void
}) {
  const { GLASS, BORDER, MUTED } = tokens

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 2,
        p: 1.8,
        borderRadius: 3,
        bgcolor: GLASS,
        border: `1px solid ${BORDER}`,
        backdropFilter: tokens.isLite ? "none" : "blur(10px)",
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
        onClick={onGoPurchases}
      >
        Minhas compras
      </Button>
    </Paper>
  )
})

const HowItWorksCard = memo(function HowItWorksCard({ tokens }: { tokens: Tokens }) {
  const { GLASS, BORDER, TXT, MUTED, GREEN } = tokens

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 2,
        p: 1.8,
        borderRadius: 3,
        bgcolor: GLASS,
        border: `1px solid ${BORDER}`,
        backdropFilter: tokens.isLite ? "none" : "blur(10px)",
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
        {HOW_IT_WORKS.map((item, idx) => (
          <Stack key={idx} direction="row" spacing={1} alignItems="flex-start">
            <Box
              sx={{
                mt: "5px",
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: GREEN,
                boxShadow: tokens.isLite ? "none" : "0 0 0 6px rgba(34,197,94,0.08)",
                flexShrink: 0,
              }}
            />
            <Box>
              <Typography
                sx={{ fontSize: "0.86rem", fontWeight: 900, color: "#fff" }}
              >
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
  )
})

const SalesProgressCard = memo(function SalesProgressCard({ tokens }: { tokens: Tokens }) {
  const { GLASS, BORDER, MUTED } = tokens

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 2,
        p: 1.8,
        borderRadius: 3,
        bgcolor: GLASS,
        border: `1px solid ${BORDER}`,
        backdropFilter: tokens.isLite ? "none" : "blur(10px)",
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
  )
})

const WinnersCard = memo(function WinnersCard({ tokens }: { tokens: Tokens }) {
  const { GLASS, BORDER, MUTED } = tokens

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 2,
        p: 1.8,
        borderRadius: 3,
        bgcolor: GLASS,
        border: `1px solid ${BORDER}`,
        backdropFilter: tokens.isLite ? "none" : "blur(10px)",
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
  )
})

const ActionPrizesWrapper = memo(function ActionPrizesWrapper({
  tokens,
}: {
  tokens: Tokens
}) {
  const { GLASS, BORDER } = tokens

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 2,
        p: 1.8,
        borderRadius: 3,
        bgcolor: GLASS,
        border: `1px solid ${BORDER}`,
        backdropFilter: tokens.isLite ? "none" : "blur(10px)",
      }}
    >
      <ActionPrizesCard />
    </Paper>
  )
})

export default function HomePage() {
  const router = useRouter()

  // ✅ CORREÇÃO CRÍTICA:
  // Não retorna objeto novo no selector do Zustand (isso quebra getServerSnapshot no Next/React novo)
  const qty = useCartStore((s) => s.qty)
  const totalInCents = useCartStore((s) => s.totalInCents)
  const handleChangeQuantity = useCartStore((s) => s.handleChangeQuantity)
  const clearCart = useCartStore((s) => s.clearCart)

  const disabledInline = qty < MIN_QTY

  // ✅ Modo leve: detecta uma vez e aplica
  const [isLite, setIsLite] = useState(false)
  useEffect(() => {
    setIsLite(getAutoLiteMode())
  }, [])

  // ✅ Montagem tardia de blocos abaixo da dobra (e Social Proof)
  const [mountBelowFold, setMountBelowFold] = useState(false)
  const [mountSocialProof, setMountSocialProof] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    const delay = isLite ? 900 : 250
    const socialDelay = isLite ? 2200 : 900

    let t1: any = null
    let t2: any = null
    let idleId1: any = null
    let idleId2: any = null

    const runIdle = (cb: () => void, timeout: number) => {
      const w = window as any
      if (typeof w.requestIdleCallback === "function") {
        return w.requestIdleCallback(cb, { timeout })
      }
      return null
    }

    const cbBelow = () => setMountBelowFold(true)
    const cbSocial = () => setMountSocialProof(true)

    idleId1 = runIdle(cbBelow, isLite ? 1800 : 1000)
    idleId2 = runIdle(cbSocial, isLite ? 2600 : 1600)

    if (!idleId1) t1 = setTimeout(cbBelow, delay)
    if (!idleId2) t2 = setTimeout(cbSocial, socialDelay)

    return () => {
      if (t1) clearTimeout(t1)
      if (t2) clearTimeout(t2)
      const w = window as any
      if (idleId1 && typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(idleId1)
      if (idleId2 && typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(idleId2)
    }
  }, [isLite])

  // 🔹 1) Evento de ViewContent
  useEffect(() => {
    const eventId = Date.now().toString() + "-" + Math.random().toString(36).slice(2)

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
  const incInline = useCallback(() => {
    handleChangeQuantity(qty + 1)
  }, [handleChangeQuantity, qty])

  const decInline = useCallback(() => {
    const next = Math.max(0, qty - 1)
    handleChangeQuantity(next)
  }, [handleChangeQuantity, qty])

  const resetInline = useCallback(() => {
    clearCart()
  }, [clearCart])

  const handleInlineBuy = useCallback(() => {
    if (disabledInline) return
    router.push("/dados")
  }, [disabledInline, router])

  const onGoPurchases = useCallback(() => {
    router.push("/compras")
  }, [router])

  // ---------- TOKENS VISUAIS (modo premium vs modo leve) ----------
  const tokens: Tokens = useMemo(() => {
    const BG = "#0B0F19"
    const GLASS = isLite ? "rgba(17,24,39,0.92)" : "rgba(255,255,255,0.06)"
    const GLASS_SOFT = isLite ? "rgba(17,24,39,0.72)" : "rgba(255,255,255,0.04)"
    const BORDER = "rgba(255,255,255,0.10)"
    const TXT = "rgba(255,255,255,0.92)"
    const MUTED = "rgba(255,255,255,0.68)"
    const GREEN = "#22C55E"
    const GREEN_DARK = "#16A34A"

    return { BG, GLASS, GLASS_SOFT, BORDER, TXT, MUTED, GREEN, GREEN_DARK, isLite }
  }, [isLite])

  // Gradiente pesado só em device bom
  const bgImage = tokens.isLite
    ? "none"
    : "radial-gradient(1200px 600px at 20% 10%, rgba(34,197,94,0.16), transparent 60%), radial-gradient(900px 500px at 90% 0%, rgba(245,158,11,0.12), transparent 55%)"

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: tokens.BG,
        display: "flex",
        justifyContent: "center",
        backgroundImage: bgImage,
      }}
    >
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
          <Paper
            elevation={0}
            sx={{
              mb: 2,
              borderRadius: 3,
              bgcolor: tokens.GLASS,
              border: `1px solid ${tokens.BORDER}`,
              backdropFilter: tokens.isLite ? "none" : "blur(10px)",
              boxShadow: tokens.isLite
                ? "0 10px 20px rgba(0,0,0,0.22)"
                : "0 18px 42px rgba(0,0,0,0.38)",
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                bgcolor: "rgba(0,0,0,0.15)",
                borderBottom: `1px solid ${tokens.BORDER}`,
              }}
            >
              <HeroBanner />
            </Box>

            <Box sx={{ p: 1.8, pt: 1.5 }}>
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
                      color: tokens.MUTED,
                      mt: 0.2,
                    }}
                  >
                    Selecione um combo pronto para acelerar suas chances.
                  </Typography>
                </Box>
              </Stack>

              <Box
                sx={{
                  borderRadius: 2,
                  bgcolor: tokens.GLASS_SOFT,
                  border: `1px solid ${tokens.BORDER}`,
                  p: 1.2,
                }}
              >
                <NumbersAdder />
              </Box>

              <Divider sx={{ my: 2, borderColor: tokens.BORDER }} />

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
                      borderColor: tokens.BORDER,
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
                      border: `1px solid ${tokens.BORDER}`,
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
                    <Typography sx={{ fontSize: "0.72rem", color: tokens.MUTED, mt: 0.15 }}>
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
                      borderColor: tokens.BORDER,
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
                        color: tokens.MUTED,
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
                      bgcolor: disabledInline ? "rgba(255,255,255,0.18)" : tokens.GREEN,
                      color: disabledInline ? "rgba(255,255,255,0.65)" : "#0B0F19",
                      boxShadow: disabledInline
                        ? "0 0 0 rgba(0,0,0,0)"
                        : tokens.isLite
                          ? "0px 6px 14px rgba(34,197,94,0.18)"
                          : "0px 10px 22px rgba(34,197,94,0.25)",
                      "&:hover": {
                        bgcolor: disabledInline
                          ? "rgba(255,255,255,0.18)"
                          : tokens.GREEN_DARK,
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

          {mountBelowFold ? (
            <>
              <CustomerAreaCard tokens={tokens} onGoPurchases={onGoPurchases} />
              <ActionPrizesWrapper tokens={tokens} />
              <HowItWorksCard tokens={tokens} />
              <SalesProgressCard tokens={tokens} />
              <WinnersCard tokens={tokens} />
              <FooterLegal />
            </>
          ) : (
            <Box sx={{ opacity: 0.7 }}>
              <Paper
                elevation={0}
                sx={{
                  mb: 2,
                  p: 1.8,
                  borderRadius: 3,
                  bgcolor: tokens.GLASS,
                  border: `1px solid ${tokens.BORDER}`,
                }}
              >
                <Typography sx={{ fontSize: "0.86rem", color: tokens.MUTED }}>
                  Carregando detalhes…
                </Typography>
              </Paper>
            </Box>
          )}
        </Container>
      </Box>

      {mountSocialProof ? <SocialProofNotifications /> : null}
    </Box>
  )
}
