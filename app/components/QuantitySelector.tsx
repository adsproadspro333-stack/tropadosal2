"use client"

import { useState, useEffect } from "react"
import {
  Box,
  Grid,
  IconButton,
  TextField,
  Button,
  Stack,
  Typography,
  Chip,
} from "@mui/material"
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline"
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline"
import { useCartStore } from "@/store/cartStore"
import { formatBRL } from "@/lib/formatCurrency"
import { useToast } from "./ui/Toast"

const PRESETS = [
  { label: "+5", q: 5 },
  { label: "+50", q: 50 },
  { label: "+100", q: 100 },
  { label: "+500", q: 500 },
]

// 👇 mínimo visual/funcional alinhado com o combo padrão
const MIN_QTY = 5

export default function QuantitySelector() {
  const { qty, totalInCents, handleChangeQuantity, clearCart } = useCartStore()
  const { show } = useToast()

  const [bump, setBump] = useState(false)
  const [animateQty, setAnimateQty] = useState(false)
  const [animateTotal, setAnimateTotal] = useState(false)

  const triggerBump = () => setBump(true)

  useEffect(() => {
    if (!bump) return
    const t = setTimeout(() => setBump(false), 380)
    return () => clearTimeout(t)
  }, [bump])

  useEffect(() => {
    setAnimateQty(true)
    const timeout = setTimeout(() => setAnimateQty(false), 220)
    return () => clearTimeout(timeout)
  }, [qty])

  useEffect(() => {
    setAnimateTotal(true)
    const timeout = setTimeout(() => setAnimateTotal(false), 240)
    return () => clearTimeout(timeout)
  }, [totalInCents])

  const inc = () => {
    const next = qty + 1
    handleChangeQuantity(next)
    triggerBump()
  }

  const dec = () => {
    const next = Math.max(MIN_QTY, qty - 1)
    handleChangeQuantity(next)
    triggerBump()
  }

  const onChangeQty = (v: number) => {
    if (!Number.isFinite(v)) return
    const safe = Math.max(MIN_QTY, Math.floor(v))
    handleChangeQuantity(safe)
    triggerBump()
  }

  // tokens do projeto (dark + vermelho + verde premium)
  const GLASS = "rgba(255,255,255,0.06)"
  const BORDER = "rgba(255,255,255,0.10)"
  const TXT = "rgba(255,255,255,0.92)"
  const MUTED = "rgba(255,255,255,0.68)"
  const RED = "#DC2626" // 🔥 banner vibe
  const GREEN = "#22C55E"
  const GREEN_DARK = "#16A34A"

  return (
    <Box sx={{ mt: 2 }}>
      {/* Presets */}
      <Grid container spacing={1} sx={{ mb: 1.6 }}>
        {PRESETS.map((p, i) => (
          <Grid item xs={3} key={i}>
            <Button
              variant="outlined"
              fullWidth
              onClick={() => {
                const next = qty + p.q
                handleChangeQuantity(next)
                triggerBump()
              }}
              sx={{
                borderRadius: 999,
                textTransform: "none",
                fontWeight: 900,
                py: 0.9,
                bgcolor: "rgba(255,255,255,0.04)",
                borderColor: "rgba(255,255,255,0.14)",
                color: "rgba(255,255,255,0.85)",
                "&:hover": {
                  bgcolor: "rgba(255,255,255,0.07)",
                  borderColor: "rgba(220,38,38,0.35)",
                },
                "&:active": { transform: "scale(0.98)" },
              }}
            >
              {p.label}
            </Button>
          </Grid>
        ))}
      </Grid>

      {/* Seletor central */}
      <PaperLike>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack spacing={0.4}>
            <Typography sx={{ color: "#fff", fontWeight: 1000, fontSize: "0.92rem" }}>
              Quantidade personalizada
            </Typography>
            <Typography sx={{ color: MUTED, fontSize: "0.78rem" }}>
              Ajuste fino (mínimo {MIN_QTY})
            </Typography>
          </Stack>

          <Chip
            label={animateTotal ? "Atualizando…" : "Custom"}
            size="small"
            sx={{
              height: 22,
              borderRadius: 999,
              bgcolor: "rgba(220,38,38,0.10)",
              color: "rgba(255,255,255,0.88)",
              fontWeight: 900,
              border: "1px solid rgba(220,38,38,0.25)",
            }}
          />
        </Stack>

        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ justifyContent: "center", mt: 1.4 }}
        >
          <IconButton
            aria-label="Diminuir"
            onClick={dec}
            sx={{
              width: 46,
              height: 46,
              borderRadius: 999,
              bgcolor: "rgba(255,255,255,0.06)",
              border: `1px solid ${BORDER}`,
              color: "rgba(255,255,255,0.88)",
              "&:hover": { bgcolor: "rgba(255,255,255,0.09)" },
              "&:active": { transform: "scale(0.98)" },
            }}
          >
            <RemoveCircleOutlineIcon />
          </IconButton>

          <TextField
            type="number"
            value={qty}
            onChange={(e) => onChangeQty(Number(e.target.value))}
            onBlur={(e) => onChangeQty(Number(e.target.value))}
            inputProps={{
              min: MIN_QTY,
              style: {
                textAlign: "center",
                fontWeight: 900,
                fontSize: 18,
                color: "#fff",
              },
            }}
            size="small"
            className={bump ? "animate-bump" : ""}
            sx={{
              width: 130,
              "& .MuiOutlinedInput-root": {
                borderRadius: 999,
                bgcolor: "rgba(255,255,255,0.05)",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(255,255,255,0.10)",
                "& fieldset": { border: "none" },
                transition: "transform 0.18s ease, box-shadow 0.18s ease",
                ...(animateQty && {
                  transform: "scale(1.05)",
                  boxShadow: "0 10px 26px rgba(220,38,38,0.25)",
                }),
              },
              "& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button": {
                WebkitAppearance: "none",
                margin: 0,
              },
              "& input[type=number]": {
                MozAppearance: "textfield",
              },
            }}
          />

          <IconButton
            aria-label="Aumentar"
            onClick={inc}
            sx={{
              width: 46,
              height: 46,
              borderRadius: 999,
              bgcolor: "rgba(255,255,255,0.06)",
              border: `1px solid ${BORDER}`,
              color: "rgba(255,255,255,0.88)",
              "&:hover": { bgcolor: "rgba(255,255,255,0.09)" },
              "&:active": { transform: "scale(0.98)" },
            }}
          >
            <AddCircleOutlineIcon />
          </IconButton>
        </Stack>

        {/* Total */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            mt: 1.4,
            p: 1.2,
            borderRadius: 2,
            bgcolor: "rgba(0,0,0,0.18)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <Typography sx={{ color: MUTED, fontSize: "0.78rem", fontWeight: 800 }}>
            Total atual
          </Typography>

          <Box
            sx={{
              px: 1.1,
              py: 0.5,
              borderRadius: 999,
              fontWeight: 1000,
              color: "#fff",
              bgcolor: animateTotal ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.06)",
              border: animateTotal
                ? "1px solid rgba(34,197,94,0.30)"
                : "1px solid rgba(255,255,255,0.10)",
              transition: "all 0.2s ease",
            }}
          >
            <span style={{ color: animateTotal ? GREEN : "#fff" }}>
              {formatBRL(totalInCents / 100)}
            </span>
          </Box>
        </Stack>

        {/* Limpar */}
        <Stack spacing={1.2} sx={{ mt: 1.4 }}>
          <Button
            fullWidth
            variant="outlined"
            color="inherit"
            onClick={() => {
              clearCart()
              show(`Carrinho resetado para o mínimo (${MIN_QTY} números).`, "default")
            }}
            sx={{
              borderRadius: 999,
              textTransform: "none",
              fontWeight: 950,
              py: 1.05,
              bgcolor: "rgba(255,255,255,0.03)",
              borderColor: "rgba(255,255,255,0.14)",
              color: "rgba(255,255,255,0.88)",
              "&:hover": {
                bgcolor: "rgba(220,38,38,0.08)",
                borderColor: "rgba(220,38,38,0.35)",
              },
            }}
          >
            Zerar seleção
          </Button>

          {/* micro-copy de confiança */}
          <Typography sx={{ textAlign: "center", color: "rgba(255,255,255,0.55)", fontSize: "0.72rem" }}>
            Dica: presets aceleram sua escolha no mobile
          </Typography>
        </Stack>
      </PaperLike>
    </Box>
  )

  function PaperLike({ children }: { children: React.ReactNode }) {
    return (
      <Box
        sx={{
          p: 2,
          borderRadius: 3,
          bgcolor: GLASS,
          border: `1px solid ${BORDER}`,
          backdropFilter: "blur(10px)",
          boxShadow: "0 14px 36px rgba(0,0,0,0.35)",
          position: "relative",
          overflow: "hidden",
          // glow sutil vermelho (DNA)
          "&:before": {
            content: '""',
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(700px 220px at 20% 0%, rgba(220,38,38,0.16), transparent 60%)",
            pointerEvents: "none",
          },
          "& > *": { position: "relative" },
        }}
      >
        {children}
      </Box>
    )
  }
}
