"use client"

import { useEffect, useState, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Container,
  Box,
  Paper,
  Typography,
  Button,
  Divider,
  Card,
  CardContent,
  Chip,
  Stack,
  Collapse,
} from "@mui/material"
import { Icon } from "@iconify/react"
import { useCartStore } from "@/store/cartStore"
import { formatBRL } from "@/lib/formatCurrency"
import OrderBumpCard from "../components/OrderBumpCard"

// Declaração do fbq e crypto para o TypeScript não reclamar
declare global {
  interface Window {
    fbq?: (...args: any[]) => void
    crypto?: Crypto & { randomUUID?: () => string }
  }
}

interface CustomerData {
  cpf: string
  nome: string
  email: string
  phone: string
  birthdate: string
}

export default function ConfirmacaoPage() {
  const router = useRouter()
  const [customer, setCustomer] = useState<CustomerData | null>(null)

  // pega do carrinho a quantidade e o total em centavos
  const { qty, totalInCents, bumpQty, bumpAmountInCents, addOrderBump } =
    useCartStore()

  const [detailsOpen, setDetailsOpen] = useState(false)

  // evita clique duplo no CTA (mobile nervoso)
  const confirmingRef = useRef(false)

  // ===========================
  // NUDGE + STICKY BUMP (conversão)
  // ===========================
  const bumpSectionRef = useRef<HTMLDivElement | null>(null)
  const bumpIsVisibleRef = useRef(true)

  const nudgedOnceRef = useRef(false)
  const [bumpAttention, setBumpAttention] = useState(false)
  const [nudgeMsgOpen, setNudgeMsgOpen] = useState(false)
  const [stickyBumpOpen, setStickyBumpOpen] = useState(false)
  const [stickyJustApplied, setStickyJustApplied] = useState(false)

  // params do bump (mantém alinhado com o OrderBumpCard)
  const BUMP_QTY = 50
  const BUMP_PRICE_CENTS = 990
  const isBumpApplied = useMemo(() => {
    return bumpQty >= BUMP_QTY && bumpAmountInCents >= BUMP_PRICE_CENTS
  }, [bumpQty, bumpAmountInCents])

  useEffect(() => {
    const customerData = localStorage.getItem("checkoutCustomer")
    if (!customerData) {
      router.replace("/dados")
      return
    }
    setCustomer(JSON.parse(customerData))
  }, [router])

  // IntersectionObserver para saber quando o OrderBump saiu da tela (mobile scroll)
  useEffect(() => {
    if (!bumpSectionRef.current) return

    const el = bumpSectionRef.current
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        const isVisible = !!entry?.isIntersecting
        bumpIsVisibleRef.current = isVisible

        // abre sticky só se:
        // - bump não aplicado
        // - ordem não está visível na tela
        // - usuário já rolou (observed naturalmente)
        if (!isBumpApplied && !isVisible) setStickyBumpOpen(true)
        if (isVisible) setStickyBumpOpen(false)
      },
      {
        root: null,
        threshold: 0.25,
      },
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [isBumpApplied])

  // se aplicar o bump, fecha sticky e qualquer nudge aberto
  useEffect(() => {
    if (isBumpApplied) {
      setStickyBumpOpen(false)
      setNudgeMsgOpen(false)
      setBumpAttention(false)
    }
  }, [isBumpApplied])

  const maskCPF = (cpf: string) => {
    const numbers = (cpf || "").replace(/\D/g, "")
    return `***.***.${numbers.slice(6, 9)}-**`
  }

  if (!customer) return null

  const totalReais = totalInCents / 100

  // 👉 Aqui é onde disparamos o InitiateCheckout no clique do botão
  const handleConfirm = () => {
    // ===========================
    // NUDGE 1x: se não pegou o bump
    // ===========================
    if (!isBumpApplied && !nudgedOnceRef.current) {
      nudgedOnceRef.current = true

      // libera o botão de novo (não vamos avançar)
      confirmingRef.current = false

      // abre mensagem e chama atenção no card
      setNudgeMsgOpen(true)
      setBumpAttention(true)

      // scroll suave até o order bump (mobile)
      try {
        bumpSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        })
      } catch {}

      // tira o glow após um tempo (não fica poluindo)
      window.setTimeout(() => setBumpAttention(false), 1600)
      window.setTimeout(() => setNudgeMsgOpen(false), 3200)

      return
    }

    if (confirmingRef.current) return
    confirmingRef.current = true

    // 1) Gera um eventId único no navegador
    let fbEventId: string | null = null

    try {
      if (
        typeof window !== "undefined" &&
        window.crypto &&
        typeof window.crypto.randomUUID === "function"
      ) {
        fbEventId = window.crypto.randomUUID()
      } else {
        fbEventId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
      }
    } catch {
      fbEventId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    }

    // 2) Guarda pra usar depois (tela de pagamento + Purchase)
    if (fbEventId && typeof window !== "undefined") {
      window.localStorage.setItem("lastFbEventId", fbEventId)
    }

    // 3) Evento do pixel no navegador com o MESMO eventID
    if (typeof window !== "undefined" && window.fbq) {
      try {
        if (fbEventId) {
          window.fbq(
            "track",
            "InitiateCheckout",
            {
              value: Number(totalReais.toFixed(2)),
              currency: "BRL",
              num_items: qty || 1,
            },
            { eventID: fbEventId },
          )
        } else {
          window.fbq("track", "InitiateCheckout", {
            value: Number(totalReais.toFixed(2)),
            currency: "BRL",
            num_items: qty || 1,
          })
        }
      } catch (e) {
        console.warn("Erro ao disparar fbq InitiateCheckout:", e)
      }
    }

    // 4) Continua o fluxo normal para a página de pagamento
    router.push("/pagamento")
  }

  const handleStickyAddBump = () => {
    if (isBumpApplied) return

    addOrderBump(BUMP_QTY, BUMP_PRICE_CENTS)
    setStickyJustApplied(true)
    window.setTimeout(() => setStickyJustApplied(false), 1600)

    // após aplicar, a store vai refletir e o sticky fecha via effect
  }

  // ---------- Tokens visuais (mesmo idioma do /pagamento) ----------
  const BG = "#0B0F19"
  const GLASS = "rgba(255,255,255,0.06)"
  const GLASS_BORDER = "rgba(255,255,255,0.10)"
  const TXT = "rgba(255,255,255,0.90)"
  const MUTED = "rgba(255,255,255,0.68)"
  const GREEN = "#22C55E"
  const GREEN_DARK = "#16A34A"

  // Reserva real pro CTA fixo (evita tampar OrderBump / cards)
  // + sticky bump (quando aparecer) — sem estourar no mobile
  const CTA_HEIGHT_PX = 140
  const STICKY_BUMP_HEIGHT_PX = 76

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: BG,
        backgroundImage:
          "radial-gradient(1200px 600px at 20% 10%, rgba(34,197,94,0.16), transparent 60%), radial-gradient(900px 500px at 90% 0%, rgba(245,158,11,0.12), transparent 55%)",
        pb: `calc(${CTA_HEIGHT_PX}px + ${STICKY_BUMP_HEIGHT_PX}px + env(safe-area-inset-bottom))`,

        // keyframes leves (sem libs)
        "@keyframes nudgeShake": {
          "0%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-4px)" },
          "40%": { transform: "translateX(4px)" },
          "60%": { transform: "translateX(-3px)" },
          "80%": { transform: "translateX(3px)" },
          "100%": { transform: "translateX(0)" },
        },
        "@keyframes nudgeGlow": {
          "0%": { boxShadow: "0 0 0 0 rgba(249,115,22,0.0)" },
          "35%": { boxShadow: "0 0 0 10px rgba(249,115,22,0.12)" },
          "100%": { boxShadow: "0 0 0 0 rgba(249,115,22,0.0)" },
        },
        "@keyframes popIn": {
          "0%": { transform: "translateY(6px)", opacity: 0 },
          "100%": { transform: "translateY(0)", opacity: 1 },
        },
        "@keyframes pulseSoft": {
          "0%": { transform: "scale(1)", filter: "brightness(1)" },
          "50%": { transform: "scale(1.012)", filter: "brightness(1.05)" },
          "100%": { transform: "scale(1)", filter: "brightness(1)" },
        },
      }}
    >
      <Container
        maxWidth="sm"
        sx={{
          pt: { xs: 2, sm: 3 },
          pb: 3,
          px: { xs: 2, sm: 0 },
        }}
      >
        {/* TOPBAR clean */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 2 }}
        >
          <Button
            onClick={() => router.back()}
            variant="text"
            sx={{
              textTransform: "none",
              px: 0,
              minWidth: "unset",
              color: TXT,
              fontWeight: 800,
            }}
            startIcon={<Icon icon="mdi:chevron-left" width={22} />}
          >
            Voltar
          </Button>

          <Chip
            label="Pagamento via PIX"
            size="small"
            sx={{
              bgcolor: "rgba(34,197,94,0.10)",
              color: GREEN,
              fontWeight: 900,
              borderRadius: 999,
              border: "1px solid rgba(34,197,94,0.22)",
            }}
          />
        </Stack>

        {/* HEADER */}
        <Box sx={{ mb: 2 }}>
          <Typography
            sx={{
              fontWeight: 1000,
              color: "#fff",
              lineHeight: 1.1,
              letterSpacing: "-0.4px",
              fontSize: { xs: "1.5rem", sm: "1.8rem" },
            }}
          >
            Confirmar compra
          </Typography>
          <Typography
            sx={{
              color: MUTED,
              mt: 0.7,
              fontSize: "0.92rem",
              lineHeight: 1.35,
            }}
          >
            Revise os dados e finalize. A confirmação do pagamento é instantânea
            no PIX.
          </Typography>
        </Box>

        {/* CARD PRINCIPAL (PIX + RESUMO) */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            border: `1px solid ${GLASS_BORDER}`,
            bgcolor: GLASS,
            backdropFilter: "blur(10px)",
            boxShadow: "0 12px 34px rgba(0,0,0,0.35)",
            overflow: "hidden",
          }}
        >
          {/* bloco pix */}
          <Box sx={{ p: 2.2 }}>
            <Stack direction="row" spacing={1.4} alignItems="center">
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: "14px",
                  bgcolor: "rgba(34,197,94,0.14)",
                  border: "1px solid rgba(34,197,94,0.22)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon icon="simple-icons:pix" width={26} color={GREEN} />
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 1000, color: "#fff", lineHeight: 1.1 }}>
                  PIX
                </Typography>
                <Typography sx={{ color: MUTED, fontSize: "0.78rem" }}>
                  Instantâneo, direto no seu banco
                </Typography>
              </Box>

              <Chip
                label="Selecionado"
                size="small"
                sx={{
                  bgcolor: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.88)",
                  fontWeight: 900,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              />
            </Stack>

            {/* resumo mini (limpo) */}
            <Box
              sx={{
                mt: 2,
                p: 1.6,
                borderRadius: 2,
                bgcolor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <Stack direction="row" alignItems="baseline" justifyContent="space-between">
                <Typography sx={{ color: "rgba(255,255,255,0.88)", fontWeight: 900 }}>
                  {qty} números
                </Typography>

                <Typography
                  sx={{
                    fontWeight: 1000,
                    color: GREEN,
                    letterSpacing: "-0.02em",
                    fontSize: "1.25rem",
                    lineHeight: 1,
                  }}
                >
                  {formatBRL(totalReais)}
                </Typography>
              </Stack>

              <Typography sx={{ color: MUTED, fontSize: "0.78rem", mt: 0.6 }}>
                Ao confirmar, você será direcionado para gerar o PIX.
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ borderColor: "rgba(255,255,255,0.10)" }} />

          {/* DADOS DO CLIENTE - colapsável */}
          <Box sx={{ p: 2.2 }}>
            <Button
              onClick={() => setDetailsOpen((s) => !s)}
              variant="text"
              fullWidth
              sx={{
                p: 0,
                textTransform: "none",
                justifyContent: "space-between",
                color: "#fff",
                fontWeight: 1000,
              }}
              endIcon={
                <Icon
                  icon={detailsOpen ? "mdi:chevron-up" : "mdi:chevron-down"}
                  width={22}
                />
              }
            >
              Dados do cliente
            </Button>

            <Typography sx={{ color: MUTED, fontSize: "0.78rem", mt: 0.4 }}>
              Toque para {detailsOpen ? "ocultar" : "ver"} detalhes
            </Typography>

            <Collapse in={detailsOpen}>
              <Box sx={{ mt: 1.6 }}>
                <Card
                  elevation={0}
                  sx={{
                    borderRadius: 2,
                    border: `1px solid ${GLASS_BORDER}`,
                    bgcolor: "rgba(255,255,255,0.04)",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  <CardContent sx={{ p: 2 }}>
                    <Stack spacing={1.1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Icon icon="mdi:account" width={18} color="#60A5FA" />
                        <Typography sx={{ fontWeight: 1000, color: "#fff" }}>
                          {customer.nome}
                        </Typography>
                      </Stack>

                      <Typography sx={{ color: "rgba(255,255,255,0.82)", fontSize: "0.9rem" }}>
                        <strong>CPF:</strong> {maskCPF(customer.cpf)}
                      </Typography>
                      <Typography sx={{ color: "rgba(255,255,255,0.82)", fontSize: "0.9rem" }}>
                        <strong>Email:</strong> {customer.email}
                      </Typography>
                      <Typography sx={{ color: "rgba(255,255,255,0.82)", fontSize: "0.9rem" }}>
                        <strong>Celular:</strong> {customer.phone}
                      </Typography>

                      <Button
                        onClick={() => router.push("/dados")}
                        variant="outlined"
                        sx={{
                          mt: 1,
                          borderRadius: 999,
                          textTransform: "none",
                          fontWeight: 900,
                          py: 1.05,
                          borderColor: "rgba(255,255,255,0.22)",
                          color: "rgba(255,255,255,0.88)",
                          bgcolor: "rgba(255,255,255,0.04)",
                          "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
                        }}
                        startIcon={<Icon icon="mdi:pencil" width={18} />}
                      >
                        Editar dados
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Box>
            </Collapse>
          </Box>
        </Paper>

        {/* ORDER BUMP */}
        <Box
          ref={bumpSectionRef}
          sx={{
            mt: 2,
            borderRadius: 3,
            // nudge 1x: shake + glow
            animation: bumpAttention ? "nudgeShake 520ms ease-in-out" : "none",
            boxShadow: bumpAttention ? "0 0 0 0 rgba(0,0,0,0)" : "none",
            position: "relative",
            "&::after": bumpAttention
              ? {
                  content: '""',
                  position: "absolute",
                  inset: -2,
                  borderRadius: 14,
                  pointerEvents: "none",
                  animation: "nudgeGlow 900ms ease-out",
                }
              : {},
          }}
        >
          {/* mensagem rápida (aparece só no nudge) */}
          <Collapse in={nudgeMsgOpen} timeout={200}>
            <Box
              sx={{
                mb: 1.2,
                borderRadius: 3,
                p: 1.2,
                bgcolor: "rgba(249,115,22,0.10)",
                border: "1px solid rgba(249,115,22,0.25)",
                backdropFilter: "blur(10px)",
                animation: "popIn 220ms ease-out",
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    bgcolor: "rgba(249,115,22,0.16)",
                    border: "1px solid rgba(249,115,22,0.22)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon icon="mdi:alert-circle-outline" width={16} color="#FDBA74" />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ color: "#fff", fontWeight: 1000, fontSize: "0.86rem", lineHeight: 1.15 }}>
                    Última chance antes do PIX
                  </Typography>
                  <Typography sx={{ color: "rgba(255,255,255,0.72)", fontSize: "0.78rem", mt: 0.1 }}>
                    Por <strong>R$ 9,90</strong> você leva <strong>+50 números</strong> agora. Depois some.
                  </Typography>
                </Box>
              </Stack>
            </Box>
          </Collapse>

          <OrderBumpCard />
        </Box>

        {/* dica (dark) */}
        <Box
          sx={{
            mt: 2,
            p: 1.6,
            borderRadius: 3,
            bgcolor: "rgba(255,255,255,0.05)",
            border: `1px solid ${GLASS_BORDER}`,
            backdropFilter: "blur(10px)",
          }}
        >
          <Stack direction="row" spacing={1.2} alignItems="flex-start">
            <Box
              sx={{
                width: 26,
                height: 26,
                borderRadius: "999px",
                bgcolor: "rgba(34,197,94,0.16)",
                border: "1px solid rgba(34,197,94,0.22)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                mt: 0.1,
              }}
            >
              <Icon icon="mdi:shield-check" width={16} color={GREEN} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 1000, color: "#fff", fontSize: "0.92rem" }}>
                Dica rápida
              </Typography>
              <Typography sx={{ color: MUTED, fontSize: "0.82rem", mt: 0.2, lineHeight: 1.35 }}>
                No PIX, a confirmação é automática. Depois de pagar, só aguarde na tela.
              </Typography>
            </Box>
          </Stack>
        </Box>

        {/* spacer extra (garantia anti-tampa em alguns Androids) */}
        <Box sx={{ height: 10 }} />
      </Container>

      {/* STICKY MINI BUMP (aparece quando o OrderBump sai da tela) */}
      <Collapse in={stickyBumpOpen && !isBumpApplied} timeout={200}>
        <Box
          sx={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: `calc(${CTA_HEIGHT_PX}px + env(safe-area-inset-bottom))`,
            zIndex: 1400,
            px: 2,
            pb: 1.0,
          }}
        >
          <Container maxWidth="sm" sx={{ px: { xs: 0, sm: 0 } }}>
            <Paper
              elevation={0}
              sx={{
                borderRadius: 999,
                border: "1px solid rgba(249,115,22,0.25)",
                bgcolor: "rgba(17,24,39,0.72)",
                backdropFilter: "blur(14px)",
                boxShadow: "0 12px 28px rgba(0,0,0,0.38)",
                overflow: "hidden",
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                spacing={1.2}
                sx={{ px: 1.4, py: 1.0 }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                  <Box
                    sx={{
                      width: 30,
                      height: 30,
                      borderRadius: 999,
                      bgcolor: "rgba(249,115,22,0.14)",
                      border: "1px solid rgba(249,115,22,0.22)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon icon="mdi:rocket-launch" width={16} color="#FDBA74" />
                  </Box>

                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      sx={{
                        color: "#fff",
                        fontWeight: 1000,
                        fontSize: "0.84rem",
                        lineHeight: 1.1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      Oferta rápida: +{BUMP_QTY} por {formatBRL(BUMP_PRICE_CENTS / 100)}
                    </Typography>
                    <Typography sx={{ color: "rgba(255,255,255,0.72)", fontSize: "0.74rem" }}>
                      1 toque e aumenta suas chances
                    </Typography>
                  </Box>
                </Stack>

                <Button
                  onClick={handleStickyAddBump}
                  variant="contained"
                  sx={{
                    borderRadius: 999,
                    textTransform: "none",
                    fontWeight: 1000,
                    px: 1.6,
                    py: 0.9,
                    minWidth: 128,
                    bgcolor: "#F97316",
                    color: "#0B0F19",
                    "&:hover": { bgcolor: "#FB923C" },
                    animation: stickyJustApplied ? "none" : "pulseSoft 1.7s ease-in-out infinite",
                  }}
                  startIcon={
                    stickyJustApplied ? (
                      <Icon icon="mdi:check-circle" width={18} />
                    ) : (
                      <Icon icon="mdi:plus" width={18} />
                    )
                  }
                >
                  {stickyJustApplied ? "Adicionado" : "Adicionar"}
                </Button>
              </Stack>
            </Paper>
          </Container>
        </Box>
      </Collapse>

      {/* CTA FIXO (mesmo padrão do /pagamento) */}
      <Box
        sx={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: "rgba(11,15,25,0.78)",
          backdropFilter: "blur(14px)",
          borderTop: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 -10px 28px rgba(0,0,0,0.45)",
          pt: 1.2,
          pb: `calc(1.2rem + env(safe-area-inset-bottom))`,
          zIndex: 1300,
        }}
      >
        <Container maxWidth="sm" sx={{ px: { xs: 2, sm: 0 } }}>
          <Stack spacing={1}>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline">
              <Typography sx={{ color: MUTED, fontSize: "0.78rem" }}>Total</Typography>
              <Typography
                sx={{
                  fontWeight: 1000,
                  color: "#fff",
                  fontSize: "1.15rem",
                  letterSpacing: "-0.02em",
                }}
              >
                {formatBRL(totalReais)}
              </Typography>
            </Stack>

            <Button
              onClick={handleConfirm}
              variant="contained"
              fullWidth
              sx={{
                fontWeight: 1000,
                borderRadius: 999,
                py: 1.15,
                fontSize: "1rem",
                textTransform: "none",
                letterSpacing: 0.2,
                bgcolor: GREEN,
                "&:hover": { bgcolor: GREEN_DARK },
              }}
              endIcon={<Icon icon="mdi:arrow-right" width={22} />}
            >
              Confirmar e gerar PIX
            </Button>

            <Button
              onClick={() => router.push("/")}
              variant="text"
              fullWidth
              sx={{
                textTransform: "none",
                fontWeight: 800,
                color: "rgba(255,255,255,0.88)",
                fontSize: "0.85rem",
              }}
            >
              Voltar para o início
            </Button>
          </Stack>
        </Container>
      </Box>
    </Box>
  )
}
