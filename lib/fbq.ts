// app/lib/fbq.ts

declare global {
  interface Window {
    fbq?: (...args: any[]) => void
  }
}

// Wrapper simples pra evitar erro se o fbq não existir
export function fbqTrack(
  event: string,
  params?: Record<string, any>,
) {
  if (typeof window === "undefined") return
  if (!window.fbq) return

  if (params) {
    window.fbq("track", event, params)
  } else {
    window.fbq("track", event)
  }
}

// Eventos específicos que vamos usar
export function trackViewContent(params?: Record<string, any>) {
  fbqTrack("ViewContent", params)
}

export function trackInitiateCheckout(params?: Record<string, any>) {
  fbqTrack("InitiateCheckout", params)
}
