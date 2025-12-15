"use client"

import { useState } from "react"
import { Box, Typography, Avatar, Button } from "@mui/material"
import { Icon } from "@iconify/react"
import Image from "next/image"
import { mockWinners } from "@/lib/data"

interface WinnersListProps {
  initialCount?: number
}

function InitialsFallback({ name }: { name: string }) {
  const initials = (n: string) => {
    return n
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("")
  }

  return (
    <Avatar
      sx={{
        width: { xs: 48, sm: 56 },
        height: { xs: 48, sm: 56 },
        mx: "auto",
        mb: 1,
        bgcolor: "rgba(255,255,255,0.14)",
        color: "rgba(255,255,255,0.88)",
        fontWeight: 900,
        fontSize: "0.9rem",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "0 10px 22px rgba(0,0,0,0.35)",
      }}
    >
      {initials(name)}
    </Avatar>
  )
}

export default function WinnersList({ initialCount = 5 }: WinnersListProps) {
  const [showAll, setShowAll] = useState(false)
  const displayedWinners = showAll
    ? mockWinners
    : mockWinners.slice(0, initialCount)

  // 🎨 tokens (DNA)
  const GLASS = "rgba(255,255,255,0.06)"
  const GLASS_SOFT = "rgba(255,255,255,0.04)"
  const BORDER = "rgba(255,255,255,0.10)"
  const TXT = "rgba(255,255,255,0.92)"
  const MUTED = "rgba(255,255,255,0.70)"
  const RED = "#DC2626"

  return (
    <Box sx={{ mb: 2 }}>
      <Typography
        variant="h5"
        gutterBottom
        fontWeight={1000}
        textAlign="center"
        sx={{
          mb: 2.2,
          color: "#fff",
          letterSpacing: "-0.3px",
          fontSize: { xs: "1.05rem", sm: "1.2rem" },
        }}
      >
        Ganhadores Recentes
      </Typography>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
        {displayedWinners.map((w) => (
          <div
            key={w.id}
            className="rounded-2xl p-4 flex items-center justify-between"
            style={{
              background: GLASS,
              border: `1px solid ${BORDER}`,
              boxShadow: "0 16px 34px rgba(0,0,0,0.35)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* AVATAR WRAPPER */}
              <div
                className="relative flex-shrink-0"
                style={{
                  width: 48,
                  height: 48,
                }}
              >
                {/* “anel” discreto no avatar (sem poluir foto) */}
                <div
                  style={{
                    position: "absolute",
                    inset: -2,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.14)",
                    boxShadow: "0 10px 22px rgba(0,0,0,0.35)",
                    pointerEvents: "none",
                  }}
                />

                {w.avatarUrl ? (
                  <Image
                    src={w.avatarUrl || "/placeholder.svg"}
                    alt={`Foto de ${w.name}`}
                    fill
                    sizes="48px"
                    className="rounded-full object-cover"
                    priority
                    style={{
                      borderRadius: 999,
                    }}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%" }}>
                    <InitialsFallback name={w.name} />
                  </div>
                )}

                {/* ✅ Badge pequeno (canto inferior direito) */}
                {w.avatarUrl && (
                  <span
                    aria-label="Ganhador"
                    style={{
                      position: "absolute",
                      right: -4,
                      bottom: -4,
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      background: RED,
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 900,
                      border: "2px solid rgba(11,15,25,0.95)", // recorta no dark sem tampar foto
                      boxShadow: "0 6px 14px rgba(0,0,0,0.35)", // sombra leve
                      pointerEvents: "none",
                    }}
                  >
                    ⭐
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <p
                  className="font-extrabold truncate"
                  style={{ color: "#fff", letterSpacing: "-0.2px" }}
                >
                  {w.name}
                </p>
                <p className="text-xs" style={{ color: MUTED }}>
                  {w.date}
                </p>
              </div>
            </div>

            <div className="ml-2 text-right">
              <p
                className="text-xs whitespace-nowrap"
                style={{ color: TXT, fontWeight: 900 }}
              >
                {w.prize}
              </p>

              <div
                style={{
                  marginTop: 6,
                  display: "inline-flex",
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: GLASS_SOFT,
                  border: `1px solid ${BORDER}`,
                  color: "rgba(255,255,255,0.72)",
                  fontSize: 11,
                  fontWeight: 800,
                  alignItems: "center",
                  gap: 6,
                }}
              >
                Confirmado{" "}
                <span style={{ color: "#22C55E", fontWeight: 900 }}>✓</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {mockWinners.length > initialCount && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => setShowAll(!showAll)}
            endIcon={
              <Icon
                icon={showAll ? "mdi:chevron-up" : "mdi:chevron-down"}
                width={20}
              />
            }
            aria-label={
              showAll ? "Mostrar menos ganhadores" : "Mostrar mais ganhadores"
            }
            sx={{
              borderRadius: 999,
              fontWeight: 1000,
              textTransform: "none",
              px: 2.2,
              py: 1.1,
              borderColor: "rgba(255,255,255,0.22)",
              color: "rgba(255,255,255,0.90)",
              bgcolor: "rgba(255,255,255,0.04)",
              "&:hover": {
                bgcolor: "rgba(255,255,255,0.06)",
                borderColor: "rgba(220,38,38,0.55)",
              },
            }}
          >
            {showAll ? "Mostrar menos" : "Mostrar mais"}
          </Button>
        </Box>
      )}
    </Box>
  )
}
