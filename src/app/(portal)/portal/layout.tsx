import type { Metadata, Viewport } from 'next'
import { getEscritorioConfig } from '@/lib/escritorio'

/**
 * Layout raiz do portal — cobre login, verificar e área autenticada.
 * Centraliza os meta tags de PWA (apple-touch-startup-image, etc.) para que
 * o iOS os leia independentemente de o usuário estar ou não autenticado no
 * momento de "Adicionar à Tela de Início".
 */
export async function generateMetadata(): Promise<Metadata> {
  const escritorio = await getEscritorioConfig()
  const nome = escritorio.nomeFantasia ?? escritorio.nome

  return {
    appleWebApp: {
      capable:        true,
      title:          nome,
      statusBarStyle: 'black-translucent',
      startupImage: [
        // iPhone SE (2nd/3rd gen) — 750×1334 @2x
        { url: '/splash/iphone-se.png',         media: 'screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
        // iPhone 12 mini / 13 mini — 1080×2340 @3x
        { url: '/splash/iphone-13-mini.png',    media: 'screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        // iPhone 14 (padrão) — 1170×2532 @3x  (usa iphone-14.png com escala mínima)
        { url: '/splash/iphone-14.png',         media: 'screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        // iPhone 14 Pro / 15 / 15 Pro / 16 — 1179×2556 @3x
        { url: '/splash/iphone-14.png',         media: 'screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        // iPhone 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus — 1290×2796 @3x
        { url: '/splash/iphone-14-plus.png',    media: 'screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        // iPhone 16 Pro — 1206×2622 @3x
        { url: '/splash/iphone-16-pro.png',     media: 'screen and (device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        // iPhone 16 Pro Max — 1320×2868 @3x
        { url: '/splash/iphone-16-pro-max.png', media: 'screen and (device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        // iPad Pro 11" — 1668×2388 @2x
        { url: '/splash/ipad-pro-11.png',       media: 'screen and (device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
        // iPad Pro 12.9" — 2048×2732 @2x
        { url: '/splash/ipad-pro-12.png',       media: 'screen and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      ],
    },
    formatDetection: { telephone: false },
    icons: {
      apple: '/icons/icon-192.png',
    },
    other: {
      'mobile-web-app-capable': 'yes',
    },
  }
}

export const viewport: Viewport = {
  themeColor:   '#0055FF',
  width:        'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit:  'cover',
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children
}
