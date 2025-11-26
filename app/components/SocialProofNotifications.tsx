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
  { name: "Thaynara", state: "CE", prize: "um iPhone 17" },
  { name: "Marcos", state: "PE", prize: "1 moto 0km" },
  { name: "Bruna", state: "BA", prize: "uma TV 75\" 4K" },
  { name: "Rafael", state: "RJ", prize: "R$ 15.000 em pix" },
  { name: "Carla", state: "SP", prize: "um Apple Watch Ultra" },
  { name: "Lucas", state: "MG", prize: "1 PlayStation 5" },
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

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: { xs: 190, md: 200 }, // ✅ MUITO MAIS ALTO AGORA
        left: { xs: "50%", md: 40 },
        transform: { xs: "translateX(-50%)", md: "none" },
        zIndex: 998,
        pointerEvents: "none",
      }}
    >
      <Paper
        elevation={6}
        sx={{
          px: 2,
          py: 1.4,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          borderRadius: 9999,
          opacity: open ? 1 : 0,
          transform: open ? "scale(1)" : "scale(0.9)",
          transition: "all 0.3s ease",
          minWidth: 280,
          backgroundColor: "#FFFFFF",
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        }}
      >
        <Icon icon="mdi:trophy" width={20} height={20} style={{ color: "#f59e0b" }} />

        <Box>
          <Typography fontWeight={700} fontSize="0.85rem">
            {currentWinner?.name} ({currentWinner?.state})
          </Typography>
          <Typography fontSize="0.75rem" color="#6B7280">
            Ganhou {currentWinner?.prize}
          </Typography>
        </Box>
      </Paper>
    </Box>
  )
}
