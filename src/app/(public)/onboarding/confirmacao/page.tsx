'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'

type Props = { searchParams: Promise<{ leadId?: string }> }

const PROXIMOS_PASSOS = [
  { icon: 'folder_open', label: 'Nosso time recebe seus documentos e inicia a migração contábil' },
  { icon: 'phone_in_talk', label: 'Um contador entra em contato em até 24h para alinhar os detalhes' },
  { icon: 'key', label: 'Você receberá acesso ao portal do cliente por e-mail' },
]

export default function ConfirmacaoPage({ searchParams }: Props) {
  const { leadId } = use(searchParams)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!leadId) return
    fetch(`/api/leads/${leadId}`)
      .then(r => r.json())
      .then((data: { contrato?: { pdfUrl?: string } }) => {
        if (data.contrato?.pdfUrl) setPdfUrl(data.contrato.pdfUrl)
      })
      .catch(() => {})
  }, [leadId])

  return (
    <div className="flex flex-col items-center gap-8 pt-4 text-center">
      {/* Ícone de sucesso */}
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

      {/* Download do contrato */}
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

      {/* Próximos passos */}
      <div className="w-full rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm text-left">
        <p className="mb-4 text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">O que acontece agora</p>
        <div className="space-y-4">
          {PROXIMOS_PASSOS.map((passo, i) => (
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

      {/* WhatsApp CTA */}
      <a
        href="https://wa.me/5585999999999?text=Ol%C3%A1%21+Acabei+de+assinar+o+contrato+no+site+da+ContabAI."
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full h-12 items-center justify-center gap-2 rounded-2xl bg-green-status text-[15px] font-semibold text-white shadow-sm hover:bg-green-status/90 transition-colors"
      >
        <span className="material-symbols-outlined text-[20px]">chat</span>
        Falar agora pelo WhatsApp
      </a>

      <Link
        href="/"
        className="text-[13px] font-medium text-on-surface-variant hover:text-primary transition-colors"
      >
        Voltar ao site
      </Link>
    </div>
  )
}
