'use client'

import { useEffect, useState } from 'react'

export function PortalPWA() {
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [showing, setShowing]             = useState(false)
  const [dismissed, setDismissed]         = useState(false)

  useEffect(() => {
    // Registrar service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/portal/' })
        .catch(() => {}) // Falha silenciosa — não é crítico
    }

    // Capturar o evento de instalação do PWA
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
      // Mostrar banner depois de 5s (para não ser imediato)
      setTimeout(() => {
        if (!sessionStorage.getItem('pwa-dismissed')) setShowing(true)
      }, 5000)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    setShowing(false)
    setDismissed(true)
    sessionStorage.setItem('pwa-dismissed', '1')
  }

  async function install() {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
    setShowing(false)
  }

  if (!showing || dismissed) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:bottom-6 md:left-auto md:right-6 md:w-80 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-card shadow-xl p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <span className="material-symbols-outlined text-[22px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            install_mobile
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-on-surface">Instalar o aplicativo</p>
          <p className="text-[12px] text-on-surface-variant/70 mt-0.5 leading-relaxed">
            Acesse o portal rapidamente direto da sua tela inicial.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={install}
              className="flex-1 rounded-xl bg-primary px-3 py-2 text-[12px] font-semibold text-white hover:bg-primary/90 transition-colors"
            >
              Instalar
            </button>
            <button
              onClick={dismiss}
              className="rounded-xl bg-surface-container px-3 py-2 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              Agora não
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant/40 hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    </div>
  )
}
