"use client"

import { useEffect, useState, type CSSProperties } from "react"
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

  // combo selecionado no momento (começa no +200 pra puxar ticket médio)
  const [selectedComboId, setSelectedComboId] =
    useState<string | null>("combo-200")
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

          // Mensagem de benefício específica de cada combo
          const benefitText =
            combo.quantity === 100
              ? "Perfeito pra começar agora"
              : combo.quantity === 200
              ? "Dobro de chances por R$ 19,90"
              : combo.quantity === 500
              ? "Pra acelerar de verdade"
              : "Combo máximo pra esgotar a edição"

          const ctaText = isSelected
            ? "Combo selecionado"
            : "Selecionar combo"

          // ✨ Glow + micro animação só quando o combo está selecionado
          const dynamicStyle: CSSProperties = {
            ["--primary-red" as any]: PRIMARY_RED,
            ["--light-red" as any]: LIGHT_RED,
            boxShadow: isSelected
              ? "0 0 0 1px rgba(139,0,0,0.7), 0 10px 22px rgba(139,0,0,0.45)"
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
                "rounded-xl border-2 shadow-sm transition-all duration-200 ease-out",
                "hover:shadow-md hover:scale-[1.02] active:scale-95",
                "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#FEE2E2]",
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
                    "mt-1 text-[10px] sm:text-[11px]",
                    isSelected ? "text-white/90" : "text-slate-600",
                  )}
                >
                  {benefitText}
                </div>

                {/* CTA + check de seleção */}
                <div
                  className={cn(
                    "mt-2 text-[11px] sm:text-xs flex items-center justify-center gap-1",
                    isSelected
                      ? "text-white font-semibold"
                      : "text-[var(--primary-red)] underline underline-offset-2 decoration-[var(--primary-red)]/50",
                  )}
                >
                  {isSelected && (
                    <span
                      className={cn(
                        "inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/70 bg-white/10 text-[9px] leading-none",
                      )}
                    >
                      ✔
                    </span>
                  )}
                  <span>{ctaText}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
