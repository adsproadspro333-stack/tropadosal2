"use client"

import { Box, Stack, CircularProgress, Typography } from "@mui/material"

export default function Loading() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "#F3F4F6",
        px: 2,
      }}
    >
      <Stack spacing={2} alignItems="center">
        <CircularProgress size={48} />

        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 600, color: "#111827", textAlign: "center" }}
        >
          Gerando seu pagamento PIX...
        </Typography>

        <Typography
          variant="body2"
          sx={{ color: "#6B7280", textAlign: "center", maxWidth: 260 }}
        >
          Isso costuma levar só alguns segundos. Não feche esta tela enquanto
          preparamos o código de pagamento pra você.
        </Typography>
      </Stack>
    </Box>
  )
}
