import { create } from "zustand"
import { persist } from "zustand/middleware"

// 🎯 Regras de preço base
const BASE_MIN_QTY = 3
const BASE_MIN_PRICE_CENTS = 990 // 3 números = R$ 9,90

// ✅ 9,90 / 3 = 3,30 por número (manual)
const UNIT_PRICE_CENTS = Math.round(BASE_MIN_PRICE_CENTS / BASE_MIN_QTY) // 330

function toInt(n: any) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.floor(v)
}

function clampInt(n: any, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const v = toInt(n)
  return Math.max(min, Math.min(max, v))
}

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
  clearCart: () => void // ✅ “Zerar seleção” => volta pro mínimo 3
  prepareUpsellOrder: (quantity: number, priceCents: number) => void
  addOrderBump: (quantity: number, priceCents: number) => void
  removeOrderBump: () => void
}

/**
 * ✅ Recalcula TUDO sempre do mesmo jeito
 * Evita bug de "qty certo mas total errado"
 */
function recalc(state: {
  baseQty: number
  comboQty: number
  combosTotalInCents: number
  bumpQty: number
  bumpAmountInCents: number
}) {
  const safeBaseQty = clampInt(state.baseQty, 0)
  const safeComboQty = clampInt(state.comboQty, 0)
  const safeBumpQty = clampInt(state.bumpQty, 0)

  const safeCombosTotal = clampInt(state.combosTotalInCents, 0)
  const safeBumpAmount = clampInt(state.bumpAmountInCents, 0)

  const baseAmountInCents = safeBaseQty * UNIT_PRICE_CENTS

  const qty = safeBaseQty + safeComboQty + safeBumpQty
  const totalInCents = baseAmountInCents + safeCombosTotal + safeBumpAmount

  return {
    baseQty: safeBaseQty,
    baseAmountInCents,
    comboQty: safeComboQty,
    combosTotalInCents: safeCombosTotal,
    bumpQty: safeBumpQty,
    bumpAmountInCents: safeBumpAmount,
    qty,
    totalInCents,
  }
}

