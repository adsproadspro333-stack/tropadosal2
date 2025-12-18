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
  MenuItem,
  Button,
  CircularProgress,
  Divider,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Tooltip,
} from "@mui/material"
import { Icon } from "@iconify/react"

export const dynamic = "force-dynamic"

type Overview = {
  ok: boolean
  range: "today" | "24h" | "all"
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
    return `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`
  }
}

function formatDateSP(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
  } catch {
    return iso
  }
}

function maskCpf(cpf?: string | null) {
  const s = String(cpf || "").replace(/\D/g, "")
  if (s.length < 11) return cpf || ""
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`
}

function maskPhone(p?: string | null) {
  const s = String(p || "").replace(/\D/g, "")
  if (s.length < 10) return p || ""
  // 55DDDN...
  if (s.startsWith("55") && s.length >= 12) {
    const ddd = s.slice(2, 4)
    const num = s.slice(4)
    if (num.length === 9) return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`
    if (num.length === 8) return `+55 (${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`
    return `+55 (${ddd}) ${num}`
  }
  // DDD + número
  const ddd = s.slice(0, 2)
  const num = s.slice(2)
  if (num.length === 9) return `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`
  if (num.length === 8) return `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`
  return p || ""
}

function statusChip(status: string) {
  const s = String(status || "").toLowerCase()
  if (s === "paid") return <Chip size="small" label="PAID" sx={{ fontWeight: 900, bgcolor: "rgba(34,197,94,0.18)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.28)" }} />
  if (s === "pending" || s === "waiting_payment") return <Chip size="small" label="PENDING" sx={{ fontWeight: 900, bgcolor: "rgba(245,158,11,0.18)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.28)" }} />
  if (s === "failed" || s === "canceled" || s === "cancelled") return <Chip size="small" label="FAILED" sx={{ fontWeight: 900, bgcolor: "rgba(239,68,68,0.18)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.28)" }} />
  return <Chip size="small" label={status || "—"} sx={{ fontWeight: 900, bgcolor: "rgba(148,163,184,0.16)", color: "rgba(255,255,255,0.78)", border: "1px solid rgba(148,163,184,0.18)" }} />
}

