"use client"

import { Box, LinearProgress, Typography, Paper } from "@mui/material"

interface SalesProgressProps {
  percent: number
}

export default function SalesProgress({ percent }: SalesProgressProps) {
  return (
    <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom fontWeight={600}>
        Progresso de Vendas
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Box sx={{ flex: 1 }}>
          <LinearProgress
            variant="determinate"
            value={percent}
            sx={{
              height: 12,
              borderRadius: 6,
              bgcolor: "grey.200",
              "& .MuiLinearProgress-bar": {
                bgcolor: "success.main",
              },
            }}
            aria-label={`Progresso de vendas: ${percent}%`}
          />
        </Box>
        <Typography variant="h6" fontWeight={700} color="success.main">
          {percent}%
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Restam apenas {(100 - percent).toFixed(1)}% dos títulos disponíveis!
      </Typography>
    </Paper>
  )
}
