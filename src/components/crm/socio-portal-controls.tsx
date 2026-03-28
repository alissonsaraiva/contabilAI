'use client'

import { useState } from 'react'

type Props = {
  socioId:     string
  temEmail:    boolean
  portalAccess: boolean
}

export function SocioPortalControls({ socioId, temEmail, portalAccess: initial }: Props) {
  const [access,    setAccess]    = useState(initial)
  const [loadingToggle, setToggle] = useState(false)
  const [loadingConvite, setConvite] = useState(false)
  const [conviteOk, setConviteOk] = useState(false)

  async function toggleAccess() {
    setToggle(true)
    try {
      const res = await fetch(`/api/crm/socios/${socioId}/portal-access`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ portalAccess: !access }),
      })
      if (res.ok) setAccess(!access)
    } finally {
      setToggle(false)
    }
  }

  async function enviarConvite() {
    setConvite(true)
    try {
      const res = await fetch(`/api/crm/socios/${socioId}/enviar-convite`, {
        method: 'POST',
      })
      if (res.ok) {
        if (!access) setAccess(true)
        setConviteOk(true)
        setTimeout(() => setConviteOk(false), 3000)
      }
    } finally {
      setConvite(false)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Badge de status */}
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        access
          ? 'bg-green-status/10 text-green-status'
          : 'bg-outline-variant/20 text-on-surface-variant'
      }`}>
        {access ? 'Portal ativo' : 'Portal inativo'}
      </span>

      {/* Toggle */}
      <button
        onClick={toggleAccess}
        disabled={loadingToggle}
        className="flex items-center gap-1 rounded-lg border border-outline-variant/30 px-2.5 py-1 text-[12px] font-medium text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[14px]">
          {access ? 'toggle_on' : 'toggle_off'}
        </span>
        {loadingToggle ? '...' : access ? 'Desabilitar' : 'Habilitar'}
      </button>

      {/* Enviar convite */}
      {temEmail && (
        <button
          onClick={enviarConvite}
          disabled={loadingConvite || conviteOk}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors disabled:opacity-60 ${
            conviteOk
              ? 'bg-green-status/10 text-green-status'
              : 'bg-primary/10 text-primary hover:bg-primary/15'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            {conviteOk ? 'check_circle' : 'send'}
          </span>
          {loadingConvite ? 'Enviando...' : conviteOk ? 'Convite enviado!' : 'Enviar convite'}
        </button>
      )}
    </div>
  )
}
