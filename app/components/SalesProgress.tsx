"use client"

import { Box, LinearProgress, Typography, Paper } from "@mui/material"
import AccessTimeIcon from "@mui/icons-material/AccessTime"
import WhatshotIcon from "@mui/icons-material/Whatshot"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"

interface SalesProgressProps {
  percent: number
}

export default function SalesProgress({ percent }: SalesProgressProps) {
  let statusLabel = ""
  let helperText = ""
  let Icon = AccessTimeIcon
  let barColor = "#16A34A" // verde padrão

  if (percent < 40) {
    statusLabel = "Edição liberada"
    helperText = "Os números estão começando a ser garantidos agora."
    Icon = AccessTimeIcon
    barColor = "#16A34A"
  } else if (percent < 80) {
    statusLabel = "Alta procura"
    helperText = "Grande parte dos números já foi garantida hoje."
    Icon = WhatshotIcon
    barColor = "#FB923C"
  } else {
    statusLabel = "Reta final"
    helperText = "Últimos números disponíveis nesta edição."
    Icon = CheckCircleIcon
    barColor = "#DC2626"
  }

  // ---------- TOKENS (DNA dark) ----------
  const GLASS = "rgba(255,255,255,0.06)"
  const BORDER = "rgba(255,255,255,0.10)"
  const TXT = "rgba(255,255,255,0.92)"
  const MUTED = "rgba(255,255,255,0.68)"
  const SOFT = "rgba(255,255,255,0.04)"

  // fundo da barra + halo do card (puxa a cor do status sem brigar com o banner)
  const trackBg = "rgba(255,255,255,0.10)"
  const glow =
    percent < 40
      ? "rgba(34,197,94,0.16)"
      : percent < 80
        ? "rgba(251,146,60,0.16)"
        : "rgba(220,38,38,0.16)"

  const iconBg =
    percent < 40
      ? "rgba(34,197,94,0.14)"
      : percent < 80
        ? "rgba(251,146,60,0.14)"
        : "rgba(220,38,38,0.14)"

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
          boxShadow: `0 18px 42px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.20)`,
          position: "relative",
          overflow: "hidden",
          "&::before": {
            content: '""',
            position: "absolute",
            inset: -1,
            background: `radial-gradient(700px 220px at 20% 0%, ${glow}, transparent 55%)`,
            pointerEvents: "none",
          },
        }}
      >
        <Box sx={{ position: "relative" }}>
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

            <Box sx={{ minWidth: 0 }}>
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

              <Typography
                sx={{
                  fontSize: "0.84rem",
                  color: TXT,
                  lineHeight: 1.25,
                  mt: 0.15,
                }}
              >
                <span style={{ fontWeight: 900 }}>{statusLabel}</span>{" "}
                <span style={{ color: MUTED }}>•</span>{" "}
                <strong style={{ color: "#fff" }}>
                  {percent}% dos números já foram garantidos
                </strong>
              </Typography>
            </Box>
          </Box>

          {/* Barra */}
          <Box mt={1.2}>
            <LinearProgress
              variant="determinate"
              value={percent}
              sx={{
                height: 10,
                borderRadius: 999,
                bgcolor: trackBg,
                border: `1px solid ${BORDER}`,
                "& .MuiLinearProgress-bar": {
                  borderRadius: 999,
                  backgroundColor: barColor,
                  boxShadow:
                    percent < 40
                      ? "0 10px 26px rgba(34,197,94,0.25)"
                      : percent < 80
                        ? "0 10px 26px rgba(251,146,60,0.25)"
                        : "0 10px 26px rgba(220,38,38,0.25)",
                },
              }}
            />

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
