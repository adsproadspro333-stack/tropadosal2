"use client"

import { Box, Container, Typography } from "@mui/material"

// 🔗 TROQUE APENAS ESSAS DUAS STRINGS PELOS SEUS LINKS REAIS
const TERMS_URL = "https://fpp-assets.playservicos.com.br/bpp/PREMIOSDOMAIA/condicoes/Filantropia_1164_CG_-_PrAmios_do_Carlinhos_v.1164_2-1763555957360.pdf"
const RULES_URL = "https://fpp-assets.playservicos.com.br/bpp/PREMIOSDOMAIA/regulamentos/Regulamento_-_PrAmios_do_Carlinhos_v.1164_2-1763555972545.pdf"

export default function FooterLegal() {
  return (
    <Box
      component="section"
      sx={{
        mt: 3,
        // 🔧 espaçamento ajustado — antes estava MUITO grande
        mb: { xs: 0, sm: 0 },
      }}
    >
      <Container maxWidth="sm" sx={{ px: { xs: 2, sm: 0 } }}>
        {/* texto legal SUSEP */}
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
          único, emitido pela AplicCap Capitalização S/A (CNPJ:
          13.122.801/0001-71). A aprovação pela Susep apenas confirma a
          conformidade do produto com a legislação vigente, sem representar
          recomendação de compra. Processo SUSEP: 15414.647372/2025-.
        </Typography>

        {/* links: Condições gerais / Regulamento */}
        <Box
          sx={{
            mt: 1.5,
            display: "flex",
            justifyContent: "center",
            gap: 3,
          }}
        >
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "0.72rem",
              color: "#111827",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              fontWeight: 500,
            }}
          >
            Condições gerais
          </a>

          <a
            href={RULES_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "0.72rem",
              color: "#111827",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              fontWeight: 500,
            }}
          >
            Regulamento
          </a>
        </Box>
      </Container>
    </Box>
  )
}
