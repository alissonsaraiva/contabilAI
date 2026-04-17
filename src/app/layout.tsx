import type { Metadata } from 'next'
import { GeistMono } from 'geist/font/mono'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { getEscritorioConfig } from '@/lib/escritorio'
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta',
  display: 'swap',
})

export async function generateMetadata(): Promise<Metadata> {
  const escritorio = await getEscritorioConfig()
  const nome   = escritorio.nome
  const titulo = escritorio.nomeFantasia ?? nome
  const desc   = escritorio.metaDescricao ?? 'Contabilidade digital com IA.'
  return {
    title: {
      default: titulo,
      template: `%s | ${nome}`,
    },
    description: desc,
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${plusJakarta.variable} ${GeistMono.variable}`}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
        {/* PWA splash screens — iOS lê estas tags diretamente do HTML ao "Adicionar à Tela de Início".
            Precisam estar no root layout (HTML estático) para garantir presença em todas as páginas,
            independente de auth ou merging de generateMetadata. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* iPhone SE (2nd/3rd gen) — 750×1334 @2x */}
        <link rel="apple-touch-startup-image" href="/splash/iphone-se.png" media="screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        {/* iPhone 12 mini / 13 mini — 1080×2340 @3x */}
        <link rel="apple-touch-startup-image" href="/splash/iphone-13-mini.png" media="screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 14 padrão — 1170×2532 @3x */}
        <link rel="apple-touch-startup-image" href="/splash/iphone-14.png" media="screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 14 Pro / 15 / 15 Pro / 16 — 1179×2556 @3x */}
        <link rel="apple-touch-startup-image" href="/splash/iphone-14.png" media="screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus — 1290×2796 @3x */}
        <link rel="apple-touch-startup-image" href="/splash/iphone-14-plus.png" media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 16 Pro — 1206×2622 @3x */}
        <link rel="apple-touch-startup-image" href="/splash/iphone-16-pro.png" media="screen and (device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 16 Pro Max — 1320×2868 @3x */}
        <link rel="apple-touch-startup-image" href="/splash/iphone-16-pro-max.png" media="screen and (device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPad Pro 11" — 1668×2388 @2x */}
        <link rel="apple-touch-startup-image" href="/splash/ipad-pro-11.png" media="screen and (device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        {/* iPad Pro 12.9" — 2048×2732 @2x */}
        <link rel="apple-touch-startup-image" href="/splash/ipad-pro-12.png" media="screen and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
      </head>
      <body className="antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
