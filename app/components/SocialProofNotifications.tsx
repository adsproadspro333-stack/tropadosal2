"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Box, Paper, Typography } from "@mui/material"
import { Icon } from "@iconify/react"

interface Winner {
  name: string
  state: string
  prize: string
}

const WINNERS: Winner[] = [
  { name: "Thaynara", state: "CE", prize: "R$ 700,00 no PIX" },
  { name: "Marcos", state: "PE", prize: "R$ 3.000,00 no PIX" },
  { name: "Bruna", state: "BA", prize: "R$ 20.000,00 no PIX" },
  { name: "Rafael", state: "RJ", prize: "R$ 15.000,00 no PIX" },
  { name: "Carla", state: "SP", prize: "R$ 5.000,00 no PIX" },
  { name: "Lucas", state: "MG", prize: "um Iphone 17 PRO MAX" },
]

// ✅ modo leve automático (low-end)
function getAutoLiteMode(): boolean {
  if (typeof window === "undefined") return false

  try {
    const nav = navigator as any
    const dm = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null
    const hc =
      typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null
    const saveData =
      typeof nav.connection?.saveData === "boolean" ? nav.connection.saveData : false
    const reducedMotion =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")?.matches
        : false

    return Boolean(
      (dm !== null && dm <= 3) ||
        (hc !== null && hc <= 4) ||
        saveData ||
        reducedMotion,
    )
  } catch {
    return false
  }
}

export default function SocialProofNotifications() {
  const [currentWinner, setCurrentWinner] = useState<Winner | null>(null)
  const [open, setOpen] = useState(false)
  const [isLite, setIsLite] = useState(false)

  // timers controlados (sem “fantasma”)
  const initTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // evita loop rodando em background
  const pausedRef = useRef(false)

  // timings (mantém seu comportamento: mostra 6s, espera ~25s, inicia em 3s)
  const INIT_DELAY_MS = 3000
  const SHOW_MS = 6000
  const GAP_MS = 25000

  useEffect(() => {
    setIsLite(getAutoLiteMode())
  }, [])

  const stopAll = () => {
    if (initTimerRef.current) clearTimeout(initTimerRef.current)
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    if (nextTimerRef.current) clearTimeout(nextTimerRef.current)
    initTimerRef.current = null
    closeTimerRef.current = null
    nextTimerRef.current = null
  }

  const pickWinner = () => {
    const idx = Math.floor(Math.random() * WINNERS.length)
    return WINNERS[idx]
  }

  const startCycle = () => {
    if (pausedRef.current) return

    // escolhe ganhador e abre
    setCurrentWinner(pickWinner())
    setOpen(true)

    // fecha após SHOW_MS
    closeTimerRef.current = setTimeout(() => {
      setOpen(false)

      // próximo ciclo após GAP_MS
      nextTimerRef.current = setTimeout(() => {
        startCycle()
      }, GAP_MS)
    }, SHOW_MS)
  }

  useEffect(() => {
    // pausa quando aba fica hidden (economia real em low-end)
    const onVis = () => {
      const hidden = typeof document !== "undefined" && document.hidden
      pausedRef.current = Boolean(hidden)

      if (pausedRef.current) {
        stopAll()
        setOpen(false)
      } else {
        // retoma suavemente
        stopAll()
        initTimerRef.current = setTimeout(() => startCycle(), INIT_DELAY_MS)
      }
    }

    document.addEventListener("visibilitychange", onVis)

    // inicia
    initTimerRef.current = setTimeout(() => startCycle(), INIT_DELAY_MS)

    return () => {
      stopAll()
      document.removeEventListener("visibilitychange", onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- TOKENS (DNA dark) ----------
  const tokens = useMemo(() => {
    const GLASS = isLite ? "rgba(17,24,39,0.92)" : "rgba(255,255,255,0.06)"
    const BORDER = "rgba(255,255,255,0.10)"
    const TXT = "rgba(255,255,255,0.92)"
    const MUTED = "rgba(255,255,255,0.70)"
    const RED = "#DC2626"

    return { GLASS, BORDER, TXT, MUTED, RED }
  }, [isLite])

  // animação mais leve em low-end
  const transition = isLite ? "opacity 0.18s linear" : "opacity 0.28s ease, transform 0.28s ease"
  const closedTransform = isLite
    ? "translateY(0) scale(1)"
    : "translateY(8px) scale(0.96)"

  return (
    <Box
      sx={{
        position: "fixed",
        // ✅ antes estava 800 (quase fora da tela). Toast tem que ficar perto do rodapé.
        bottom: { xs: 92, md: 44 },
        left: { xs: "50%", md: 40 },
        transform: { xs: "translateX(-50%)", md: "none" },
        zIndex: 998,
        pointerEvents: "none",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          px: 2,
          py: 1.35,
          display: "flex",
          alignItems: "center",
          gap: 1.3,
          borderRadius: 9999,

          opacity: open ? 1 : 0,
          transform: open ? "translateY(0) scale(1)" : closedTransform,
          transition,

          minWidth: 288,
          maxWidth: 360,

          bgcolor: tokens.GLASS,
          border: `1px solid ${tokens.BORDER}`,

          // ✅ low-end: sem blur (caríssimo)
          backdropFilter: isLite ? "none" : "blur(10px)",

          // ✅ low-end: reduz shadow/glow
          boxShadow: isLite
            ? "0 10px 22px rgba(0,0,0,0.30)"
            : open
              ? `0 18px 40px rgba(0,0,0,0.45),
                 0 0 0 1px rgba(220,38,38,0.55),
                 0 14px 36px rgba(220,38,38,0.22)`
              : `0 12px 28px rgba(0,0,0,0.35),
                 0 0 0 1px rgba(220,38,38,0.35)`,

          position: "relative",
          overflow: "hidden",

          // ✅ low-end: remove gradiente radial pesado
          ...(isLite
            ? {}
            : {
                "&::before": {
                  content: '""',
                  position: "absolute",
                  inset: -1,
                  background:
                    "radial-gradient(420px 120px at 20% 10%, rgba(220,38,38,0.20), transparent 55%)",
                  pointerEvents: "none",
                },
              }),
        }}
      >
        {/* Badge ícone */}
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "rgba(245,158,11,0.14)",
            border: `1px solid ${tokens.BORDER}`,
            // ✅ low-end: sombra menor
            boxShadow: isLite ? "0 6px 14px rgba(0,0,0,0.22)" : "0 10px 22px rgba(0,0,0,0.25)",
            flexShrink: 0,
          }}
        >
          {isLite ? (
            <Typography sx={{ fontSize: "1.05rem", lineHeight: 1 }}>🏆</Typography>
          ) : (
            <Icon icon="mdi:trophy" width={18} height={18} style={{ color: "#f59e0b" }} />
          )}
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Typography
            fontWeight={1000}
            fontSize="0.86rem"
            sx={{
              color: tokens.TXT,
              lineHeight: 1.15,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {currentWinner?.name} ({currentWinner?.state})
          </Typography>

          <Typography
            fontSize="0.76rem"
            sx={{
              color: tokens.MUTED,
              mt: 0.15,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Ganhou{" "}
            <span style={{ color: "#fff", fontWeight: 900 }}>
              {currentWinner?.prize}
            </span>
            <span style={{ color: tokens.RED, fontWeight: 900 }}> ✓</span>
          </Typography>
        </Box>
      </Paper>
    </Box>
  )
}
