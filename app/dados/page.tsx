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

const EMAIL_DOMAINS = ["gmail.com", "hotmail.com", "outlook.com", "icloud.com", "yahoo.com"]

export default function DadosPage() {
  const router = useRouter()

  // ✅ CORREÇÃO CRÍTICA: no store é totalInCents (não existe "total")
  const { qty, totalInCents } = useCartStore()

  const [cpf, setCpf] = useState("")
  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [birthdate, setBirthdate] = useState("")
  const [error, setError] = useState("")
  const [autoFillMessage, setAutoFillMessage] = useState("")
  const [autoFillCheckedCpf, setAutoFillCheckedCpf] = useState<string | null>(null)

  // ✅ Anti-fluxo quebrado: se cair aqui sem carrinho, manda pra home
  useEffect(() => {
    if (!qty || qty <= 0 || !totalInCents || totalInCents <= 0) {
      router.replace("/")
    }
  }, [qty, totalInCents, router])

  // Formatadores simples
  const formatCPF = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 11)
    if (numbers.length <= 3) return numbers
    if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`
    if (numbers.length <= 9) return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9)}`
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
    if (numbers.length <= 4) return `${numbers.slice(0, 2)}/${numbers.slice(2)}`
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
    if (typeof window === "undefined") return

    // ✅ Sanitização forte (evita salvar "undefined"/NaN e quebrar confirmação)
    const safeQty = Number.isFinite(Number(qty)) ? Math.max(0, Number(qty)) : 0
    const safeTotalInCents = Number.isFinite(Number(totalInCents))
      ? Math.max(0, Number(totalInCents))
      : 0

    if (!safeQty || safeQty <= 0 || !safeTotalInCents || safeTotalInCents <= 0) {
      setError("Seu carrinho está vazio. Volte e selecione os números novamente.")
      return
    }

    const payload = { cpf, nome, email, phone, birthdate }
    localStorage.setItem("checkoutCustomer", JSON.stringify(payload))

    // ✅ compat: mantém chaves antigas + novas
    localStorage.setItem("checkoutQuantity", String(safeQty))
    // antigo (em reais)
    localStorage.setItem("checkoutTotal", String((safeTotalInCents / 100).toFixed(2)))
    // novo (em centavos)
    localStorage.setItem("checkoutTotalInCents", String(safeTotalInCents))

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
        if (data.nome) setNome(data.nome)
        if (data.email) setEmail(data.email)
        if (data.phone) setPhone(data.phone)
        if (data.birthdate) setBirthdate(data.birthdate)

        setAutoFillMessage("Encontramos seus dados da sua última participação e preenchemos automaticamente.")
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

  // 🔎 sugestões de e-mail
  const emailTrimmed = email.trim()
  const [userPart, domainPart] = emailTrimmed.split("@")
  const hasAt = emailTrimmed.includes("@")
  const showEmailSuggestions = !!userPart && !emailTrimmed.includes(" ") && userPart.length >= 2

  const filteredDomains = EMAIL_DOMAINS.filter((d) => {
    if (!hasAt) return true
    const fragment = (domainPart || "").toLowerCase()
    if (!fragment) return true
    return d.startsWith(fragment)
  })

  const emailSuggestions = showEmailSuggestions ? filteredDomains.map((d) => `${userPart}@${d}`) : []

  // ---------- TOKENS VISUAIS (alinhado com / e /pagamento) ----------
  const BG = "#0B0F19"
  const GLASS = "rgba(255,255,255,0.06)"
  const GLASS_SOFT = "rgba(255,255,255,0.04)"
  const BORDER = "rgba(255,255,255,0.10)"
  const TXT = "rgba(255,255,255,0.92)"
  const MUTED = "rgba(255,255,255,0.68)"
  const GREEN = "#22C55E"
  const GREEN_DARK = "#16A34A"
  const RED = "#DC2626"

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: BG,
        display: "flex",
        justifyContent: "center",
        alignItems: { xs: "center", sm: "flex-start" },
        px: { xs: 1.5, sm: 0 },
        backgroundImage:
          "radial-gradient(1200px 600px at 20% 10%, rgba(34,197,94,0.14), transparent 60%), radial-gradient(900px 500px at 90% 0%, rgba(220,38,38,0.10), transparent 55%)",
      }}
    >
      <Container
        maxWidth="sm"
        sx={{
          py: { xs: 2.5, sm: 4 },
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: "100%",
            p: { xs: 2.2, sm: 3.2 },
            borderRadius: 3,
            bgcolor: GLASS,
            border: `1px solid ${BORDER}`,
            backdropFilter: "blur(10px)",
            boxShadow: "0 18px 42px rgba(0,0,0,0.38)",
          }}
        >
          {/* Header */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                bgcolor: "rgba(34,197,94,0.14)",
                border: "1px solid rgba(34,197,94,0.28)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 10px 22px rgba(34,197,94,0.12)",
              }}
            >
              <Icon icon="mdi:account-circle" width={24} style={{ color: GREEN }} />
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={900} sx={{ lineHeight: 1.1, color: "#fff" }}>
                Dados pessoais
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.35, color: MUTED, fontSize: "0.84rem" }}>
                Preencha seus dados para continuar com a compra.
              </Typography>
            </Box>
          </Box>

          {/* Barra de progresso */}
          <Box sx={{ mb: 2.2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: MUTED }}>
                Etapa 2 de 3
              </Typography>
              <Typography variant="caption" sx={{ color: MUTED }}>
                Método de pagamento é a próxima
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={66}
              sx={{
                height: 7,
                borderRadius: 999,
                bgcolor: "rgba(255,255,255,0.10)",
                "& .MuiLinearProgress-bar": {
                  borderRadius: 999,
                  bgcolor: GREEN,
                },
              }}
            />
          </Box>

          {/* Resumo do pedido */}
          <Box
            sx={{
              mb: 2.2,
              p: 1.4,
              borderRadius: 2.5,
              bgcolor: GLASS_SOFT,
              border: `1px dashed ${BORDER}`,
            }}
          >
            <Typography sx={{ display: "block", mb: 0.3, fontSize: "0.74rem", color: MUTED }}>
              Seu pedido até aqui:
            </Typography>
            <Typography sx={{ fontWeight: 900, color: "#fff", fontSize: "0.92rem" }}>
              {qty} números selecionados na etapa anterior.
            </Typography>
          </Box>

          {/* Mensagem de autofill */}
          {autoFillMessage && !error && (
            <Alert
              severity="info"
              sx={{
                mb: 2,
                bgcolor: "rgba(59,130,246,0.10)",
                border: "1px solid rgba(59,130,246,0.20)",
                color: TXT,
                "& .MuiAlert-icon": { color: "rgba(59,130,246,0.9)" },
              }}
            >
              {autoFillMessage}
            </Alert>
          )}

          {/* Form */}
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{
              "& .MuiInputLabel-root": { color: MUTED },
              "& .MuiInputLabel-root.Mui-focused": { color: "#fff" },
              "& .MuiOutlinedInput-root": {
                bgcolor: "rgba(255,255,255,0.04)",
                borderRadius: 2.5,
                color: "#fff",
                "& fieldset": { borderColor: BORDER },
                "&:hover fieldset": { borderColor: "rgba(255,255,255,0.18)" },
                "&.Mui-focused fieldset": { borderColor: "rgba(34,197,94,0.55)" },
              },
              "& .MuiFormHelperText-root": { color: MUTED },
            }}
          >
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

            <Box sx={{ mt: 0.5 }}>
              <TextField
                label="Email *"
                type="email"
                value={email}
                onChange={(e) => {
                  setError("")
                  setAutoFillMessage("")
                  setEmail(e.target.value)
                }}
                fullWidth
                required
                margin="normal"
                placeholder="seu@email.com"
              />

              {emailSuggestions.length > 0 && (
                <Box sx={{ mt: 0.6, display: "flex", flexWrap: "wrap", gap: 0.6 }}>
                  {emailSuggestions.map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      variant="outlined"
                      size="small"
                      onClick={() => setEmail(suggestion)}
                      sx={{
                        textTransform: "none",
                        borderRadius: 999,
                        fontSize: "0.78rem",
                        px: 1.2,
                        py: 0.25,
                        borderColor: "rgba(255,255,255,0.16)",
                        color: "rgba(255,255,255,0.82)",
                        bgcolor: "rgba(255,255,255,0.04)",
                        "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
                      }}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </Box>
              )}
            </Box>

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
              <Alert
                severity="error"
                sx={{
                  mt: 2,
                  bgcolor: "rgba(220,38,38,0.12)",
                  border: "1px solid rgba(220,38,38,0.22)",
                  color: TXT,
                  "& .MuiAlert-icon": { color: RED },
                }}
              >
                {error}
              </Alert>
            )}

            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              sx={{
                mt: 3,
                py: 1.35,
                fontWeight: 1000,
                borderRadius: 999,
                textTransform: "none",
                bgcolor: GREEN,
                color: "#0B0F19",
                boxShadow: "0px 14px 30px rgba(34,197,94,0.22)",
                "&:hover": { bgcolor: GREEN_DARK },
              }}
              endIcon={<Icon icon="mdi:arrow-right" width={22} />}
            >
              Ir para confirmação
            </Button>

            <Button
              fullWidth
              variant="text"
              sx={{
                mt: 1.2,
                textTransform: "none",
                fontSize: "0.86rem",
                color: "rgba(255,255,255,0.70)",
                "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
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
