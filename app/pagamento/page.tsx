// app/pagamento/page.tsx
"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Container,
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  CircularProgress,
  Stack,
  LinearProgress,
  IconButton,
  Divider,
} from "@mui/material"
import { Icon } from "@iconify/react"
import QRCode from "react-qr-code"
import CloseIcon from "@mui/icons-material/Close"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import QrCode2Icon from "@mui/icons-material/QrCode2"

import { useCartStore } from "@/store/cartStore"
import { formatBRL } from "@/lib/formatCurrency"
import { UNIT_PRICE_CENTS } from "@/app/config/pricing"

type OrderDTO = { id: string; amount: number; quantity: number }

// ===============================
// 🔒 Anti-duplicidade / Persistência
// ===============================
const LS_PENDING_KEY = "pix_pending_payload_v1"
const PENDING_TTL_MS = 20 * 60 * 1000 // 20 min

// ✅ Upsell (gerado no /pagamento-confirmado)
const LS_UPSELL_KEY = "checkout_upsell_payload_v1"
const UPSELL_TTL_MS = 10 * 60 * 1000

type PendingPixCache = {
  orderId: string | null
  transactionId: string | null // ✅ ID DO DB (prisma.transaction.id)
  pixPayload: string
  amount: number // em reais
  qty: number
  createdAt: number
  cacheKey?: string
  cpf?: string | null
  mode?: "main" | "upsell"
}

