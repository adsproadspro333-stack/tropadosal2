// app/pagamento-confirmado/PagamentoConfirmadoClient.tsx
"use client"

import { useEffect, useMemo, useState, useRef } from "react"
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
  Divider,
  Chip,
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

  numbers?: Array<string | number>
  tickets?: Array<string | number>
  chosenNumbers?: Array<string | number>
}

const UPSELL_OPTIONS = [
  {
    id: "turbo",
    label: "Aumentar 10X a sorte",
    qty: 100,
    priceCents: 990,
    note: "Adicione números extras agora, sem refazer pagamento.",
    badge: "Rápido",
    badgeTone: "neutral" as const,
  },
  {
    id: "elite",
    label: "Aumentar 20X a sorte",
    qty: 200,
    priceCents: 1990,
    note: "Mais chances com melhor custo-benefício do dia.",
    badge: "Melhor escolha",
    badgeTone: "green" as const,
  },
  {
    id: "dominator",
    label: "Aumentar 50X a sorte",
    qty: 300,
    priceCents: 3990,
    note: "Pacote forte pra quem quer entrar pesado no sorteio.",
    badge: "Mais popular",
    badgeTone: "red" as const,
  },
]

// ✅ Upsell cache (lido pelo /pagamento)
const LS_UPSELL_KEY = "checkout_upsell_payload_v1"
const UPSELL_TTL_MS = 10 * 60 * 1000

// ✅ Mesmas chaves usadas no /pagamento
const LS_PENDING_KEY = "pix_pending_payload_v1"
const SS_PAID_PREFIX = "paid_order_v1:" // sessionStorage

// ✅ Gate Minhas Compras (sessão)
const SS_MINHAS_GATE_PREFIX = "pc_gate_minhas_v1:" // sessionStorage
const MINHAS_COMPRAS_PATH = "/compras"

type UpsellCache = {
  qty: number
  priceCents: number
  createdAt: number
  baseOrderId?: string | null
  optId?: string | null
  nonce?: string | null
}

function coerceNumbersFromOrder(order: OrderDTO | null) {
  if (!order) return []
  const raw = (order.numbers as any) || (order.tickets as any) || (order.chosenNumbers as any)
  if (!Array.isArray(raw)) return []
  return raw.map((x) => String(x).trim()).filter(Boolean)
}

function formatQtyLabel(qty: number) {
  if (!Number.isFinite(qty) || qty <= 0) return "+0 números"
  return `+${qty} números extras`
}

