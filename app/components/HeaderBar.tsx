"use client"

import Image from "next/image"
import Link from "next/link"
import { useState } from "react"

export default function HeaderBar() {
  const [imgOk, setImgOk] = useState(true)

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        width: "100%",
        backgroundColor: "#F3F4F6",
        boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
      }}
    >
      <div
        style={{
          padding: "8px 0", // 🔥 reduz altura – antes era height: 60
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 480,
            padding: "0 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          {/* LOGO */}
          <Link
            href="/"
            aria-label="Página inicial"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              flex: 1,
            }}
          >
            {imgOk ? (
              <Image
                src="/logo-header.png"
                alt="CHRYS PRÊMIOS"
                width={360}
                height={120}
                priority
                sizes="(max-width: 640px) 180px, 260px"
                style={{
                  height: 40, // 🔥 menor para deixar header elegante
                  width: "auto",
                  objectFit: "contain",
                }}
                onError={() => setImgOk(false)}
              />
            ) : (
              <strong
                style={{
                  fontSize: 18,
                  color: "#0F172A",
                  whiteSpace: "nowrap",
                }}
              >
                CHRYS PRÊMIOS
              </strong>
            )}
          </Link>

          {/* BOTÃO MINHAS COMPRAS */}
          <Link href="/compras" aria-label="Minhas compras" style={{ textDecoration: "none" }}>
            <button
              type="button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: "2px solid #d4af37",
                color: "#b88700",
                background: "transparent",
                padding: "6px 12px",
                borderRadius: 999,
                fontWeight: 600,
                fontSize: 12,
                lineHeight: 1,
                cursor: "pointer",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M6 7h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7Z"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M9 7a3 3 0 1 1 6 0"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
              <span className="hide-on-xs">Minhas compras</span>
            </button>
          </Link>
        </div>
      </div>
    </header>
  )
}
