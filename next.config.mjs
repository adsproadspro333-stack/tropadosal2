/** @type {import('next').NextConfig} */

// Headers de segurança aplicados em todas as rotas
const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    // Bloqueia uso de câmera/microfone/geolocalização pelo site
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    // Força HTTPS nos browsers que já acessaram via HTTPS
    value: "max-age=63072000; includeSubDomains; preload",
  },
]

const nextConfig = {
  // ⚙️ Mantido do seu config original
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },

  // 🛡️ Blindagem de código no front
  // Garante que o navegador NÃO recebe source maps legíveis
  productionBrowserSourceMaps: false,

  // Garante JS minificado em produção (mais difícil de ler / copiar)
  swcMinify: true,

  // 🔐 Security headers em todas as rotas
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
