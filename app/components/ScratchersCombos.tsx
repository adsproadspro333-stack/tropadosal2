"use client"

import * as React from "react"
import { Card, CardActionArea, CardContent, Grid, Typography, Box, Snackbar, Alert } from "@mui/material"
import { useSelection } from "@/hooks/useSelection"
import { formatBRL } from "@/lib/checkout"

type Tier = { name: "Bronze" | "Prata" | "Ouro"; quantity: number; totalCentavos: number; bonusLabel: string }
type Toast = { id: number; message: string }

const TIERS: Tier[] = [
  { name: "Bronze", quantity: 50, totalCentavos: 500, bonusLabel: "Recebe 2 Raspadinhas" },
  { name: "Prata", quantity: 150, totalCentavos: 1500, bonusLabel: "Recebe 30 Raspadinhas" },
  { name: "Ouro", quantity: 500, totalCentavos: 5000, bonusLabel: "Recebe 50 Raspadinhas" },
]

export default function ScratchersCombos() {
  const { add, selection } = useSelection()
  const [toastQueue, setToastQueue] = React.useState<Toast[]>([])

  const onSelect = (t: Tier) => {
    add(t.quantity, t.totalCentavos)
    const newMessage = `${t.name}: +${t.quantity} títulos (${formatBRL(t.totalCentavos)}). Total: ${selection.quantity + t.quantity}.`
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
      <Grid container spacing={2} sx={{ mt: 3 }}>
        {TIERS.map((t, i) => (
          <Grid key={i} item xs={12} sm={4}>
            <Card sx={{ borderRadius: 2 }}>
              <CardActionArea onClick={() => onSelect(t)}>
                <CardContent sx={{ textAlign: "center", py: 3 }}>
                  <Typography variant="h6" fontWeight={900}>
                    {t.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    A partir de {t.quantity} títulos
                  </Typography>
                  <Box mt={1} mb={1}>
                    <Typography variant="h6" color="success.main" fontWeight={800}>
                      {formatBRL(t.totalCentavos)}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="warning.main" fontWeight={700}>
                    {t.bonusLabel} 🍀
                  </Typography>
                  <Box mt={1}>
                    <Typography variant="caption" color="primary" fontWeight={700}>
                      Selecionar combo
                    </Typography>
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
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
