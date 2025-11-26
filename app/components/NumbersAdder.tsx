"use client"
import { useEffect, useState } from "react"
import { useCartStore } from "@/store/cartStore"
import { formatBRL } from "@/lib/formatCurrency"
import { useToast } from "./ui/Toast"
import { cn } from "@/lib/utils"

// 🎨 CORES PRINCIPAIS
const PRIMARY_RED = "#8B0000"   // vermelho escuro dos combos
const LIGHT_RED = "#FDE8E8"     // vermelho claro de hover
const BADGE_GREEN = "#16A34A"   // verde do selo "Mais vendido"

// 🎯 COMBOS
// 100 → 9,90
// 200 → 19,90
// 500 → 49,90
// 1000 → 99,90
const COMBOS = [
  { id: "combo-100", quantity: 100, priceCents: 990 },
  { id: "combo-200", quantity: 200, priceCents: 1990 },
  { id: "combo-500", quantity: 500, priceCents: 4990 },
  { id: "combo-1000", quantity: 1000, priceCents: 9990 },
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

  // combo selecionado no momento (começa no +100)
  const [selectedComboId, setSelectedComboId] =
    useState<string | null>("combo-100")
  const [highlight, setHighlight] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setHighlight(false), 4000)
    return () => clearTimeout(t)
  }, [])

  const handleAdd = (combo: (typeof COMBOS)[0]) => {
    addComboToCart(combo.quantity, combo.priceCents)
    setSelectedComboId(combo.id)

    let message = ""
    let toastType:
      | "default"
      | "smart-2500"
      | "special-5000"
      | "premium-10000" = "default"

    if (combo.quantity === 100) {
      message = `+${combo.quantity} números adicionados <b>(${formatBRL(
        combo.priceCents / 100,
      )})</b>`
      toastType = "default"
    } else if (combo.quantity === 200) {
      message = `🔥 Oferta inteligente! +${combo.quantity} números adicionados <b>(${formatBRL(
        combo.priceCents / 100,
      )})</b>`
      toastType = "smart-2500"
    } else if (combo.quantity === 500) {
      message = `🚀 Aceleração total! +${combo.quantity} números adicionados <b>(${formatBRL(
        combo.priceCents / 100,
      )})</b>`
      toastType = "special-5000"
    } else if (combo.quantity === 1000) {
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
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {COMBOS.map((combo) => {
          const isFeatured = combo.quantity === 100 // “Mais vendido” no +100
          const isSelected = selectedComboId === combo.id

          return (
            <button
              key={combo.id}
              type="button"
              aria-label={`Adicionar +${combo.quantity} números por ${formatBRL(
                combo.priceCents / 100,
              )}`}
              onClick={() => handleAdd(combo)}
              style={{
                ["--primary-red" as any]: PRIMARY_RED,
                ["--light-red" as any]: LIGHT_RED,
              }}
              className={cn(
                "relative w-full select-none cursor-pointer",
                "rounded-xl border-2 shadow-sm transition-all duration-200 ease-out",
                "hover:shadow-md hover:scale-[1.02] active:scale-95",
                "focus:outline-none focus:ring-2",
                isSelected
                  ? "bg-[var(--primary-red)] border-[var(--primary-red)] text-white hover:brightness-90"
                  : "bg-white border-[var(--primary-red)] text-[var(--primary-red)] hover:bg-[var(--light-red)]",
                highlight && isFeatured && "motion-safe:animate-soft-pulse",
              )}
            >
              {/* Badge MAIS VENDIDO sempre no primeiro combo */}
              {isFeatured && (
                <span
                  className="absolute -top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm flex items-center gap-1"
                  style={{ backgroundColor: BADGE_GREEN }}
                >
                  <span className="text-[11px]">🔥</span>
                  Mais vendido
                </span>
              )}

              <div className="text-center pt-2 pb-1">
                <div className="text-sm font-semibold mb-1">
                  +{combo.quantity} Números
                </div>
                <div className="text-base sm:text-lg font-extrabold leading-none">
                  {formatBRL(combo.priceCents / 100)}
                </div>

                <div
                  className={cn(
                    "mt-2 text-[11px] sm:text-xs underline underline-offset-2",
                    isSelected
                      ? "text-white decoration-white/70"
                      : "text-[var(--primary-red)] decoration-[var(--primary-red)]/50",
                  )}
                >
                  Adicionar ao carrinho
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
