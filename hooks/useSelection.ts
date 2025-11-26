"use client"
import * as React from "react"
import { getSelection, addToSelection, replaceSelection, clearSelection, type OfferSelection } from "@/lib/checkout"

export function useSelection() {
  const [selection, setSel] = React.useState<OfferSelection>(() => getSelection())

  React.useEffect(() => {
    const onChange = () => setSel(getSelection())
    window.addEventListener("selection:changed", onChange)
    window.addEventListener("storage", onChange)
    return () => {
      window.removeEventListener("selection:changed", onChange)
      window.removeEventListener("storage", onChange)
    }
  }, [])

  return {
    selection,
    add: (q: number, cents: number) => setSel(addToSelection(q, cents)),
    replace: (q: number, cents: number) => setSel(replaceSelection(q, cents)),
    clear: () => setSel(clearSelection()),
  }
}
