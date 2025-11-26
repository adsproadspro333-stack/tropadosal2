"use client"

import * as React from "react"
import { Box, Card, CardActionArea, CardContent, Grid, Typography, Snackbar, Alert, Chip } from "@mui/material"
import { useCartStore } from "@/store/cartStore"
import { formatBRL } from "@/lib/checkout"
import { promoCombos } from "@/lib/data"

type Combo = { title: string; quantity: number; totalCentavos: number; price: number; highlight: boolean }
type Toast = { id: number; message: string }

export default function PromoCombos() {
  const { add, qty } = useCartStore()
  const [toastQueue, setToastQueue] = React.useState<Toast[]>([])

  const onSelect = (c: Combo) => {
    add(c.quantity)
    const newMessage = `+${c.quantity} títulos adicionados (${formatBRL(c.totalCentavos)}). Total agora: ${qty + c.quantity} títulos.`
    setToastQueue(prev => {
      const updated = [...prev, { id: Date.now(), message: newMessage }]
      return updated.slice(-3)
    })
  }

  const removeToast = (id: number) => {
    setToastQueue(prev => prev.filter(t => t.id !== id))
  }

  return (
    <>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" gutterBottom fontWeight={600} textAlign="center" sx={{ mb: 3 }}>
          Combos Promocionais
        </Typography>
        <Grid container spacing={2}>
          {promoCombos.map((combo, index) => (
            <Grid item xs={12} sm={4} key={index}>
              <Card
                elevation={combo.highlight ? 6 : 2}
                sx={{
                  position: "relative",
                  border: combo.highlight ? "3px solid" : "none",
                  borderColor: combo.highlight ? "success.main" : "transparent",
                  transition: "transform 0.2s",
                  "&:hover": {
                    transform: "translateY(-4px)",
                  },
                }}
              >
                {combo.highlight && (
                  <Chip
                    label="MAIS POPULAR"
                    color="success"
                    size="small"
                    sx={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      fontWeight: 700,
                    }}
                  />
                )}
                <CardActionArea onClick={() => onSelect(combo)}>
                  <CardContent sx={{ textAlign: "center", pt: combo.highlight ? 4 : 2 }}>
                    <Typography variant="h3" fontWeight={700} color="primary.main">
                      {combo.quantity}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      números
                    </Typography>
                    <Typography variant="h5" fontWeight={700} color="success.main" sx={{ my: 2 }}>
                      R$ {combo.price.toFixed(2)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      R$ {(combo.price / combo.quantity).toFixed(3)} por número
                    </Typography>
                    <Typography variant="caption" display="block" color="primary" fontWeight={700} sx={{ mt: 1 }}>
                      Toque para adicionar ao carrinho
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
      {toastQueue.map((toast) => (
        <Snackbar
          key={toast.id}
          open
          autoHideDuration={2200}
          onClose={() => removeToast(toast.id)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" variant="filled" onClose={() => removeToast(toast.id)}>
            {toast.message}
          </Alert>
        </Snackbar>
      ))}
    </>
  )
}
