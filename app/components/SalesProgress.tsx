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

  return (
    <Box sx={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 3,
          bgcolor: "#FEF2F2",
          border: "1px solid #FECACA",
          p: 1.5,
          mb: 2,
        }}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <Box
            sx={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              bgcolor: "#FEE2E2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon sx={{ fontSize: 18, color: "#B91C1C" }} />
          </Box>

          <Box>
            <Typography
              sx={{
                fontSize: "0.75rem",
                fontWeight: 800,
                color: "#991B1B",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Progresso da edição
            </Typography>

            <Typography
              sx={{
                fontSize: "0.8rem",
                color: "#374151",
              }}
            >
              {statusLabel} •{" "}
              <strong>{percent}% dos números já foram garantidos</strong>
            </Typography>
          </Box>
        </Box>

        {/* Barra */}
        <Box mt={1}>
          <LinearProgress
            variant="determinate"
            value={percent}
            sx={{
              height: 10,
              borderRadius: 999,
              bgcolor: "#FECACA",
              "& .MuiLinearProgress-bar": {
                borderRadius: 999,
                backgroundColor: barColor,
              },
            }}
          />

          <Typography
            sx={{
              fontSize: "0.72rem",
              color: "#6B7280",
              mt: 0.5,
            }}
          >
            {helperText}
          </Typography>
        </Box>
      </Paper>
    </Box>
  )
}