export default function DashPage() {
  const [range, setRange] = useState<"today" | "24h" | "all">("today")
  const [status, setStatus] = useState<"all" | "pending" | "paid" | "failed">("all")
  const [q, setQ] = useState("")

  const [overview, setOverview] = useState<Overview | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [limit, setLimit] = useState(50)

  const [loadingTop, setLoadingTop] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [errTop, setErrTop] = useState<string | null>(null)
  const [errList, setErrList] = useState<string | null>(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("range", range)
    params.set("status", status)
    params.set("limit", String(limit))
    if (q.trim()) params.set("q", q.trim())
    return params.toString()
  }, [range, status, limit, q])

  async function loadOverview() {
    setErrTop(null)
    setLoadingTop(true)
    try {
      const res = await fetch(`/api/dash/overview?range=${range}`, { cache: "no-store" })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao carregar overview")
      setOverview(data)
    } catch (e: any) {
      setErrTop(e?.message || "Falha ao carregar overview")
      setOverview(null)
    } finally {
      setLoadingTop(false)
    }
  }

  async function loadOrders() {
    setErrList(null)
    setLoadingList(true)
    try {
      const res = await fetch(`/api/dash/orders?${queryString}`, { cache: "no-store" })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao carregar transações")
      setRows(Array.isArray(data?.rows) ? data.rows : [])
    } catch (e: any) {
      setErrList(e?.message || "Falha ao carregar transações")
      setRows([])
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    loadOverview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  useEffect(() => {
    loadOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#0B0F19", py: 3 }}>
      <Container maxWidth="md">
        <Stack spacing={2.2}>
          {/* Header */}
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack spacing={0.3}>
              <Typography sx={{ color: "#fff", fontWeight: 950, fontSize: "1.2rem" }}>
                Dashboard — FAVELA Prêmios
              </Typography>
              <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.9rem" }}>
                Monitoramento interno (orders + transactions)
              </Typography>
            </Stack>

            <Stack direction="row" spacing={1}>
              <Button
                onClick={() => {
                  loadOverview()
                  loadOrders()
                }}
                disabled={loadingTop || loadingList}
                variant="outlined"
                sx={{
                  borderColor: "rgba(255,255,255,0.18)",
                  color: "rgba(255,255,255,0.85)",
                  textTransform: "none",
                  fontWeight: 900,
                  borderRadius: 999,
                }}
                startIcon={<Icon icon="mdi:refresh" width={18} />}
              >
                Atualizar
              </Button>
            </Stack>
          </Stack>

          {/* Cards */}
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 3,
              bgcolor: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              backdropFilter: "blur(10px)",
            }}
          >
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "stretch", sm: "center" }}>
              <TextField
                select
                label="Período"
                value={range}
                onChange={(e) => setRange(e.target.value as any)}
                size="small"
                sx={{
                  minWidth: 180,
                  "& .MuiInputBase-input": { color: "#fff" },
                  "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.7)" },
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.18)" },
                }}
              >
                <MenuItem value="today">Hoje</MenuItem>
                <MenuItem value="24h">Últimas 24h</MenuItem>
                <MenuItem value="all">Tudo</MenuItem>
              </TextField>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Box sx={{ p: 1.2, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", minWidth: 170 }}>
                  <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.78rem" }}>Pedidos gerados</Typography>
                  <Typography sx={{ color: "#fff", fontWeight: 950, fontSize: "1.25rem" }}>
                    {loadingTop ? "…" : overview?.ordersCreated ?? "—"}
                  </Typography>
                </Box>

                <Box sx={{ p: 1.2, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", minWidth: 170 }}>
                  <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.78rem" }}>Transações</Typography>
                  <Typography sx={{ color: "#fff", fontWeight: 950, fontSize: "1.25rem" }}>
                    {loadingTop ? "…" : overview?.transactionsTotal ?? "—"}
                  </Typography>
                </Box>

                <Box sx={{ p: 1.2, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", minWidth: 170 }}>
                  <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.78rem" }}>Pedidos pagos</Typography>
                  <Typography sx={{ color: "#fff", fontWeight: 950, fontSize: "1.25rem" }}>
                    {loadingTop ? "…" : overview?.paidOrders ?? "—"}
                  </Typography>
                </Box>
              </Stack>

              {loadingTop && (
                <Stack direction="row" alignItems="center" spacing={1} sx={{ ml: "auto" }}>
                  <CircularProgress size={18} sx={{ color: "rgba(255,255,255,0.75)" }} />
                  <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.85rem" }}>Atualizando…</Typography>
                </Stack>
              )}
            </Stack>

            {errTop && (
              <Box sx={{ mt: 1 }}>
                <Typography sx={{ color: "#EF4444", fontWeight: 800, fontSize: "0.9rem" }}>
                  {errTop}
                </Typography>
              </Box>
            )}

            <Divider sx={{ my: 2, borderColor: "rgba(255,255,255,0.08)" }} />

            {/* Filters */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems={{ xs: "stretch", sm: "center" }}>
              <TextField
                select
                label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                size="small"
                sx={{
                  minWidth: 180,
                  "& .MuiInputBase-input": { color: "#fff" },
                  "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.7)" },
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.18)" },
                }}
              >
                <MenuItem value="all">Todos</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="paid">Paid</MenuItem>
                <MenuItem value="failed">Failed</MenuItem>
              </TextField>

              <TextField
                label="Buscar (id, cpf, tel, email, gatewayId)"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                size="small"
                fullWidth
                sx={{
                  "& .MuiInputBase-input": { color: "#fff" },
                  "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.7)" },
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.18)" },
                }}
              />

              <TextField
                select
                label="Por página"
                value={String(limit)}
                onChange={(e) => setLimit(Number(e.target.value))}
                size="small"
                sx={{
                  minWidth: 140,
                  "& .MuiInputBase-input": { color: "#fff" },
                  "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.7)" },
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.18)" },
                }}
              >
                <MenuItem value="50">50</MenuItem>
                <MenuItem value="100">100</MenuItem>
                <MenuItem value="150">150</MenuItem>
                <MenuItem value="200">200</MenuItem>
                <MenuItem value="300">300</MenuItem>
              </TextField>
            </Stack>
          </Paper>

          {/* Table */}
          <Paper
            elevation={0}
            sx={{
              p: 0,
              borderRadius: 3,
              bgcolor: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              overflow: "hidden",
            }}
          >
            <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography sx={{ color: "#fff", fontWeight: 950 }}>Transações</Typography>
              {loadingList && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CircularProgress size={18} sx={{ color: "rgba(255,255,255,0.75)" }} />
                  <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.85rem" }}>Carregando…</Typography>
                </Stack>
              )}
            </Box>

            {errList ? (
              <Box sx={{ px: 2, pb: 2 }}>
                <Typography sx={{ color: "#EF4444", fontWeight: 800, fontSize: "0.9rem" }}>
                  {errList}
                </Typography>
              </Box>
            ) : (
              <Box sx={{ width: "100%", overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: "rgba(255,255,255,0.75)", fontWeight: 900 }}>Data</TableCell>
                      <TableCell sx={{ color: "rgba(255,255,255,0.75)", fontWeight: 900 }}>Cliente</TableCell>
                      <TableCell sx={{ color: "rgba(255,255,255,0.75)", fontWeight: 900 }}>CPF</TableCell>
                      <TableCell sx={{ color: "rgba(255,255,255,0.75)", fontWeight: 900 }}>Telefone</TableCell>
                      <TableCell sx={{ color: "rgba(255,255,255,0.75)", fontWeight: 900 }}>Email</TableCell>
                      <TableCell sx={{ color: "rgba(255,255,255,0.75)", fontWeight: 900 }}>Valor</TableCell>
                      <TableCell sx={{ color: "rgba(255,255,255,0.75)", fontWeight: 900 }}>Status</TableCell>
                      <TableCell sx={{ color: "rgba(255,255,255,0.75)", fontWeight: 900 }}>OrderId</TableCell>
                      <TableCell sx={{ color: "rgba(255,255,255,0.75)", fontWeight: 900 }}>GatewayId</TableCell>
                      <TableCell sx={{ color: "rgba(255,255,255,0.75)", fontWeight: 900 }} align="right">
                        Ações
                      </TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {rows.length === 0 && !loadingList ? (
                      <TableRow>
                        <TableCell colSpan={10} sx={{ color: "rgba(255,255,255,0.65)" }}>
                          Nenhuma transação encontrada.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((r) => (
                        <TableRow key={r.transactionId} hover>
                          <TableCell sx={{ color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap" }}>
                            {formatDateSP(r.createdAt)}
                          </TableCell>
                          <TableCell sx={{ color: "rgba(255,255,255,0.90)", fontWeight: 800 }}>
                            {r.name || "—"}
                          </TableCell>
                          <TableCell sx={{ color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap" }}>
                            {maskCpf(r.cpf)}
                          </TableCell>
                          <TableCell sx={{ color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap" }}>
                            {maskPhone(r.phone)}
                          </TableCell>
                          <TableCell sx={{ color: "rgba(255,255,255,0.85)" }}>
                            {r.email || "—"}
                          </TableCell>
                          <TableCell sx={{ color: "rgba(255,255,255,0.90)", fontWeight: 900, whiteSpace: "nowrap" }}>
                            {formatBRL(Number(r.value || 0))}
                          </TableCell>
                          <TableCell>{statusChip(r.status)}</TableCell>
                          <TableCell sx={{ color: "rgba(255,255,255,0.78)", fontFamily: "monospace", fontSize: "0.78rem" }}>
                            {r.orderId}
                          </TableCell>
                          <TableCell sx={{ color: "rgba(255,255,255,0.78)", fontFamily: "monospace", fontSize: "0.78rem" }}>
                            {r.gatewayId || "—"}
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <Tooltip title="Copiar OrderId">
                                <IconButton
                                  size="small"
                                  onClick={() => navigator.clipboard.writeText(r.orderId)}
                                  sx={{ color: "rgba(255,255,255,0.75)" }}
                                >
                                  <Icon icon="mdi:content-copy" width={18} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Copiar GatewayId">
                                <span>
                                  <IconButton
                                    size="small"
                                    disabled={!r.gatewayId}
                                    onClick={() => r.gatewayId && navigator.clipboard.writeText(r.gatewayId)}
                                    sx={{ color: "rgba(255,255,255,0.75)" }}
                                  >
                                    <Icon icon="mdi:barcode-scan" width={18} />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Paper>

          <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.8rem", textAlign: "center", mt: 1 }}>
            /dash é protegido por cookie assinado (middleware). Se cair no login, é porque o cookie expirou ou o secret mudou.
          </Typography>
        </Stack>
      </Container>
    </Box>
  )
}
