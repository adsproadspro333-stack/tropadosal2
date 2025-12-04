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
  // Núcleo do pedido (home)
  baseQty: number
  baseAmountInCents: number
  comboQty: number
  combosTotalInCents: number

  // 🔥 Order bump da página /confirmacao
  bumpQty: number
  bumpAmountInCents: number

  // Totais finais (o que vai pro banco / payment)
  qty: number
  totalInCents: number

  setBaseQty: (n: number) => void
  handleChangeQuantity: (newTotalQty: number) => void
  addComboToCart: (quantity: number, priceCents: number) => void
  clearCart: () => void
  prepareUpsellOrder: (quantity: number, priceCents: number) => void

  // 👉 NOVO: controle do order bump
  addOrderBump: (quantity: number, priceCents: number) => void
  removeOrderBump: () => void
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      // 🟢 Começa com o combo padrão já selecionado (100 / 9,90)
      baseQty: 0,
      baseAmountInCents: 0,
      comboQty: DEFAULT_COMBO_QTY,
      combosTotalInCents: DEFAULT_COMBO_PRICE_CENTS,

      // 🔥 Order bump começa zerado
      bumpQty: 0,
      bumpAmountInCents: 0,

      // Totais
      qty: DEFAULT_COMBO_QTY,
      totalInCents: DEFAULT_COMBO_PRICE_CENTS,

      // Ajusta SOMENTE a parte personalizada (baseQty)
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

      // Controla o TOTAL “visível” (combo + personalizado)
      // 🔹 O order bump é extra e sempre SOMA por fora.
      handleChangeQuantity: (newTotalQty: number) => {
        set((state) => {
          const rawTarget = Math.floor(Number(newTotalQty) || 0)

          // mínimo sempre é o combo já escolhido
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

      // 🔴 Combo agora SUBSTITUI o combo anterior (não soma mais)
      addComboToCart: (quantity: number, priceCents: number) => {
        set((state) => {
          const comboQty = quantity
          const combosTotalInCents = priceCents
          const coreQty = state.baseQty + comboQty
          const totalQty = coreQty + state.bumpQty

          return {
            comboQty,
            combosTotalInCents,
            qty: totalQty,
            totalInCents:
              state.baseAmountInCents +
              combosTotalInCents +
              state.bumpAmountInCents,
          }
        })
      },

      // "Limpar" volta pro estado padrão: 100 / 9,90 (sem bump)
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
        })
      },

      // 🔥 Upsell (reforço) – monta um NOVO pedido só com o pacote
      // (usado quando vem de /compras?reforco=...)
      prepareUpsellOrder: (quantity: number, priceCents: number) => {
        set(() => {
          const baseQty = 0
          const baseAmountInCents = 0
          const comboQty = quantity
          const combosTotalInCents = priceCents

          // Upsell é um pedido “limpo”: sem bump junto
          return {
            baseQty,
            baseAmountInCents,
            comboQty,
            combosTotalInCents,
            bumpQty: 0,
            bumpAmountInCents: 0,
            qty: comboQty,
            totalInCents: combosTotalInCents,
          }
        })
      },

      // ✅ Order Bump: soma +2000 números e +R$ 9,90 ao pedido
      addOrderBump: (quantity: number, priceCents: number) => {
        set((state) => {
          const bumpQty = quantity
          const bumpAmountInCents = priceCents

          const totalQty =
            state.baseQty + state.comboQty + bumpQty

          return {
            bumpQty,
            bumpAmountInCents,
            qty: totalQty,
            totalInCents:
              state.baseAmountInCents +
              state.combosTotalInCents +
              bumpAmountInCents,
          }
        })
      },

      // Remover bump (se algum dia quiser permitir isso)
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
