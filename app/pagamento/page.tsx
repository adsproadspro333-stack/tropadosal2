// app/pagamento/page.tsx
"use client"

import { useState, useEffect, useRef } from "react"
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

export default function PagamentoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderIdFromUrl = searchParams.get("orderId")

  // totalInCents vem da store
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
  const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error">(
    "success",
  )
  const [timeRemaining, setTimeRemaining] = useState("14:28")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 1) Se tiver orderId na URL, tenta carregar do backend
  useEffect(() => {
    const loadOrderData = async () => {
      if (!orderIdFromUrl) {
        setResolved({ amount: totalInCents / 100, qty })
        return
      }

      try {
        const response = await fetch(`/api/orders/${orderIdFromUrl}`, {
          cache: "no-store",
        })
        if (!response.ok) throw new Error("Failed to load order")

        const data: OrderDTO = await response.json()

        // no banco, amount está em REAIS
        setResolved({ amount: data.amount, qty: data.quantity })
        setOrderId(data.id)
      } catch (err) {
        console.error("[v0] Failed to load order, falling back to store:", err)
        setResolved({ amount: totalInCents / 100, qty })
      }
    }

    loadOrderData()
  }, [orderIdFromUrl, totalInCents, qty])

  // 2) Geração do PIX (com trava pra não duplicar)
  useEffect(() => {
    const customerData =
      typeof window !== "undefined"
        ? localStorage.getItem("checkoutCustomer")
        : null

    if (!customerData) {
      router.replace("/dados")
      return
    }

    if (
      !resolved.qty ||
      resolved.qty <= 0 ||
      !resolved.amount ||
      resolved.amount <= 0
    ) {
      return
    }

    // impede chamar 2x
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

        // parser robusto para o código copia-e-cola
        const copiaECola: string | null =
          data.pixCopiaECola ??
          data.copia_e_cola ??
          data.pix?.copiaECola ??
          data.pix?.copia_e_cola ??
          data.qr_code ??
          null

        if (!copiaECola) {
          console.error("Resposta da API PIX sem copia e cola:", data)
          throw new Error(
            "PIX gerado, mas o código de pagamento não foi retornado pela API.",
          )
        }

        setPixPayload(copiaECola)
        setTransactionId(data.transactionId || data.id || null)

        // 🔗 guarda o fbEventId pra página /pagamento-confirmado deduplicar com o CAPI
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

        setLoading(false)
      } catch (err: any) {
        console.error("Erro ao gerar PIX:", err)
        setError(err.message || "Erro ao gerar PIX")
        setLoading(false)
      }
    }

    generatePix()

    // contador de tempo
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
          `${minutes.toString().padStart(2, "0")}:${seconds
            .toString()
            .padStart(2, "0")}`,
        )
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [router, resolved.qty, resolved.amount, orderIdFromUrl])

  // 3) Checa no backend se a transação foi paga e redireciona
  useEffect(() => {
    if (!transactionId) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/transaction-status?id=${transactionId}`)
        if (!res.ok) return

        const data = await res.json()

        if (data.status === "paid") {
          clearInterval(interval)

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

          if (finalOrderId) {
            router.push(`/pagamento-confirmado?orderId=${finalOrderId}`)
          } else {
            router.push("/pagamento-confirmado")
          }
        }
      } catch (err) {
        console.error("Erro ao checar status da transação:", err)
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [transactionId, router, orderId])

  const handleCopyPixCode = async () => {
    if (!pixPayload) {
      setSnackbarMessage(
        "Ainda estamos gerando o código PIX, aguarde alguns segundos.",
      )
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
      setSnackbarMessage(
        "Ainda estamos gerando o QR Code, aguarde alguns segundos.",
      )
      setSnackbarSeverity("error")
      setSnackbarOpen(true)
      return
    }
    setQrCodeDialogOpen(true)
  }

  const handleCloseQRCode = () => {
    setQrCodeDialogOpen(false)
  }

  const unitPrice = UNIT_PRICE_CENTS / 100

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ bgcolor: "background.default", minHeight: "100vh", pb: 4 }}>
        <Container maxWidth="md" sx={{ py: 4 }}>
          <Alert severity="error">{error}</Alert>
          <Button
            variant="contained"
            color="primary"
            sx={{ mt: 2 }}
            onClick={() => router.back()}
          >
            Voltar
          </Button>
        </Container>
      </Box>
    )
  }

  return (
    <Box sx={{ bgcolor: "#F3F4F6", minHeight: "100vh", pb: 4 }}>
      <Container maxWidth="sm" sx={{ pt: 3, pb: 2, px: { xs: 2, sm: 0 } }}>
        {/* BARRA DE STATUS / TIMER */}
        <Paper
          elevation={0}
          sx={{
            mb: 3,
            borderRadius: 2,
            bgcolor: "#FEF3C7",
            border: "1px solid #FACC15",
            px: 2,
            py: 1.5,
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1.5}
          >
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Box
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: "999px",
                  bgcolor: "#F97316",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon icon="mdi:clock-outline" width={16} color="#FFF" />
              </Box>
              <Box>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    color: "#92400E",
                    fontSize: "0.8rem",
                  }}
                >
                  Aguardando seu pagamento
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: "#92400E", fontSize: "0.72rem" }}
                >
                  Tempo restante para pagamento
                </Typography>
              </Box>
            </Stack>

            <Chip
              label={timeRemaining}
              size="small"
              sx={{
                borderRadius: 999,
                bgcolor: "#F97316",
                color: "#FFF",
                fontWeight: 700,
                fontSize: "0.8rem",
                px: 1.5,
              }}
            />
          </Stack>

          <LinearProgress
            variant="indeterminate"
            sx={{
              mt: 1.4,
              height: 4,
              borderRadius: 999,
              bgcolor: "rgba(0,0,0,0.04)",
              "& .MuiLinearProgress-bar": {
                bgcolor: "#F97316",
              },
            }}
          />
        </Paper>

        {/* CARD PRINCIPAL PIX */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2,
            border: "1px solid #E5E7EB",
            boxShadow: "0 10px 30px rgba(15,23,42,0.04)",
            bgcolor: "#FFFFFF",
            p: { xs: 2.4, sm: 3 },
          }}
        >
          {/* Cabeçalho */}
          <Stack alignItems="center" spacing={1} sx={{ mb: 2.5 }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: "16px",
                bgcolor: "#ECFDF3",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 0.5,
              }}
            >
              <Icon icon="simple-icons:pix" width={32} color="#00A868" />
            </Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                fontSize: { xs: "1.1rem", sm: "1.25rem" },
                color: "#111827",
              }}
            >
              Pagar com PIX
            </Typography>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                color: "#16A34A",
                fontSize: { xs: "1.4rem", sm: "1.6rem" },
                mt: 0.3,
              }}
            >
              {formatBRL(resolved.amount)}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: "#6B7280", mt: 0.2, fontSize: "0.78rem" }}
            >
              Você está adquirindo{" "}
              <strong>
                {resolved.qty} Números × {formatBRL(unitPrice)}
              </strong>
            </Typography>
          </Stack>

          {/* COMO PAGAR COM PIX (passo a passo) */}
          <Box sx={{ mb: 2.5 }}>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, mb: 1.4, color: "#111827" }}
            >
              Como pagar com PIX:
            </Typography>

            <Stack spacing={1.4}>
              {[
                {
                  title: "Abra o aplicativo do seu banco",
                  desc: "Acesse a área PIX do aplicativo.",
                },
                {
                  title: "Escolha pagar com QR Code ou Pix Copia e Cola",
                  desc: "Use uma das opções abaixo para finalizar.",
                },
                {
                  title: "Confirme o pagamento",
                  desc: "Verifique os dados e confirme a transação.",
                },
                {
                  title: "Pronto! Seu pedido será confirmado automaticamente",
                  desc: "Você receberá um email e poderá acompanhar em “Minhas compras”.",
                },
              ].map((step, index) => (
                <Stack
                  key={index}
                  direction="row"
                  spacing={1.5}
                  alignItems="flex-start"
                >
                  <Box
                    sx={{
                      width: 22,
                      height: 22,
                      borderRadius: "999px",
                      bgcolor: "#EEF2FF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#4F46E5",
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </Box>
                  <Box>
                    <Typography
                      variant="body2"
                      sx={{
                        color: "#111827",
                        fontSize: "0.86rem",
                        fontWeight: 600,
                      }}
                    >
                      {step.title}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: "#4B5563",
                        fontSize: "0.8rem",
                      }}
                    >
                      {step.desc}
                    </Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Box>

          {/* BOTÕES PIX */}
          <Stack spacing={1.2}>
            <Button
              variant="contained"
              fullWidth
              onClick={handleCopyPixCode}
              startIcon={<ContentCopyIcon />}
              disabled={!pixPayload}
              sx={{
                py: 1.3,
                fontWeight: 700,
                borderRadius: 999,
                textTransform: "none",
                fontSize: "0.95rem",
                bgcolor: "#16A34A",
                "&:hover": {
                  bgcolor: "#15803D",
                },
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
                py: 1.2,
                fontWeight: 600,
                borderRadius: 999,
                textTransform: "none",
                fontSize: "0.9rem",
                borderColor: "#D1D5DB",
                color: "#374151",
                bgcolor: "#F9FAFB",
                "&:hover": {
                  bgcolor: "#F3F4F6",
                },
              }}
            >
              Ver QR Code
            </Button>
          </Stack>

          {/* AVISO IMPORTANTE */}
          <Box
            sx={{
              mt: 2.2,
              pt: 1.4,
              borderTop: "1px dashed #E5E7EB",
            }}
          >
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <Icon
                icon="mdi:information-outline"
                width={18}
                color="#6B7280"
                style={{ marginTop: 2 }}
              />
              <Typography
                variant="caption"
                sx={{
                  color: "#6B7280",
                  fontSize: "0.75rem",
                  lineHeight: 1.5,
                }}
              >
                <strong>Importante:</strong> O pagamento via PIX é processado
                instantaneamente. Após a confirmação, você receberá seus números
                por email e poderá acompanhar tudo em{" "}
                <strong>“Minhas compras”.</strong>
              </Typography>
            </Stack>
          </Box>
        </Paper>
      </Container>

      {/* Modal QR Code */}
      <Dialog
        open={qrCodeDialogOpen}
        onClose={handleCloseQRCode}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle
          sx={{
            textAlign: "center",
            fontWeight: 700,
            pb: 1,
          }}
        >
          QR Code PIX
          <IconButton
            onClick={handleCloseQRCode}
            sx={{ position: "absolute", right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ textAlign: "center", py: 3 }}>
          <Typography
            variant="body2"
            color="text.secondary"
            gutterBottom
            sx={{ mb: 1.5 }}
          >
            Escaneie o QR Code com o aplicativo do seu banco.
          </Typography>
          <Box
            sx={{
              my: 2,
              display: "flex",
              justifyContent: "center",
            }}
          >
            {pixPayload && (
              <Box
                sx={{
                  p: 2,
                  border: "4px solid #00a868",
                  borderRadius: 2,
                  bgcolor: "white",
                }}
              >
                <QRCode value={pixPayload} size={210} />
              </Box>
            )}
          </Box>
          <Typography variant="h6" fontWeight={700} color="success.main">
            {formatBRL(resolved.amount)}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mt: 1.5 }}
          >
            Válido por {timeRemaining}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "center", pb: 2.5 }}>
          <Button
            onClick={handleCloseQRCode}
            variant="outlined"
            size="medium"
            sx={{ minWidth: 120, borderRadius: 999 }}
          >
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
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={snackbarSeverity}
          sx={{ width: "100%" }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  )
}
