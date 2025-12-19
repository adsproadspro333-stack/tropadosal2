// app/pagamento-confirmado/PagamentoConfirmadoClient.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
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
    label: "10x Mais Sorte",
    qty: 100,
    priceCents: 990,
    note: "Adicione números extras agora, sem refazer pagamento.",
    badge: "Rápido",
    badgeTone: "neutral" as const,
  },
  {
    id: "elite",
    label: "20x Mais Sorte",
    qty: 200,
    priceCents: 1990,
    note: "Mais chances com melhor custo-benefício do dia.",
    badge: "Melhor escolha",
    badgeTone: "green" as const,
  },
  {
    id: "dominator",
    label: "50x Mais Sorte",
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

  const [upsellSubmittingId, setUpsellSubmittingId] = useState<string | null>(null)

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

  useEffect(() => {
    async function load() {
      const orderId =
        orderIdFromSearch ||
        localStorage.getItem("lastPaidOrderId") ||
        localStorage.getItem("lastOrderId")

      if (!orderId) {
        setLoading(false)
        return
      }

      localStorage.setItem("lastPaidOrderId", orderId)

      const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" })
      const data = await res.json()

      setOrder(data)
      setLoading(false)
    }

    load()
  }, [orderIdFromSearch])

  // ✅ Dispara Purchase no browser (fbq) com dedupe por event_id
  // ✅ E chama purchase-retry passando o MESMO eventId (para dedupe perfeito com CAPI)
  useEffect(() => {
    if (!order?.id) return
    if (typeof window === "undefined") return

    const orderId = String(order.id)

    // ✅ event_id CONSISTENTE:
    // prioridade 1) order.metaEventId (ideal: vem do backend)
    // prioridade 2) cache por orderId (pra manter consistência em refresh/back)
    // prioridade 3) lastFbEventId (se você salvou no /pagamento ao gerar pix)
    // fallback 4) orderId (último recurso; melhor do que nada)
    const cachedKey = `metaEventId:${orderId}`
    const cached = (localStorage.getItem(cachedKey) || "").trim()
    const lastFbEventId = (localStorage.getItem("lastFbEventId") || "").trim()

    const eventId = String(
      (order.metaEventId && String(order.metaEventId).trim()) ||
        cached ||
        lastFbEventId ||
        orderId,
    ).trim()

    // guarda pra manter o mesmo event_id em refresh/back
    try {
      if (eventId) localStorage.setItem(cachedKey, eventId)
    } catch {}

    // ✅ dedupe keys (por sessão)
    const sentKey = getStorageKey("fbq_purchase_sent", `${orderId}:${eventId}`)
    const retryKey = getStorageKey("capi_purchase_retry_called", `${orderId}:${eventId}`)

    function firePurchaseOnce() {
      try {
        if (!window.fbq) return

        const already = sessionStorage.getItem(sentKey)
        if (already) return

        const value = safeNumber(order.amount)

        // ✅ Dedupe com CAPI: eventID precisa ser IGUAL no browser e no CAPI
        window.fbq("track", "Purchase", { value, currency: "BRL" }, { eventID: eventId })

        sessionStorage.setItem(sentKey, "1")
      } catch (e) {
        console.error("fbq Purchase error:", e)
      }
    }

    async function retryCapiPurchase() {
      try {
        // ✅ trava por sessão (refresh/back não fica chamando)
        const already = sessionStorage.getItem(retryKey)
        if (already) return

        // ✅ dá tempo pro webhook normal enviar primeiro (evita retry desnecessário)
        // (principalmente em webview/3G)
        await new Promise((r) => setTimeout(r, 1500))

        // se perdeu o order no meio do caminho, aborta
        if (!orderId) return

        await fetch("/api/meta/purchase-retry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // ✅ PASSA O MESMO eventId do browser -> CAPI
          body: JSON.stringify({ orderId, eventId }),
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
        nonce: (globalThis.crypto as any)?.randomUUID ? (globalThis.crypto as any).randomUUID() : String(Date.now()),
      }

      localStorage.setItem(LS_UPSELL_KEY, JSON.stringify(payload))

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

    router.push(`/pagamento?${qs.toString()}`)
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
      <Container maxWidth="sm" sx={{ py: { xs: 2.5, sm: 4 } }}>
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

          <Typography sx={{ mt: 0.5, color: MUTED, fontSize: "0.85rem" }}>
            Seus números já estão concorrendo. Guarde seu comprovante e acompanhe em “Minhas compras”.
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
                <Typography sx={{ fontSize: "0.72rem", color: MUTED, mb: 0.7 }}>Prévia dos seus números</Typography>

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
            </AccordionDetails>
          </Accordion>
        </Paper>

        {/* ✅ UPSELL */}
        <Paper
          elevation={0}
          sx={{
            p: 2.4,
            borderRadius: 3,
            mb: 2.2,
            bgcolor: GLASS,
            border: `1px solid ${BORDER}`,
            backdropFilter: "blur(10px)",
            boxShadow: "0 18px 42px rgba(0,0,0,0.30)",
          }}
        >
          <Typography sx={{ fontWeight: 1000, color: "#fff", fontSize: "1.02rem" }}>
            Última chance antes do sorteio
          </Typography>
          <Typography sx={{ color: MUTED, fontSize: "0.82rem", mt: 0.35 }}>
            A maioria dos ganhadores entra com mais de um pacote. Garanta mais chances agora.
          </Typography>

          {/* TIMER */}
          <Box
            sx={{
              mt: 1.6,
              mb: 1.8,
              p: 1.2,
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
                color: "rgba(255,255,255,0.86)",
                mb: 0.7,
                letterSpacing: 0.4,
              }}
            >
              ⏳ OFERTA EXPIRA EM{" "}
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

          <Box sx={{ display: "grid", gap: 1.2 }}>
            {UPSELL_OPTIONS.map((opt) => {
              const active = selected === opt.id
              const isDominator = opt.id === "dominator"

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
                        color: "rgba(255,255,255,0.90)",
                      }
                    : {
                        bgcolor: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "rgba(255,255,255,0.86)",
                      }

              const busy = upsellSubmittingId === opt.id

              return (
                <Box
                  key={opt.id}
                  onClick={() => setSelected(opt.id)}
                  sx={{
                    borderRadius: 2.5,
                    p: 2,
                    cursor: "pointer",
                    border: active ? `2px solid ${RED}` : "1px solid rgba(255,255,255,0.10)",
                    bgcolor: active
                      ? opt.id === "dominator"
                        ? "rgba(26,7,7,0.90)"
                        : "rgba(220,38,38,0.10)"
                      : "rgba(255,255,255,0.04)",
                    transition:
                      "transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease, border-color 0.18s ease",
                    transform: active ? "translateY(-1px)" : "translateY(0)",
                    boxShadow: active ? "0 16px 40px rgba(220,38,38,0.22)" : "0 10px 26px rgba(0,0,0,0.25)",
                    overflow: "hidden",
                    opacity: upsellSubmittingId && !busy ? 0.85 : 1,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 1000, color: "#fff", lineHeight: 1.1 }}>
                        {opt.label}
                      </Typography>

                      <Typography
                        sx={{
                          mt: 0.55,
                          fontSize: "0.82rem",
                          fontWeight: 1000,
                          color: "rgba(255,255,255,0.88)",
                        }}
                      >
                        {formatQtyLabel(opt.qty)}
                      </Typography>

                      <Box sx={{ mt: 0.8, display: "flex", gap: 0.7, flexWrap: "wrap" }}>
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
                      </Box>
                    </Box>

                    <Typography
                      sx={{
                        fontWeight: 1000,
                        color: RED,
                        whiteSpace: "nowrap",
                        fontSize: "0.98rem",
                      }}
                    >
                      {formatBRL(opt.priceCents / 100)}
                    </Typography>
                  </Box>

                  <Typography sx={{ fontSize: "0.78rem", color: MUTED, mt: 0.9 }}>{opt.note}</Typography>

                  {active && (
                    <Button
                      fullWidth
                      disabled={secondsLeft <= 0 || !!upsellSubmittingId}
                      onClick={(e) => {
                        e.stopPropagation()
                        goToUpsellPayment({ id: opt.id, qty: opt.qty, priceCents: opt.priceCents })
                      }}
                      sx={{
                        mt: 1.5,
                        borderRadius: 999,
                        bgcolor: RED,
                        color: "#FFFFFF",
                        fontWeight: 1000,
                        py: 1.05,
                        textTransform: "none",
                        boxShadow: "0 16px 34px rgba(220,38,38,0.28)",
                        animation: isDominator ? "pulseRed 1.6s ease-out infinite" : "none",
                        "@keyframes pulseRed": {
                          "0%": { boxShadow: "0 0 0 0 rgba(220,38,38,0.55)" },
                          "70%": { boxShadow: "0 0 0 14px rgba(220,38,38,0)" },
                          "100%": { boxShadow: "0 0 0 0 rgba(220,38,38,0)" },
                        },
                        "&:hover": { bgcolor: RED_DARK },
                        "&.Mui-disabled": {
                          bgcolor: "rgba(220,38,38,0.35)",
                          color: "rgba(255,255,255,0.7)",
                        },
                      }}
                    >
                      {busy ? "Gerando PIX..." : `Adicionar ${formatQtyLabel(opt.qty)} agora`}
                    </Button>
                  )}
                </Box>
              )
            })}
          </Box>

          <Typography
            sx={{
              mt: 1.4,
              textAlign: "center",
              fontSize: "0.76rem",
              color: "rgba(255,255,255,0.58)",
            }}
          >
            Essa oferta não aparecerá novamente.
          </Typography>
        </Paper>
      </Container>
    </Box>
  )
}
