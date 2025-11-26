"use client"

import { useState } from "react"

type TransactionDTO = {
  id: string
  status: string
  value: number
  gatewayId: string
}

type OrderDTO = {
  id: string
  displayOrderCode: string   // 👈 bate com o campo que vem da API
  amount: number
  status: string
  createdAt: string | null
  quantity: number
  numbers: number[]
  transactions: TransactionDTO[]
}

export default function MinhasComprasPage() {
  const [cpf, setCpf] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orders, setOrders] = useState<OrderDTO[]>([])
  const [searched, setSearched] = useState(false)

  const handleSearch = async () => {
    const cleanCpf = cpf.replace(/\D/g, "")
    if (!cleanCpf) {
      setError("Digite um CPF válido")
      return
    }

    setLoading(true)
    setError(null)
    setOrders([])
    setSearched(false)

    try {
      const res = await fetch("/api/minhas-compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: cleanCpf }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Falha ao buscar pedidos")
      }

      setOrders(data.orders || [])
      setSearched(true)
    } catch (err: any) {
      console.error("Erro ao buscar pedidos:", err)
      setError(err.message || "Erro inesperado ao buscar pedidos")
      setSearched(true)
    } finally {
      setLoading(false)
    }
  }

  const formatDateTime = (value: string | null) => {
    if (!value) return "-"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return "-"
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const formatBRL = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    })

  // 👇 Helper só pra traduzir o status visualmente
  const getStatusLabel = (status: string) => {
    switch (status) {
      case "paid":
        return "PAGO"
      case "pending":
        return "PENDENTE"
      case "canceled":
        return "CANCELADO"
      default:
        return status?.toUpperCase?.() || status
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f5f5f5",
        padding: "32px 16px",
      }}
    >
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          backgroundColor: "#fff",
          borderRadius: 12,
          padding: "24px 24px 40px",
          boxShadow: "0 8px 20px rgba(0,0,0,0.05)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1
            style={{
              fontSize: 28,
              margin: 0,
              fontWeight: 700,
              color: "#111827",
            }}
          >
            Minhas Compras
          </h1>
          <p style={{ marginTop: 8, color: "#6B7280", fontSize: 14 }}>
            Consulte seus pedidos usando seu CPF.
          </p>
        </div>

        {/* Form CPF */}
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <input
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            placeholder="Digite seu CPF"
            style={{
              flex: 1,
              maxWidth: 420,
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid #D1D5DB",
              fontSize: 14,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            style={{
              padding: "10px 20px",
              borderRadius: 6,
              border: "none",
              backgroundColor: loading ? "#059669aa" : "#059669",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>

        {/* Mensagens de erro */}
        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: "10px 12px",
              borderRadius: 6,
              backgroundColor: "#FEE2E2",
              color: "#991B1B",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Lista de pedidos */}
        {!loading && searched && orders.length === 0 && !error && (
          <p
            style={{
              textAlign: "center",
              color: "#6B7280",
              fontSize: 14,
              marginTop: 12,
            }}
          >
            Nenhum pedido encontrado para esse CPF.
          </p>
        )}

        {!loading &&
          orders.map((order) => {
            const qtdNumeros =
              order.quantity && order.quantity > 0
                ? order.quantity
                : order.numbers?.length || 0

            const isPaid = order.status === "paid"

            return (
              <div
                key={order.id}
                style={{
                  marginTop: 12,
                  borderRadius: 10,
                  border: "1px solid #E5E7EB",
                  backgroundColor: "#FFFFFF",
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                {/* Esquerda */}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#6B7280",
                      marginBottom: 4,
                    }}
                  >
                    ID do pedido:{" "}
                    <span style={{ fontWeight: 600, color: "#111827" }}>
                      {order.displayOrderCode}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 12,
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600 }}>Status: </span>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: 0.3,
                          backgroundColor: isPaid
                            ? "#DCFCE7"
                            : "#FEF3C7",
                          color: isPaid ? "#166534" : "#92400E",
                        }}
                      >
                        {getStatusLabel(order.status)}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontWeight: 600 }}>Data: </span>
                      {formatDateTime(order.createdAt)}
                    </div>
                    <div>
                      <span style={{ fontWeight: 600 }}>
                        Qtde de números:{" "}
                      </span>
                      {qtdNumeros}
                    </div>
                  </div>
                </div>

                {/* Direita - valor */}
                <div style={{ textAlign: "right", minWidth: 120 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#6B7280",
                      marginBottom: 4,
                    }}
                  >
                    Valor pago
                  </div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 16,
                      color: "#111827",
                    }}
                  >
                    {formatBRL(order.amount)}
                  </div>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
