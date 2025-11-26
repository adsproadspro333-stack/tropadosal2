// Single source of truth for pricing
export const UNIT_PRICE_CENTS = 10

// Helper functions
export const priceForQtyCents = (qty: number) => qty * UNIT_PRICE_CENTS

export const priceForQty = (qty: number) => priceForQtyCents(qty) / 100
