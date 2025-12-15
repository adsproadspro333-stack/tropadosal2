"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { useCartStore } from "@/store/cartStore"
import { formatBRL } from "@/lib/formatCurrency"
import { useToast } from "./ui/Toast"
import { cn } from "@/lib/utils"

// 🎯 COMBOS PROMOCIONAIS (faz sentido no funil)
const COMBOS = [
  { id: "combo-3", quantity: 3, priceCents: 990 },      // base
  { id: "combo-10", quantity: 10, priceCents: 1990 },   // promo
  { id: "combo-30", quantity: 30, priceCents: 2990 },   // mais vendido
  { id: "combo-100", quantity: 100, priceCents: 4990 }, // âncora forte
]

// 👇 controla o “Mais vendido”
const FEATURED_ID = "combo-10"

// 🔥 se você quer começar já com 9,90 “selecionado”
const DEFAULT_SELECTED_ID: (typeof COMBOS)[number]["id"] = "combo-3"

let clickAudio: HTMLAudioElement | null = null
function playClick() {
  try {
    if (!clickAudio) clickAudio = new Audio("/click.mp3")
    clickAudio.currentTime = 0
    clickAudio.play().catch(() => {})
  } catch {}
}

function vibrate(ms = 12) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    ;(navigator as any).vibrate?.(ms)
  }
}

export default function NumbersAdder() {
  const { addComboToCart } = useCartStore()
  const { show } = useToast()

  // ✅ apenas visual (quem manda de verdade é o store)
  const [selectedComboId, setSelectedComboId] =
    useState<string | null>(DEFAULT_SELECTED_ID)

  const [highlight, setHighlight] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setHighlight(false), 3500)
    return () => clearTimeout(t)
  }, [])

  const handleAdd = (combo: (typeof COMBOS)[number]) => {
    // ✅ importante: o store deve substituir o combo anterior (não somar)
    addComboToCart(combo.quantity, combo.priceCents)

    setSelectedComboId(combo.id)

    show(
      `+${combo.quantity} números adicionados <b>(${formatBRL(
        combo.priceCents / 100,
      )})</b>`,
      "default",
    )

    playClick()
    vibrate(12)
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-3">
        {COMBOS.map((combo) => {
          const isFeatured = combo.id === FEATURED_ID
          const isSelected = selectedComboId === combo.id

          const dynamicStyle: CSSProperties = {
            boxShadow: isSelected
              ? "0 0 0 1px rgba(220,38,38,0.92), 0 10px 30px rgba(220,38,38,0.45)"
              : "0 6px 18px rgba(0,0,0,0.35)",
            transform: isSelected ? "scale(1.03)" : "scale(1)",
            transition: "transform 180ms ease, box-shadow 180ms ease",
          }

          return (
            <button
              key={combo.id}
              type="button"
              onClick={() => handleAdd(combo)}
              style={dynamicStyle}
              className={cn(
                "relative w-full rounded-2xl px-4 py-4 text-left transition-all",
                "border backdrop-blur-md active:scale-[0.99]",
                isSelected
                  ? "bg-gradient-to-br from-[#1a0f10] to-[#2a1416] border-[#DC2626]"
                  : "bg-[#1C232B] border-white/10 hover:border-white/15",
                highlight && isFeatured && "motion-safe:animate-soft-pulse",
              )}
            >
              {/* Badge Mais vendido */}
              {isFeatured && (
                <span className="absolute -top-2 left-3 rounded-full bg-[#DC2626] px-2.5 py-0.5 text-[11px] font-extrabold text-white shadow-lg">
                  Mais vendido
                </span>
              )}

              <p className="text-sm font-extrabold text-white">
                {combo.quantity} Números
              </p>

              <p className="mt-1 text-sm text-white/80">
                Por{" "}
                <strong className={cn("text-white", isSelected && "text-white")}>
                  {formatBRL(combo.priceCents / 100)}
                </strong>
              </p>

              <div
                className={cn(
                  "mt-3 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-extrabold",
                  isSelected
                    ? "bg-[#DC2626] text-white"
                    : "bg-white/10 text-white/70",
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
