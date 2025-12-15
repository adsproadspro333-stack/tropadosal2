"use client"

import Image from "next/image"
import Link from "next/link"
import { useState } from "react"

export default function HeaderBar() {
  const [imgOk, setImgOk] = useState(true)

  const RED = "#DC2626"
  const RED_DARK = "#B91C1C"

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        width: "100%",
        background: "linear-gradient(180deg, #0B0B0B 0%, #050505 100%)",
        boxShadow: "0 3px 12px rgba(0,0,0,0.65)",
        // ✅ acabamento premium (linha sutil)
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        style={{
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* miolo fixo */}
        <div
          style={{
            width: "100%",
            maxWidth: 480,
            padding: "0 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          {/* LOGO */}
          <Link
            href="/"
            aria-label="Página inicial"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flex: 1,
              minWidth: 0,
            }}
          >
            {imgOk ? (
              <Image
                src="/logo-header.jpg"
                alt="FAVELA PRÊMIOS"
                width={360}
                height={120}
                priority
                sizes="(max-width: 640px) 180px, 260px"
                style={{
                  height: 46,
                  width: "auto",
                  objectFit: "contain",
                  filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.85))",
                }}
                onError={() => setImgOk(false)}
              />
            ) : (
              <strong
                style={{
                  fontSize: 18,
                  color: "#FFFFFF",
                  letterSpacing: 0.6,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                FAVELA PRÊMIOS
              </strong>
            )}
          </Link>

          {/* BOTÃO MINHAS COMPRAS (vermelho, sem ícone) */}
          <Link href="/compras" aria-label="Minhas compras" style={{ textDecoration: "none" }}>
            <button
              type="button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 0,
                padding: "8px 14px",
                borderRadius: 999,
                border: `1px solid rgba(220,38,38,0.55)`,
                background:
                  "linear-gradient(180deg, rgba(220,38,38,0.22), rgba(220,38,38,0.08))",
                color: "#FFFFFF",
                fontSize: 12,
                fontWeight: 900,
                cursor: "pointer",
                transition: "transform .15s ease, box-shadow .15s ease, border-color .15s ease",
                boxShadow: "0 0 0 rgba(220,38,38,0)",
                letterSpacing: 0.2,
                // ✅ melhora “toque”
                WebkitTapHighlightColor: "transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.045)"
                e.currentTarget.style.boxShadow = "0 0 16px rgba(220,38,38,0.35)"
                e.currentTarget.style.borderColor = "rgba(220,38,38,0.85)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)"
                e.currentTarget.style.boxShadow = "0 0 0 rgba(220,38,38,0)"
                e.currentTarget.style.borderColor = "rgba(220,38,38,0.55)"
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "scale(0.965)"
                e.currentTarget.style.boxShadow = "0 0 10px rgba(220,38,38,0.25)"
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "scale(1.045)"
              }}
            >
              <span>Minhas compras</span>
            </button>
          </Link>
        </div>
      </div>

      {/* ✅ glow sutil embaixo do header (bem premium e discreto) */}
      <div
        aria-hidden="true"
        style={{
          height: 2,
          width: "100%",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(220,38,38,0.22) 35%, rgba(220,38,38,0.10) 65%, transparent 100%)",
          opacity: 0.9,
        }}
      />
    </header>
  )
}
