import { create } from "zustand"
import { persist } from "zustand/middleware"

// 🎯 Regras de preço base (personalizado)
const BASE_MIN_QTY = 100
const BASE_MIN_PRICE_CENTS = 990 // 100 números = R$ 9,90
const UNIT_PRICE = BASE_MIN_PRICE_CENTS / BASE_MIN_QTY // 9,9 centavos

// 🎯 Combo padrão da home (100 / 9,90)
const DEFAULT_COMBO_QTY = 100
const DEFAULT_COMBO_PRICE_CENTS = 990

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
      // 🟢 Começa com o combo padrão já selecionado (100 / 9,90)
      baseQty: 0,
      baseAmountInCents: 0,
      comboQty: DEFAULT_COMBO_QTY,
      combosTotalInCents: DEFAULT_COMBO_PRICE_CENTS,
      qty: DEFAULT_COMBO_QTY,
      totalInCents: DEFAULT_COMBO_PRICE_CENTS,

      // Ajusta SOMENTE a parte personalizada (baseQty)
      setBaseQty: (n: number) => {
        const newBaseQty = Math.max(0, Math.floor(Number(n) || 0))

        set((state) => {
          const baseAmountInCents = Math.round(newBaseQty * UNIT_PRICE)
          const totalQty = newBaseQty + state.comboQty

          return {
            baseQty: newBaseQty,
            baseAmountInCents,
            qty: totalQty,
            totalInCents: baseAmountInCents + state.combosTotalInCents,
          }
        })
      },

      // Controla o TOTAL, respeitando o combo atual como mínimo
      handleChangeQuantity: (newTotalQty: number) => {
        set((state) => {
          const rawTarget = Math.floor(Number(newTotalQty) || 0)

          // total nunca pode ser menor que o combo já escolhido
          const targetTotal = Math.max(state.comboQty, rawTarget)

          const newBaseQty = Math.max(0, targetTotal - state.comboQty)
          const baseAmountInCents = Math.round(newBaseQty * UNIT_PRICE)

          return {
            baseQty: newBaseQty,
            baseAmountInCents,
            qty: targetTotal,
            totalInCents: baseAmountInCents + state.combosTotalInCents,
          }
        })
      },

      // 🔴 Combo agora SUBSTITUI o combo anterior (não soma mais)
      addComboToCart: (quantity: number, priceCents: number) => {
        set((state) => {
          const comboQty = quantity
          const combosTotalInCents = priceCents
          const totalQty = state.baseQty + comboQty

          return {
            comboQty,
            combosTotalInCents,
            qty: totalQty,
            totalInCents: state.baseAmountInCents + combosTotalInCents,
          }
        })
      },

      // "Limpar" volta pro estado padrão: 100 / 9,90
      clearCart: () => {
        set({
          baseQty: 0,
          baseAmountInCents: 0,
          comboQty: DEFAULT_COMBO_QTY,
          combosTotalInCents: DEFAULT_COMBO_PRICE_CENTS,
          qty: DEFAULT_COMBO_QTY,
          totalInCents: DEFAULT_COMBO_PRICE_CENTS,
        })
      },

      // 🔥 Upsell na /pagamento-confirmado — mantemos igual:
      // monta um NOVO pedido só com o upsell
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
