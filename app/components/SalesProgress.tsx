"use client"

import { Box, Typography, Paper } from "@mui/material"
import AccessTimeIcon from "@mui/icons-material/AccessTime"
import WhatshotIcon from "@mui/icons-material/Whatshot"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"

interface SalesProgressProps {
  percent: number
}

export default function SalesProgress({ percent }: SalesProgressProps) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0))

  let statusLabel = ""
  let helperText = ""
  let Icon = AccessTimeIcon
  let barColor = "#22C55E" // green

  if (safePercent < 40) {
    statusLabel = "Edição liberada"
    helperText = "Começou agora — pega antes de subir."
    Icon = AccessTimeIcon
    barColor = "#22C55E"
  } else if (safePercent < 80) {
    statusLabel = "Alta procura"
    helperText = "Tá girando forte — muita gente garantindo hoje."
    Icon = WhatshotIcon
    barColor = "#FB923C"
  } else {
    statusLabel = "Reta final"
    helperText = "Últimos números — essa parte some rápido."
    Icon = CheckCircleIcon
    barColor = "#DC2626"
  }

  // DNA dark/glass
  const GLASS = "rgba(255,255,255,0.06)"
  const BORDER = "rgba(255,255,255,0.10)"
  const TXT = "rgba(255,255,255,0.92)"
  const MUTED = "rgba(255,255,255,0.68)"
  const SOFT = "rgba(255,255,255,0.04)"
  const trackBg = "rgba(255,255,255,0.10)"

  const glow =
    safePercent < 40
      ? "rgba(34,197,94,0.18)"
      : safePercent < 80
        ? "rgba(251,146,60,0.18)"
        : "rgba(220,38,38,0.20)"

  const iconBg =
    safePercent < 40
      ? "rgba(34,197,94,0.14)"
      : safePercent < 80
        ? "rgba(251,146,60,0.14)"
        : "rgba(220,38,38,0.14)"

  const badgeBg =
    safePercent < 40
      ? "rgba(34,197,94,0.12)"
      : safePercent < 80
        ? "rgba(251,146,60,0.12)"
        : "rgba(220,38,38,0.14)"

  const badgeBorder =
    safePercent < 40
      ? "rgba(34,197,94,0.22)"
      : safePercent < 80
        ? "rgba(251,146,60,0.22)"
        : "rgba(220,38,38,0.26)"

  const pulseDanger = safePercent >= 80

  return (
    <Box sx={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 3,
          bgcolor: GLASS,
          border: `1px solid ${BORDER}`,
          backdropFilter: "blur(10px)",
          p: 1.6,
          mb: 2,
          boxShadow:
            "0 18px 42px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.20)",
          position: "relative",
          overflow: "hidden",
          "&::before": {
            content: '""',
            position: "absolute",
            inset: -1,
            background: `radial-gradient(760px 260px at 18% 0%, ${glow}, transparent 58%)`,
            pointerEvents: "none",
          },
          ...(pulseDanger
            ? {
                animation: "pulseCard 1.8s ease-in-out infinite",
                "@keyframes pulseCard": {
                  "0%,100%": { boxShadow: "0 18px 42px rgba(0,0,0,0.35)" },
                  "50%": { boxShadow: "0 22px 55px rgba(220,38,38,0.18)" },
                },
              }
            : {}),
        }}
      >
        <Box sx={{ position: "relative" }}>
          {/* topo */}
          <Box display="flex" alignItems="center" gap={1.2}>
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                bgcolor: iconBg,
                border: `1px solid ${BORDER}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 10px 22px rgba(0,0,0,0.25)",
              }}
            >
              <Icon sx={{ fontSize: 18, color: barColor }} />
            </Box>

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "0.72rem",
                    fontWeight: 1000,
                    color: MUTED,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                  }}
                >
                  Progresso da edição
                </Typography>

                <Box
                  sx={{
                    px: 1.1,
                    py: 0.35,
                    borderRadius: 999,
                    fontSize: "0.70rem",
                    fontWeight: 1000,
                    color: TXT,
                    bgcolor: badgeBg,
                    border: `1px solid ${badgeBorder}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {statusLabel}
                </Box>
              </Box>

              <Typography
                sx={{
                  fontSize: "0.84rem",
                  color: TXT,
                  lineHeight: 1.25,
                  mt: 0.35,
                }}
              >
                <strong style={{ color: "#fff" }}>
                  {safePercent.toFixed(1)}%
                </strong>{" "}
                <span style={{ color: MUTED }}>
                  dos números já foram garantidos
                </span>
              </Typography>
            </Box>
          </Box>

          {/* barra REAL (custom) */}
          <Box mt={1.2}>
            <Box
              sx={{
                height: 12,
                borderRadius: 999,
                bgcolor: trackBg,
                border: `1px solid ${BORDER}`,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <Box
                sx={{
                  width: `${safePercent}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${barColor}, rgba(255,255,255,0.25), ${barColor})`,
                  backgroundSize: "220% 100%",
                  boxShadow:
                    safePercent < 40
                      ? "0 10px 26px rgba(34,197,94,0.22)"
                      : safePercent < 80
                        ? "0 10px 26px rgba(251,146,60,0.22)"
                        : "0 10px 26px rgba(220,38,38,0.25)",
                  transition: "width 700ms ease",
                  animation: "flow 2.1s ease-in-out infinite",
                  position: "relative",
                  overflow: "hidden",
                  "@keyframes flow": {
                    "0%": { backgroundPosition: "0% 50%" },
                    "100%": { backgroundPosition: "100% 50%" },
                  },

                  // shine passando por cima
                  "&::after": {
                    content: '""',
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(90deg, transparent, rgba(255,255,255,0.30), transparent)",
                    transform: "translateX(-60%)",
                    animation: "shine 2.4s ease-in-out infinite",
                  },
                  "@keyframes shine": {
                    "0%": { transform: "translateX(-80%)" },
                    "100%": { transform: "translateX(140%)" },
                  },

                  // stripes “carregando”
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    inset: 0,
                    opacity: 0.18,
                    background:
                      "repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 10px, rgba(255,255,255,0.0) 10px 20px)",
                    animation: "stripes 1.6s linear infinite",
                  },
                  "@keyframes stripes": {
                    "0%": { backgroundPosition: "0 0" },
                    "100%": { backgroundPosition: "40px 0" },
                  },
                }}
              />
            </Box>

            <Box
              sx={{
                mt: 0.9,
                p: 1.0,
                borderRadius: 2,
                bgcolor: SOFT,
                border: `1px solid ${BORDER}`,
              }}
            >
              <Typography
                sx={{
                  fontSize: "0.75rem",
                  color: MUTED,
                  lineHeight: 1.35,
                }}
              >
                {helperText}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}
