// app/dash/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Box,
  Container,
  Paper,
  Typography,
  Stack,
  Chip,
  TextField,
  Button,
  CircularProgress,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material"

type Overview = {
  ok: boolean
  range: string
  ordersCreated: number
  transactionsTotal: number
  paidOrders: number
}

type Row = {
  transactionId: string
  createdAt: string
  status: string
  value: number
  gatewayId: string | null
  orderId: string
  name: string | null
  cpf: string | null
  phone: string | null
  email: string | null
}

function formatBRL(v: number) {
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`
  }
}

function maskCpf(cpf?: string | null) {
  const d = String(cpf || "").replace(/\D/g, "")
  if (d.length < 11) return cpf || ""
  return `${d.slice(0, 3)}.***.***-${d.slice(-2)}`
}

export default function DashPage() {
  const [range, setRange] = useState<"today" | "24h" | "all">("today")
  const [status, setStatus] = useState<"all" | "pending" | "paid" | "failed">("all")
  const [q, setQ] = useState("")

  const [overview, setOverview] = useState<Overview | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingTable, setLoadingTable] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const params = useMemo(() => {
    const sp = new URLSearchParams()
    sp.set("range", range)
    sp.set("status", status)
    if (q.trim()) sp.set("q", q.trim())
    sp.set("limit", "150")
    return sp.toString()
  }, [range, status, q])

  const loadOverview = async () => {
    const sp = new URLSearchParams()
    sp.set("range", range === "all" ? "24h" : range) // overview só suporta today/24h (sem inventar demais)
    const res = await fetch(`/api/dash/overview?${sp.toString()}`, { cache: "no-store" })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha overview")
    setOverview(data)
  }

  const loadRows = async () => {
    setLoadingTable(true)
    const res = await fetch(`/api/dash/orders?${params}`, { cache: "no-store" })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha transações")
    setRows(Array.isArray(data.rows) ? data.rows : [])
    setLoadingTable(false)
  }

  const reloadAll = async () => {
    setErr(null)
    setLoading(true)
    try {
      await Promise.all([loadOverview(), loadRows()])
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar dashboard")
    } finally {
      setLoading(false)
      setLoadingTable(false)
    }
  }

  useEffect(() => {
    reloadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  useEffect(() => {
    // muda filtros de tabela sem travar
    loadRows().catch((e: any) => setErr(e?.message || "Falha transações"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#0B0F19", pb: 6 }}>
      <Container maxWidth="md" sx={{ pt: { xs: 2, sm: 3 } }}>
        <Stack spacing={2}>
          <Paper
            elevation={0}
            sx={{
              borderRadius: 3,
              bgcolor: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              backdropFilter: "blur(10px)",
              p: { xs: 2, sm: 2.5 },
            }}
          >
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} justifyContent="space-between">
              <Box>
                <Typography sx={{ color: "#fff", fontWeight: 1000, fontSize: "1.1rem" }}>
                  Dashboard (Transações)
                </Typography>
                <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.85rem", mt: 0.4 }}>
                  Lista completa de transações + KPIs do topo.
                </Typography>
              </Box>

              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  onClick={reloadAll}
                  sx={{
                    borderRadius: 999,
                    textTransform: "none",
                    fontWeight: 900,
                    borderColor: "rgba(255,255,255,0.20)",
                    color: "rgba(255,255,255,0.9)",
                  }}
                >
                  Recarregar
                </Button>
              </Stack>
            </Stack>

            <Divider sx={{ borderColor: "rgba(255,255,255,0.10)", my: 2 }} />

            {/* KPIs */}
            {loading ? (
              <Stack direction="row" spacing={1.2} alignItems="center">
                <CircularProgress size={18} />
                <Typography sx={{ color: "rgba(255,255,255,0.75)" }}>Carregando…</Typography>
              </Stack>
            ) : (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                <Chip
                  label={`Pedidos gerados: ${overview?.ordersCreated ?? 0}`}
                  sx={{
                    bgcolor: "rgba(59,130,246,0.14)",
                    color: "#fff",
                    border: "1px solid rgba(59,130,246,0.22)",
                    fontWeight: 900,
                  }}
                />
                <Chip
                  label={`Transações: ${overview?.transactionsTotal ?? 0}`}
                  sx={{
                    bgcolor: "rgba(245,158,11,0.14)",
                    color: "#fff",
                    border: "1px solid rgba(245,158,11,0.22)",
                    fontWeight: 900,
                  }}
                />
                <Chip
                  label={`Pedidos pagos: ${overview?.paidOrders ?? 0}`}
                  sx={{
                    bgcolor: "rgba(34,197,94,0.14)",
                    color: "#fff",
                    border: "1px solid rgba(34,197,94,0.22)",
                    fontWeight: 900,
                  }}
                />
              </Stack>
            )}

            {err && (
              <Typography sx={{ color: "#EF4444", fontWeight: 800, mt: 2 }}>
                {err}
              </Typography>
            )}
          </Paper>

          {/* FILTROS */}
          <Paper
            elevation={0}
            sx={{
              borderRadius: 3,
              bgcolor: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              backdropFilter: "blur(10px)",
              p: { xs: 2, sm: 2.5 },
            }}
          >
            <Stack spacing={1.5}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems={{ sm: "center" }}>
                <ToggleButtonGroup
                  color="primary"
                  exclusive
                  value={range}
                  onChange={(_, v) => v && setRange(v)}
                  sx={{
                    "& .MuiToggleButton-root": {
                      borderColor: "rgba(255,255,255,0.16)",
                      color: "rgba(255,255,255,0.85)",
                      fontWeight: 900,
                      textTransform: "none",
                    },
                    "& .Mui-selected": {
                      bgcolor: "rgba(34,197,94,0.18) !important",
                      borderColor: "rgba(34,197,94,0.30) !important",
                      color: "#fff !important",
                    },
                  }}
                >
                  <ToggleButton value="today">Hoje</ToggleButton>
                  <ToggleButton value="24h">Últimas 24h</ToggleButton>
                  <ToggleButton value="all">Tudo</ToggleButton>
                </ToggleButtonGroup>

                <ToggleButtonGroup
                  exclusive
                  value={status}
                  onChange={(_, v) => v && setStatus(v)}
                  sx={{
                    "& .MuiToggleButton-root": {
                      borderColor: "rgba(255,255,255,0.16)",
                      color: "rgba(255,255,255,0.85)",
                      fontWeight: 900,
                      textTransform: "none",
                    },
                    "& .Mui-selected": {
                      bgcolor: "rgba(245,158,11,0.18) !important",
                      borderColor: "rgba(245,158,11,0.30) !important",
                      color: "#fff !important",
                    },
                  }}
                >
                  <ToggleButton value="all">Todos</ToggleButton>
                  <ToggleButton value="pending">Pendentes</ToggleButton>
                  <ToggleButton value="paid">Pagos</ToggleButton>
                  <ToggleButton value="failed">Falhas</ToggleButton>
                </ToggleButtonGroup>
              </Stack>

              <TextField
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por CPF, telefone, email, orderId, gatewayId..."
                fullWidth
                InputProps={{ style: { color: "#fff" } }}
                sx={{
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.18)" },
                  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.26)" },
                }}
              />
            </Stack>
          </Paper>

          {/* LISTA */}
          <Paper
            elevation={0}
            sx={{
              borderRadius: 3,
              bgcolor: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              backdropFilter: "blur(10px)",
              p: { xs: 2, sm: 2.5 },
            }}
          >
            <Stack spacing={1.5}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography sx={{ color: "#fff", fontWeight: 1000 }}>
                  Transações (mais recentes)
                </Typography>
                {loadingTable && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={16} />
                    <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.85rem" }}>
                      Atualizando…
                    </Typography>
                  </Stack>
                )}
              </Stack>

              <Divider sx={{ borderColor: "rgba(255,255,255,0.10)" }} />

              <Stack spacing={1.1}>
                {rows.length === 0 ? (
                  <Typography sx={{ color: "rgba(255,255,255,0.70)" }}>
                    Nenhuma transação encontrada.
                  </Typography>
                ) : (
                  rows.map((r) => (
                    <Box
                      key={r.transactionId}
                      sx={{
                        p: 1.6,
                        borderRadius: 2.5,
                        border: "1px solid rgba(255,255,255,0.10)",
                        bgcolor: "rgba(0,0,0,0.18)",
                      }}
                    >
                      <Stack spacing={0.6}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between">
                          <Typography sx={{ color: "#fff", fontWeight: 900, fontSize: "0.95rem" }}>
                            {r.name || "Sem nome"} • {maskCpf(r.cpf)}
                          </Typography>

                          <Chip
                            size="small"
                            label={String(r.status || "").toUpperCase()}
                            sx={{
                              fontWeight: 1000,
                              bgcolor:
                                r.status === "paid"
                                  ? "rgba(34,197,94,0.16)"
                                  : r.status === "pending"
                                  ? "rgba(245,158,11,0.16)"
                                  : "rgba(239,68,68,0.16)",
                              border:
                                r.status === "paid"
                                  ? "1px solid rgba(34,197,94,0.26)"
                                  : r.status === "pending"
                                  ? "1px solid rgba(245,158,11,0.26)"
                                  : "1px solid rgba(239,68,68,0.26)",
                              color: "#fff",
                            }}
                          />
                        </Stack>

                        <Typography sx={{ color: "rgba(255,255,255,0.78)", fontSize: "0.86rem", fontWeight: 900 }}>
                          {formatBRL(Number(r.value || 0))}
                        </Typography>

                        <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.78rem" }}>
                          Email: {r.email || "-"} • Tel: {r.phone || "-"}
                        </Typography>

                        <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.75rem" }}>
                          Tx: {r.transactionId} • Order: {r.orderId} • Gateway: {r.gatewayId || "-"} • {new Date(r.createdAt).toLocaleString("pt-BR")}
                        </Typography>
                      </Stack>
                    </Box>
                  ))
                )}
              </Stack>
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </Box>
  )
}
