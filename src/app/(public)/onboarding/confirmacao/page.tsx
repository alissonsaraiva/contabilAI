'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'

type Props = { searchParams: Promise<{ leadId?: string; aguardando?: string }> }

const PROXIMOS_PASSOS_AGUARDANDO = [
  { icon: 'mark_email_read', label: 'Verifique seu e-mail e clique no link para assinar o contrato' },
  { icon: 'verified',        label: 'Após a assinatura, sua conta será ativada automaticamente' },
  { icon: 'key',             label: 'Você receberá acesso ao Portal do Cliente por e-mail' },
]

const PROXIMOS_PASSOS_ASSINADO = [
  { icon: 'folder_open',   label: 'Nosso time recebe seus documentos e inicia a migração contábil' },
  { icon: 'phone_in_talk', label: 'Um contador entra em contato em até 24h para alinhar os detalhes' },
  { icon: 'key',           label: 'Você receberá acesso ao portal do cliente por e-mail' },
]

export default function ConfirmacaoPage({ searchParams }: Props) {
  const { leadId, aguardando } = use(searchParams)
  const isAguardando = aguardando === 'true'
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [whatsapp, setWhatsapp] = useState<string | null>(null)

  useEffect(() => {
    if (!leadId || isAguardando) return
    fetch(`/api/onboarding/lead/${leadId}`)
      .then(r => r.json())
      .then((data: { contrato?: { pdfUrl?: string } }) => {
        if (data.contrato?.pdfUrl) setPdfUrl(`/api/leads/${leadId}/contrato/download`)
      })
      .catch(err => console.error('[onboarding] falha ao salvar progresso:', err))
  }, [leadId, isAguardando])

  useEffect(() => {
    fetch('/api/escritorio')
      .then(r => r.json())
      .then((e: { whatsapp?: string | null }) => { if (e?.whatsapp) setWhatsapp(e.whatsapp) })
      .catch(err => console.error('[onboarding] falha ao salvar progresso:', err))
  }, [])

  if (isAguardando) {
    return (
      <div className="flex flex-col items-center gap-8 pt-4 text-center">
        {/* Ícone de e-mail */}
        <div className="relative">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
            <span
              className="material-symbols-outlined text-[52px] text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              mark_email_read
            </span>
          </div>
          <div className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-orange-status shadow-md">
            <span className="material-symbols-outlined text-[16px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>
              pending
            </span>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-on-surface">
            Contrato enviado!
          </h1>
          <p className="mt-2 text-[15px] text-on-surface-variant leading-relaxed max-w-sm">
            Verifique seu e-mail e clique no link para assinar eletronicamente.
            O link é válido por <strong>24 horas</strong>.
          </p>
        </div>

        {/* Alerta de ação necessária */}
        <div className="w-full rounded-2xl border border-orange-status/20 bg-orange-status/5 px-5 py-4 flex items-start gap-3 text-left">
          <span className="material-symbols-outlined text-[20px] text-orange-status mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
            notification_important
          </span>
          <div>
            <p className="text-[13px] font-semibold text-on-surface">Ação necessária</p>
            <p className="text-[13px] text-on-surface-variant mt-0.5">
              Sua conta só será ativada após a assinatura do contrato. Não encontrou o e-mail? Verifique a pasta de spam.
            </p>
          </div>
        </div>

        {/* Próximos passos */}
        <div className="w-full rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm text-left">
          <p className="mb-4 text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">O que acontece agora</p>
          <div className="space-y-4">
            {PROXIMOS_PASSOS_AGUARDANDO.map((passo, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {passo.icon}
                  </span>
                </div>
                <p className="text-[14px] font-medium text-on-surface">{passo.label}</p>
              </div>
            ))}
          </div>
        </div>

        {whatsapp && (
          <a
            href={`https://wa.me/${whatsapp.replace(/\D/g, '')}?text=Ol%C3%A1%21+Acabei+de+enviar+o+contrato+para+assinatura.`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full h-12 items-center justify-center gap-2 rounded-2xl bg-green-status text-[15px] font-semibold text-white shadow-sm hover:bg-green-status/90 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">chat</span>
            Falar pelo WhatsApp
          </a>
        )}

        <Link href="/" className="text-[13px] font-medium text-on-surface-variant hover:text-primary transition-colors">
          Voltar ao site
        </Link>
      </div>
    )
  }

  // Estado legado (contrato assinado via input de texto — manter compatibilidade)
  return (
    <div className="flex flex-col items-center gap-8 pt-4 text-center">
      <div className="relative">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-status/10">
          <span
            className="material-symbols-outlined text-[52px] text-green-status"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            check_circle
          </span>
        </div>
        <div className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary shadow-md">
          <span className="material-symbols-outlined text-[16px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>
            celebration
          </span>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-on-surface">
          Contrato assinado!
        </h1>
        <p className="mt-2 text-[15px] text-on-surface-variant leading-relaxed max-w-sm">
          Tudo certo. Seu contrato foi assinado digitalmente e nossa equipe já foi notificada.
        </p>
      </div>

      {pdfUrl && (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3.5 text-left transition-colors hover:bg-primary/10"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <span className="material-symbols-outlined text-[20px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              picture_as_pdf
            </span>
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-semibold text-primary">Baixar contrato assinado</p>
            <p className="text-[12px] text-on-surface-variant/70">Guarde uma cópia para seus registros</p>
          </div>
          <span className="material-symbols-outlined text-[18px] text-primary/60">download</span>
        </a>
      )}

      <div className="w-full rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm text-left">
        <p className="mb-4 text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">O que acontece agora</p>
        <div className="space-y-4">
          {PROXIMOS_PASSOS_ASSINADO.map((passo, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {passo.icon}
                </span>
              </div>
              <p className="text-[14px] font-medium text-on-surface">{passo.label}</p>
            </div>
          ))}
        </div>
      </div>

      {whatsapp && (
        <a
          href={`https://wa.me/${whatsapp.replace(/\D/g, '')}?text=Ol%C3%A1%21+Acabei+de+assinar+o+contrato.`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full h-12 items-center justify-center gap-2 rounded-2xl bg-green-status text-[15px] font-semibold text-white shadow-sm hover:bg-green-status/90 transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">chat</span>
          Falar agora pelo WhatsApp
        </a>
      )}

      <Link href="/" className="text-[13px] font-medium text-on-surface-variant hover:text-primary transition-colors">
        Voltar ao site
      </Link>
    </div>
  )
}