function safeNumber(n: any) {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

function getStorageKey(prefix: string, orderId: string) {
  return `${prefix}:${orderId}`
}

function paidKey(orderId: string) {
  return `${SS_PAID_PREFIX}${String(orderId || "").trim()}`
}

function markOrderPaidSession(orderId: string | null | undefined) {
  try {
    if (typeof window === "undefined") return
    const id = String(orderId || "").trim()
    if (!id) return
    sessionStorage.setItem(paidKey(id), "1")
  } catch {}
}

function clearPendingPixCache() {
  try {
    if (typeof window === "undefined") return
    localStorage.removeItem(LS_PENDING_KEY)
  } catch {}
}

function gateKey(orderId: string) {
  return `${SS_MINHAS_GATE_PREFIX}${String(orderId || "").trim()}`
}

function getMinhasGate(orderId: string) {
  try {
    if (typeof window === "undefined") return false
    return sessionStorage.getItem(gateKey(orderId)) === "1"
  } catch {
    return false
  }
}

function setMinhasGate(orderId: string) {
  try {
    if (typeof window === "undefined") return
    sessionStorage.setItem(gateKey(orderId), "1")
  } catch {}
}

// Tipagem mínima do fbq sem depender de lib
declare global {
  interface Window {
    fbq?: (...args: any[]) => void
  }
}

export default function PagamentoConfirmadoClient({ orderIdFromSearch }: Props) {
  const router = useRouter()
  const { prepareUpsellOrder } = useCartStore()

  const [order, setOrder] = useState<OrderDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState("dominator")

  // ✅ trava clique duplo / spam
  const [upsellSubmittingId, setUpsellSubmittingId] = useState<string | null>(null)

  // ✅ evita “voltar pro front e disparar fluxo novo”
  const antiNavArmedRef = useRef(false)

  // ✅ refs pra scroll / destaque
  const upsellRef = useRef<HTMLDivElement | null>(null)
  const [flashUpsell, setFlashUpsell] = useState(false)

  // ⏱️ Timer total (3:30)
  const TOTAL_TIME = 210
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_TIME)

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = String(secondsLeft % 60).padStart(2, "0")
  const progress = (secondsLeft / TOTAL_TIME) * 100

  // ✅ 1) Resolve orderId e "ancora" o pós-pago + limpa pendências
  useEffect(() => {
    async function load() {
      try {
        if (typeof window === "undefined") return

        const orderId =
          orderIdFromSearch ||
          localStorage.getItem("lastPaidOrderId") ||
          localStorage.getItem("lastOrderId")

        if (!orderId) {
          setLoading(false)
          router.replace("/")
          return
        }

        // ✅ âncora forte
        localStorage.setItem("lastPaidOrderId", String(orderId))
        markOrderPaidSession(String(orderId))

        // ✅ limpa pendência de PIX pra não “ressuscitar”
        clearPendingPixCache()

        // ✅ também “zera” qualquer upsell velho (não atrapalha um novo clique)
        try {
          const raw = localStorage.getItem(LS_UPSELL_KEY)
          if (raw) {
            const parsed = JSON.parse(raw)
            const createdAt = Number(parsed?.createdAt || 0)
            if (!createdAt || Date.now() - createdAt > UPSELL_TTL_MS) {
              localStorage.removeItem(LS_UPSELL_KEY)
            }
          }
        } catch {}

        const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" })
        const data = await res.json().catch(() => null)

        if (!res.ok || !data?.id) {
          setLoading(false)
          setOrder({ id: String(orderId), amount: 0, quantity: 0 } as any)
          return
        }

        setOrder(data)
        setLoading(false)
      } catch {
        setLoading(false)
      }
    }

    load()
  }, [orderIdFromSearch, router])

  // ✅ 2) Cadeado anti-voltar/anti-refresh (webview/histórico)
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!order?.id) return

    if (!antiNavArmedRef.current) {
      antiNavArmedRef.current = true
      try {
        window.history.pushState({ __paid_ok: true }, "", window.location.href)
      } catch {}
    }

    const onPopState = () => {
      try {
        window.history.pushState({ __paid_ok: true }, "", window.location.href)
      } catch {}
    }

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
      return ""
    }

    window.addEventListener("popstate", onPopState)
    window.addEventListener("beforeunload", onBeforeUnload)

    return () => {
      window.removeEventListener("popstate", onPopState)
      window.removeEventListener("beforeunload", onBeforeUnload)
    }
  }, [order?.id])

  // ✅ Dispara Purchase no browser (fbq) com dedupe por event_id
  useEffect(() => {
    if (!order?.id) return
    if (typeof window === "undefined") return

    const orderId = String(order.id)

    const cachedKey = `metaEventId:${orderId}`
    const cached = (localStorage.getItem(cachedKey) || "").trim()
    const lastFbEventId = (localStorage.getItem("lastFbEventId") || "").trim()

    const eventId = String(
      (order.metaEventId && String(order.metaEventId).trim()) || cached || lastFbEventId || orderId,
    ).trim()

    try {
      if (eventId) localStorage.setItem(cachedKey, eventId)
    } catch {}

    const sentKey = getStorageKey("fbq_purchase_sent", `${orderId}:${eventId}`)
    const retryKey = getStorageKey("capi_purchase_retry_called", orderId)

    function firePurchaseOnce() {
      try {
        if (!window.fbq) return

        const already = sessionStorage.getItem(sentKey)
        if (already) return

        const value = safeNumber(order.amount)

        window.fbq("track", "Purchase", { value, currency: "BRL" }, { eventID: eventId })

        sessionStorage.setItem(sentKey, "1")
      } catch (e) {
        console.error("fbq Purchase error:", e)
      }
    }

    async function retryCapiPurchase() {
      try {
        if (order.metaEventId) return

        const already = sessionStorage.getItem(retryKey)
        if (already) return

        await fetch("/api/meta/purchase-retry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        })

        sessionStorage.setItem(retryKey, "1")
      } catch (e) {
        console.log("CAPI retry skipped/failed:", e)
      }
    }

    firePurchaseOnce()
    retryCapiPurchase()
  }, [order])

  const numbers = useMemo(() => coerceNumbersFromOrder(order), [order])
  const numbersPreview = useMemo(() => numbers.slice(0, 8), [numbers])
  const hasNumbersPreview = numbersPreview.length > 0

  // ---------- TOKENS VISUAIS ----------
  const BG = "#0B0F19"
  const GLASS = "rgba(255,255,255,0.06)"
  const BORDER = "rgba(255,255,255,0.10)"
  const MUTED = "rgba(255,255,255,0.68)"
  const GREEN = "#22C55E"
  const RED = "#DC2626"
  const RED_DARK = "#B91C1C"

  function persistUpsell(opt: { qty: number; priceCents: number; optId?: string }, baseOrderId: string) {
    try {
      if (typeof window === "undefined") return

      localStorage.removeItem(LS_UPSELL_KEY)

      const payload: UpsellCache = {
        qty: Math.round(Number(opt.qty || 0)),
        priceCents: Math.round(Number(opt.priceCents || 0)),
        createdAt: Date.now(),
        baseOrderId: baseOrderId || null,
        optId: opt.optId || null,
        nonce: (globalThis.crypto as any)?.randomUUID
          ? (globalThis.crypto as any).randomUUID()
          : String(Date.now()),
      }

      localStorage.setItem(LS_UPSELL_KEY, JSON.stringify(payload))

      // debug (opcional)
      localStorage.setItem("lastUpsellBaseOrderId", String(baseOrderId || ""))
      localStorage.setItem("lastUpsellPriceCents", String(payload.priceCents))
      localStorage.setItem("lastUpsellQty", String(payload.qty))
      localStorage.setItem("lastUpsellOptId", String(payload.optId || ""))
      localStorage.setItem("lastUpsellNonce", String(payload.nonce || ""))
    } catch {}
  }

  function goToUpsellPayment(opt: { id: string; qty: number; priceCents: number }) {
    if (!order?.id) return
    if (secondsLeft <= 0) return

    if (upsellSubmittingId) return
    setUpsellSubmittingId(opt.id)

    try {
      prepareUpsellOrder(opt.qty, opt.priceCents)
    } catch {}

    persistUpsell({ qty: opt.qty, priceCents: opt.priceCents, optId: opt.id }, order.id)

    const qs = new URLSearchParams()
    qs.set("upsell", "1")
    qs.set("orderId", String(order.id))
    qs.set("qty", String(opt.qty))
    qs.set("priceCents", String(opt.priceCents))
    qs.set("optId", String(opt.id))

    const target = `/pagamento?${qs.toString()}`

    let pushed = false
    try {
      router.push(target)
      pushed = true
    } catch {}

    if (typeof window !== "undefined") {
      setTimeout(() => {
        if (window.location.pathname.includes("/pagamento-confirmado")) {
          window.location.href = target
        }
      }, pushed ? 180 : 50)

      setTimeout(() => {
        if (window.location.pathname.includes("/pagamento-confirmado")) {
          setUpsellSubmittingId(null)
        }
      }, 2500)
    }
  }

  function scrollToUpsell() {
    try {
      upsellRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    } catch {}
    setFlashUpsell(true)
    setTimeout(() => setFlashUpsell(false), 1200)
  }

  function handleMinhasComprasClick() {
    if (!order?.id) {
      router.push(MINHAS_COMPRAS_PATH)
      return
    }

    const id = String(order.id)
    const alreadyGated = getMinhasGate(id)

    if (!alreadyGated) {
      // ✅ 1º clique: força o upsell
      setMinhasGate(id)
      scrollToUpsell()
      return
    }

    // ✅ 2º clique: libera Minhas Compras
    router.push(MINHAS_COMPRAS_PATH)
  }

  if (loading || !order) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: BG,
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
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: BG,
        pb: 6,
        backgroundImage:
          "radial-gradient(1200px 600px at 20% 10%, rgba(34,197,94,0.14), transparent 60%), radial-gradient(900px 500px at 90% 0%, rgba(220,38,38,0.10), transparent 55%)",
      }}
    >
      <Container maxWidth="sm" sx={{ py: { xs: 2.2, sm: 4 } }}>
        {/* ✅ CONFIRMAÇÃO */}
        <Paper
          elevation={0}
          sx={{
            p: 2.6,
            borderRadius: 3,
            textAlign: "center",
            mb: 2,
            bgcolor: GLASS,
            border: `1px solid ${BORDER}`,
            backdropFilter: "blur(10px)",
            boxShadow: "0 18px 42px rgba(0,0,0,0.38)",
          }}
        >
          <Box
            sx={{
              width: 64,
              height: 64,
              mx: "auto",
              mb: 1.6,
              borderRadius: "50%",
              bgcolor: "rgba(34,197,94,0.14)",
              border: "1px solid rgba(34,197,94,0.28)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 18px 44px rgba(34,197,94,0.18)",
              position: "relative",
              overflow: "hidden",
              "&:after": {
                content: '""',
                position: "absolute",
                inset: -40,
                background: "radial-gradient(circle at 30% 30%, rgba(34,197,94,0.30), transparent 55%)",
              },
            }}
          >
            <Box sx={{ position: "relative", zIndex: 2 }}>
              <Icon icon="mdi:check-bold" width={30} style={{ color: GREEN }} />
            </Box>
          </Box>

          <Typography sx={{ fontWeight: 1000, fontSize: "1.12rem", color: "#fff" }}>
            Pagamento aprovado ✅
          </Typography>

          <Typography sx={{ mt: 0.55, color: MUTED, fontSize: "0.86rem" }}>
            Seus números já estão concorrendo.
            <br />
            <strong style={{ color: "rgba(255,255,255,0.92)" }}>Atenção:</strong> se você sair dessa tela, não tem problema —
            seu pedido já foi confirmado.
          </Typography>

          <Accordion
            sx={{
              mt: 2,
              bgcolor: "rgba(255,255,255,0.04)",
              border: `1px solid ${BORDER}`,
              borderRadius: 2,
              boxShadow: "none",
              "&:before": { display: "none" },
              overflow: "hidden",
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ color: "rgba(255,255,255,0.80)" }} />}
              sx={{ "& .MuiAccordionSummary-content": { alignItems: "center" } }}
            >
              <Typography sx={{ fontWeight: 900, color: "rgba(255,255,255,0.88)" }}>
                Ver detalhes do pedido
              </Typography>
            </AccordionSummary>

            <AccordionDetails sx={{ pt: 0 }}>
              <Divider sx={{ borderColor: BORDER, mb: 1.2 }} />

              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1.2, px: 0.5, pb: 0.4 }}>
                <Box sx={{ textAlign: "left" }}>
                  <Typography sx={{ fontSize: "0.72rem", color: MUTED }}>Números</Typography>
                  <Typography sx={{ fontWeight: 1000, color: "#fff" }}>{order.quantity ?? "-"}</Typography>
                </Box>

                <Box sx={{ textAlign: "right" }}>
                  <Typography sx={{ fontSize: "0.72rem", color: MUTED }}>Total pago</Typography>
                  <Typography sx={{ fontWeight: 1000, color: GREEN }}>{formatBRL(order.amount)}</Typography>
                </Box>
              </Box>

              <Box sx={{ mt: 1.2 }}>
                <Typography sx={{ fontSize: "0.72rem", color: MUTED, mb: 0.7 }}>
                  Prévia dos seus números
                </Typography>

                {hasNumbersPreview ? (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.7 }}>
                    {numbersPreview.map((n) => (
                      <Chip
                        key={String(n)}
                        label={String(n)}
                        size="small"
                        sx={{
                          bgcolor: "rgba(255,255,255,0.06)",
                          border: `1px solid ${BORDER}`,
                          color: "rgba(255,255,255,0.88)",
                          fontWeight: 900,
                        }}
                      />
                    ))}

                    {numbers.length > numbersPreview.length && (
                      <Chip
                        label={`+${numbers.length - numbersPreview.length}`}
                        size="small"
                        sx={{
                          bgcolor: "rgba(34,197,94,0.12)",
                          border: "1px solid rgba(34,197,94,0.22)",
                          color: "rgba(34,197,94,0.95)",
                          fontWeight: 1000,
                        }}
                      />
                    )}
                  </Box>
                ) : (
                  <Typography sx={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.62)" }}>
                    Seus números completos aparecem em <strong style={{ color: "#fff" }}>Minhas compras</strong>.
                  </Typography>
                )}
              </Box>

              {/* ✅ BOTÃO “VER MINHAS COMPRAS” (com gate pro upsell) */}
              <Button
                fullWidth
                onClick={handleMinhasComprasClick}
                sx={{
                  mt: 1.6,
                  borderRadius: 2,
                  py: 1.05,
                  textTransform: "none",
                  fontWeight: 1000,
                  bgcolor: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "rgba(255,255,255,0.92)",
                  "&:hover": { bgcolor: "rgba(255,255,255,0.09)" },
                }}
              >
                Ver Minhas Compras
              </Button>

              <Typography sx={{ mt: 0.7, fontSize: "0.74rem", color: "rgba(255,255,255,0.52)", textAlign: "center" }}>
                Dica: no primeiro clique a gente te mostra uma oferta rápida pra aumentar suas chances.
              </Typography>
            </AccordionDetails>
          </Accordion>
        </Paper>

        {/* ✅ UPSELL (FOCO TOTAL) */}
        <Paper
          ref={upsellRef}
          elevation={0}
          sx={{
            p: 2.4,
            borderRadius: 3,
            mb: 0, // ✅ nada depois
            bgcolor: GLASS,
            border: flashUpsell ? "2px solid rgba(220,38,38,0.65)" : `1px solid ${BORDER}`,
            backdropFilter: "blur(10px)",
            boxShadow: flashUpsell ? "0 0 0 6px rgba(220,38,38,0.12)" : "0 18px 42px rgba(0,0,0,0.30)",
            transition: "border-color 220ms ease, box-shadow 220ms ease",
          }}
        >
          <Typography sx={{ fontWeight: 1000, color: "#fff", fontSize: "1.06rem", lineHeight: 1.2 }}>
            É a sua última chance{" "}
            <span style={{ color: "rgba(255,255,255,0.72)" }}>(sem refazer pagamento)</span>
          </Typography>

          <Typography sx={{ color: MUTED, fontSize: "0.83rem", mt: 0.45 }}>
            Isso cria um <strong style={{ color: "#fff" }}>PIX extra</strong> só para adicionar mais números no seu pedido.
          </Typography>

          {/* TIMER */}
          <Box
            sx={{
              mt: 1.6,
              mb: 1.7,
              p: 1.15,
              borderRadius: 2,
              bgcolor: "rgba(42,14,14,0.85)",
              border: `1px solid ${RED}`,
              boxShadow: "0 14px 34px rgba(220,38,38,0.18)",
            }}
          >
            <Typography
              sx={{
                textAlign: "center",
                fontSize: "0.75rem",
                fontWeight: 1000,
                color: "rgba(255,255,255,0.88)",
                mb: 0.75,
                letterSpacing: 0.3,
              }}
            >
              Oferta disponível por{" "}
              <span style={{ color: "#FF4D4D" }}>
                {minutes}:{seconds}
              </span>
            </Typography>

            <Box sx={{ height: 7, borderRadius: 999, bgcolor: "rgba(127,29,29,0.95)", overflow: "hidden" }}>
              <Box
                sx={{
                  height: "100%",
                  width: `${progress}%`,
                  bgcolor: "#EF4444",
                  transition: "width 1s linear",
                }}
              />
            </Box>
          </Box>

          {/* ✅ animações globais */}
          <Box
            sx={{
              "@keyframes pulseCTA": {
                "0%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(220,38,38,0.55)" },
                "60%": { transform: "scale(1.01)", boxShadow: "0 0 0 14px rgba(220,38,38,0)" },
                "100%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(220,38,38,0)" },
              },
              "@keyframes glowCard": {
                "0%": { filter: "brightness(1)" },
                "50%": { filter: "brightness(1.05)" },
                "100%": { filter: "brightness(1)" },
              },
            }}
          />

          <Box sx={{ display: "grid", gap: 1.15 }}>
            {UPSELL_OPTIONS.map((opt) => {
              const active = selected === opt.id
              const isDominator = opt.id === "dominator"
              const busy = upsellSubmittingId === opt.id
              const anyBusy = !!upsellSubmittingId

              const badgeStyles =
                opt.badgeTone === "green"
                  ? {
                      bgcolor: "rgba(34,197,94,0.14)",
                      border: "1px solid rgba(34,197,94,0.22)",
                      color: "rgba(34,197,94,0.95)",
                    }
                  : opt.badgeTone === "red"
                    ? {
                        bgcolor: "rgba(220,38,38,0.14)",
                        border: "1px solid rgba(220,38,38,0.22)",
                        color: "rgba(255,255,255,0.92)",
                      }
                    : {
                        bgcolor: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "rgba(255,255,255,0.86)",
                      }

              return (
                <Box
                  key={opt.id}
                  onClick={() => setSelected(opt.id)}
                  sx={{
                    borderRadius: 2.6,
                    p: 2,
                    cursor: "pointer",
                    border: active ? `2px solid ${RED}` : "1px solid rgba(255,255,255,0.10)",
                    bgcolor: active
                      ? isDominator
                        ? "linear-gradient(180deg, rgba(40,10,10,0.92), rgba(15,8,10,0.92))"
                        : "rgba(220,38,38,0.10)"
                      : "rgba(255,255,255,0.04)",
                    transition:
                      "transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease, border-color 0.18s ease",
                    transform: active ? "translateY(-1px)" : "translateY(0)",
                    boxShadow: active ? "0 16px 40px rgba(220,38,38,0.22)" : "0 10px 26px rgba(0,0,0,0.25)",
                    overflow: "hidden",
                    opacity: anyBusy && !busy ? 0.86 : 1,
                    ...(isDominator ? { animation: "glowCard 2.2s ease-in-out infinite" } : {}),
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.4 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 1000, color: "#fff", lineHeight: 1.1 }}>
                        {opt.label}
                      </Typography>

                      <Typography
                        sx={{
                          mt: 0.5,
                          fontSize: "0.84rem",
                          fontWeight: 1000,
                          color: "rgba(255,255,255,0.90)",
                        }}
                      >
                        {formatQtyLabel(opt.qty)}
                      </Typography>

                      <Box sx={{ mt: 0.75, display: "flex", gap: 0.7, flexWrap: "wrap" }}>
                        <Box
                          sx={{
                            px: 1.1,
                            py: 0.35,
                            borderRadius: 999,
                            fontSize: "0.70rem",
                            fontWeight: 1000,
                            width: "fit-content",
                            ...badgeStyles,
                          }}
                        >
                          {opt.badge}
                        </Box>

                        {isDominator && (
                          <Box
                            sx={{
                              px: 1.1,
                              py: 0.35,
                              borderRadius: 999,
                              fontSize: "0.70rem",
                              fontWeight: 1000,
                              bgcolor: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(255,255,255,0.14)",
                              color: "rgba(255,255,255,0.86)",
                            }}
                          >
                            Maior impacto
                          </Box>
                        )}
                      </Box>
                    </Box>

                    <Typography
                      sx={{
                        fontWeight: 1000,
                        color: "#FF4D4D",
                        whiteSpace: "nowrap",
                        fontSize: "1.0rem",
                      }}
                    >
                      {formatBRL(opt.priceCents / 100)}
                    </Typography>
                  </Box>

                  <Typography sx={{ fontSize: "0.78rem", color: MUTED, mt: 0.9 }}>{opt.note}</Typography>

                  {/* ✅ CTA SEMPRE VISÍVEL (pulse em todos) */}
                  <Button
                    fullWidth
                    disabled={secondsLeft <= 0 || anyBusy}
                    onClick={(e) => {
                      e.stopPropagation()
                      goToUpsellPayment({ id: opt.id, qty: opt.qty, priceCents: opt.priceCents })
                    }}
                    sx={{
                      mt: 1.35,
                      borderRadius: 999,
                      bgcolor: RED,
                      color: "#FFFFFF",
                      fontWeight: 1000,
                      py: 1.12,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      boxShadow: "0 16px 34px rgba(220,38,38,0.28)",
                      animation: secondsLeft > 0 ? "pulseCTA 1.55s ease-out infinite" : "none",
                      "&:hover": { bgcolor: RED_DARK, transform: "translateY(-1px)" },
                      "&.Mui-disabled": {
                        bgcolor: "rgba(220,38,38,0.35)",
                        color: "rgba(255,255,255,0.7)",
                      },
                    }}
                  >
                    {busy ? "Gerando PIX..." : opt.label}
                  </Button>
                </Box>
              )
            })}
          </Box>

          <Typography
            sx={{
              mt: 1.25,
              textAlign: "center",
              fontSize: "0.76rem",
              color: "rgba(255,255,255,0.58)",
            }}
          >
            Dica: se você sair dessa página, essa oferta pode não aparecer novamente.
          </Typography>
        </Paper>
      </Container>
    </Box>
  )
}