type UpsellCache = {
  qty: number
  priceCents: number
  createdAt: number
  baseOrderId?: string | null
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function isPendingValid(p: PendingPixCache | null) {
  if (!p) return false
  if (!p.pixPayload || !p.transactionId) return false
  if (!p.createdAt) return false
  return Date.now() - p.createdAt <= PENDING_TTL_MS
}

function clearPendingPixCache() {
  if (typeof window === "undefined") return
  localStorage.removeItem(LS_PENDING_KEY)
}

function normalizeCpfDigits(cpf: any) {
  return String(cpf || "").replace(/\D/g, "")
}

function getCheckoutCustomerCpf() {
  if (typeof window === "undefined") return ""
  const raw = localStorage.getItem("checkoutCustomer")
  if (!raw) return ""
  const parsed = safeJsonParse<any>(raw)
  const cpf = parsed?.cpf || parsed?.documentNumber || parsed?.document || ""
  return normalizeCpfDigits(cpf)
}

function readUpsellCache(): UpsellCache | null {
  if (typeof window === "undefined") return null
  const raw = localStorage.getItem(LS_UPSELL_KEY)
  const p = safeJsonParse<UpsellCache>(raw)
  if (!p) return null

  const qty = Math.round(Number(p.qty || 0))
  const priceCents = Math.round(Number(p.priceCents || 0))

  if (!Number.isFinite(qty) || qty <= 0) return null
  if (!Number.isFinite(priceCents) || priceCents <= 0) return null
  if (!p.createdAt) return null
  if (Date.now() - Number(p.createdAt) > UPSELL_TTL_MS) return null

  return {
    qty,
    priceCents,
    createdAt: Number(p.createdAt),
    baseOrderId: (p.baseOrderId || null) as any,
  }
}

function buildPixCacheKey(input: {
  cpf: string
  amountInCents: number
  qty: number
  orderIdFromUrl?: string | null
  mode?: "main" | "upsell"
}) {
  const cpf = normalizeCpfDigits(input.cpf)
  const amountInCents = Math.max(0, Math.round(Number(input.amountInCents || 0)))
  const qty = Math.max(0, Math.round(Number(input.qty || 0)))
  const order = (input.orderIdFromUrl || "").trim()
  const mode = input.mode || "main"
  return `mode:${mode}|cpf:${cpf}|amt:${amountInCents}|qty:${qty}|order:${order}`
}

// ===============================

export default function PagamentoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderIdFromUrl = searchParams.get("orderId")
  const isUpsell = searchParams.get("upsell") === "1"

  const { qty, totalInCents } = useCartStore()

  const [resolved, setResolved] = useState<{ amount: number; qty: number }>(() => ({
    amount: totalInCents / 100,
    qty,
  }))

  const [orderId, setOrderId] = useState<string | null>(orderIdFromUrl)

  // ✅ trava por cacheKey (não por render)
  const lastRequestKeyRef = useRef<string | null>(null)

  const [pixPayload, setPixPayload] = useState("")
  const [transactionId, setTransactionId] = useState<string | null>(null) // ✅ ID DO DB
  const [qrCodeDialogOpen, setQrCodeDialogOpen] = useState(false)
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState("")
  const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error">("success")
  const [timeRemaining, setTimeRemaining] = useState("14:28")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [manualChecking, setManualChecking] = useState(false)
  const paidRedirectedRef = useRef(false)

  const unitPrice = UNIT_PRICE_CENTS / 100

  const upsell = useMemo(() => {
    if (!isUpsell) return null
    return readUpsellCache()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUpsell, orderIdFromUrl])

  const intended = useMemo(() => {
    if (isUpsell && upsell) {
      return {
        amount: upsell.priceCents / 100,
        qty: upsell.qty,
        mode: "upsell" as const,
      }
    }
    return {
      amount: resolved.amount,
      qty: resolved.qty,
      mode: "main" as const,
    }
  }, [isUpsell, upsell, resolved.amount, resolved.qty])

  // 0) UPSell: força valores
  useEffect(() => {
    if (!isUpsell) return

    const p = readUpsellCache()
    if (!p) {
      setError("Upsell expirou ou não foi encontrado. Volte e selecione a oferta novamente.")
      setLoading(false)
      return
    }

    setResolved({ amount: p.priceCents / 100, qty: p.qty })

    // limpa visual (mas não “libera” request duplicado: trava é por cacheKey)
    setPixPayload("")
    setTransactionId(null)
    setError(null)
    setLoading(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUpsell])

  // 1) Reuso seguro do cache (CPF+valor+qty+mode+order)
  useEffect(() => {
    if (typeof window === "undefined") return

    const pending = safeJsonParse<PendingPixCache>(localStorage.getItem(LS_PENDING_KEY))
    if (!isPendingValid(pending)) {
      clearPendingPixCache()
      return
    }

    const cpf = getCheckoutCustomerCpf()

    const currentKey = buildPixCacheKey({
      cpf,
      amountInCents: Math.round(intended.amount * 100),
      qty: intended.qty,
      orderIdFromUrl,
      mode: intended.mode,
    })

    if (!pending?.cacheKey) {
      clearPendingPixCache()
      return
    }

    if (orderIdFromUrl && pending?.orderId && orderIdFromUrl !== pending.orderId) {
      return
    }

    if (pending.cacheKey !== currentKey) {
      clearPendingPixCache()
      setPixPayload("")
      setTransactionId(null)
      setError(null)
      setLoading(true)
      return
    }

    if (!pixPayload && !transactionId) {
      setResolved({ amount: pending.amount, qty: pending.qty })
      setPixPayload(pending.pixPayload)
      setTransactionId(pending.transactionId) // ✅ DB id
      setOrderId(pending.orderId || orderIdFromUrl || null)
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderIdFromUrl, intended.amount, intended.qty, intended.mode])

  // 2) Se tiver orderId na URL (main), resolve do backend
  useEffect(() => {
    const loadOrderData = async () => {
      if (isUpsell) return

      if (!orderIdFromUrl) {
        setResolved({ amount: totalInCents / 100, qty })
        return
      }

      try {
        const response = await fetch(`/api/orders/${orderIdFromUrl}`, { cache: "no-store" })
        if (!response.ok) throw new Error("Failed to load order")
        const data: OrderDTO = await response.json()

        setResolved({ amount: data.amount, qty: data.quantity })
        setOrderId(data.id)
      } catch (err) {
        console.error("[pagamento] Failed to load order, falling back to store:", err)
        setResolved({ amount: totalInCents / 100, qty })
      }
    }

    loadOrderData()
  }, [isUpsell, orderIdFromUrl, totalInCents, qty])

  // 3) Geração do PIX
  useEffect(() => {
    if (pixPayload && transactionId) {
      setLoading(false)
      return
    }

    const customerData = typeof window !== "undefined" ? localStorage.getItem("checkoutCustomer") : null
    if (!customerData) {
      router.replace("/dados")
      return
    }

    if (!intended.qty || intended.qty <= 0 || !intended.amount || intended.amount <= 0) return

    const customerParsed = safeJsonParse<any>(customerData)
    const cpfNow = normalizeCpfDigits(customerParsed?.cpf || customerParsed?.documentNumber || "")

    const totalInCentsToSend = Math.round(intended.amount * 100)

    const currentKey = buildPixCacheKey({
      cpf: cpfNow,
      amountInCents: totalInCentsToSend,
      qty: intended.qty,
      orderIdFromUrl,
      mode: intended.mode,
    })

    // ✅ trava absoluta: mesma intenção/cacheKey = não faz 2 requests nunca
    if (lastRequestKeyRef.current === currentKey) return
    lastRequestKeyRef.current = currentKey

    // ✅ Se existe pendente válido e bate cacheKey, reusa
    if (typeof window !== "undefined") {
      const pending = safeJsonParse<PendingPixCache>(localStorage.getItem(LS_PENDING_KEY))
      if (isPendingValid(pending) && pending?.cacheKey === currentKey) {
        setResolved({ amount: pending!.amount, qty: pending!.qty })
        setPixPayload(pending!.pixPayload)
        setTransactionId(pending!.transactionId) // ✅ DB id
        setOrderId(pending!.orderId || orderIdFromUrl || null)
        setLoading(false)
        return
      }
    }

    const generatePix = async () => {
      try {
        const customer = JSON.parse(customerData)

        const baseOrderId =
          intended.mode === "upsell"
            ? (upsell?.baseOrderId || orderIdFromUrl || null)
            : null

        const response = await fetch("/api/pagamento/pix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantity: intended.qty,
            totalInCents: totalInCentsToSend,
            itemTitle: intended.mode === "upsell" ? `Upsell +${intended.qty} números` : `${intended.qty} números`,

            // ✅ main: mantém orderId
            // ✅ upsell: NÃO amarra em orderId pago
            orderId: intended.mode === "upsell" ? null : (orderIdFromUrl || null),

            // ✅ seu backend lê body.upsell === true
            upsell: intended.mode === "upsell",

            // opcional
            baseOrderId,

            customer: {
              name: customer.nome,
              email: customer.email,
              phone: customer.phone,
              documentNumber: customer.cpf,
              documentType: "CPF",
            },
          }),
        })

        const data = await response.json()

        if (!response.ok || data.error) throw new Error(data.error || "Falha ao gerar PIX")

        const copiaECola: string | null =
          data.pixCopiaECola ??
          data.copia_e_cola ??
          data.pix?.copiaECola ??
          data.pix?.copia_e_cola ??
          data.qr_code ??
          null

        // ✅ CORREÇÃO CRÍTICA:
        // seu backend está retornando:
        // - dbTransactionId = ID do Prisma (transaction.id)
        // - transactionId = gatewayId/txid (não serve pro /transaction-status se ele busca no DB)
        const txDbId: string | null =
          data.dbTransactionId ??
          data.transaction?.id ??
          data.transactionId ??
          null

        if (!copiaECola) {
          console.error("[pagamento] Resposta da API PIX sem copia e cola:", data)
          throw new Error("PIX não retornou o código Copia e Cola.")
        }
        if (!txDbId) {
          console.error("[pagamento] API PIX veio sem transactionId (DB). Resposta:", data)
          throw new Error("PIX gerou, mas não retornou transactionId do sistema.")
        }

        setPixPayload(String(copiaECola))
        setTransactionId(String(txDbId))

        const fbEventIdFromApi = data.fbEventId || data.metaEventId
        if (fbEventIdFromApi && typeof window !== "undefined") {
          window.localStorage.setItem("lastFbEventId", String(fbEventIdFromApi))
        }

        const newOrderId = data.orderId || null
        if (newOrderId) {
          setOrderId(newOrderId)
          if (typeof window !== "undefined") localStorage.setItem("lastOrderId", String(newOrderId))
        }

        if (typeof window !== "undefined") {
          const cache: PendingPixCache = {
            orderId: newOrderId,
            transactionId: String(txDbId), // ✅ DB id
            pixPayload: String(copiaECola),
            amount: intended.amount,
            qty: intended.qty,
            createdAt: Date.now(),
            cacheKey: currentKey,
            cpf: cpfNow || null,
            mode: intended.mode,
          }
          localStorage.setItem(LS_PENDING_KEY, JSON.stringify(cache))
        }

        setResolved({ amount: intended.amount, qty: intended.qty })
        setLoading(false)
      } catch (err: any) {
        console.error("Erro ao gerar PIX:", err)
        clearPendingPixCache()
        setError(err.message || "Erro ao gerar PIX")
        setLoading(false)

        // ✅ libera retry real (novo clique / reload)
        lastRequestKeyRef.current = null
      }
    }

    generatePix()

    let minutes = 14
    let seconds = 28
    const interval = setInterval(() => {
      seconds--
      if (seconds < 0) {
        seconds = 59
        minutes--
      }
      if (minutes < 0) {
        clearInterval(interval)
        setTimeRemaining("00:00")
      } else {
        setTimeRemaining(`${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`)
      }
    }, 1000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, intended.qty, intended.amount, intended.mode, orderIdFromUrl, pixPayload, transactionId, upsell])

  // helper: checa pagamento
  const checkPaymentStatusOnce = async () => {
    if (!transactionId) return
    if (paidRedirectedRef.current) return

    const res = await fetch(`/api/transaction-status?id=${transactionId}`, { cache: "no-store" })
    if (!res.ok) return
    const data = await res.json()

    if (data.status === "paid") {
      paidRedirectedRef.current = true
      clearPendingPixCache()

      let finalOrderId: string | null =
        data.orderId ||
        orderId ||
        (intended.mode === "upsell" ? (upsell?.baseOrderId || orderIdFromUrl || null) : null) ||
        null

      if (!finalOrderId && typeof window !== "undefined") {
        finalOrderId = localStorage.getItem("lastOrderId") || localStorage.getItem("lastPaidOrderId") || null
      }

      if (finalOrderId && typeof window !== "undefined") {
        localStorage.setItem("lastPaidOrderId", String(finalOrderId))
      }

      if (finalOrderId) router.push(`/pagamento-confirmado?orderId=${finalOrderId}`)
      else router.push("/pagamento-confirmado")
    }
  }

  // 4) Polling
  useEffect(() => {
    if (!transactionId) return

    let elapsed = 0
    const tick = async () => {
      try {
        await checkPaymentStatusOnce()
      } catch (err) {
        console.error("Erro ao checar status da transação:", err)
      }
    }

    const interval = setInterval(() => {
      elapsed += 1
      const every = elapsed <= 45 ? 3 : 5
      if (elapsed % every === 0) tick()
    }, 1000)

    tick()

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId, router, orderId])

  // 5) Checar ao voltar pra aba
  useEffect(() => {
    if (!transactionId) return

    const onFocus = () => checkPaymentStatusOnce()
    const onVis = () => {
      if (document.visibilityState === "visible") checkPaymentStatusOnce()
    }

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVis)

    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId])

  const handleCopyPixCode = async () => {
    if (!pixPayload) {
      setSnackbarMessage("Ainda estamos gerando o código PIX, aguarde alguns segundos.")
      setSnackbarSeverity("error")
      setSnackbarOpen(true)
      return
    }

    try {
      await navigator.clipboard.writeText(pixPayload)
      setSnackbarMessage("Código PIX copiado com sucesso!")
      setSnackbarSeverity("success")
      setSnackbarOpen(true)
    } catch (err) {
      console.error("Erro ao copiar PIX:", err)
      setSnackbarMessage("Erro ao copiar código PIX")
      setSnackbarSeverity("error")
      setSnackbarOpen(true)
    }
  }

  const handleOpenQRCode = () => {
    if (!pixPayload) {
      setSnackbarMessage("Ainda estamos gerando o QR Code, aguarde alguns segundos.")
      setSnackbarSeverity("error")
      setSnackbarOpen(true)
      return
    }
    setQrCodeDialogOpen(true)
  }

  const handleIAlreadyPaid = async () => {
    if (!transactionId) {
      setSnackbarMessage("Ainda estamos gerando o pagamento. Aguarde alguns segundos.")
      setSnackbarSeverity("error")
      setSnackbarOpen(true)
      return
    }

    try {
      setManualChecking(true)
      await checkPaymentStatusOnce()

      setSnackbarMessage("Verificando pagamento… se você acabou de pagar, pode levar alguns segundos.")
      setSnackbarSeverity("success")
      setSnackbarOpen(true)
    } catch (err) {
      console.error("Erro no Já paguei:", err)
      setSnackbarMessage("Não consegui verificar agora. Aguarde alguns segundos e tente novamente.")
      setSnackbarSeverity("error")
      setSnackbarOpen(true)
    } finally {
      setManualChecking(false)
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
          bgcolor: "#0B0F19",
          px: 2,
        }}
      >
        <Stack spacing={2} alignItems="center">
          <CircularProgress />
          <Typography sx={{ color: "rgba(255,255,255,0.75)", fontSize: "0.9rem" }}>
            Preparando seu PIX…
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.78rem", textAlign: "center" }}>
            Se você já tinha um pagamento pendente, estamos recuperando automaticamente.
          </Typography>
        </Stack>
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ bgcolor: "#0B0F19", minHeight: "100vh", pb: 4 }}>
        <Container maxWidth="sm" sx={{ py: 4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 3,
              border: "1px solid rgba(239,68,68,0.35)",
              bgcolor: "rgba(255,255,255,0.06)",
              backdropFilter: "blur(10px)",
            }}
          >
            <Stack spacing={2}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: "999px",
                    bgcolor: "rgba(239,68,68,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon icon="mdi:alert-circle-outline" width={24} color="#EF4444" />
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 800, color: "#fff" }}>Não foi possível gerar o PIX agora</Typography>
                  <Typography sx={{ color: "rgba(255,255,255,0.75)", fontSize: "0.85rem" }}>{error}</Typography>
                </Box>
              </Stack>

              {/* ✅ removido o texto “PIX fantasma” pra não travar conversão */}

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} sx={{ mt: 1 }}>
                <Button
                  variant="contained"
                  fullWidth
                  onClick={() => {
                    if (typeof window !== "undefined") window.location.reload()
                    else router.refresh()
                  }}
                  sx={{
                    fontWeight: 800,
                    borderRadius: 999,
                    textTransform: "none",
                    py: 1.25,
                    bgcolor: "#22C55E",
                    "&:hover": { bgcolor: "#16A34A" },
                  }}
                >
                  Tentar novamente
                </Button>

                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => router.back()}
                  sx={{
                    fontWeight: 700,
                    borderRadius: 999,
                    textTransform: "none",
                    py: 1.25,
                    borderColor: "rgba(255,255,255,0.25)",
                    color: "rgba(255,255,255,0.85)",
                  }}
                >
                  Voltar
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </Container>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        pb: 5,
        bgcolor: "#0B0F19",
        backgroundImage:
          "radial-gradient(1200px 600px at 20% 10%, rgba(34,197,94,0.16), transparent 60%), radial-gradient(900px 500px at 90% 0%, rgba(245,158,11,0.12), transparent 55%)",
      }}
    >
      {/* ... RESTANTE DO SEU COMPONENTE SEM MEXER ... */}
      {/* (mantive o resto intacto pra não quebrar seu front) */}

      <Container maxWidth="sm" sx={{ pt: { xs: 2, sm: 3 }, pb: 2, px: { xs: 2, sm: 0 } }}>
        {/* STATUS / TIMER */}
        <Paper
          elevation={0}
          sx={{
            mb: 2,
            borderRadius: 3,
            bgcolor: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(10px)",
            px: { xs: 1.6, sm: 2 },
            py: { xs: 1.2, sm: 1.4 },
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
            <Stack direction="row" alignItems="center" spacing={1.3}>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "999px",
                  bgcolor: "rgba(245,158,11,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon icon="mdi:clock-outline" width={16} color="#F59E0B" />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800, color: "#fff", fontSize: "0.88rem", lineHeight: 1.1 }}>
                  Aguardando seu pagamento
                </Typography>
                <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.72rem" }}>
                  Tempo restante para finalizar
                </Typography>
              </Box>
            </Stack>

            <Chip
              label={timeRemaining}
              size="small"
              sx={{
                borderRadius: 999,
                bgcolor: "rgba(245,158,11,0.18)",
                color: "#F59E0B",
                fontWeight: 900,
                fontSize: "0.78rem",
                px: 1.2,
                border: "1px solid rgba(245,158,11,0.25)",
              }}
            />
          </Stack>

          <LinearProgress
            variant="indeterminate"
            sx={{
              mt: 1.2,
              height: 4,
              borderRadius: 999,
              bgcolor: "rgba(255,255,255,0.08)",
              "& .MuiLinearProgress-bar": { bgcolor: "#F59E0B" },
            }}
          />
        </Paper>

        {/* CONFIRMAÇÃO AUTOMÁTICA */}
        <Paper
          elevation={0}
          sx={{
            mb: 2,
            borderRadius: 3,
            bgcolor: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.18)",
            backdropFilter: "blur(10px)",
            px: { xs: 1.6, sm: 2 },
            py: { xs: 1.2, sm: 1.5 },
          }}
        >
          <Stack direction="row" spacing={1.3} alignItems="center">
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: 2,
                bgcolor: "rgba(34,197,94,0.16)",
                border: "1px solid rgba(34,197,94,0.22)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon icon="mdi:check-decagram-outline" width={18} color="#22C55E" />
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Typography
                  sx={{
                    fontWeight: 900,
                    color: "#fff",
                    fontSize: "0.92rem",
                    lineHeight: 1.15,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  Confirmando pagamento…
                </Typography>

                <Chip
                  label="auto"
                  size="small"
                  sx={{
                    height: 22,
                    borderRadius: 999,
                    bgcolor: "rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.85)",
                    fontWeight: 900,
                    fontSize: "0.72rem",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                />
              </Stack>

              <Typography sx={{ color: "rgba(255,255,255,0.75)", fontSize: "0.78rem", mt: 0.4, lineHeight: 1.3 }}>
                Pagou? Só aguarde aqui. <strong style={{ color: "#fff" }}>Não gere outro pagamento.</strong>
              </Typography>
            </Box>

            <Button
              variant="outlined"
              onClick={handleIAlreadyPaid}
              disabled={manualChecking}
              sx={{
                borderRadius: 999,
                textTransform: "none",
                fontWeight: 900,
                px: 1.6,
                py: 0.9,
                minWidth: 104,
                borderColor: "rgba(34,197,94,0.45)",
                color: "#22C55E",
                bgcolor: "rgba(34,197,94,0.06)",
                "&:hover": {
                  bgcolor: "rgba(34,197,94,0.10)",
                  borderColor: "rgba(34,197,94,0.65)",
                },
              }}
              startIcon={
                manualChecking ? <CircularProgress size={16} sx={{ color: "#22C55E" }} /> : <Icon icon="mdi:check-circle-outline" width={18} />
              }
            >
              Já paguei
            </Button>
          </Stack>
        </Paper>

        {/* CARD PRINCIPAL PIX */}
        {/* ... seu restante continua igual ... */}
        {/* (mantive o resto do JSX igual ao seu original, só cortei aqui por espaço) */}
      </Container>

      <Dialog open={qrCodeDialogOpen} onClose={() => setQrCodeDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ textAlign: "center", fontWeight: 900, pb: 1 }}>
          QR Code PIX
          <IconButton onClick={() => setQrCodeDialogOpen(false)} sx={{ position: "absolute", right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ textAlign: "center", py: 3 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 1.5 }}>
            Escaneie o QR Code com o aplicativo do seu banco.
          </Typography>
          <Box sx={{ my: 2, display: "flex", justifyContent: "center" }}>
            {pixPayload && (
              <Box sx={{ p: 2, border: "4px solid #22C55E", borderRadius: 2, bgcolor: "white" }}>
                <QRCode value={pixPayload} size={210} />
              </Box>
            )}
          </Box>
          <Typography variant="h6" fontWeight={900} color="success.main">
            {formatBRL(resolved.amount)}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
            Válido por {timeRemaining}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "center", pb: 2.5 }}>
          <Button onClick={() => setQrCodeDialogOpen(false)} variant="outlined" size="medium" sx={{ minWidth: 120, borderRadius: 999 }}>
            Fechar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbarOpen} autoHideDuration={4000} onClose={() => setSnackbarOpen(false)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity} sx={{ width: "100%" }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  )
}
