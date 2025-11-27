// app/components/ui/Toast.tsx
"use client"

import type React from "react"
import { createContext, useContext, useState, useCallback } from "react"

type ToastType = "default" | "smart-2500" | "special-5000" | "premium-10000"

type Toast = {
  id: string
  message: string
  type: ToastType
}

type Ctx = {
  show: (message: string, type?: ToastType, ms?: number) => void
}

const ToastCtx = createContext<Ctx | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const show = useCallback(
    (message: string, type: ToastType = "default", ms = 3200) => {
      const id = Math.random().toString(36).slice(2)

      setToasts((t) => {
        const updated = [...t, { id, message, type }]
        // no máximo 3 toasts por vez
        return updated.slice(-1)
      })

      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id))
      }, ms)
    },
    [],
  )

  const isVIPMessage = (message: string): boolean => {
    return /\b(1000|2500|5000|10000)\b/.test(message)
  }

  const getToastStyles = (type: ToastType, message: string) => {
    const messageIsVIP = isVIPMessage(message)

    if (messageIsVIP) {
      return {
        background: "#F7F7F7",
        border: "2px solid #E9C600",
        borderRadius: "12px",
        shadow: "0 4px 16px rgba(233, 198, 0, 0.15)",
        icon: "👑",
        isSemibold: true,
        isVIP: true,
      }
    }

    // padrão bem clean
    return {
      background: "#FFFFFF",
      border: "1px solid #E5E7EB",
      borderRadius: "9999px",
      shadow: "0 8px 30px rgba(15, 23, 42, 0.12)",
      icon: "✅",
      isSemibold: false,
      isVIP: false,
    }
  }

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}

      {/* Container dos toasts – afastado do CTA fixo */}
      <div className="fixed inset-x-0 bottom-[130px] z-[60] flex justify-center px-3 pointer-events-none">
        <div className="w-full max-w-md space-y-2">
          {toasts.map((t) => {
            const styles = getToastStyles(t.type, t.message)

            return (
              <div
                key={t.id}
                className="pointer-events-auto px-4 py-2.5 text-sm flex items-center gap-2 bg-white"
                style={{
                  background: styles.background,
                  border: styles.border,
                  borderRadius: styles.borderRadius,
                  boxShadow: styles.shadow,
                  color: "#111827",
                }}
              >
                <span className="flex-shrink-0 text-base">{styles.icon}</span>

                <span
                  className={styles.isSemibold ? "font-semibold" : "font-normal"}
                  dangerouslySetInnerHTML={{ __html: t.message }}
                />
              </div>
            )
          })}
        </div>
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>")
  return ctx
}
