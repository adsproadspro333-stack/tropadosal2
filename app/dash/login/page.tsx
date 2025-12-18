// app/dash/login/page.tsx
"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
} from "@mui/material"
import { Icon } from "@iconify/react"

export const dynamic = "force-dynamic"

function sanitizeNext(nextRaw: string | null) {
  const n = String(nextRaw || "").trim()
  if (n.startsWith("/dash")) return n
  return "/dash"
}

function DashLoginInner() {
  const router = useRouter()
  const search = useSearchParams()

  const next = useMemo(() => sanitizeNext(search.get("next")), [search])
  const e = search.get("e")

  const [user, setUser] = useState("")
  const [pass, setPass] = useState("")
  const [showPass, setShowPass] = useState(false)

  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (e === "missing_secret") {
      setErr("DASH_TOKEN_SECRET não configurado no Railway. Configure e faça deploy novamente.")
    }
  }, [e])

  const submit = async () => {
    if (loading) return
    setErr(null)
    setLoading(true)

    try {
      const res = await fetch("/api/dash/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({
          user: String(user || "").trim(),
          pass: String(pass || ""),
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha no login")

      router.replace(next)
    } catch (ex: any) {
      setErr(ex?.message || "Falha no login")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#0B0F19", display: "flex", alignItems: "center", py: 4 }}>
      <Container maxWidth="sm">
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            bgcolor: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(10px)",
          }}
        >
          <Stack spacing={2}>
            <Typography sx={{ fontWeight: 950, color: "#fff", fontSize: "1.2rem" }}>
              Login do Dashboard
            </Typography>

            <Typography sx={{ color: "rgba(255,255,255,0.70)", fontSize: "0.9rem" }}>
              Área restrita. Use o usuário/senha definidos nas variáveis do Railway.
            </Typography>

            {err && <Alert severity="error">{err}</Alert>}

            <TextField
              label="Usuário"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              fullWidth
              autoComplete="username"
              onKeyDown={(e) => e.key === "Enter" && submit()}
              InputLabelProps={{ style: { color: "rgba(255,255,255,0.7)" } }}
              sx={{
                input: { color: "#fff" },
                "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.18)" },
              }}
            />

            <TextField
              label="Senha"
              type={showPass ? "text" : "password"}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              fullWidth
              autoComplete="current-password"
              onKeyDown={(e) => e.key === "Enter" && submit()}
              InputLabelProps={{ style: { color: "rgba(255,255,255,0.7)" } }}
              sx={{
                input: { color: "#fff" },
                "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.18)" },
              }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPass((v) => !v)}
                      edge="end"
                      aria-label="Mostrar/ocultar senha"
                      sx={{ color: "rgba(255,255,255,0.75)" }}
                    >
                      <Icon icon={showPass ? "mdi:eye-off-outline" : "mdi:eye-outline"} width={20} />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              variant="contained"
              disabled={loading || !user.trim() || !pass}
              onClick={submit}
              fullWidth
              sx={{
                mt: 1,
                borderRadius: 999,
                py: 1.2,
                textTransform: "none",
                fontWeight: 950,
                bgcolor: "#22C55E",
                "&:hover": { bgcolor: "#16A34A" },
              }}
              startIcon={loading ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : null}
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </Stack>
        </Paper>
      </Container>
    </Box>
  )
}

export default function DashLoginPage() {
  return (
    <Suspense
      fallback={
        <Box
          sx={{
            minHeight: "100vh",
            bgcolor: "#0B0F19",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            px: 2,
          }}
        >
          <Stack spacing={2} alignItems="center">
            <CircularProgress />
            <Typography sx={{ color: "rgba(255,255,255,0.75)", fontSize: "0.9rem" }}>
              Carregando…
            </Typography>
          </Stack>
        </Box>
      }
    >
      <DashLoginInner />
    </Suspense>
  )
}
