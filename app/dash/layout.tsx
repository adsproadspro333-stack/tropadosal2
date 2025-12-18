// app/dash/layout.tsx
import type { Metadata } from "next"
import type React from "react"
import { Box, Container } from "@mui/material"

export const metadata: Metadata = {
  title: "Dashboard | FAVELA Prêmios",
  description: "Área administrativa",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
}

export default function DashLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#0B0F19",
      }}
    >
      {/* “Top safe area” */}
      <Box sx={{ py: 2 }}>
        <Container maxWidth="lg">
          {/* Barra superior simples (sem HeaderBar do site) */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
              px: 2,
              py: 1.4,
              borderRadius: 3,
              bgcolor: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              backdropFilter: "blur(10px)",
            }}
          >
            <Box>
              <Box
                sx={{
                  color: "#fff",
                  fontWeight: 1000,
                  lineHeight: 1,
                  fontSize: "1rem",
                }}
              >
                Admin Dashboard
              </Box>
              <Box
                sx={{
                  color: "rgba(255,255,255,0.65)",
                  fontSize: "0.82rem",
                  fontWeight: 800,
                }}
              >
                /dash (protegido por cookie)
              </Box>
            </Box>

            {/* Placeholder para actions futuras (logout etc) */}
            <Box
              sx={{
                color: "rgba(255,255,255,0.65)",
                fontSize: "0.8rem",
                fontWeight: 800,
              }}
            >
              Railway • Prisma • MWBank
            </Box>
          </Box>
        </Container>
      </Box>

      {/* Conteúdo do dashboard */}
      <Box>{children}</Box>
    </Box>
  )
}
