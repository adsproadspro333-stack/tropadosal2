"use client"

import { useState } from "react"
import { Box, Typography, IconButton, Collapse } from "@mui/material"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"

export default function ActionPrizesCard() {
  const [openPremios, setOpenPremios] = useState(false)

  return (
    <Box sx={{ width: "100%", mt: 1.5, mb: 2 }}>
      <Box
        sx={{
          borderRadius: 2,
          border: "1px solid #e5e7eb",
          bgcolor: "#ffffff",
          boxShadow: "0 4px 10px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}
      >
        {/* Header do accordion */}
        <Box
          onClick={() => setOpenPremios((prev) => !prev)}
          sx={{
            px: 2,
            py: 1.2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
          }}
        >
          <Box>
            <Typography
              sx={{
                fontSize: "0.7rem",
                textTransform: "uppercase",
                color: "#6B7280",
                letterSpacing: 1,
              }}
            >
              Detalhes
            </Typography>
            <Typography
              sx={{
                fontSize: "0.95rem",
                fontWeight: 800,
                color: "#111827",
              }}
            >
              PRÊMIOS DA AÇÃO
            </Typography>
            <Typography
              sx={{
                fontSize: "0.75rem",
                color: "#6B7280",
                mt: 0.2,
              }}
            >
              Milhares de prêmios entregues nesta ação.
            </Typography>
          </Box>

          <IconButton
            size="small"
            sx={{
              transform: openPremios ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
          >
            <ExpandMoreIcon />
          </IconButton>
        </Box>

        {/* Conteúdo do accordion */}
        <Collapse in={openPremios}>
          <Box
            sx={{
              px: 2,
              pb: 1.5,
              pt: 0.5,
              borderTop: "1px solid #e5e7eb",
            }}
          >
            {[
              "1x Moto BMW GS 1300",
              "10x CG 160 FAN",
              "10x iPhone 17 Pro Max",
              "02x R$ 10.000,00 no PIX",
              "04x R$ 5.000,00 no PIX",
              "10x R$ 1.000,00 no PIX",
              "20x R$ 500,00 no PIX",
              "40x R$ 250,00 no PIX",
            ].map((item) => (
              <Typography
                key={item}
                component="div"
                sx={{
                  fontSize: "0.85rem",
                  color: "#111827",
                  mb: 0.4,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Box
                  component="span"
                  sx={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: "#B91C1C",
                    flexShrink: 0,
                  }}
                />
                {item}
              </Typography>
            ))}
          </Box>
        </Collapse>
      </Box>
    </Box>
  )
}
