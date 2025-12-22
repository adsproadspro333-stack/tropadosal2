"use client"

import { Box, Typography } from "@mui/material"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"

function getAutoLiteMode(): boolean {
  if (typeof window === "undefined") return false

  try {
    const nav = navigator as any
    const dm = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null
    const hc =
      typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null
    const saveData =
      typeof nav.connection?.saveData === "boolean" ? nav.connection.saveData : false
    const reducedMotion =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")?.matches
        : false

    return Boolean(
      (dm !== null && dm <= 3) ||
        (hc !== null && hc <= 4) ||
        saveData ||
        reducedMotion,
    )
  } catch {
    return false
  }
}

export default function HeroBanner() {
  const [mounted, setMounted] = useState(false)
  const [isLite, setIsLite] = useState(false)

  useEffect(() => {
    setIsLite(getAutoLiteMode())
  }, [])

  useEffect(() => {
    // ✅ low-end: sem animação de entrada (mais rápido e suave)
    if (isLite) {
      setMounted(true)
      return
    }

    const t = setTimeout(() => setMounted(true), 30)
    return () => clearTimeout(t)
  }, [isLite])

  // 🎨 Tokens (puxando o DNA do banner: dark + red + green)
  const GLASS = "rgba(255,255,255,0.06)"
  const BORDER = "rgba(255,255,255,0.10)"
  const TXT = "rgba(255,255,255,0.92)"
  const MUTED = "rgba(255,255,255,0.70)"
  const GREEN = "#22C55E"
  const GREEN_DARK = "#16A34A"

  // ✅ Overlay mais leve pra deixar a arte “viva”
  const overlays = useMemo(() => {
    // no lite: overlays bem mais simples
    if (isLite) {
      return {
        dark: "linear-gradient(180deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.22) 100%)",
        redGlow: "radial-gradient(700px 250px at 20% 20%, rgba(220,38,38,0.10), transparent 60%)",
        redOpacity: 0.35,
      }
    }

    return {
      dark: "linear-gradient(180deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.30) 100%)",
      redGlow: "radial-gradient(700px 250px at 20% 20%, rgba(220,38,38,0.14), transparent 60%)",
      redOpacity: 0.55,
    }
  }, [isLite])

  const imageStyle = useMemo(() => {
    // ✅ premium: dá “punch” sem sujar
    // ✅ lite: sem filter (GPU agradece)
    return {
      objectFit: "cover" as const,
      objectPosition: "center 45%",
      filter: isLite
        ? "none"
        : "brightness(1.06) contrast(1.06) saturate(1.10)",
    }
  }, [isLite])

  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        bgcolor: "transparent",
        px: 1.5,
        pt: 1.4,
        pb: 1.4,
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
          bgcolor: "#000",
          border: `1px solid ${BORDER}`,
          boxShadow: isLite ? "0 12px 26px rgba(0,0,0,0.40)" : "0 18px 46px rgba(0,0,0,0.55)",

          // ✅ low-end: sem transform/opacity animando
          transform: mounted ? "translateY(0) scale(1)" : isLite ? "none" : "translateY(10px) scale(0.975)",
          opacity: mounted ? 1 : isLite ? 1 : 0,
          transition: isLite ? "none" : "opacity 0.45s ease, transform 0.45s ease",
        }}
      >
        <Box
          sx={{
            position: "relative",
            width: "100%",
            paddingTop: "50%", // mantém a proporção
          }}
        >
          <Image
            src="/banner-sorteio.jpg"
            alt="Banner principal do sorteio"
            fill
            priority
            sizes="(max-width: 640px) 100vw, 420px"
            quality={75}
            style={imageStyle as any}
          />

          {/* overlay escuro (mais leve pra não apagar) */}
          <Box
            sx={{
              pointerEvents: "none",
              position: "absolute",
              inset: 0,
              background: overlays.dark,
            }}
          />

          {/* glow vermelho sutil (reduzido pra não “pintar” a arte) */}
          <Box
            sx={{
              pointerEvents: "none",
              position: "absolute",
              inset: 0,
              background: overlays.redGlow,
              opacity: overlays.redOpacity,
            }}
          />

          {/* ✅ Vignette bem leve (ajuda leitura sem matar cor) */}
          {!isLite && (
            <Box
              sx={{
                pointerEvents: "none",
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(120% 90% at 50% 40%, rgba(0,0,0,0.00) 0%, rgba(0,0,0,0.22) 70%, rgba(0,0,0,0.35) 100%)",
                opacity: 0.55,
              }}
            />
          )}
        </Box>
      </Box>

      {/* Faixa abaixo do banner (dark/glass) */}
      <Box
        sx={{
          width: "100%",
          maxWidth: 420,
          mt: 1.4,
          bgcolor: isLite ? "rgba(17,24,39,0.92)" : GLASS,
          border: `1px solid ${BORDER}`,
          backdropFilter: isLite ? "none" : "blur(10px)",
          borderRadius: 2.5,
          px: 1.2,
          py: 1.1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          boxShadow: isLite ? "0 10px 22px rgba(0,0,0,0.28)" : "0 14px 34px rgba(0,0,0,0.35)",
        }}
      >
        {/* Sorteio */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              bgcolor: GREEN,
              boxShadow: isLite ? "none" : "0 0 0 6px rgba(34,197,94,0.10)",
              flexShrink: 0,
            }}
          />
          <Box>
            <Typography
              sx={{
                fontWeight: 900,
                fontSize: "0.74rem",
                color: TXT,
                letterSpacing: "-0.15px",
                lineHeight: 1.1,
              }}
            >
              Sorteio
            </Typography>
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: "0.76rem",
                color: MUTED,
                lineHeight: 1.1,
                mt: 0.2,
              }}
            >
              26/12/2025 21:00
            </Typography>
          </Box>
        </Box>

        {/* Preço */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography
            sx={{
              fontSize: "0.82rem",
              color: MUTED,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            Por apenas
          </Typography>

          <Box
            sx={{
              background: `linear-gradient(180deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`,
              color: "#07120B",
              px: 1.1,
              py: 0.45,
              borderRadius: 1.6,
              fontWeight: 1000,
              fontSize: "0.86rem",
              letterSpacing: "-0.2px",
              boxShadow: isLite ? "none" : "0 12px 26px rgba(34,197,94,0.28)",
              border: "1px solid rgba(255,255,255,0.14)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            R$ 9,90

            {/* shine (premium apenas) */}
            {!isLite && (
              <Box
                sx={{
                  pointerEvents: "none",
                  position: "absolute",
                  top: "-40%",
                  left: "-30%",
                  width: "60%",
                  height: "200%",
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
                  transform: mounted ? "translateX(220%)" : "translateX(0%)",
                  transition: "transform 1.25s ease",
                  opacity: 0.6,
                }}
              />
            )}
          </Box>
        </Box>
      </Box>

      {/* Linha/Glow inferior sutil */}
      <Box
        sx={{
          width: "100%",
          maxWidth: 420,
          mt: 1.2,
          height: 1,
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)",
          position: "relative",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, transparent, rgba(220,38,38,0.26), transparent)",
            opacity: 0.55,
          }}
        />
      </Box>
    </Box>
  )
}
