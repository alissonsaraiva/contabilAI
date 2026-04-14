'use client'

import { useState } from 'react'
import type { EnvioResumo } from './types'
import { EmptyState } from '../EmptyState'

export function HistoricoSection({ envios }: { envios: EnvioResumo[] }) {
  if (envios.length === 0) return <EmptyState icon="history" text="Nenhum envio realizado" />

  return (
    <div className="px-4 py-3 space-y-3">
      {envios.map(envio => (
        <EnvioCard key={envio.id} envio={envio} />
      ))}
    </div>
  )
}

function EnvioCard({ envio }: { envio: EnvioResumo }) {
  const [expandido, setExpandido] = useState(false)
  const statusConfig = {
    processando: { icon: 'hourglass_top', color: 'text-orange-status', bg: 'bg-orange-status/10', label: 'Enviando...' },
    concluido:   { icon: 'check_circle', color: 'text-green-status', bg: 'bg-green-status/10', label: 'Concluído' },
    falhou:      { icon: 'error', color: 'text-error', bg: 'bg-error/10', label: 'Falhou' },
  }[envio.status] ?? { icon: 'help', color: 'text-on-surface-variant', bg: 'bg-surface-container', label: envio.status }

  return (
    <div className="rounded-lg border border-outline-variant/10 bg-card">
      <button onClick={() => setExpandido(!expandido)} className="flex w-full items-start gap-3 px-3 py-3 text-left">
        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${statusConfig.bg}`}>
          <span className={`material-symbols-outlined text-[14px] ${statusConfig.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>
            {statusConfig.icon}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[12px] text-on-surface">{envio.conteudo || `[${envio.mediaFileName ?? 'Arquivo'}]`}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusConfig.bg} ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
            <span className="text-[10px] text-on-surface-variant/50">
              {envio.totalEnviados}/{envio.totalMembros} enviados
              {envio.totalFalhas > 0 && ` · ${envio.totalFalhas} falha(s)`}
            </span>
            <span className="ml-auto text-[10px] text-on-surface-variant/40">
              {new Date(envio.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
        <span className={`material-symbols-outlined text-[16px] text-on-surface-variant/30 transition-transform ${expandido ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {expandido && (
        <div className="border-t border-outline-variant/10 px-3 py-2">
          <p className="mb-2 text-[10px] font-semibold text-on-surface-variant/50">
            Enviado por {envio.operador.nome}
          </p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {envio.destinatarios.map(d => (
              <div key={d.id} className="flex items-center gap-2 text-[10px]">
                <span className={`material-symbols-outlined text-[12px] ${
                  d.status === 'enviado' ? 'text-green-status' : d.status === 'falhou' ? 'text-error' : 'text-on-surface-variant/30'
                }`} style={{ fontVariationSettings: "'FILL' 1" }}>
                  {d.status === 'enviado' ? 'check_circle' : d.status === 'falhou' ? 'cancel' : 'schedule'}
                </span>
                <span className="text-on-surface-variant/70">{d.remoteJid.replace('@s.whatsapp.net', '')}</span>
                {d.erroEnvio && <span className="text-error/60 truncate">{d.erroEnvio}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
