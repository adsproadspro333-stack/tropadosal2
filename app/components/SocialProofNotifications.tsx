"use client"

import { useState, useEffect } from "react"
import { Box, Paper, Typography } from "@mui/material"
import { Icon } from "@iconify/react"

interface Winner {
  name: string
  state: string
  prize: string
}

const WINNERS: Winner[] = [
  { name: "Thaynara", state: "CE", prize: "R$ 700,00 no PIX" },
  { name: "Marcos", state: "PE", prize: "R$ 3.000,00 no PIX" },
  { name: "Bruna", state: "BA", prize: "R$ 20.000,00 no PIX" },
  { name: "Rafael", state: "RJ", prize: "R$ 15.000,00 no PIX" },
  { name: "Carla", state: "SP", prize: "R$ 5.000,00 no PIX" },
  { name: "Lucas", state: "MG", prize: "um Iphone 17 PRO MAX" },
]

export default function SocialProofNotifications() {
  const [currentWinner, setCurrentWinner] = useState<Winner | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let timeout: NodeJS.Timeout

    const loop = () => {
      const randomWinner = WINNERS[Math.floor(Math.random() * WINNERS.length)]
      setCurrentWinner(randomWinner)
      setOpen(true)

      timeout = setTimeout(() => {
        setOpen(false)
        setTimeout(loop, 25000)
      }, 6000)
    }

    const init = setTimeout(loop, 3000)

    return () => {
      clearTimeout(init)
      clearTimeout(timeout)
    }
  }, [])

  // ---------- TOKENS (DNA dark) ----------
  const GLASS = "rgba(255,255,255,0.06)"
  const BORDER = "rgba(255,255,255,0.10)"
  const TXT = "rgba(255,255,255,0.92)"
  const MUTED = "rgba(255,255,255,0.70)"
  const RED = "#DC2626"

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: { xs: 800, md: 700 },
        left: { xs: "50%", md: 40 },
        transform: { xs: "translateX(-50%)", md: "none" },
        zIndex: 998,
        pointerEvents: "none",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          px: 2,
          py: 1.35,
          display: "flex",
          alignItems: "center",
          gap: 1.3,
          borderRadius: 9999,

          opacity: open ? 1 : 0,
          transform: open
            ? { xs: "translateY(0) scale(1)", md: "translateX(0) scale(1)" }
            : { xs: "translateY(8px) scale(0.96)", md: "translateX(-10px) scale(0.96)" },
          transition: "opacity 0.28s ease, transform 0.28s ease",

          minWidth: 288,
          maxWidth: 360,

          bgcolor: GLASS,
          border: `1px solid ${BORDER}`,
          backdropFilter: "blur(10px)",

          // 🔥 contorno vermelho + glow (controlado)
          boxShadow: open
            ? `0 18px 40px rgba(0,0,0,0.45),
               0 0 0 1px rgba(220,38,38,0.55),
               0 14px 36px rgba(220,38,38,0.22)`
            : `0 12px 28px rgba(0,0,0,0.35),
               0 0 0 1px rgba(220,38,38,0.35)`,
          position: "relative",
          overflow: "hidden",

          "&::before": {
            content: '""',
            position: "absolute",
            inset: -1,
            background:
              "radial-gradient(420px 120px at 20% 10%, rgba(220,38,38,0.20), transparent 55%)",
            pointerEvents: "none",
          },
        }}
      >
        {/* Badge ícone */}
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "rgba(245,158,11,0.14)",
            border: `1px solid ${BORDER}`,
            boxShadow: "0 10px 22px rgba(0,0,0,0.25)",
            flexShrink: 0,
          }}
        >
          <Icon icon="mdi:trophy" width={18} height={18} style={{ color: "#f59e0b" }} />
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Typography
            fontWeight={1000}
            fontSize="0.86rem"
            sx={{
              color: TXT,
              lineHeight: 1.15,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {currentWinner?.name} ({currentWinner?.state})
          </Typography>

          <Typography
            fontSize="0.76rem"
            sx={{
              color: MUTED,
              mt: 0.15,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Ganhou <span style={{ color: "#fff", fontWeight: 900 }}>{currentWinner?.prize}</span>
            <span style={{ color: RED, fontWeight: 900 }}> ✓</span>
          </Typography>
        </Box>
      </Paper>
    </Box>
  )
}
