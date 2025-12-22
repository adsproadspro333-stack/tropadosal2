"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Paper,
  Box,
  Typography,
  Button,
  Stack,
  Chip,
  Divider,
  LinearProgress,
  Collapse,
} from "@mui/material"
import { Icon } from "@iconify/react"
import { useCartStore } from "@/store/cartStore"
import { useShallow } from "zustand/react/shallow"
import { formatBRL } from "@/lib/formatCurrency"
import { useToast } from "./ui/Toast"

const BUMP_QTY = 50
const BUMP_PRICE_CENTS = 990

const INITIAL_MINUTES = 1
const INITIAL_SECONDS = 0

export default function OrderBumpCard() {
  // ✅ selector com cache (evita loop do getSnapshot)
  const { addOrderBump, bumpQty, bumpAmountInCents } = useCartStore(
    useShallow((s) => ({
      addOrderBump: s.addOrderBump,
      bumpQty: s.bumpQty,
      bumpAmountInCents: s.bumpAmountInCents,
    })),
  )

  const { show } = useToast()

  const [applied, setApplied] = useState(false)
  const [justApplied, setJustApplied] = useState(false)

  const totalSeconds = useMemo(
    () => INITIAL_MINUTES * 60 + INITIAL_SECONDS,
    [],
  )

  const [timeLeft, setTimeLeft] = useState(totalSeconds)

  // Se o bump já estiver no carrinho (ex: recarregou a página), marca como aplicado
  useEffect(() => {
    if (bumpQty >= BUMP_QTY && bumpAmountInCents >= BUMP_PRICE_CENTS) {
      setApplied(true)
    }
  }, [bumpQty, bumpAmountInCents])

  // efeito para fazer o contador descer usando o tempo real
  useEffect(() => {
    if (applied) return

    const startTime = Date.now()

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      const remaining = totalSeconds - elapsed

      setTimeLeft((prev) => {
        const next = remaining > 0 ? remaining : 0
        return next !== prev ? next : prev
      })

      if (remaining <= 0) clearInterval(interval)
    }, 1000)

    return () => clearInterval(interval)
  }, [applied, totalSeconds])

  // formata o tempo em MM:SS
  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(
    seconds,
  ).padStart(2, "0")}`

  const isEnding = !applied && timeLeft > 0 && timeLeft <= 10

  const handleApply = () => {
    if (applied) return

    addOrderBump(BUMP_QTY, BUMP_PRICE_CENTS)
    setApplied(true)

    setJustApplied(true)
    setTimeout(() => setJustApplied(false), 2600)

    show(
      `🚀 Oferta especial ativada! +${BUMP_QTY.toLocaleString(
        "pt-BR",
      )} números adicionados <b>(${formatBRL(BUMP_PRICE_CENTS / 100)})</b>`,
      "special-50-990",
    )
  }

  // tokens visuais
  const GLASS = "rgba(255,255,255,0.06)"
  const BORDER = "rgba(255,255,255,0.10)"
  const TXT = "rgba(255,255,255,0.90)"
  const MUTED = "rgba(255,255,255,0.68)"
  const GREEN = "#22C55E"

  // barra de urgência (0..100)
  const urgencyValue = useMemo(() => {
    if (applied) return 100
    const ratio = totalSeconds > 0 ? timeLeft / totalSeconds : 0
    const clamped = Math.max(0, Math.min(1, ratio))
    return Math.round(clamped * 100)
  }, [applied, timeLeft, totalSeconds])

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 2.2,
        borderRadius: 3,
        overflow: "hidden",
        border: applied
          ? `1px solid ${BORDER}`
          : "1px solid rgba(249,115,22,0.28)",
        bgcolor: GLASS,
        backdropFilter: "blur(10px)",
        boxShadow: applied
          ? "0 12px 34px rgba(0,0,0,0.32)"
          : "0 14px 44px rgba(249,115,22,0.10)",
        position: "relative",

        "@keyframes bumpGlow": {
          "0%": { boxShadow: "0 0 0 0 rgba(249,115,22,0.18)" },
          "70%": { boxShadow: "0 0 0 14px rgba(249,115,22,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(249,115,22,0)" },
        },
        "@keyframes shimmer": {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(120%)" },
        },
        "@keyframes pulseCTA": {
          "0%": { transform: "scale(1)", filter: "brightness(1)" },
          "50%": { transform: "scale(1.018)", filter: "brightness(1.06)" },
          "100%": { transform: "scale(1)", filter: "brightness(1)" },
        },
        "@keyframes blink": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.72 },
        },
        "@keyframes popIn": {
          "0%": { transform: "translateY(6px)", opacity: 0 },
          "100%": { transform: "translateY(0)", opacity: 1 },
        },
        "@keyframes confettiFade": {
          "0%": { opacity: 0, transform: "scale(0.96)" },
          "10%": { opacity: 1, transform: "scale(1)" },
          "100%": { opacity: 0, transform: "scale(1.02)" },
        },

        animation: !applied ? "bumpGlow 1.9s ease-out infinite" : "none",
      }}
    >
      {!applied && (
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              top: -40,
              left: 0,
              width: "45%",
              height: "140%",
              background:
                "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.08) 35%, rgba(255,255,255,0) 70%)",
              transform: "translateX(-120%)",
              animation: "shimmer 2.6s ease-in-out infinite",
              opacity: 0.55,
            }}
          />
        </Box>
      )}

      {justApplied && (
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(700px 200px at 50% 20%, rgba(34,197,94,0.18), transparent 60%)",
            animation: "confettiFade 2.6s ease-out forwards",
          }}
        />
      )}

      <Box
        sx={{
          px: 2,
          py: 1.2,
          background:
            "linear-gradient(135deg, rgba(249,115,22,0.18) 0%, rgba(239,68,68,0.10) 55%, rgba(0,0,0,0) 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.2,
          position: "relative",
          zIndex: 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.1, minWidth: 0 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "12px",
              bgcolor: applied ? "rgba(34,197,94,0.14)" : "rgba(249,115,22,0.14)",
              border: applied
                ? "1px solid rgba(34,197,94,0.22)"
                : "1px solid rgba(249,115,22,0.22)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "all 180ms ease",
              transform: justApplied ? "scale(1.04)" : "scale(1)",
            }}
          >
            <Icon
              icon={applied ? "mdi:check-decagram-outline" : "mdi:rocket-launch"}
              width={18}
              color={applied ? GREEN : "#FB923C"}
            />
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                fontWeight: 1000,
                color: "#fff",
                fontSize: "0.92rem",
                lineHeight: 1.15,
              }}
            >
              Oferta rápida do checkout
            </Typography>

            <Typography
              sx={{
                color: MUTED,
                fontSize: "0.78rem",
                display: "block",
                mt: 0.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              +{BUMP_QTY} números por {formatBRL(BUMP_PRICE_CENTS / 100)}
            </Typography>
          </Box>
        </Box>

        <Chip
          label={applied ? "Ativada" : formattedTime}
          size="small"
          sx={{
            bgcolor: applied ? "rgba(34,197,94,0.12)" : "rgba(249,115,22,0.14)",
            color: applied ? GREEN : "#FDBA74",
            borderRadius: 999,
            fontWeight: 1000,
            border: applied
              ? "1px solid rgba(34,197,94,0.22)"
              : "1px solid rgba(249,115,22,0.22)",
            animation: applied ? "none" : isEnding ? "blink 0.8s infinite" : "none",
          }}
        />
      </Box>

      {!applied && (
        <Box sx={{ px: 2, pb: 1.0, position: "relative", zIndex: 1 }}>
          <LinearProgress
            variant="determinate"
            value={urgencyValue}
            sx={{
              height: 6,
              borderRadius: 999,
              bgcolor: "rgba(255,255,255,0.08)",
              "& .MuiLinearProgress-bar": {
                bgcolor: isEnding ? "rgba(239,68,68,0.95)" : "rgba(249,115,22,0.95)",
                borderRadius: 999,
                transition: "transform 250ms linear",
              },
            }}
          />
        </Box>
      )}

      <Divider sx={{ borderColor: BORDER }} />

      <Box sx={{ px: 2, pt: 1.6, pb: 1.8, position: "relative", zIndex: 1 }}>
        <Collapse in={applied} timeout={220}>
          <Box
            sx={{
              mb: 1.25,
              borderRadius: 2,
              border: "1px solid rgba(34,197,94,0.22)",
              bgcolor: "rgba(34,197,94,0.10)",
              px: 1.2,
              py: 0.95,
              display: "flex",
              alignItems: "center",
              gap: 0.9,
              animation: "popIn 200ms ease-out",
            }}
          >
            <Icon icon="mdi:check-circle" width={18} color={GREEN} />
            <Typography sx={{ color: "rgba(255,255,255,0.92)", fontSize: "0.82rem", fontWeight: 950 }}>
              Oferta ativada: <span style={{ color: GREEN }}>+{BUMP_QTY} números</span> no seu pedido ✅
            </Typography>
          </Box>
        </Collapse>

        <Box sx={{ textAlign: "center", mb: 1.25 }}>
          <Typography sx={{ fontWeight: 1000, color: "#fff", fontSize: "0.95rem" }}>
            Adicione <span style={{ color: "#FDBA74" }}>+{BUMP_QTY} números</span> agora
          </Typography>

          <Box
            sx={{
              mt: 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 1.0,
              px: 1.4,
              py: 0.75,
              borderRadius: 999,
              bgcolor: "rgba(255,255,255,0.05)",
              border: `1px solid ${BORDER}`,
            }}
          >
            <Typography
              sx={{
                fontWeight: 1000,
                color: GREEN,
                fontSize: "1.25rem",
                lineHeight: 1,
                letterSpacing: "-0.02em",
              }}
            >
              {formatBRL(BUMP_PRICE_CENTS / 100)}
            </Typography>

            <Chip
              label="mais chances"
              size="small"
              sx={{
                bgcolor: "rgba(34,197,94,0.12)",
                color: GREEN,
                borderRadius: 999,
                fontWeight: 950,
                border: "1px solid rgba(34,197,94,0.20)",
              }}
            />
          </Box>

          <Typography sx={{ display: "block", mt: 0.7, color: MUTED, fontSize: "0.78rem" }}>
            Oferta válida só nesta etapa. Depois some.
          </Typography>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr" },
            gap: 0.8,
            mb: 1.35,
          }}
        >
          {[
            "Mais chances de ganhar",
            "Vantagem sobre outros",
            "Mais números = mais sorte",
            "Condição exclusiva",
          ].map((item, idx) => (
            <Box
              key={idx}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.6,
                p: 1,
                borderRadius: 2,
                bgcolor: "rgba(255,255,255,0.05)",
                border: `1px solid ${BORDER}`,
                transition: "transform 140ms ease, border-color 140ms ease",
                "&:active": { transform: "scale(0.99)" },
              }}
            >
              <Icon icon="mdi:check-circle" width={16} color={GREEN} />
              <Typography sx={{ fontSize: "0.78rem", color: TXT, fontWeight: 800 }}>
                {item}
              </Typography>
            </Box>
          ))}
        </Box>

        <Button
          fullWidth
          onClick={handleApply}
          disabled={applied || timeLeft <= 0}
          variant={applied ? "outlined" : "contained"}
          sx={{
            borderRadius: 999,
            fontWeight: 1000,
            fontSize: "0.92rem",
            textTransform: "none",
            py: 1.05,
            bgcolor: applied ? "rgba(255,255,255,0.06)" : "#F97316",
            borderColor: applied ? BORDER : "#F97316",
            color: applied ? "rgba(255,255,255,0.88)" : "#0B0F19",
            transition: "transform 120ms ease, filter 120ms ease, background-color 120ms ease",
            animation: !applied && timeLeft > 0 ? "pulseCTA 1.7s ease-in-out infinite" : "none",
            "&:hover": {
              bgcolor: applied ? "rgba(255,255,255,0.08)" : "#FB923C",
              filter: applied ? "none" : "brightness(1.02)",
            },
            "&:active": {
              transform: "scale(0.985)",
              filter: applied ? "none" : "brightness(1.06)",
            },
            "&.Mui-disabled": {
              bgcolor: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.55)",
              borderColor: "rgba(255,255,255,0.10)",
            },
          }}
          startIcon={
            applied ? (
              <Icon icon="mdi:check-circle" width={18} />
            ) : (
              <Icon icon="mdi:rocket-launch" width={18} />
            )
          }
        >
          {applied
            ? "Oferta adicionada ao pedido"
            : timeLeft <= 0
              ? "Oferta expirou nesta etapa"
              : `Adicionar +${BUMP_QTY} números por ${formatBRL(BUMP_PRICE_CENTS / 100)}`}
        </Button>

        <Typography
          sx={{
            display: "block",
            mt: 0.9,
            color: "rgba(255,255,255,0.55)",
            textAlign: "center",
            fontSize: "0.72rem",
          }}
        >
          Confirmação automática via PIX • sem precisar enviar comprovante
        </Typography>
      </Box>
    </Paper>
  )
}
