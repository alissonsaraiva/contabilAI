'use client'

import { useEffect, useState } from 'react'

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

/** Converte base64url para Uint8Array (exigido pela API pushManager.subscribe) */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

async function subscribeToPush(swReg: ServiceWorkerRegistration): Promise<void> {
  if (!VAPID_PUBLIC) return
  try {
    const existing = await swReg.pushManager.getSubscription()
    const sub = existing ?? await swReg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC).buffer as ArrayBuffer,
    })
    await fetch('/api/portal/push/subscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(sub.toJSON()),
    })
    localStorage.setItem('push-subscribed', '1')
  } catch {
    // Silencioso — push não é crítico
  }
}

export function PortalPWA() {
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [showing, setShowing]             = useState(false)
  const [dismissed, setDismissed]         = useState(false)
  const [showPushBanner, setShowPushBanner] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js', { scope: '/portal/' })
      .then(async (reg) => {
        // Se já subscrito anteriormente, re-envia a subscription (chaves podem ter expirado)
        if (localStorage.getItem('push-subscribed')) {
          await subscribeToPush(reg)
          return
        }
        // Mostra banner de permissão de push após 8s — só se ainda não pediu
        if (
          VAPID_PUBLIC &&
          Notification.permission === 'default' &&
          !localStorage.getItem('push-dismissed')
        ) {
          setTimeout(() => setShowPushBanner(true), 8000)
        }
      })
      .catch(() => {})

    // Capturar o evento de instalação do PWA
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
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

  async function enablePush() {
    setShowPushBanner(false)
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      localStorage.setItem('push-dismissed', '1')
      return
    }
    const reg = await navigator.serviceWorker.ready
    await subscribeToPush(reg)
  }

  function dismissPush() {
    setShowPushBanner(false)
    localStorage.setItem('push-dismissed', '1')
  }

  // Banner de push tem prioridade sobre banner de instalação
  if (showPushBanner) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-50 md:bottom-6 md:left-auto md:right-6 md:w-80 animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-card shadow-xl p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[22px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              notifications
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-on-surface">Ativar notificações</p>
            <p className="text-[12px] text-on-surface-variant/70 mt-0.5 leading-relaxed">
              Receba avisos de mensagens, chamados e comunicados mesmo com o portal fechado.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={enablePush}
                className="flex-1 rounded-xl bg-primary px-3 py-2 text-[12px] font-semibold text-white hover:bg-primary/90 transition-colors"
              >
                Ativar
              </button>
              <button
                onClick={dismissPush}
                className="rounded-xl bg-surface-container px-3 py-2 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Agora não
              </button>
            </div>
          </div>
          <button
            onClick={dismissPush}
            className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant/40 hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      </div>
    )
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
