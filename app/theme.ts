"use client"

import { createTheme } from "@mui/material/styles"

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1976d2", // Azul
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#dc004e",
    },
    success: {
      main: "#4caf50", // Verde
      contrastText: "#ffffff",
    },
    warning: {
      main: "#ff9800", // Amarelo
      contrastText: "#000000",
    },
    background: {
      default: "#f5f5f5",
      paper: "#ffffff",
    },
  },
  typography: {
    fontFamily: "inherit",
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
        },
      },
    },
  },
})
