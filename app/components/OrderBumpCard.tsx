"use client"

import { useState, useEffect } from "react"
import {
  Paper,
  Box,
  Typography,
  Button,
  Stack,
  Chip,
} from "@mui/material"
import { Icon } from "@iconify/react"
import { useCartStore } from "@/store/cartStore"
import { formatBRL } from "@/lib/formatCurrency"
import { useToast } from "./ui/Toast"

const BUMP_QTY = 2000          // +2.000 números extras
const BUMP_PRICE_CENTS = 990   // R$ 9,90

// tempo inicial do contador: 1 minuto
const INITIAL_MINUTES = 1
const INITIAL_SECONDS = 0

export default function OrderBumpCard() {
  const {
    addOrderBump,
    bumpQty,
    bumpAmountInCents,
  } = useCartStore()
  const { show } = useToast()

  // aplicado local (sincronizado com o store)
  const [applied, setApplied] = useState(false)

  // estado do contador em segundos
  const [timeLeft, setTimeLeft] = useState(
    INITIAL_MINUTES * 60 + INITIAL_SECONDS,
  )

  // Se o bump já estiver no carrinho (ex: recarregou a página), marca como aplicado
  useEffect(() => {
    if (bumpQty >= BUMP_QTY && bumpAmountInCents >= BUMP_PRICE_CENTS) {
      setApplied(true)
    }
  }, [bumpQty, bumpAmountInCents])

  // efeito para fazer o contador descer usando o tempo real
  useEffect(() => {
    if (applied) return

    const totalSeconds = INITIAL_MINUTES * 60 + INITIAL_SECONDS
    const startTime = Date.now()

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      const remaining = totalSeconds - elapsed

      setTimeLeft((prev) => {
        const next = remaining > 0 ? remaining : 0
        return next !== prev ? next : prev
      })

      if (remaining <= 0) {
        clearInterval(interval)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [applied])

  // formata o tempo em MM:SS
  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(
    seconds,
  ).padStart(2, "0")}`

  const handleApply = () => {
    if (applied) return

    // ✅ agora o bump SOMA números e valor em cima do que já existe
    addOrderBump(BUMP_QTY, BUMP_PRICE_CENTS)
    setApplied(true)

    show(
      `🚀 Oferta especial ativada! +${BUMP_QTY.toLocaleString(
        "pt-BR",
      )} números adicionados <b>(${formatBRL(
        BUMP_PRICE_CENTS / 100,
      )})</b>`,
      "special-2000-990",
    )
  }

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 3,
        borderRadius: 2.5,
        overflow: "hidden",
        border: "1px solid #FDBA74",
        boxShadow: "0 14px 40px rgba(249,115,22,0.18)",
        position: "relative",
        "@keyframes bumpGlow": {
          "0%": {
            boxShadow: "0 0 0 0 rgba(248,113,22,0.45)",
          },
          "70%": {
            boxShadow: "0 0 0 12px rgba(248,113,22,0)",
          },
          "100%": {
            boxShadow: "0 0 0 0 rgba(248,113,22,0)",
          },
        },
        animation: !applied ? "bumpGlow 1.8s ease-out infinite" : "none",
      }}
    >
      {/* TOPO LARANJA / HEADER */}
      <Box
        sx={{
          px: 2.2,
          py: 1.2,
          bgcolor: "linear-gradient(90deg,#FB923C,#F97316)",
          background:
            "linear-gradient(135deg, #FB923C 0%, #F97316 40%, #EF4444 100%)",
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 800, letterSpacing: 0.4, fontSize: "0.78rem" }}
          >
            Saia na frente!
          </Typography>
          <Typography
            variant="caption"
            sx={{ opacity: 0.95, fontSize: "0.72rem" }}
          >
            Aumente suas chances em <b>+127%</b>
          </Typography>
        </Box>

        <Chip
          label="QUENTE"
          size="small"
          icon={<Icon icon="mdi:fire" width={14} />}
          sx={{
            bgcolor: "rgba(255,255,255,0.16)",
            color: "#FFF",
            borderRadius: 999,
            pl: 0.5,
            "& .MuiChip-icon": {
              color: "#FACC15",
              ml: 0.2,
            },
            fontSize: "0.7rem",
            fontWeight: 700,
          }}
        />
      </Box>

      {/* CORPO BRANCO */}
      <Box sx={{ px: 2.2, pt: 1.6, pb: 2 }}>
        <Box sx={{ textAlign: "center", mb: 1.2 }}>
          <Typography
            variant="caption"
            sx={{ fontSize: "0.7rem", color: "#F97316", fontWeight: 700 }}
          >
            Triplicar as chances
          </Typography>
          <Typography
            variant="body2"
            sx={{ mt: 0.4, color: "#111827", fontSize: "0.86rem" }}
          >
            Adicione{" "}
            <b style={{ color: "#DC2626" }}>+{BUMP_QTY} números</b> por apenas
          </Typography>

          {/* 🔥 BLOCO DO PREÇO DESTACADO */}
          <Box
            sx={{
              mt: 1,
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
              px: 2,
              py: 0.8,
              borderRadius: 999,
              bgcolor: "#ECFDF5",
              border: "1px solid #22C55E",
            }}
          >
            <Typography
              variant="h6"
              sx={{
                m: 0,
                lineHeight: 1,
                fontWeight: 900,
                color: "#16A34A",
                fontSize: "1.4rem",
              }}
            >
              {formatBRL(BUMP_PRICE_CENTS / 100)}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                fontSize: "0.7rem",
                color: "#047857",
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              Aumente a sua sorte em 100x
            </Typography>
          </Box>
        </Box>

        {/* BULLETS */}
        <Stack spacing={0.4} sx={{ mb: 1.6, pl: 0.5 }}>
          {[
            "127% mais chances de ganhar",
            "Vantagem competitiva sobre outros participantes",
            "Mais números = mais sorte",
            "Condição exclusiva por R$ 9,90",
          ].map((item, idx) => (
            <Box
              key={idx}
              sx={{ display: "flex", alignItems: "center", gap: 0.6 }}
            >
              <Icon
                icon="mdi:check-circle"
                width={16}
                style={{ color: "#16A34A" }}
              />
              <Typography
                variant="caption"
                sx={{ fontSize: "0.76rem", color: "#374151" }}
              >
                {item}
              </Typography>
            </Box>
          ))}
        </Stack>

        {/* BLOCO DE URGÊNCIA */}
        <Box
          sx={{
            mt: 0.4,
            mb: 1.6,
            borderRadius: 1.5,
            border: "1px dashed #FDBA74",
            bgcolor: "#FFF7ED",
            px: 1.5,
            py: 1,
            textAlign: "center",
          }}
        >
          <Typography
            variant="caption"
            sx={{
              display: "block",
              fontSize: "0.72rem",
              color: "#EA580C",
              mb: 0.4,
            }}
          >
            🕒 Oportunidade única válida apenas nesta etapa do checkout
          </Typography>
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              px: 1.8,
              py: 0.4,
              borderRadius: 999,
              bgcolor: "#EF4444",
              color: "#FFFFFF",
              fontWeight: 800,
              fontSize: "0.78rem",
              letterSpacing: 0.4,
              "@keyframes blink": {
                "0%, 100%": { opacity: 1 },
                "50%": { opacity: 0.65 },
              },
              animation: "blink 1.2s infinite",
            }}
          >
            {formattedTime}
          </Box>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              mt: 0.4,
              fontSize: "0.7rem",
              color: "#B45309",
            }}
          >
            Outros participantes já estão aproveitando esta oferta!
          </Typography>
        </Box>

        {/* BOTÃO PRINCIPAL DO BUMP */}
        <Button
          fullWidth
          onClick={handleApply}
          disabled={applied}
          variant={applied ? "outlined" : "contained"}
          sx={{
            mt: 0.2,
            borderRadius: 999,
            fontWeight: 800,
            fontSize: "0.82rem",
            textTransform: "none",
            py: 1.2,
            bgcolor: applied ? "#FFFFFF" : "#F97316",
            borderColor: "#F97316",
            color: applied ? "#F97316" : "#FFFFFF",
            "&:hover": {
              bgcolor: applied ? "#FFF7ED" : "#EA580C",
            },
          }}
        >
          {applied ? (
            "Oferta adicionada ao pedido ✅"
          ) : (
            <>
              <Icon
                icon="mdi:rocket-launch"
                width={18}
                style={{ marginRight: 6 }}
              />
              QUERO TRIPLICAR MINHAS CHANCES!
            </>
          )}
        </Button>
      </Box>
    </Paper>
  )
}
