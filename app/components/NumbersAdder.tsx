"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useCartStore } from "@/store/cartStore"
import { formatBRL } from "@/lib/formatCurrency"
import { useToast } from "./ui/Toast"
import { cn } from "@/lib/utils"

// 🎯 COMBOS PROMOCIONAIS (faz sentido no funil)
const COMBOS = [
  { id: "combo-3", quantity: 3, priceCents: 990 }, // base
  { id: "combo-10", quantity: 10, priceCents: 1990 }, // promo
  { id: "combo-30", quantity: 30, priceCents: 2990 }, // mais vendido
  { id: "combo-100", quantity: 100, priceCents: 4990 }, // âncora forte
] as const

// 👇 controla o “Mais vendido”
const FEATURED_ID = "combo-10"

// 🔥 se você quer começar já com 9,90 “selecionado”
const DEFAULT_SELECTED_ID: (typeof COMBOS)[number]["id"] = "combo-3"

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

export default function NumbersAdder() {
  const addComboToCart = useCartStore((s) => s.addComboToCart)
  const { show } = useToast()

  // ✅ apenas visual (quem manda de verdade é o store)
  const [selectedComboId, setSelectedComboId] =
    useState<string | null>(DEFAULT_SELECTED_ID)

  const [highlight, setHighlight] = useState(true)
  const [isLite, setIsLite] = useState(false)

  // áudio: ref estável, pré-aquecido
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    setIsLite(getAutoLiteMode())
  }, [])

  useEffect(() => {
    // highlight inicial (só premium; low-end não precisa)
    if (isLite) {
      setHighlight(false)
      return
    }
    const t = setTimeout(() => setHighlight(false), 3500)
    return () => clearTimeout(t)
  }, [isLite])

  useEffect(() => {
    // ✅ Pré-carrega o áudio só em premium, pra não travar no primeiro clique
    if (isLite) return

    try {
      const a = new Audio("/click.mp3")
      a.preload = "auto"
      a.volume = 0.45
      audioRef.current = a

      // alguns browsers só liberam play após interação — aqui só “prepara”
      // não chamamos play aqui.
    } catch {
      audioRef.current = null
    }

    return () => {
      audioRef.current = null
    }
  }, [isLite])

  const feedback = useCallback(() => {
    // ✅ low-end: sem áudio (ou vibração mínima)
    if (isLite) {
      try {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          ;(navigator as any).vibrate?.(8)
        }
      } catch {}
      return
    }

    // premium: vibra + click
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        ;(navigator as any).vibrate?.(12)
      }
    } catch {}

    try {
      const a = audioRef.current
      if (!a) return
      a.currentTime = 0
      a.play().catch(() => {})
    } catch {}
  }, [isLite])

  const handleAdd = useCallback(
    (combo: (typeof COMBOS)[number]) => {
      // ✅ importante: o store deve substituir o combo anterior (não somar)
      addComboToCart(combo.quantity, combo.priceCents)

      setSelectedComboId(combo.id)

      show(
        `+${combo.quantity} números adicionados <b>(${formatBRL(
          combo.priceCents / 100,
        )})</b>`,
        "default",
      )

      feedback()
    },
    [addComboToCart, feedback, show],
  )

  const gridClass = useMemo(() => {
    return cn("grid grid-cols-2 gap-3", isLite && "gap-2")
  }, [isLite])

  return (
    <div className="w-full">
      <div className={gridClass}>
        {COMBOS.map((combo) => {
          const isFeatured = combo.id === FEATURED_ID
          const isSelected = selectedComboId === combo.id

          // ✅ Em low-end, remove blur e remove escala/sombra pesada
          const baseCard = cn(
            "relative w-full rounded-2xl px-4 py-4 text-left transition-all",
            "border active:scale-[0.99]",
            isLite ? "bg-[#1C232B] border-white/10" : "border backdrop-blur-md",
          )

          const selectedClass = isSelected
            ? cn(
                "bg-gradient-to-br from-[#1a0f10] to-[#2a1416] border-[#DC2626]",
                !isLite && "shadow-[0_10px_30px_rgba(220,38,38,0.45)]",
              )
            : cn(
                "bg-[#1C232B] border-white/10 hover:border-white/15",
                !isLite && "shadow-[0_6px_18px_rgba(0,0,0,0.35)]",
              )

          const premiumSelectMotion = !isLite && isSelected ? "scale-[1.03]" : "scale-100"

          return (
            <button
              key={combo.id}
              type="button"
              onClick={() => handleAdd(combo)}
              className={cn(
                baseCard,
                selectedClass,
                // ✅ escala só no premium
                premiumSelectMotion,
                // ✅ pulse só no premium
                !isLite && highlight && isFeatured && "motion-safe:animate-soft-pulse",
              )}
            >
              {/* Badge Mais vendido */}
              {isFeatured && (
                <span
                  className={cn(
                    "absolute -top-2 left-3 rounded-full bg-[#DC2626] px-2.5 py-0.5 text-[11px] font-extrabold text-white",
                    isLite ? "shadow-none" : "shadow-lg",
                  )}
                >
                  Mais vendido
                </span>
              )}

              <p className="text-sm font-extrabold text-white">
                {combo.quantity} Números
              </p>

              <p className="mt-1 text-sm text-white/80">
                Por{" "}
                <strong className="text-white">
                  {formatBRL(combo.priceCents / 100)}
                </strong>
              </p>

              <div
                className={cn(
                  "mt-3 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-extrabold",
                  isSelected ? "bg-[#DC2626] text-white" : "bg-white/10 text-white/70",
                )}
              >
                {isSelected ? "Selecionado" : "Toque pra escolher"}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
