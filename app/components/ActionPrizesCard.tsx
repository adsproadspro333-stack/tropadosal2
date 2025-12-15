"use client"

import { useState } from "react"
import { Box, Typography, IconButton, Collapse } from "@mui/material"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"

export default function ActionPrizesCard() {
  const [openPremios, setOpenPremios] = useState(false)

  // ---------- TOKENS (DNA dark) ----------
  const GLASS = "rgba(255,255,255,0.06)"
  const GLASS_SOFT = "rgba(255,255,255,0.04)"
  const BORDER = "rgba(255,255,255,0.10)"
  const TXT = "rgba(255,255,255,0.92)"
  const MUTED = "rgba(255,255,255,0.68)"
  const RED = "#DC2626"
  const GREEN = "#22C55E"

  return (
    <Box sx={{ width: "100%", mt: 0, mb: 0 }}>
      <Box
        sx={{
          borderRadius: 3,
          border: `1px solid ${BORDER}`,
          bgcolor: GLASS,
          backdropFilter: "blur(10px)",
          boxShadow: "0 18px 42px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        {/* Header do accordion */}
        <Box
          onClick={() => setOpenPremios((prev) => !prev)}
          sx={{
            px: 2,
            py: 1.35,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            gap: 1.5,
          }}
        >
          <Box>
            <Typography
              sx={{
                fontSize: "0.72rem",
                textTransform: "uppercase",
                color: MUTED,
                letterSpacing: 1,
                fontWeight: 800,
              }}
            >
              Detalhes
            </Typography>

            <Typography
              sx={{
                fontSize: "0.98rem",
                fontWeight: 1000,
                color: "#fff",
                letterSpacing: "-0.2px",
                lineHeight: 1.15,
              }}
            >
              PRÊMIOS DA AÇÃO
            </Typography>

            <Typography
              sx={{
                fontSize: "0.78rem",
                color: MUTED,
                mt: 0.25,
              }}
            >
              Diversos ganhadores em uma única ação.
            </Typography>
          </Box>

          <IconButton
            size="small"
            sx={{
              color: "rgba(255,255,255,0.86)",
              bgcolor: "rgba(255,255,255,0.04)",
              border: `1px solid ${BORDER}`,
              borderRadius: 999,
              width: 38,
              height: 38,
              transform: openPremios ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.22s ease, background-color 0.2s ease",
              "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
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
              pb: 1.6,
              pt: 1.0,
              borderTop: `1px solid ${BORDER}`,
              bgcolor: "rgba(0,0,0,0.12)",
            }}
          >
            {/* 🔥 PRÊMIO PRINCIPAL EM DESTAQUE */}
            <Box
              sx={{
                mb: 1.35,
                p: 1.1,
                borderRadius: 2.2,
                border: `1px solid rgba(220,38,38,0.40)`,
                background:
                  "linear-gradient(135deg, rgba(220,38,38,0.20), rgba(0,0,0,0.10))",
                boxShadow: "0 16px 34px rgba(0,0,0,0.28)",
              }}
            >
              <Typography
                sx={{
                  fontSize: "0.72rem",
                  fontWeight: 1000,
                  color: "rgba(255,255,255,0.82)",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                Prêmio principal
              </Typography>

              <Typography
                sx={{
                  fontSize: "1.02rem",
                  fontWeight: 1000,
                  color: "#fff",
                  letterSpacing: "-0.2px",
                  mt: 0.2,
                }}
              >
                1x Moto BMW GS 1300
              </Typography>

              <Typography
                sx={{
                  fontSize: "0.78rem",
                  color: MUTED,
                  mt: 0.45,
                }}
              >
                E dezenas de prêmios menores durante a edição.
              </Typography>
            </Box>

            {/* LISTA DE PRÊMIOS */}
            {[
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
                  fontSize: "0.88rem",
                  color: TXT,
                  mb: 0.45,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Box
                  component="span"
                  sx={{
                    display: "inline-block",
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    bgcolor: RED,
                    boxShadow: "0 0 0 6px rgba(220,38,38,0.12)",
                    flexShrink: 0,
                  }}
                />
                {item}
              </Typography>
            ))}

            {/* MICRO-COPY DE CONVERSÃO */}
            <Box
              sx={{
                mt: 1.2,
                p: 1.0,
                borderRadius: 2,
                bgcolor: GLASS_SOFT,
                border: `1px solid ${BORDER}`,
              }}
            >
              <Typography
                sx={{
                  fontSize: "0.78rem",
                  color: MUTED,
                  lineHeight: 1.35,
                }}
              >
                Quanto mais números você escolher,{" "}
                <strong style={{ color: "#fff" }}>
                  maiores são suas chances de ganhar
                </strong>
                .{" "}
                <span style={{ color: GREEN, fontWeight: 900 }}>
                  Aproveita os combos promocionais.
                </span>
              </Typography>
            </Box>
          </Box>
        </Collapse>
      </Box>
    </Box>
  )
}
