"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Container,
  Box,
  Paper,
  Typography,
  Button,
  Breadcrumbs,
  Link,
  Divider,
  Card,
  CardContent,
  Chip,
  Stack,
} from "@mui/material"
import { Icon } from "@iconify/react"
import { useCartStore } from "@/store/cartStore"
import { formatBRL } from "@/lib/formatCurrency"
import OrderBumpCard from "../components/OrderBumpCard" // ajuste o caminho se necessário

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
  const { qty, totalInCents } = useCartStore()

  useEffect(() => {
    const customerData = localStorage.getItem("checkoutCustomer")
    if (!customerData) {
      router.replace("/dados")
      return
    }

    setCustomer(JSON.parse(customerData))
  }, [router])

  const maskCPF = (cpf: string) => {
    const numbers = cpf.replace(/\D/g, "")
    return `***.***.${numbers.slice(6, 9)}-**`
  }

  if (!customer) return null

  const totalReais = totalInCents / 100

  // 👉 Aqui é onde disparamos o InitiateCheckout no clique do botão
  const handleConfirm = () => {
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
        // fallback se randomUUID não existir
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
              value: Number(totalReais.toFixed(2)), // valor em R$
              currency: "BRL",
              num_items: qty || 1, // quantidade de números
            },
            { eventID: fbEventId },
          )
        } else {
          // fallback: dispara sem eventID (ainda funciona, só não deduplica com o CAPI)
          window.fbq("track", "InitiateCheckout", {
            value: Number(totalReais.toFixed(2)),
            currency: "BRL",
            num_items: qty || 1,
          })
        }

        console.log("FBQ InitiateCheckout disparado:", {
          value: Number(totalReais.toFixed(2)),
          num_items: qty,
          eventID: fbEventId,
        })
      } catch (e) {
        console.warn("Erro ao disparar fbq InitiateCheckout:", e)
      }
    }

    // 4) Continua o fluxo normal para a página de pagamento
    router.push("/pagamento")
  }

  return (
    <Box
      sx={{
        bgcolor: "#F3F4F6",
        minHeight: "100vh",
        pb: 14, // espaço pro CTA fixo
      }}
    >
      <Container maxWidth="sm" sx={{ py: 3 }}>
        {/* BREADCRUMB / PASSOS */}
        <Breadcrumbs
          aria-label="breadcrumb"
          sx={{ mb: 2, fontSize: "0.8rem" }}
        >
          <Link
            underline="hover"
            color="inherit"
            onClick={() => router.push("/")}
            sx={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              fontSize: "0.78rem",
            }}
          >
            <Icon icon="mdi:home" width={16} />
            Escolher Produto
          </Link>
          <Link
            underline="hover"
            color="inherit"
            onClick={() => router.push("/dados")}
            sx={{ cursor: "pointer", fontSize: "0.78rem" }}
          >
            Dados pessoais
          </Link>
          <Typography
            color="primary"
            fontWeight={600}
            sx={{ fontSize: "0.78rem" }}
          >
            Método de pagamento
          </Typography>
        </Breadcrumbs>

        {/* TÍTULO */}
        <Typography
          variant="h5"
          fontWeight={700}
          gutterBottom
          sx={{ mb: 2, color: "#111827" }}
        >
          Confirmação do pedido
        </Typography>

        {/* DADOS DO CLIENTE */}
        <Card
          elevation={0}
          sx={{
            mb: 2,
            borderRadius: 2,
            border: "1px solid #E5E7EB",
            boxShadow: "0 10px 30px rgba(15,23,42,0.04)",
            bgcolor: "#FFFFFF",
          }}
        >
          <CardContent sx={{ p: 2.2 }}>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
              <Icon
                icon="mdi:account"
                width={22}
                style={{ marginRight: 8, color: "#2563EB" }}
              />
              <Typography variant="subtitle1" fontWeight={700}>
                Dados do Cliente
              </Typography>
            </Box>
            <Typography variant="body2" gutterBottom>
              <strong>Nome:</strong> {customer.nome}
            </Typography>
            <Typography variant="body2" gutterBottom>
              <strong>CPF:</strong> {maskCPF(customer.cpf)}
            </Typography>
            <Typography variant="body2" gutterBottom>
              <strong>Email:</strong> {customer.email}
            </Typography>
            <Typography variant="body2">
              <strong>Celular:</strong> {customer.phone}
            </Typography>
          </CardContent>
        </Card>

        {/* MÉTODO DE PAGAMENTO */}
        <Card
          elevation={0}
          sx={{
            mb: 2,
            borderRadius: 2,
            border: "1px solid #E5E7EB",
            boxShadow: "0 10px 30px rgba(15,23,42,0.04)",
            bgcolor: "#FFFFFF",
          }}
        >
          <CardContent sx={{ p: 2.2 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mb: 1.5,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <Icon
                  icon="mdi:qrcode"
                  width={22}
                  style={{ marginRight: 8, color: "#16A34A" }}
                />
                <Typography variant="subtitle1" fontWeight={700}>
                  Método de pagamento
                </Typography>
              </Box>
              <Chip label="Selecionado" color="success" size="small" />
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Icon
                icon="simple-icons:pix"
                width={36}
                style={{ color: "#00A868" }}
              />
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  PIX
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Pagamento instantâneo e seguro
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* ORDER BUMP - AGORA LOGO APÓS MÉTODO DE PAGAMENTO */}
        <OrderBumpCard />

        {/* RESUMO DO PEDIDO */}
        <Paper
          elevation={0}
          sx={{
            p: 2.4,
            mb: 2.5,
            borderRadius: 2,
            border: "1px solid #E5E7EB",
            boxShadow: "0 10px 30px rgba(15,23,42,0.04)",
            bgcolor: "#FFFFFF",
          }}
        >
          <Typography
            variant="subtitle1"
            fontWeight={700}
            gutterBottom
            sx={{ mb: 1.2 }}
          >
            Resumo do pedido
          </Typography>

          <Divider sx={{ mb: 1.8 }} />

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              mb: 1,
            }}
          >
            <Typography variant="body2">
              Seu pedido: {qty} números com preço promocional
            </Typography>
            <Typography variant="body2" fontWeight={700}>
              {formatBRL(totalReais)}
            </Typography>
          </Box>

          <Divider sx={{ my: 1.6 }} />

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Typography
              variant="subtitle1"
              fontWeight={700}
              sx={{ color: "#111827" }}
            >
              Total:
            </Typography>
            <Typography
              variant="h6"
              fontWeight={800}
              sx={{ color: "#16A34A" }}
            >
              {formatBRL(totalReais)}
            </Typography>
          </Box>
        </Paper>
      </Container>

      {/* CTA FIXO NO RODAPÉ */}
      <Box
        sx={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: "#FFFFFF",
          borderTop: "1px solid #E5E7EB",
          boxShadow: "0 -8px 24px rgba(15,23,42,0.16)",
          py: 1.2,
          zIndex: 1300,
        }}
      >
        <Container maxWidth="sm">
          <Stack spacing={1}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontSize: "0.78rem", color: "#6B7280" }}
              >
                Total
              </Typography>
              <Typography
                variant="h6"
                sx={{ fontWeight: 800, color: "#111827" }}
              >
                {formatBRL(totalReais)}
              </Typography>
            </Box>

            <Button
              onClick={handleConfirm}
              variant="contained"
              fullWidth
              sx={{
                fontWeight: 800,
                borderRadius: 999,
                py: 1.1,
                fontSize: "0.98rem",
                textTransform: "none",
                letterSpacing: 0.3,
                bgcolor: "#16A34A",
                "&:hover": {
                  bgcolor: "#15803D",
                },
              }}
            >
              Confirmar compra
            </Button>
          </Stack>
        </Container>
      </Box>
    </Box>
  )
}
