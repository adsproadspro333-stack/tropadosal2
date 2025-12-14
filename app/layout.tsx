import type React from "react"
import type { Metadata } from "next"
import Script from "next/script"
import { Public_Sans } from "next/font/google"
import { AppRouterCacheProvider } from "@mui/material-nextjs/v14-appRouter"
import { ThemeProvider } from "@mui/material/styles"
import CssBaseline from "@mui/material/CssBaseline"
import { theme } from "./theme"
import "./globals.css"
import HeaderBar from "./components/HeaderBar"
import { ToastProvider } from "./components/ui/Toast"

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "FAVELA Prêmios",
  description: "Sorteios e promoções",
  generator: "proprio",
}

const FB_PIXEL_ID = "2539052283140863"

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Meta Pixel Code */}
        <Script
          id="fb-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)_fbq=n;n.push=n; n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');

fbq('init', '${FB_PIXEL_ID}');
fbq('track', 'PageView');

window.fbq = window.fbq || function() {
  (window.fbq.q = window.fbq.q || []).push(arguments);
};
          `,
          }}
        />
        {/* End Meta Pixel Code */}
      </head>

      <body className={`${publicSans.className} with-sticky-header`}>
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src={`https://www.facebook.com/tr?id=${FB_PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>

        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <ToastProvider>
              {/* Header */}
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

              {/* Conteúdo */}
              <main
                className="page-content"
                style={{ minHeight: "100dvh" }}
              >
                {children}
              </main>
            </ToastProvider>
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  )
}
