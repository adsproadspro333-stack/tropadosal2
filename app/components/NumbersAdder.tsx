"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { useCartStore } from "@/store/cartStore"
import { formatBRL } from "@/lib/formatCurrency"
import { useToast } from "./ui/Toast"
import { cn } from "@/lib/utils"

// 🎯 COMBOS
// 3  →  9,90
// 5  → 19,90  (mais vendido)
// 10 → 49,90
// 15 → 99,90
const COMBOS = [
  { id: "combo-3", quantity: 3, priceCents: 990 },
  { id: "combo-5", quantity: 5, priceCents: 1990 },
  { id: "combo-10", quantity: 10, priceCents: 4990 },
  { id: "combo-15", quantity: 15, priceCents: 9990 },
]

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

  // combo destaque apenas visual
  const [selectedComboId, setSelectedComboId] =
    useState<string | null>("combo-5")
  const [highlight, setHighlight] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setHighlight(false), 4000)
    return () => clearTimeout(t)
  }, [])

  const handleAdd = (combo: (typeof COMBOS)[number]) => {
    addComboToCart(combo.quantity, combo.priceCents)
    setSelectedComboId(combo.id)

    let message = ""
    let toastType:
      | "default"
      | "smart-2500"
      | "special-5000"
      | "premium-10000" = "default"

    if (combo.quantity === 3) {
      message = `+${combo.quantity} números adicionados <b>(${formatBRL(
        combo.priceCents / 100,
      )})</b>`
      toastType = "default"
    } else if (combo.quantity === 5) {
      message = `🔥 Oferta inteligente! +${combo.quantity} números adicionados <b>(${formatBRL(
        combo.priceCents / 100,
      )})</b>`
      toastType = "smart-2500"
    } else if (combo.quantity === 10) {
      message = `🚀 Aceleração total! +${combo.quantity} números adicionados <b>(${formatBRL(
        combo.priceCents / 100,
      )})</b>`
      toastType = "special-5000"
    } else if (combo.quantity === 15) {
      message = `👑 Combo VIP ativado! +${combo.quantity} números adicionados <b>(${formatBRL(
        combo.priceCents / 100,
      )})</b>`
      toastType = "premium-10000"
    }

    show(message, toastType)
    playClick()
    vibrate(12)
  }

  return (
    <div className="w-full">
      <div className="w-full grid grid-cols-2 gap-x-5 gap-y-2.5">
        {COMBOS.map((combo) => {
          const isFeatured = combo.id === "combo-5"
          const isSelected = selectedComboId === combo.id

          const dynamicStyle: CSSProperties = {
            boxShadow: isSelected
              ? "0 10px 22px rgba(220,38,38,0.28)"
              : "0 2px 6px rgba(15,23,42,0.12)",
            transform: isSelected
              ? "translateY(-1px) scale(1.02)"
              : "translateY(0) scale(1)",
            transition: "transform 0.18s ease, box-shadow 0.18s ease",
          }

          return (
            <button
              key={combo.id}
              type="button"
              aria-label={`Adicionar +${combo.quantity} números por ${formatBRL(
                combo.priceCents / 100,
              )}`}
              onClick={() => handleAdd(combo)}
              style={dynamicStyle}
              className={cn(
                "relative w-full select-none cursor-pointer",
                "flex flex-col border-[2px] px-3 py-3 rounded-[12px]",
                "transition-colors duration-150 active:scale-[0.97]",
                isSelected
                  ? "border-[#DC2626] bg-[#FEF2F2]"
                  : "border-[#E5E7EB] bg-white hover:bg-slate-50",
                highlight && isFeatured && "motion-safe:animate-soft-pulse",
              )}
            >
              {/* Badge Mais vendido */}
              {isFeatured && (
                <span className="absolute -top-2 left-2 flex items-center text-[11px] h-5 rounded-full px-2 bg-[#DC2626] text-white font-semibold shadow">
                  Mais vendido
                </span>
              )}

              <p className="font-semibold text-base text-gray-900">
                {combo.quantity} Números
              </p>

              <p className="mt-0.5 text-[13px] text-gray-700">
                Por: <strong>{formatBRL(combo.priceCents / 100)}</strong>
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
