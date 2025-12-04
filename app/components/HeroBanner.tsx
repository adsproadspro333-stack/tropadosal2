"use client"

import { Box, Typography } from "@mui/material"
import Image from "next/image"
import { useEffect, useState } from "react"

export default function HeroBanner() {
  const [mounted, setMounted] = useState(false)
  const [timerText, setTimerText] = useState("30:00")

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const DURATION_MS = 30 * 60 * 1000 // 30min
    const endAt = Date.now() + DURATION_MS

    const interval = setInterval(() => {
      const diff = endAt - Date.now()

      if (diff <= 0) {
        setTimerText("00:00")
        clearInterval(interval)
        return
      }

      const minutes = Math.floor(diff / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)

      const mm = String(minutes).padStart(2, "0")
      const ss = String(seconds).padStart(2, "0")

      setTimerText(`${mm}:${ss}`)
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        bgcolor: "#F3F4F6",
        px: 1.5,
        pt: 0.5, // levemente maior pra não colar demais no header
        pb: 1.5,
        gap: 1,
      }}
    >
      {/* Headline + subtítulo */}
      <Box
        sx={{
          width: "100%",
          maxWidth: 420,
          textAlign: "center",
          mb: 0.5,
        }}
      >
        <Typography
          component="h1"
          sx={{
            fontSize: "1.05rem",
            fontWeight: 800,
            lineHeight: 1.25,
            color: "#111827",
          }}
        >
          Sua chance de{" "}
          <Box component="span" sx={{ color: "#B91C1C" }}>
            mudar de vida
          </Box>{" "}
          começa aqui
        </Typography>

        <Typography
          component="p"
          sx={{
            mt: 0.5,
            fontSize: "0.85rem",
            color: "#4B5563",
          }}
        >
          Com apenas{" "}
          <Box component="span" sx={{ fontWeight: 700, color: "#16A34A" }}>
            R$ 9,90
          </Box>{" "}
          você já está concorrendo agora.
        </Typography>
      </Box>

      {/* Banner principal */}
      <Box
        sx={{
          position: "relative",
          width: "100%",
          maxWidth: 420,
          borderRadius: 3,
          overflow: "hidden",
          boxShadow: "0 14px 28px rgba(0,0,0,0.18)",
          bgcolor: "#000",
          transform: mounted
            ? "translateY(0) scale(1)"
            : "translateY(8px) scale(0.97)",
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.45s ease, transform 0.45s ease",
        }}
      >
        <Box
          sx={{
            position: "relative",
            width: "100%",
            paddingTop: "60%", // mostra mais da arte
          }}
        >
          <Image
            src="/banner-sorteio.jpg"
            alt="Banner principal do sorteio"
            fill
            priority
            sizes="(max-width: 640px) 100vw, 420px"
            style={{
              objectFit: "cover",
              objectPosition: "center 45%",
            }}
          />
        </Box>
      </Box>

      {/* 🔥 Faixa “Compre agora e ganhe o dobro” com timer visual */}
      <Box sx={{ width: "100%", maxWidth: 420, mt: 1 }}>
        <Box
          sx={{
            borderRadius: 2,
            bgcolor: "#B91C1C",
            color: "#ffffff",
            px: 2,
            py: 1.2,
            boxShadow: "0 10px 22px rgba(185,28,28,0.45)",
          }}
        >
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: "0.98rem",
            }}
          >
            Compre agora e ganhe o dobro
          </Typography>

          <Box
            sx={{
              mt: 0.4,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1.5,
            }}
          >
            <Typography
              sx={{
                fontSize: "0.8rem",
                opacity: 0.95,
              }}
            >
              Encerra em{" "}
              <Box component="span" sx={{ fontWeight: 700 }}>
                {timerText}
              </Box>
            </Typography>

            <Box
              sx={{
                flexShrink: 0,
                width: 90,
                height: 6,
                borderRadius: 999,
                bgcolor: "#FCA5A5",
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  width: "100%",
                  height: "100%",
                  bgcolor: "#FEE2E2",
                  opacity: 0.9,
                }}
              />
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
