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
        backgroundColor: "#0B0B0B", // 🔥 header preta premium
        boxShadow: "0 2px 8px rgba(0,0,0,0.55)", // separação mais forte
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
        {/* miolo 480px */}
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
                src="/logo-header.jpg"
                alt="FAVELA PRÊMIOS"
                width={360}
                height={120}
                priority
                sizes="(max-width: 640px) 180px, 260px"
                style={{
                  height: 48,
                  width: "auto",
                  objectFit: "contain",
                  filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))",
                }}
                onError={() => setImgOk(false)}
              />
            ) : (
              <strong
                style={{
                  fontSize: 18,
                  color: "#FFFFFF",
                  whiteSpace: "nowrap",
                }}
              >
                FAVELA PRÊMIOS
              </strong>
            )}
          </Link>

          {/* BOTÃO MINHAS COMPRAS */}
          <Link
            href="/compras"
            aria-label="Minhas compras"
            style={{ textDecoration: "none" }}
          >
            <button
              type="button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: "2px solid #D4AF37",
                color: "#F5D76E",
                background: "rgba(212,175,55,0.08)", // fundo sutil
                padding: "6px 12px",
                borderRadius: 999,
                fontWeight: 600,
                fontSize: 12,
                lineHeight: 1,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(212,175,55,0.18)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(212,175,55,0.08)"
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
