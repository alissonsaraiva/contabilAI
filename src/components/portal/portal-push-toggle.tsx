'use client'

import { useEffect, useState } from 'react'

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

type PushState = 'checking' | 'not-supported' | 'granted' | 'default' | 'denied'

export function PortalPushToggle() {
  const [state,   setState]   = useState<PushState>('checking')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !VAPID_PUBLIC) {
      setState('not-supported')
      return
    }
    const perm = Notification.permission
    if (perm === 'granted' && localStorage.getItem('push-subscribed')) {
      setState('granted')
    } else if (perm === 'denied') {
      setState('denied')
    } else {
      setState('default')
    }
  }, [])

  async function handleEnable() {
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState('denied')
        return
      }
      const reg      = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      const sub      = existing ?? await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC).buffer as ArrayBuffer,
      })
      await fetch('/api/portal/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(sub.toJSON()),
      })
      localStorage.setItem('push-subscribed', '1')
      localStorage.removeItem('push-dismissed')
      setState('granted')
    } catch {
      // falha silenciosa — push não é crítico
    } finally {
      setLoading(false)
    }
  }

  if (state === 'checking') {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-surface-container-low/60 px-4 py-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <p className="text-[13px] text-on-surface-variant/60">Verificando status…</p>
      </div>
    )
  }

  if (state === 'not-supported') {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-surface-container-low/60 px-4 py-3">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant/40">notifications_off</span>
        <p className="text-[13px] text-on-surface-variant/60">Seu navegador não suporta notificações push.</p>
      </div>
    )
  }

  if (state === 'granted') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-xl border border-green-status/20 bg-green-status/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[18px] text-green-status" style={{ fontVariationSettings: "'FILL' 1" }}>
              notifications_active
            </span>
            <div>
              <p className="text-[13px] font-medium text-on-surface">Notificações ativas</p>
              <p className="text-[11px] text-on-surface-variant/60">
                Você receberá alertas de mensagens, chamados e comunicados.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-green-status/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-green-status">
            Ativo
          </span>
        </div>
        <p className="px-1 text-[11px] text-on-surface-variant/50">
          Para desativar, acesse as configurações de notificações do seu navegador ou dispositivo.
        </p>
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-error/20 bg-error/5 px-4 py-3">
        <span className="material-symbols-outlined mt-0.5 text-[18px] text-error">block</span>
        <div>
          <p className="text-[13px] font-medium text-on-surface">Notificações bloqueadas</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-on-surface-variant/70">
            Você bloqueou as notificações para este site. Para reativar, permita notificações
            nas configurações de privacidade do seu navegador e recarregue a página.
          </p>
        </div>
      </div>
    )
  }

  // state === 'default'
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface-container-low/60 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant/50" style={{ fontVariationSettings: "'FILL' 1" }}>
          notifications
        </span>
        <div>
          <p className="text-[13px] font-medium text-on-surface">Notificações push</p>
          <p className="text-[11px] text-on-surface-variant/60">Receba alertas mesmo com o portal fechado.</p>
        </div>
      </div>
      <button
        onClick={handleEnable}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {loading
          ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          : <span className="material-symbols-outlined text-[14px]">add_alert</span>
        }
        Ativar
      </button>
    </div>
  )
}
