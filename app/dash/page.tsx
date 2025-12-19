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
  TableContainer,
  Pagination,
} from "@mui/material"
import { Icon } from "@iconify/react"

export const dynamic = "force-dynamic"

type Overview = {
  ok: boolean
  range: "today" | "24h" | "all"
  ordersCreated: number
  transactionsTotal: number
  paidOrders: number

  // opcional (se vier do backend algum dia)
  paidValue?: number
  pendingValue?: number
  totalValue?: number
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

type OrdersResponse = {
  ok: boolean
  rows: Row[]
  total: number
  page: number
  pages: number
  limit: number
  error?: string
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
  if (s.startsWith("55") && s.length >= 12) {
    const ddd = s.slice(2, 4)
    const num = s.slice(4)
    if (num.length === 9) return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`
    if (num.length === 8) return `+55 (${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`
    return `+55 (${ddd}) ${num}`
  }
  const ddd = s.slice(0, 2)
  const num = s.slice(2)
  if (num.length === 9) return `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`
  if (num.length === 8) return `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`
  return p || ""
}

function statusChip(status: string) {
  const s = String(status || "").toLowerCase()
  if (s === "paid")
    return (
      <Chip
        size="small"
        label="PAID"
        sx={{
          fontWeight: 900,
          bgcolor: "rgba(34,197,94,0.18)",
          color: "#22C55E",
          border: "1px solid rgba(34,197,94,0.28)",
        }}
      />
    )
  if (s === "pending" || s === "waiting_payment")
    return (
      <Chip
        size="small"
        label="PENDING"
        sx={{
          fontWeight: 900,
          bgcolor: "rgba(245,158,11,0.18)",
          color: "#F59E0B",
          border: "1px solid rgba(245,158,11,0.28)",
        }}
      />
    )
  if (s === "failed" || s === "canceled" || s === "cancelled")
    return (
      <Chip
        size="small"
        label="FAILED"
        sx={{
          fontWeight: 900,
          bgcolor: "rgba(239,68,68,0.18)",
          color: "#EF4444",
          border: "1px solid rgba(239,68,68,0.28)",
        }}
      />
    )
  return (
    <Chip
      size="small"
      label={status || "—"}
      sx={{
        fontWeight: 900,
        bgcolor: "rgba(148,163,184,0.16)",
        color: "rgba(255,255,255,0.78)",
        border: "1px solid rgba(148,163,184,0.18)",
      }}
    />
  )
}

// ===============================
// ✅ DASH ONLY: ocultar transações localmente (sem DB)
// ===============================
const LS_HIDDEN_TX_KEY = "dash_hidden_tx_ids_v1"

function readHiddenTxIds(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(LS_HIDDEN_TX_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.map(String) : []
  } catch {
    return []
  }
}

function writeHiddenTxIds(ids: string[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(LS_HIDDEN_TX_KEY, JSON.stringify(Array.from(new Set(ids.map(String)))))
  } catch {}
}

export default function DashPage() {
  const [range, setRange] = useState<"today" | "24h" | "all">("today")
  const [status, setStatus] = useState<"all" | "pending" | "paid" | "failed">("all")
  const [q, setQ] = useState("")

  const [overview, setOverview] = useState<Overview | null>(null)

  const [rows, setRows] = useState<Row[]>([])
  const [limit, setLimit] = useState(50)

  // ✅ paginação real
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)

  const [loadingTop, setLoadingTop] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [errTop, setErrTop] = useState<string | null>(null)
  const [errList, setErrList] = useState<string | null>(null)

  // ✅ hidden state (dash-only)
  const [hiddenTxIds, setHiddenTxIds] = useState<string[]>([])
  const [showHidden, setShowHidden] = useState(false)

  useEffect(() => {
    setHiddenTxIds(readHiddenTxIds())
  }, [])

  const hiddenSet = useMemo(() => new Set(hiddenTxIds), [hiddenTxIds])

  const hideTx = (id: string) => {
    const key = String(id || "").trim()
    if (!key) return
    setHiddenTxIds((prev) => {
      const next = Array.from(new Set([...prev, key]))
      writeHiddenTxIds(next)
      return next
    })
  }

  const unhideAll = () => {
    setHiddenTxIds([])
    writeHiddenTxIds([])
  }

  // lista visível (por página/filtro atual) — aplica “hide”
  const visibleRows = useMemo(() => {
    const base = rows || []
    if (showHidden) return base
    return base.filter((r) => !hiddenSet.has(String(r.transactionId)))
  }, [rows, showHidden, hiddenSet])

  // Somatórios da lista (por página / filtro atual) — agora usa visibleRows
  const listTotals = useMemo(() => {
    let paid = 0
    let pending = 0
    let totalSum = 0

    for (const r of visibleRows) {
      const v = Number(r.value || 0)
      totalSum += v
      const st = String(r.status || "").toLowerCase()
      if (st === "paid") paid += v
      else if (st === "pending" || st === "waiting_payment") pending += v
    }

    return { paid, pending, total: totalSum }
  }, [visibleRows])

  // ✅ sempre que mudar filtro/limite, volta pra página 1
  useEffect(() => {
    setPage(1)
  }, [range, status, limit, q])

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("range", range)
    params.set("status", status)
    params.set("limit", String(limit))
    params.set("page", String(page))
    if (q.trim()) params.set("q", q.trim())
    return params.toString()
  }, [range, status, limit, q, page])

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
      const data = (await res.json().catch(() => null)) as OrdersResponse | null
      if (!res.ok || !data?.ok) throw new Error((data as any)?.error || "Falha ao carregar transações")

      setRows(Array.isArray(data?.rows) ? data!.rows : [])
      setTotal(Number(data?.total || 0))
      setPages(Math.max(1, Number(data?.pages || 1)))

      const apiPage = Math.max(1, Number(data?.page || 1))
      if (apiPage !== page) setPage(apiPage)
    } catch (e: any) {
      setErrList(e?.message || "Falha ao carregar transações")
      setRows([])
      setTotal(0)
      setPages(1)
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

          {/* Cards + filtros */}
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

                {/* Valores (na lista - por página/filtro atual) */}
                <Box
                  sx={{
                    p: 1.2,
                    borderRadius: 2,
                    border: "1px solid rgba(34,197,94,0.22)",
                    bgcolor: "rgba(34,197,94,0.08)",
                    minWidth: 220,
                  }}
                >
                  <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.78rem" }}>Valor pago (na lista)</Typography>
                  <Typography sx={{ color: "#22C55E", fontWeight: 950, fontSize: "1.15rem" }}>
                    {formatBRL(listTotals.paid)}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    p: 1.2,
                    borderRadius: 2,
                    border: "1px solid rgba(245,158,11,0.22)",
                    bgcolor: "rgba(245,158,11,0.08)",
                    minWidth: 220,
                  }}
                >
                  <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.78rem" }}>
                    Valor pendente (na lista)
                  </Typography>
                  <Typography sx={{ color: "#F59E0B", fontWeight: 950, fontSize: "1.15rem" }}>
                    {formatBRL(listTotals.pending)}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    p: 1.2,
                    borderRadius: 2,
                    border: "1px solid rgba(255,255,255,0.14)",
                    bgcolor: "rgba(255,255,255,0.06)",
                    minWidth: 220,
                  }}
                >
                  <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.78rem" }}>Valor total (na lista)</Typography>
                  <Typography sx={{ color: "#fff", fontWeight: 950, fontSize: "1.15rem" }}>
                    {formatBRL(listTotals.total)}
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
                <Typography sx={{ color: "#EF4444", fontWeight: 800, fontSize: "0.9rem" }}>{errTop}</Typography>
              </Box>
            )}

            <Divider sx={{ my: 2, borderColor: "rgba(255,255,255,0.08)" }} />

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

          {/* Lista/Tabela */}
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
            <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
              <Typography sx={{ color: "#fff", fontWeight: 950 }}>Transações</Typography>

              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  onClick={() => setShowHidden((v) => !v)}
                  variant="outlined"
                  size="small"
                  sx={{
                    borderColor: "rgba(255,255,255,0.18)",
                    color: "rgba(255,255,255,0.85)",
                    textTransform: "none",
                    fontWeight: 900,
                    borderRadius: 999,
                  }}
                >
                  {showHidden ? "Ocultar removidas" : `Mostrar removidas (${hiddenTxIds.length})`}
                </Button>

                <Button
                  onClick={unhideAll}
                  disabled={hiddenTxIds.length === 0}
                  variant="outlined"
                  size="small"
                  sx={{
                    borderColor: "rgba(255,255,255,0.18)",
                    color: "rgba(255,255,255,0.85)",
                    textTransform: "none",
                    fontWeight: 900,
                    borderRadius: 999,
                  }}
                >
                  Restaurar tudo
                </Button>

                {loadingList && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={18} sx={{ color: "rgba(255,255,255,0.75)" }} />
                    <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: "0.85rem" }}>Carregando…</Typography>
                  </Stack>
                )}
              </Stack>
            </Box>

            {errList ? (
              <Box sx={{ px: 2, pb: 2 }}>
                <Typography sx={{ color: "#EF4444", fontWeight: 800, fontSize: "0.9rem" }}>{errList}</Typography>
              </Box>
            ) : (
              <>
                <TableContainer
                  sx={{
                    maxHeight: { xs: "62vh", sm: "58vh" },
                    overflowY: "auto",
                    overflowX: "auto",
                    WebkitOverflowScrolling: "touch",
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        {["Data", "Cliente", "CPF", "Telefone", "Email", "Valor", "Status", "OrderId", "GatewayId", "Ações"].map(
                          (h, idx) => (
                            <TableCell
                              key={h}
                              align={h === "Ações" ? "right" : "left"}
                              sx={{
                                color: "rgba(255,255,255,0.75)",
                                fontWeight: 900,
                                bgcolor: "rgba(11,15,25,0.92)",
                                backdropFilter: "blur(8px)",
                                borderBottom: "1px solid rgba(255,255,255,0.10)",
                                whiteSpace: "nowrap",
                                ...(idx === 0 ? { position: "sticky", left: 0, zIndex: 3 } : {}),
                              }}
                            >
                              {h}
                            </TableCell>
                          ),
                        )}
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {visibleRows.length === 0 && !loadingList ? (
                        <TableRow>
                          <TableCell colSpan={10} sx={{ color: "rgba(255,255,255,0.65)" }}>
                            Nenhuma transação encontrada.
                          </TableCell>
                        </TableRow>
                      ) : (
                        visibleRows.map((r) => (
                          <TableRow
                            key={r.transactionId}
                            hover
                            sx={
                              showHidden && hiddenSet.has(String(r.transactionId))
                                ? { opacity: 0.55 }
                                : undefined
                            }
                          >
                            <TableCell
                              sx={{
                                color: "rgba(255,255,255,0.85)",
                                whiteSpace: "nowrap",
                                position: "sticky",
                                left: 0,
                                zIndex: 2,
                                bgcolor: "rgba(11,15,25,0.86)",
                                borderRight: "1px solid rgba(255,255,255,0.06)",
                              }}
                            >
                              {formatDateSP(r.createdAt)}
                            </TableCell>

                            <TableCell sx={{ color: "rgba(255,255,255,0.90)", fontWeight: 800, minWidth: 180 }}>
                              {r.name || "—"}
                            </TableCell>

                            <TableCell sx={{ color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap", minWidth: 140 }}>
                              {maskCpf(r.cpf)}
                            </TableCell>

                            <TableCell sx={{ color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap", minWidth: 160 }}>
                              {maskPhone(r.phone)}
                            </TableCell>

                            <TableCell sx={{ color: "rgba(255,255,255,0.85)", minWidth: 220 }}>
                              {r.email || "—"}
                            </TableCell>

                            <TableCell
                              sx={{ color: "rgba(255,255,255,0.90)", fontWeight: 900, whiteSpace: "nowrap", minWidth: 110 }}
                            >
                              {formatBRL(Number(r.value || 0))}
                            </TableCell>

                            <TableCell sx={{ minWidth: 110 }}>{statusChip(r.status)}</TableCell>

                            <TableCell
                              sx={{
                                color: "rgba(255,255,255,0.78)",
                                fontFamily: "monospace",
                                fontSize: "0.78rem",
                                minWidth: 260,
                              }}
                            >
                              {r.orderId}
                            </TableCell>

                            <TableCell
                              sx={{
                                color: "rgba(255,255,255,0.78)",
                                fontFamily: "monospace",
                                fontSize: "0.78rem",
                                minWidth: 260,
                              }}
                            >
                              {r.gatewayId || "—"}
                            </TableCell>

                            <TableCell align="right" sx={{ minWidth: 140 }}>
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

                                <Tooltip title="Ocultar do meu dashboard (não apaga do sistema)">
                                  <span>
                                    <IconButton
                                      size="small"
                                      onClick={() => hideTx(r.transactionId)}
                                      sx={{
                                        color: "rgba(255,255,255,0.75)",
                                        border: "1px solid rgba(255,255,255,0.10)",
                                        borderRadius: 999,
                                        px: 0.25,
                                      }}
                                    >
                                      <Icon icon="mdi:close" width={18} />
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
                </TableContainer>

                {/* paginação */}
                {pages > 1 && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                      p: 1.5,
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      bgcolor: "rgba(11,15,25,0.35)",
                    }}
                  >
                    <Pagination
                      count={pages}
                      page={page}
                      onChange={(_, p) => setPage(p)}
                      size="small"
                      hidePrevButton
                      hideNextButton
                      siblingCount={1}
                      boundaryCount={1}
                      variant="outlined"
                      shape="rounded"
                      sx={{
                        "& .MuiPaginationItem-root": {
                          color: "rgba(255,255,255,0.85)",
                          borderColor: "rgba(255,255,255,0.14)",
                          fontWeight: 900,
                        },
                        "& .MuiPaginationItem-root.Mui-selected": {
                          borderColor: "rgba(34,197,94,0.45)",
                          bgcolor: "rgba(34,197,94,0.14)",
                        },
                      }}
                    />

                    <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                      {total > 0 ? `Total: ${total}` : ""}
                    </Typography>
                  </Box>
                )}
              </>
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
