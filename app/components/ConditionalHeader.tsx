"use client"

import { usePathname } from "next/navigation"
import HeaderBar from "./HeaderBar"

export default function ConditionalHeader() {
  const pathname = usePathname()

  // Esconde tudo do admin
  const isDash = pathname === "/dash" || pathname.startsWith("/dash/")
  if (isDash) return null

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        <HeaderBar />
      </div>
    </div>
  )
}
