import { create } from "zustand"
import { persist } from "zustand/middleware"

// 🎯 Regras de preço base
const BASE_MIN_QTY = 3
const BASE_MIN_PRICE_CENTS = 990 // 3 números = R$ 9,90
const UNIT_PRICE = BASE_MIN_PRICE_CENTS / BASE_MIN_QTY

// 🎯 Combo padrão
const DEFAULT_COMBO_QTY = 5
const DEFAULT_COMBO_PRICE_CENTS = 1990

export type CartState = {
  // Núcleo do pedido
  baseQty: number
  baseAmountInCents: number
  comboQty: number
  combosTotalInCents: number

  // Order bump
  bumpQty: number
  bumpAmountInCents: number

  // Totais finais
  qty: number
  totalInCents: number

  // 🔥 CONTROLE DE FLUXO
  isUpsell: boolean

  setBaseQty: (n: number) => void
  handleChangeQuantity: (newTotalQty: number) => void
  addComboToCart: (quantity: number, priceCents: number) => void
  clearCart: () => void
  prepareUpsellOrder: (quantity: number, priceCents: number) => void
  addOrderBump: (quantity: number, priceCents: number) => void
  removeOrderBump: () => void
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      // 🟢 Estado inicial
      baseQty: 0,
      baseAmountInCents: 0,
      comboQty: DEFAULT_COMBO_QTY,
      combosTotalInCents: DEFAULT_COMBO_PRICE_CENTS,

      bumpQty: 0,
      bumpAmountInCents: 0,

      qty: DEFAULT_COMBO_QTY,
      totalInCents: DEFAULT_COMBO_PRICE_CENTS,

      isUpsell: false,

      // Ajusta apenas a parte personalizada
      setBaseQty: (n: number) => {
        const newBaseQty = Math.max(0, Math.floor(Number(n) || 0))

        set((state) => {
          const baseAmountInCents = Math.round(newBaseQty * UNIT_PRICE)
          const totalQty =
            newBaseQty + state.comboQty + state.bumpQty

          return {
            baseQty: newBaseQty,
            baseAmountInCents,
            qty: totalQty,
            totalInCents:
              baseAmountInCents +
              state.combosTotalInCents +
              state.bumpAmountInCents,
          }
        })
      },

      // Controla quantidade total visível
      handleChangeQuantity: (newTotalQty: number) => {
        set((state) => {
          const rawTarget = Math.floor(Number(newTotalQty) || 0)
          const coreTarget = Math.max(state.comboQty, rawTarget)

          const newBaseQty = Math.max(0, coreTarget - state.comboQty)
          const baseAmountInCents = Math.round(newBaseQty * UNIT_PRICE)

          const totalQty = coreTarget + state.bumpQty

          return {
            baseQty: newBaseQty,
            baseAmountInCents,
            qty: totalQty,
            totalInCents:
              baseAmountInCents +
              state.combosTotalInCents +
              state.bumpAmountInCents,
          }
        })
      },

      // 🔴 Combo substitui combo anterior
      addComboToCart: (quantity: number, priceCents: number) => {
        set((state) => {
          const comboQty = quantity
          const combosTotalInCents = priceCents

          const totalQty =
            state.baseQty + comboQty + state.bumpQty

          return {
            comboQty,
            combosTotalInCents,
            qty: totalQty,
            totalInCents:
              state.baseAmountInCents +
              combosTotalInCents +
              state.bumpAmountInCents,
            isUpsell: false,
          }
        })
      },

      // 🔄 Reset total
      clearCart: () => {
        set({
          baseQty: 0,
          baseAmountInCents: 0,
          comboQty: DEFAULT_COMBO_QTY,
          combosTotalInCents: DEFAULT_COMBO_PRICE_CENTS,
          bumpQty: 0,
          bumpAmountInCents: 0,
          qty: DEFAULT_COMBO_QTY,
          totalInCents: DEFAULT_COMBO_PRICE_CENTS,
          isUpsell: false,
        })
      },

      // 🔥 UPSell pós-pagamento
      prepareUpsellOrder: (quantity: number, priceCents: number) => {
        set(() => ({
          baseQty: 0,
          baseAmountInCents: 0,
          comboQty: quantity,
          combosTotalInCents: priceCents,
          bumpQty: 0,
          bumpAmountInCents: 0,
          qty: quantity,
          totalInCents: priceCents,
          isUpsell: true, // 🔥 FLAG CRÍTICA
        }))
      },

      // ➕ Order bump
      addOrderBump: (quantity: number, priceCents: number) => {
        set((state) => {
          const totalQty =
            state.baseQty + state.comboQty + quantity

          return {
            bumpQty: quantity,
            bumpAmountInCents: priceCents,
            qty: totalQty,
            totalInCents:
              state.baseAmountInCents +
              state.combosTotalInCents +
              priceCents,
          }
        })
      },

      // ➖ Remove bump
      removeOrderBump: () => {
        set((state) => {
          const totalQty = state.baseQty + state.comboQty

          return {
            bumpQty: 0,
            bumpAmountInCents: 0,
            qty: totalQty,
            totalInCents:
              state.baseAmountInCents + state.combosTotalInCents,
          }
        })
      },
    }),
    {
      name: "cart-storage",
    },
  ),
)
