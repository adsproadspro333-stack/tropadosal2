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
        bgcolor: "#F3F4F6",
        px: 1.5,
        pt: 0.1,
        pb: 1.5,
        gap: 2,
      }}
    >
      {/* Headline minimalista */}
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
          Você vai ganhar{" "}
          <Box component="span" sx={{ color: "#B91C1C" }}>
            1 MILHÃO
          </Box>{" "}
          no PIX
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
            paddingTop: "60%",
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
    </Box>
  )
}