// ✅ Estado inicial correto: começa no mínimo 3 (base), sem combo, sem bump
const INITIAL_STATE = recalc({
  baseQty: BASE_MIN_QTY, // ✅ 3
  comboQty: 0,
  combosTotalInCents: 0,
  bumpQty: 0,
  bumpAmountInCents: 0,
})

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,
      isUpsell: false,

      /**
       * Ajusta apenas a parte manual (base).
       * Não mexe no combo nem bump.
       */
      setBaseQty: (n: number) => {
        const newBaseQty = clampInt(n, 0)

        set((state) => {
          const next = recalc({
            baseQty: newBaseQty,
            comboQty: state.comboQty,
            combosTotalInCents: state.combosTotalInCents,
            bumpQty: state.bumpQty,
            bumpAmountInCents: state.bumpAmountInCents,
          })

          return { ...next, isUpsell: false }
        })
      },

      /**
       * Controla quantidade total (seletor +/-).
       *
       * ✅ regra:
       * - nunca negativo
       * - se não tem combo e o cara tentar ir abaixo de 3 => volta pra 3
       * - se tem combo, o combo é o piso natural (base não fica negativo)
       */
      handleChangeQuantity: (newTotalQty: number) => {
        set((state) => {
          const rawTarget = clampInt(newTotalQty, 0)

          // ✅ mínimo 3 só quando NÃO existe combo selecionado
          const targetTotal =
            state.comboQty > 0 ? rawTarget : Math.max(BASE_MIN_QTY, rawTarget)

          // total = base + combo + bump  => base = total - combo - bump
          const newBaseQty = Math.max(
            0,
            targetTotal - state.comboQty - state.bumpQty,
          )

          const next = recalc({
            baseQty: newBaseQty,
            comboQty: state.comboQty,
            combosTotalInCents: state.combosTotalInCents,
            bumpQty: state.bumpQty,
            bumpAmountInCents: state.bumpAmountInCents,
          })

          return { ...next, isUpsell: false }
        })
      },

      /**
       * 🔴 Combo PROMO:
       * ✅ substitui o pedido (zera base) e aplica valor fechado do combo
       * ✅ mantém bump (se já estiver aplicado)
       */
      addComboToCart: (quantity: number, priceCents: number) => {
        set((state) => {
          const comboQty = clampInt(quantity, 0)
          const combosTotalInCents = clampInt(priceCents, 0)

          const next = recalc({
            baseQty: 0, // ✅ combo não soma com base mínima
            comboQty,
            combosTotalInCents,
            bumpQty: state.bumpQty,
            bumpAmountInCents: state.bumpAmountInCents,
          })

          return { ...next, isUpsell: false }
        })
      },

      /**
       * 🔄 “Zerar seleção”:
       * ✅ volta pro mínimo do funil: 3 números / R$ 9,90
       * ✅ remove combo e bump
       */
      clearCart: () => {
        set({
          ...INITIAL_STATE,
          isUpsell: false,
        })
      },

      /**
       * 🔥 Upsell pós-pagamento
       * carrinho vira 100% upsell (isolado)
       */
      prepareUpsellOrder: (quantity: number, priceCents: number) => {
        const comboQty = clampInt(quantity, 0)
        const combosTotalInCents = clampInt(priceCents, 0)

        const next = recalc({
          baseQty: 0,
          comboQty,
          combosTotalInCents,
          bumpQty: 0,
          bumpAmountInCents: 0,
        })

        set({
          ...next,
          isUpsell: true,
        })
      },

      /**
       * ➕ Order bump (substitui o bump atual)
       */
      addOrderBump: (quantity: number, priceCents: number) => {
        set((state) => {
          const bumpQty = clampInt(quantity, 0)
          const bumpAmountInCents = clampInt(priceCents, 0)

          const next = recalc({
            baseQty: state.baseQty,
            comboQty: state.comboQty,
            combosTotalInCents: state.combosTotalInCents,
            bumpQty,
            bumpAmountInCents,
          })

          return { ...next, isUpsell: false }
        })
      },

      /**
       * ➖ Remove bump
       */
      removeOrderBump: () => {
        set((state) => {
          const next = recalc({
            baseQty: state.baseQty,
            comboQty: state.comboQty,
            combosTotalInCents: state.combosTotalInCents,
            bumpQty: 0,
            bumpAmountInCents: 0,
          })

          return { ...next, isUpsell: false }
        })
      },
    }),
    {
      name: "cart-storage",
      version: 5,

      /**
       * ✅ MIGRAÇÃO:
       * - limpa versões antigas com “estado zumbi”
       * - normaliza campos
       * - garante mínimo base=3 somente quando não há combo
       */
      migrate: (persistedState: any, version: number) => {
        try {
          // veio de versão velha => zera pro novo padrão
          if (!version || version < 5) return { ...INITIAL_STATE, isUpsell: false }

          const s = persistedState as Partial<CartState>
          if (!s || typeof s !== "object")
            return { ...INITIAL_STATE, isUpsell: false }

          const comboQty = clampInt((s as any).comboQty ?? 0, 0)
          const combosTotalInCents = clampInt((s as any).combosTotalInCents ?? 0, 0)

          const bumpQty = clampInt((s as any).bumpQty ?? 0, 0)
          const bumpAmountInCents = clampInt((s as any).bumpAmountInCents ?? 0, 0)

          // base só precisa ser >=3 se não há combo
          const rawBase = clampInt((s as any).baseQty ?? BASE_MIN_QTY, 0)
          const baseQty = comboQty > 0 ? Math.max(0, rawBase) : Math.max(BASE_MIN_QTY, rawBase)

          const next = recalc({
            baseQty,
            comboQty,
            combosTotalInCents,
            bumpQty,
            bumpAmountInCents,
          })

          return {
            ...next,
            isUpsell: Boolean((s as any).isUpsell ?? false),
          }
        } catch {
          return { ...INITIAL_STATE, isUpsell: false }
        }
      },
    },
  ),
)
