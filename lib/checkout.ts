export type OfferSelection = {
  quantity: number // quantidade total acumulada
  totalCentavos: number // valor total acumulado em centavos
}

const KEY = "checkoutSelection"

export function getSelection(): OfferSelection {
  if (typeof window === "undefined") return { quantity: 0, totalCentavos: 0 }
  const raw = localStorage.getItem(KEY)
  if (!raw) return { quantity: 0, totalCentavos: 0 }
  try {
    const s = JSON.parse(raw) as OfferSelection
    if (!Number.isFinite(s.quantity) || !Number.isFinite(s.totalCentavos)) {
      return { quantity: 0, totalCentavos: 0 }
    }
    return s
  } catch {
    return { quantity: 0, totalCentavos: 0 }
  }
}

export function setSelection(sel: OfferSelection) {
  if (typeof window === "undefined") return
  localStorage.setItem(KEY, JSON.stringify(sel))
  window.dispatchEvent(new Event("selection:changed"))
}

export function clearSelection() {
  if (typeof window === "undefined") return
  const zero: OfferSelection = { quantity: 0, totalCentavos: 0 }
  setSelection(zero)
  return zero
}

export function addToSelection(addQuantity: number, addTotalCentavos: number) {
  const cur = getSelection()
  const next: OfferSelection = {
    quantity: Math.max(0, cur.quantity + addQuantity),
    totalCentavos: Math.max(0, cur.totalCentavos + addTotalCentavos),
  }
  setSelection(next)
  return next
}

export function replaceSelection(quantity: number, totalCentavos: number) {
  const next: OfferSelection = {
    quantity: Math.max(0, quantity),
    totalCentavos: Math.max(0, totalCentavos),
  }
  setSelection(next)
  return next
}

export function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function getDerivedUnitPriceCents(sel: OfferSelection): number {
  if (!sel.quantity) return 0
  return Math.round(sel.totalCentavos / sel.quantity)
}
