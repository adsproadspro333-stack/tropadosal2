"use client"

import { Box, Button, Typography } from "@mui/material"
import { useRouter } from "next/navigation"
import { useCartStore } from "@/store/cartStore"
import { formatBRL } from "@/lib/formatCurrency"
import { useEffect, useState } from "react"
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos"

export default function FixedCTA() {
  const router = useRouter()
  const { qty, totalInCents } = useCartStore()

  const disabled = qty < 100
  const [pulse, setPulse] = useState(false)

  // pulso suave automático a cada 9s se estiver habilitado
  useEffect(() => {
    if (disabled) return

    const interval = setInterval(() => {
      setPulse(true)
      setTimeout(() => setPulse(false), 500)
    }, 9000)

    return () => clearInterval(interval)
  }, [disabled])

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    router.push("/dados")
  }

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 0,
        left: 0,
        width: "100%",
        bgcolor: "#ffffff",
        boxShadow: "0 -4px 12px rgba(0,0,0,0.1)",
        p: 2,
        zIndex: 9999,
      }}
    >
      <Box
        sx={{
          maxWidth: 600,
          mx: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        <Typography fontWeight={600} textAlign="center">
          {qty} números • Total: {formatBRL(totalInCents / 100)}
        </Typography>

        <Button
          fullWidth
          size="large"
          type="button"
          disabled={disabled}
          onClick={handleClick}
          sx={{
            bgcolor: disabled ? "#9e9e9e" : "#16a34a",
            color: "#fff",
            fontWeight: "bold",
            borderRadius: 999,
            py: 1.6,
            fontSize: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            boxShadow: "0px 8px 18px rgba(0,0,0,0.18)",
            transform: pulse ? "scale(1.04)" : "scale(1)",
            transition:
              "transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease",

            "&:hover": {
              bgcolor: disabled ? "#9e9e9e" : "#14863f",
              transform: disabled ? "none" : "translateY(-2px)",
              boxShadow: "0px 12px 26px rgba(0,0,0,0.25)",
            },

            "&:active": {
              transform: "scale(0.97)",
              boxShadow: "0px 6px 14px rgba(0,0,0,0.2)",
            },
          }}
        >
          CONCORRER AGORA
          <ArrowForwardIosIcon
            sx={{
              fontSize: 16,
              transition: "transform 0.2s ease",
            }}
          />
        </Button>
      </Box>
    </Box>
  )
}
