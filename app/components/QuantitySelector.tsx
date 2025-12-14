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
} from "@mui/material"
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline"
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline"
import { useRouter } from "next/navigation"
import { useCartStore } from "@/store/cartStore"
import { formatBRL } from "@/lib/formatCurrency"
import { useToast } from "./ui/Toast"

const PRESETS = [
  { label: "+5", q: 5 },
  { label: "+50", q: 50 },
  { label: "+100", q: 100 },
  { label: "+500", q: 500 },
]

// 👇 mínimo visual/funcional alinhado com o combo padrão (5 / 19,90)
const MIN_QTY = 5

export default function QuantitySelector() {
  const router = useRouter()
  const { qty, totalInCents, handleChangeQuantity, clearCart } = useCartStore()
  const { show } = useToast()
  const [bump, setBump] = useState(false)
  const [animateQty, setAnimateQty] = useState(false)
  const [animateTotal, setAnimateTotal] = useState(false)

  const triggerBump = () => {
    setBump(true)
  }

  useEffect(() => {
    if (!bump) return
    const t = setTimeout(() => setBump(false), 400)
    return () => clearTimeout(t)
  }, [bump])

  useEffect(() => {
    setAnimateQty(true)
    const timeout = setTimeout(() => setAnimateQty(false), 250)
    return () => clearTimeout(timeout)
  }, [qty])

  useEffect(() => {
    setAnimateTotal(true)
    const timeout = setTimeout(() => setAnimateTotal(false), 250)
    return () => clearTimeout(timeout)
  }, [totalInCents])

  const inc = () => {
    const next = qty + 1
    handleChangeQuantity(next)
    triggerBump()
  }

  const dec = () => {
    // garante que nunca desce abaixo do mínimo visual
    const next = Math.max(MIN_QTY, qty - 1)
    handleChangeQuantity(next)
    triggerBump()
  }

  const onChangeQty = (v: number) => {
    if (!Number.isFinite(v)) return

    // se o cara apagar ou digitar 0/negativo, força o mínimo (5)
    const safe = Math.max(MIN_QTY, Math.floor(v))
    handleChangeQuantity(safe)
    triggerBump()
  }

  return (
    <Box sx={{ mt: 2 }}>
      {/* Presets de quantidade */}
      <Grid container spacing={1} sx={{ mb: 2 }}>
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
              sx={{ fontWeight: 800 }}
            >
              {p.label}
            </Button>
          </Grid>
        ))}
      </Grid>

      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ justifyContent: "center" }}
      >
        <IconButton aria-label="Diminuir" onClick={dec}>
          <RemoveCircleOutlineIcon />
        </IconButton>

        <TextField
          type="number"
          value={qty}
          onChange={(e) => onChangeQty(Number(e.target.value))}
          onBlur={(e) => onChangeQty(Number(e.target.value))}
          inputProps={{
            min: MIN_QTY,
            style: { textAlign: "center", width: 110 },
          }}
          size="small"
          className={bump ? "animate-bump" : ""}
          InputProps={{
            sx: {
              transition: "transform 0.2s ease, filter 0.2s ease",
              ...(animateQty && {
                transform: "scale(1.08)",
                filter: "brightness(1.1)",
              }),
            },
          }}
        />

        <IconButton aria-label="Aumentar" onClick={inc}>
          <AddCircleOutlineIcon />
        </IconButton>
      </Stack>

      <Typography align="center" sx={{ mt: 1.25 }} color="text.secondary">
        Total atual:{" "}
        <Box
          component="span"
          sx={{
            fontWeight: 700,
            transition: "color 0.2s ease, backgroundColor 0.2s ease",
            borderRadius: 1,
            px: 0.5,
            ...(animateTotal && {
              color: "success.main",
              backgroundColor: "rgba(46, 204, 113, 0.12)",
            }),
          }}
        >
          {formatBRL(totalInCents / 100)}
        </Box>
      </Typography>

      <Stack spacing={1.5} sx={{ mt: 1.5 }}>
        <Button
          fullWidth
          variant="outlined"
          color="inherit"
          sx={{ fontWeight: 600 }}
          onClick={() => {
            clearCart()
            show(
              `Carrinho resetado para o mínimo (${MIN_QTY} números).`,
              "default",
            )
          }}
        >
          Limpar
        </Button>
      </Stack>
    </Box>
  )
}
