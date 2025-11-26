import { create } from "zustand"
import { persist } from "zustand/middleware"

// 🎯 Regras de preço
const BASE_MIN_QTY = 100
const BASE_MIN_PRICE_CENTS = 990 // 100 números = R$ 9,90

export type CartState = {
  baseQty: number
  baseAmountInCents: number
  comboQty: number
  combosTotalInCents: number
  qty: number
  totalInCents: number

  setBaseQty: (n: number) => void
  handleChangeQuantity: (newTotalQty: number) => void
  addComboToCart: (quantity: number, priceCents: number) => void
  clearCart: () => void
  prepareUpsellOrder: (quantity: number, priceCents: number) => void
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      // 🧊 Começa ZERADO pra não confundir o lead
      baseQty: 0,
      baseAmountInCents: 0,
      comboQty: 0,
      combosTotalInCents: 0,
      qty: 0,
      totalInCents: 0,

      setBaseQty: (n: number) => {
        // agora pode ser 0 pra começar zerado
        const MIN_QTY = 0
        let newQty = Math.max(MIN_QTY, Math.floor(Number(n) || 0))

        set((state) => {
          const pricePerUnit = BASE_MIN_PRICE_CENTS / BASE_MIN_QTY
          const baseAmountInCents = Math.round(newQty * pricePerUnit)

          return {
            baseQty: newQty,
            baseAmountInCents,
            qty: newQty + state.comboQty,
            totalInCents: baseAmountInCents + state.combosTotalInCents,
          }
        })
      },

      handleChangeQuantity: (newTotalQty: number) => {
        // mínimo total agora pode ser 0 também
        const MIN_TOTAL_QTY = 0
        let adjustedTotalQty = Math.max(
          MIN_TOTAL_QTY,
          Math.floor(Number(newTotalQty) || 0),
        )

        set((state) => {
          // base = total - combos (nunca negativo)
          const newBaseQty = Math.max(0, adjustedTotalQty - state.comboQty)
          const pricePerUnit = BASE_MIN_PRICE_CENTS / BASE_MIN_QTY
          const baseAmountInCents = Math.round(newBaseQty * pricePerUnit)

          return {
            baseQty: newBaseQty,
            baseAmountInCents,
            qty: newBaseQty + state.comboQty,
            totalInCents: baseAmountInCents + state.combosTotalInCents,
          }
        })
      },

      addComboToCart: (quantity: number, priceCents: number) => {
        set((state) => ({
          comboQty: state.comboQty + quantity,
          combosTotalInCents: state.combosTotalInCents + priceCents,
          qty: state.baseQty + state.comboQty + quantity,
          totalInCents:
            state.baseAmountInCents + state.combosTotalInCents + priceCents,
        }))
      },

      clearCart: () => {
        // limpar = voltar pra 0, não pra 100
        set({
          baseQty: 0,
          baseAmountInCents: 0,
          comboQty: 0,
          combosTotalInCents: 0,
          qty: 0,
          totalInCents: 0,
        })
      },

      // 🔥 Usado no upsell da /pagamento-confirmado
      prepareUpsellOrder: (quantity: number, priceCents: number) => {
        set(() => {
          const baseQty = 0
          const baseAmountInCents = 0
          const comboQty = quantity
          const combosTotalInCents = priceCents

          return {
            baseQty,
            baseAmountInCents,
            comboQty,
            combosTotalInCents,
            qty: comboQty,
            totalInCents: combosTotalInCents,
          }
        })
      },
    }),
    { name: "cart-storage" },
  ),
)
