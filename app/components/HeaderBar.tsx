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
        background: "linear-gradient(180deg, #0B0B0B 0%, #050505 100%)",
        boxShadow: "0 3px 12px rgba(0,0,0,0.65)",
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
                  filter:
                    "drop-shadow(0 2px 6px rgba(0,0,0,0.85))",
                }}
                onError={() => setImgOk(false)}
              />
            ) : (
              <strong
                style={{
                  fontSize: 18,
                  color: "#FFFFFF",
                  letterSpacing: 0.6,
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
                padding: "7px 14px",
                borderRadius: 999,
                border: "2px solid #D4AF37",
                background:
                  "linear-gradient(180deg, rgba(212,175,55,0.18), rgba(212,175,55,0.06))",
                color: "#F5D76E",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                transition: "transform .15s ease, box-shadow .15s ease",
                boxShadow:
                  "0 0 0 rgba(212,175,55,0)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.05)"
                e.currentTarget.style.boxShadow =
                  "0 0 12px rgba(212,175,55,0.45)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)"
                e.currentTarget.style.boxShadow =
                  "0 0 0 rgba(212,175,55,0)"
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "scale(0.96)"
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "scale(1.05)"
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
              <span>Minhas compras</span>
            </button>
          </Link>
        </div>
      </div>
    </header>
  )
}
