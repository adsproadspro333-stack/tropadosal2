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
        bgcolor: "#d0d0d0",
        color: "#666",
        fontWeight: 600,
        fontSize: "0.875rem",
      }}
    >
      {initials(name)}
    </Avatar>
  )
}

export default function WinnersList({ initialCount = 5 }: WinnersListProps) {
  const [showAll, setShowAll] = useState(false)
  const displayedWinners = showAll ? mockWinners : mockWinners.slice(0, initialCount)

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h5" gutterBottom fontWeight={600} textAlign="center" sx={{ mb: 3 }}>
        Ganhadores Recentes
      </Typography>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
        {displayedWinners.map((w) => (
          <div
            key={w.id}
            className="rounded-xl bg-white shadow-sm border border-gray-200 p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-12 h-12 flex-shrink-0">
                {w.avatarUrl && (
                  <span aria-label="Ganhador" className="winner-badge pointer-events-none">
                    <span className="winner-badge__core">⭐</span>
                  </span>
                )}
                {w.avatarUrl ? (
                  <Image
                    src={w.avatarUrl || "/placeholder.svg"}
                    alt={`Foto de ${w.name}`}
                    fill
                    sizes="48px"
                    className="rounded-full object-cover"
                    priority
                  />
                ) : (
                  <InitialsFallback name={w.name} />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{w.name}</p>
                <p className="text-xs text-gray-500">{w.date}</p>
              </div>
            </div>

            {/* Prize displayed discretely on the right */}
            <div className="ml-2 text-right">
              <p className="text-xs text-gray-600 whitespace-nowrap">{w.prize}</p>
            </div>
          </div>
        ))}
      </div>

      {mockWinners.length > initialCount && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
          <Button
            variant="outlined"
            color="primary"
            onClick={() => setShowAll(!showAll)}
            endIcon={<Icon icon={showAll ? "mdi:chevron-up" : "mdi:chevron-down"} width={20} />}
            aria-label={showAll ? "Mostrar menos ganhadores" : "Mostrar mais ganhadores"}
          >
            {showAll ? "Mostrar menos" : "Mostrar mais"}
          </Button>
        </Box>
      )}
    </Box>
  )
}
