"use client"

import { Box, Typography } from "@mui/material"
import Image from "next/image"
import { useEffect, useState } from "react"

export default function HeroBanner() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30)
    return () => clearTimeout(t)
  }, [])

  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        bgcolor: "#FFFFFF",
        px: 1.5,
        pt: 1.5,
        pb: 1.5,
      }}
    >
      {/* Banner */}
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
            paddingTop: "50%", // mesma proporção do site deles
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

      {/* 🔥 Faixa abaixo do banner — IDENTICA à deles */}
      <Box
        sx={{
          width: "100%",
          maxWidth: 420,
          mt: 1.5,
          bgcolor: "#F9FAFB", // equivalente ao bg-background-pri
          borderBottom: "2px solid #E5E7EB", // border-background-sec
          borderRadius: "0 0 12px 12px",
          py: 1.2,
          px: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {/* Linha 1 → Sorteio */}
        <Box sx={{ pl: "10px", fontFamily: "Inter" }}>
          <Typography
            component="span"
            sx={{
              fontWeight: 600,
              fontSize: "0.75rem",
            }}
          >
            🍀 Sorteio:{" "}
          </Typography>

          <Typography
            component="span"
            sx={{
              fontWeight: 600,
              fontSize: "0.75rem",
              color: "#374151", // text-grayplay-700
            }}
          >
            26/12/2025 21:00
          </Typography>
        </Box>

        {/* Linha 2 → Preço */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            pr: 2,
            pl: "10px",
            alignSelf: "flex-end",
            fontFamily: "Inter",
          }}
        >
          <Typography
            component="span"
            sx={{
              fontSize: "0.85rem",
              color: "#374151",
            }}
          >
            Por apenas
          </Typography>

          <Box
            sx={{
              backgroundColor: "#16A34A", // bg-btn-gst-pri
              color: "#FFFFFF",
              px: 1,
              py: 0.4,
              borderRadius: 1,
              fontWeight: 700,
              fontSize: "0.85rem",
            }}
          >
            R$ 9,90
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
