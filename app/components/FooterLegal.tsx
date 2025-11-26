"use client"

import { Box, Container, Typography } from "@mui/material"

export default function FooterLegal() {
  return (
    <Box
      component="section"
      sx={{
        mt: 3,
        mb: 6, // espaço antes do CTA fixo
      }}
    >
      <Container maxWidth="sm" sx={{ px: { xs: 2, sm: 0 } }}>
        <Typography
          variant="caption"
          align="center"
          sx={{
            fontSize: "0.68rem",
            lineHeight: 1.4,
            color: "#9CA3AF",
          }}
        >
          Título de Capitalização na modalidade Filantropia Premiável, pagamento
          único, emitido pela AplicCap Capitalização S/A (CNPJ: 13.122.801/0001-71).
          A aprovação pela Susep apenas confirma a conformidade do produto com a
          legislação vigente, sem representar recomendação de compra.
          Processo SUSEP: 15414.647372/2025-.
        </Typography>
      </Container>
    </Box>
  )
}
