"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Container,
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  LinearProgress,
} from "@mui/material"
import { Icon } from "@iconify/react"
import { useCartStore } from "@/store/cartStore"

export default function DadosPage() {
  const router = useRouter()
  const { qty, total } = useCartStore()

  const [cpf, setCpf] = useState("")
  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [birthdate, setBirthdate] = useState("")
  const [error, setError] = useState("")
  const [autoFillMessage, setAutoFillMessage] = useState("")
  const [autoFillCheckedCpf, setAutoFillCheckedCpf] = useState<string | null>(
    null
  )

  // Formatadores simples
  const formatCPF = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 11)
    if (numbers.length <= 3) return numbers
    if (numbers.length <= 6)
      return `${numbers.slice(0, 3)}.${numbers.slice(3)}`
    if (numbers.length <= 9)
      return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(
        6,
      )}`
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(
      6,
      9,
    )}-${numbers.slice(9)}`
  }

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 11)
    if (numbers.length <= 2) return numbers
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`
  }

  const formatDate = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 8)
    if (numbers.length <= 2) return numbers
    if (numbers.length <= 4)
      return `${numbers.slice(0, 2)}/${numbers.slice(2)}`
    return `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}/${numbers.slice(4)}`
  }

  const validateForm = () => {
    if (cpf.replace(/\D/g, "").length !== 11) {
      setError("CPF inválido. Deve conter 11 dígitos.")
      return false
    }
    if (nome.trim().length < 2) {
      setError("Nome deve ter pelo menos 2 caracteres.")
      return false
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError("Email inválido.")
      return false
    }
    if (phone.replace(/\D/g, "").length < 10) {
      setError("Telefone inválido.")
      return false
    }
    if (birthdate.replace(/\D/g, "").length !== 8) {
      setError("Data de nascimento inválida.")
      return false
    }
    return true
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setAutoFillMessage("")

    if (!validateForm()) return

    const payload = { cpf, nome, email, phone, birthdate }

    localStorage.setItem("checkoutCustomer", JSON.stringify(payload))
    localStorage.setItem("checkoutQuantity", String(qty))
    localStorage.setItem("checkoutTotal", String(total))

    router.push("/confirmacao")
  }

  // 🔥 Autofill inteligente baseado no último checkout salvo no navegador
  useEffect(() => {
    if (typeof window === "undefined") return

    const cleanCpf = cpf.replace(/\D/g, "")
    if (cleanCpf.length !== 11) {
      setAutoFillMessage("")
      return
    }

    // evita ficar checando o mesmo CPF toda hora
    if (autoFillCheckedCpf === cleanCpf) return

    try {
      const stored = localStorage.getItem("checkoutCustomer")
      if (!stored) {
        setAutoFillCheckedCpf(cleanCpf)
        setAutoFillMessage("")
        return
      }

      const data = JSON.parse(stored) as {
        cpf?: string
        nome?: string
        email?: string
        phone?: string
        birthdate?: string
      }

      const storedCleanCpf = (data.cpf || "").replace(/\D/g, "")
      if (storedCleanCpf && storedCleanCpf === cleanCpf) {
        // preenche automaticamente
        if (data.nome) setNome(data.nome)
        if (data.email) setEmail(data.email)
        if (data.phone) setPhone(data.phone)
        if (data.birthdate) setBirthdate(data.birthdate)

        setAutoFillMessage(
          "Encontramos seus dados da sua última participação e preenchemos automaticamente."
        )
      } else {
        setAutoFillMessage("")
      }

      setAutoFillCheckedCpf(cleanCpf)
    } catch (err) {
      console.error("Erro ao tentar autofill de checkoutCustomer:", err)
      setAutoFillMessage("")
      setAutoFillCheckedCpf(cleanCpf)
    }
  }, [cpf, autoFillCheckedCpf])

  return (
    <Box sx={{ bgcolor: "background.default", minHeight: "100vh" }}>
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Paper
          elevation={3}
          sx={{
            p: { xs: 3, sm: 4 },
            borderRadius: 3,
          }}
        >
          {/* Header */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              mb: 2,
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                bgcolor: "success.light",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon
                icon="mdi:account-circle"
                width={24}
                style={{ color: "#16a34a" }}
              />
            </Box>

            <Box>
              <Typography
                variant="h6"
                fontWeight={700}
                sx={{ lineHeight: 1.1 }}
              >
                Dados pessoais
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.3 }}
              >
                Preencha seus dados para continuar com a compra.
              </Typography>
            </Box>
          </Box>

          {/* Barra de progresso discreta */}
          <Box sx={{ mb: 3 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                mb: 0.5,
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Etapa 2 de 3
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Método de pagamento é a próxima
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={66}
              sx={{
                height: 6,
                borderRadius: 999,
                bgcolor: "#E5E7EB",
                "& .MuiLinearProgress-bar": {
                  borderRadius: 999,
                  bgcolor: "#16A34A",
                },
              }}
            />
          </Box>

          {/* Resumo da escolha anterior */}
          <Box
            sx={{
              mb: 3,
              p: 1.5,
              borderRadius: 2,
              bgcolor: "#F9FAFB",
              border: "1px dashed #D1D5DB",
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 0.3 }}
            >
              Seu pedido até aqui:
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {qty} números selecionados na etapa anterior.
            </Typography>
          </Box>

          {/* Mensagem de autofill (se rolou) */}
          {autoFillMessage && !error && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {autoFillMessage}
            </Alert>
          )}

          {/* Formulário */}
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              label="CPF *"
              value={cpf}
              onChange={(e) => {
                setError("")
                setAutoFillMessage("")
                setCpf(formatCPF(e.target.value))
              }}
              fullWidth
              required
              margin="normal"
              placeholder="000.000.000-00"
              inputProps={{ maxLength: 14 }}
            />

            <TextField
              label="Nome completo *"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              fullWidth
              required
              margin="normal"
              placeholder="Seu nome completo"
            />

            <TextField
              label="Email *"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              required
              margin="normal"
              placeholder="seu@email.com"
            />

            <TextField
              label="Celular *"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              fullWidth
              required
              margin="normal"
              placeholder="(00) 00000-0000"
              inputProps={{ maxLength: 15 }}
            />

            <TextField
              label="Data de nascimento *"
              value={birthdate}
              onChange={(e) => setBirthdate(formatDate(e.target.value))}
              fullWidth
              required
              margin="normal"
              placeholder="DD/MM/AAAA"
              inputProps={{ maxLength: 10 }}
            />

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              type="submit"
              variant="contained"
              color="success"
              size="large"
              fullWidth
              sx={{
                mt: 3,
                py: 1.6,
                fontWeight: 700,
                borderRadius: 999,
                textTransform: "none",
              }}
              endIcon={<Icon icon="mdi:arrow-right" width={22} />}
            >
              Ir para confirmação
            </Button>

            <Button
              fullWidth
              variant="text"
              sx={{
                mt: 1.5,
                textTransform: "none",
                fontSize: "0.85rem",
              }}
              onClick={() => router.push("/")}
            >
              Voltar para a página inicial
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  )
}
