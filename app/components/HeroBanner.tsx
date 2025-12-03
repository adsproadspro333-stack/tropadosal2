"use client"

import { Box, Typography, Collapse, IconButton } from "@mui/material"
import Image from "next/image"
import { useEffect, useState } from "react"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"

export default function HeroBanner() {
  const [mounted, setMounted] = useState(false)
  const [openPremios, setOpenPremios] = useState(false)

  // ⏱ Timer VISUAL de 30 minutos (não mexe em preço, nem em carrinho)
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
        pt: 0.1,      // margem superior reduzida
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

      {/* PRÊMIOS DA AÇÃO */}
      <Box sx={{ width: "100%", maxWidth: 420, mt: 1 }}>
        <Box
          sx={{
            borderRadius: 2,
            border: "1px solid #e5e7eb",
            bgcolor: "#ffffff",
            boxShadow: "0 4px 10px rgba(0,0,0,0.04)",
            overflow: "hidden",
          }}
        >
          {/* Header do accordion */}
          <Box
            onClick={() => setOpenPremios((prev) => !prev)}
            sx={{
              px: 2,
              py: 1.2,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
            }}
          >
            <Box>
              <Typography
                sx={{
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  color: "#6B7280",
                  letterSpacing: 1,
                }}
              >
                Detalhes
              </Typography>
              <Typography
                sx={{
                  fontSize: "0.95rem",
                  fontWeight: 800,
                  color: "#111827",
                }}
              >
                PRÊMIOS DA AÇÃO
              </Typography>
            </Box>

            <IconButton
              size="small"
              sx={{
                transform: openPremios ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            >
              <ExpandMoreIcon />
            </IconButton>
          </Box>

          {/* Conteúdo do accordion */}
          <Collapse in={openPremios}>
            <Box
              sx={{
                px: 2,
                pb: 1.5,
                pt: 0.5,
                borderTop: "1px solid #e5e7eb",
              }}
            >
              {[
                "10x CG 160 FAN",
                "10x iPhone 17 Pro Max",
                "02x R$ 10.000,00",
                "04x R$ 5.000,00",
                "10x R$ 1.000,00",
                "20x R$ 500,00",
                "40x R$ 250,00",
              ].map((item) => (
                <Typography
                  key={item}
                  component="div" // ✅ evita <div> dentro de <p>
                  sx={{
                    fontSize: "0.85rem",
                    color: "#111827",
                    mb: 0.3,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      bgcolor: "#B91C1C",
                    }}
                  />
                  {item}
                </Typography>
              ))}
            </Box>
          </Collapse>
        </Box>
      </Box>
    </Box>
  )
}
