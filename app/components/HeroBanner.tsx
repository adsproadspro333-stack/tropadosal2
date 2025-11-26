"use client"

import { Box } from "@mui/material"
import Image from "next/image"

export default function HeroBanner() {
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        bgcolor: "#F3F4F6",
        px: 1.5,
        pt: 1.5,
        pb: 1,
      }}
    >
      <Box
        sx={{
          position: "relative",
          width: "100%",
          maxWidth: 420,
          borderRadius: 3,
          overflow: "hidden",
          boxShadow: "0 14px 28px rgba(0,0,0,0.18)",
          bgcolor: "#000",
        }}
      >
        {/* Aspect ratio mais alto pra mostrar mais conteúdo do banner */}
        <Box
          sx={{
            position: "relative",
            width: "100%",
            paddingTop: "60%", // antes ~54% — agora mais alto
          }}
        >
          <Image
            src="/banner-sorteio.jpg"
            alt="Banner principal do sorteio"
            fill
            priority
            sizes="(max-width: 640px) 100vw, 420px"
            style={{
              objectFit: "cover",
              // puxa o foco um pouco mais para cima,
              // mostrando melhor a parte do topo da arte
              objectPosition: "center 45%",
            }}
          />
        </Box>
      </Box>
    </Box>
  )
}
