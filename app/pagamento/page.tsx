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
const PENDING_TTL_MS = 20 * 60 * 1000 // 20 min (seguro p/ evitar pedido duplo)

type PendingPixCache = {
  orderId: string | null
  transactionId: string | null
  pixPayload: string
  amount: number // em reais
  qty: number
  createdAt: number // Date.now()
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

// ===============================

export default function PagamentoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderIdFromUrl = searchParams.get("orderId")

  const { qty, totalInCents } = useCartStore()

  const [resolved, setResolved] = useState<{ amount: number; qty: number }>(() => ({
    amount: totalInCents / 100,
    qty,
  }))

  const [orderId, setOrderId] = useState<string | null>(orderIdFromUrl)

  // trava pra não gerar PIX duas vezes (StrictMode)
  const pixRequestedRef = useRef(false)

  const [pixPayload, setPixPayload] = useState("")
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [qrCodeDialogOpen, setQrCodeDialogOpen] = useState(false)
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState("")
  const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error">("success")
  const [timeRemaining, setTimeRemaining] = useState("14:28")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // UI state
  const [manualChecking, setManualChecking] = useState(false)
  const paidRedirectedRef = useRef(false)

  const unitPrice = UNIT_PRICE_CENTS / 100

  // ===========================================
  // 0) Se existir PIX pendente salvo, REUSAR
  // ===========================================
  useEffect(() => {
    if (typeof window === "undefined") return

    const pending = safeJsonParse<PendingPixCache>(localStorage.getItem(LS_PENDING_KEY))
    if (!isPendingValid(pending)) {
      // limpa lixo velho
      clearPendingPixCache()
      return
    }

    // Se já chegou aqui com ?orderId diferente, não reaproveita pra não confundir
    if (orderIdFromUrl && pending?.orderId && orderIdFromUrl !== pending.orderId) return

    // Se não tem pix na tela ainda, carrega do cache
    if (!pixPayload && !transactionId) {
      setResolved({ amount: pending.amount, qty: pending.qty })
      setPixPayload(pending.pixPayload)
      setTransactionId(pending.transactionId)
      setOrderId(pending.orderId || orderIdFromUrl || null)
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderIdFromUrl])

  // 1) Se tiver orderId na URL, tenta carregar do backend (somente pra resolver valores)
  useEffect(() => {
    const loadOrderData = async () => {
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
  }, [orderIdFromUrl, totalInCents, qty])

  // 2) Geração do PIX (com trava + anti duplicidade)
  useEffect(() => {
    // se já tem pix (reaproveitado do cache), não gera outro
    if (pixPayload && transactionId) {
      setLoading(false)
      return
    }

    const customerData =
      typeof window !== "undefined" ? localStorage.getItem("checkoutCustomer") : null

    if (!customerData) {
      router.replace("/dados")
      return
    }

    if (!resolved.qty || resolved.qty <= 0 || !resolved.amount || resolved.amount <= 0) {
      return
    }

    // ✅ Se existe pendente válido, REUSA e sai
    if (typeof window !== "undefined") {
      const pending = safeJsonParse<PendingPixCache>(localStorage.getItem(LS_PENDING_KEY))
      if (isPendingValid(pending)) {
        setResolved({ amount: pending!.amount, qty: pending!.qty })
        setPixPayload(pending!.pixPayload)
        setTransactionId(pending!.transactionId)
        setOrderId(pending!.orderId || orderIdFromUrl || null)
        setLoading(false)
        return
      }
    }

    if (pixRequestedRef.current) return
    pixRequestedRef.current = true

    const generatePix = async () => {
      try {
        const customer = JSON.parse(customerData)
        const totalInCentsToSend = Math.round(resolved.amount * 100)

        const response = await fetch("/api/pagamento/pix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantity: resolved.qty,
            totalInCents: totalInCentsToSend,
            itemTitle: `${resolved.qty} números`,
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

        if (!response.ok || data.error) {
          throw new Error(data.error || "Falha ao gerar PIX")
        }

        const copiaECola: string | null =
          data.pixCopiaECola ??
          data.copia_e_cola ??
          data.pix?.copiaECola ??
          data.pix?.copia_e_cola ??
          data.qr_code ??
          null

        if (!copiaECola) {
          console.error("Resposta da API PIX sem copia e cola:", data)
          throw new Error("PIX gerado, mas o código de pagamento não foi retornado pela API.")
        }

        const txId = data.transactionId || data.id || null
        setPixPayload(copiaECola)
        setTransactionId(txId)

        // 🔗 guarda eventId pra dedup
        const fbEventIdFromApi = data.fbEventId || data.metaEventId
        if (fbEventIdFromApi && typeof window !== "undefined") {
          window.localStorage.setItem("lastFbEventId", String(fbEventIdFromApi))
        }

        const newOrderId = data.orderId || orderIdFromUrl || null
        if (newOrderId) {
          setOrderId(newOrderId)
          if (typeof window !== "undefined") {
            localStorage.setItem("lastOrderId", String(newOrderId))
          }
        }

        // ✅ salva cache pendente (anti pedido duplo)
        if (typeof window !== "undefined") {
          const cache: PendingPixCache = {
            orderId: newOrderId,
            transactionId: txId,
            pixPayload: copiaECola,
            amount: resolved.amount,
            qty: resolved.qty,
            createdAt: Date.now(),
          }
          localStorage.setItem(LS_PENDING_KEY, JSON.stringify(cache))
        }

        setLoading(false)
      } catch (err: any) {
        console.error("Erro ao gerar PIX:", err)
        setError(err.message || "Erro ao gerar PIX")
        setLoading(false)
      }
    }

    generatePix()

    // contador visual
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
        setTimeRemaining(
          `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
        )
      }
    }, 1000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, resolved.qty, resolved.amount, orderIdFromUrl, pixPayload, transactionId])

  // helper: checa pagamento
  const checkPaymentStatusOnce = async () => {
    if (!transactionId) return
    if (paidRedirectedRef.current) return

    const res = await fetch(`/api/transaction-status?id=${transactionId}`, { cache: "no-store" })
    if (!res.ok) return
    const data = await res.json()

    if (data.status === "paid") {
      paidRedirectedRef.current = true

      // ✅ limpa cache pendente (pra não travar próximas compras)
      clearPendingPixCache()

      let finalOrderId: string | null = data.orderId || orderId || null

      if (!finalOrderId && typeof window !== "undefined") {
        finalOrderId =
          localStorage.getItem("lastOrderId") ||
          localStorage.getItem("lastPaidOrderId") ||
          null
      }

      if (finalOrderId && typeof window !== "undefined") {
        localStorage.setItem("lastPaidOrderId", String(finalOrderId))
      }

      if (finalOrderId) router.push(`/pagamento-confirmado?orderId=${finalOrderId}`)
      else router.push("/pagamento-confirmado")
    }
  }

  // 3) Polling: agressivo no começo (3s) e depois 5s
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
      // a cada 1s a gente só controla o timing
      const every = elapsed <= 45 ? 3 : 5
      if (elapsed % every === 0) tick()
    }, 1000)

    // checa imediatamente ao entrar
    tick()

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId, router, orderId])

  // 4) Checar ao voltar pra aba / focar (resolve “paguei e voltei”)
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

  const handleCloseQRCode = () => setQrCodeDialogOpen(false)

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

  // ---------- Loading ----------
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

  // ---------- Error ----------
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
                  <Typography sx={{ fontWeight: 800, color: "#fff" }}>
                    Não foi possível gerar o PIX agora
                  </Typography>
                  <Typography sx={{ color: "rgba(255,255,255,0.75)", fontSize: "0.85rem" }}>
                    {error}
                  </Typography>
                </Box>
              </Stack>

              <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.78rem" }}>
                Isso pode acontecer quando o emissor do PIX está instável. Seus dados continuam seguros — tente novamente em instantes.
              </Typography>

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

  // ---------- UI ----------
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

        {/* CONFIRMAÇÃO AUTOMÁTICA (ANTI ANSIEDADE + ANTI DUPLICIDADE) */}
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

              <Typography
                sx={{
                  color: "rgba(255,255,255,0.75)",
                  fontSize: "0.78rem",
                  mt: 0.4,
                  lineHeight: 1.3,
                }}
              >
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
                manualChecking ? (
                  <CircularProgress size={16} sx={{ color: "#22C55E" }} />
                ) : (
                  <Icon icon="mdi:check-circle-outline" width={18} />
                )
              }
            >
              Já paguei
            </Button>
          </Stack>
        </Paper>

        {/* CARD PRINCIPAL PIX */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            border: "1px solid rgba(255,255,255,0.10)",
            bgcolor: "rgba(255,255,255,0.06)",
            backdropFilter: "blur(10px)",
            p: { xs: 2.1, sm: 3 },
          }}
        >
          {/* Cabeçalho */}
          <Stack alignItems="center" spacing={0.9} sx={{ mb: 2.2 }}>
            <Box
              sx={{
                width: 54,
                height: 54,
                borderRadius: 3,
                bgcolor: "rgba(34,197,94,0.14)",
                border: "1px solid rgba(34,197,94,0.22)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon icon="simple-icons:pix" width={30} color="#22C55E" />
            </Box>

            <Typography sx={{ fontWeight: 900, color: "#fff", fontSize: { xs: "1.05rem", sm: "1.2rem" } }}>
              Pagar com PIX
            </Typography>

            <Typography
              sx={{
                fontWeight: 1000,
                color: "#22C55E",
                fontSize: { xs: "1.45rem", sm: "1.7rem" },
                letterSpacing: "-0.02em",
              }}
            >
              {formatBRL(resolved.amount)}
            </Typography>

            <Typography sx={{ color: "rgba(255,255,255,0.70)", fontSize: "0.78rem", textAlign: "center" }}>
              Você está adquirindo{" "}
              <strong style={{ color: "rgba(255,255,255,0.92)" }}>
                {resolved.qty} Números × {formatBRL(unitPrice)}
              </strong>
            </Typography>
          </Stack>

          <Divider sx={{ borderColor: "rgba(255,255,255,0.10)", mb: 2 }} />

          {/* Como pagar */}
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontWeight: 900, color: "#fff", fontSize: "0.92rem", mb: 1.2 }}>
              Como pagar com PIX
            </Typography>

            <Stack spacing={1.2}>
              {[
                { title: "Abra o app do seu banco", desc: "Entre na área PIX do aplicativo." },
                { title: "Escolha QR Code ou Copia e Cola", desc: "Use uma das opções abaixo para finalizar." },
                { title: "Confirme o pagamento", desc: "Verifique os dados e confirme a transação." },
                { title: "Confirmação automática", desc: "Após pagar, aguarde nesta tela. Não atualize e não gere outro PIX." },
              ].map((step, index) => (
                <Stack key={index} direction="row" spacing={1.2} alignItems="flex-start">
                  <Box
                    sx={{
                      width: 22,
                      height: 22,
                      borderRadius: "999px",
                      bgcolor: "rgba(255,255,255,0.10)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.75rem",
                      fontWeight: 900,
                      color: "rgba(255,255,255,0.9)",
                      flexShrink: 0,
                      mt: 0.2,
                    }}
                  >
                    {index + 1}
                  </Box>
                  <Box>
                    <Typography sx={{ color: "#fff", fontSize: "0.86rem", fontWeight: 800, lineHeight: 1.25 }}>
                      {step.title}
                    </Typography>
                    <Typography sx={{ color: "rgba(255,255,255,0.68)", fontSize: "0.78rem", lineHeight: 1.35 }}>
                      {step.desc}
                    </Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Box>

          {/* Botões */}
          <Stack spacing={1.1} sx={{ mt: 2 }}>
            <Button
              variant="contained"
              fullWidth
              onClick={handleCopyPixCode}
              startIcon={<ContentCopyIcon />}
              disabled={!pixPayload}
              sx={{
                py: 1.25,
                fontWeight: 1000,
                borderRadius: 999,
                textTransform: "none",
                fontSize: "0.95rem",
                bgcolor: "#22C55E",
                "&:hover": { bgcolor: "#16A34A" },
              }}
            >
              Copiar código Pix
            </Button>

            <Button
              variant="outlined"
              fullWidth
              onClick={handleOpenQRCode}
              startIcon={<QrCode2Icon />}
              disabled={!pixPayload}
              sx={{
                py: 1.15,
                fontWeight: 900,
                borderRadius: 999,
                textTransform: "none",
                fontSize: "0.9rem",
                borderColor: "rgba(255,255,255,0.22)",
                color: "rgba(255,255,255,0.88)",
                bgcolor: "rgba(255,255,255,0.04)",
                "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
              }}
            >
              Ver QR Code
            </Button>
          </Stack>

          {/* Aviso */}
          <Box sx={{ mt: 2.2, pt: 1.4, borderTop: "1px dashed rgba(255,255,255,0.18)" }}>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <Icon icon="mdi:information-outline" width={18} color="rgba(255,255,255,0.70)" style={{ marginTop: 2 }} />
              <Typography sx={{ color: "rgba(255,255,255,0.70)", fontSize: "0.75rem", lineHeight: 1.55 }}>
                <strong style={{ color: "rgba(255,255,255,0.92)" }}>Importante:</strong>{" "}
                o PIX pode confirmar em segundos. Se você acabou de pagar, mantenha esta tela aberta.{" "}
                <strong style={{ color: "#fff" }}>Se não aparecer na hora, é normal — o sistema confirma automaticamente.</strong>
              </Typography>
            </Stack>
          </Box>
        </Paper>
      </Container>

      {/* Modal QR Code */}
      <Dialog open={qrCodeDialogOpen} onClose={handleCloseQRCode} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ textAlign: "center", fontWeight: 900, pb: 1 }}>
          QR Code PIX
          <IconButton onClick={handleCloseQRCode} sx={{ position: "absolute", right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ textAlign: "center", py: 3 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 1.5 }}>
            Escaneie o QR Code com o aplicativo do seu banco.
          </Typography>
          <Box sx={{ my: 2, display: "flex", justifyContent: "center" }}>
            {pixPayload && (
              <Box
                sx={{
                  p: 2,
                  border: "4px solid #22C55E",
                  borderRadius: 2,
                  bgcolor: "white",
                }}
              >
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
          <Button onClick={handleCloseQRCode} variant="outlined" size="medium" sx={{ minWidth: 120, borderRadius: 999 }}>
            Fechar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity} sx={{ width: "100%" }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  )
}
