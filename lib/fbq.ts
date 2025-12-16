// app/lib/fbq.ts

declare global {
  interface Window {
    fbq?: (...args: any[]) => void
  }
}

// gera um event_id único (browser-safe)
function generateEventId() {
  return (
    Date.now().toString() +
    "-" +
    Math.random().toString(36).slice(2, 10)
  )
}

// Wrapper base
export function fbqTrack(
  event: string,
  params?: Record<string, any>,
) {
  if (typeof window === "undefined") return
  if (!window.fbq) return

  const eventId = generateEventId()

  const payload = {
    ...(params || {}),
    event_id: eventId,
  }

  window.fbq("track", event, payload)

  // 🔎 útil pra debug em dev
  if (process.env.NODE_ENV !== "production") {
    console.log("[fbq]", event, payload)
  }

  return eventId
}

// ================= EVENTOS =================

// ViewContent (home / produto)
export function trackViewContent(params?: Record<string, any>) {
  return fbqTrack("ViewContent", params)
}

// InitiateCheckout (quando vai pra /dados ou gera PIX)
export function trackInitiateCheckout(params?: Record<string, any>) {
  return fbqTrack("InitiateCheckout", params)
}
