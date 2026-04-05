'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { type FormState, FORM_VAZIO, parseBRL, validarCpfCnpj, formatCnpj } from './_shared'
import { ModalOverlay, ModalHeader, ModalFooter, Spinner } from './_modal'
import { NfseFormFields } from './nfse-form-fields'

type Props = {
  prestador: { razaoSocial: string; cnpj: string }
  onClose: () => void
  onSuccess: () => void
}

export function ModalEmitir({ prestador, onClose, onSuccess }: Props) {
  const [form, setForm]       = useState<FormState>(FORM_VAZIO)
  const [emitindo, setEmitindo] = useState(false)

  function handleChange(patch: Partial<FormState>) {
    setForm(f => ({ ...f, ...patch }))
  }

  async function handleEmitir() {
    const { descricao, valor, tomadorNome, tomadorCpfCnpj } = form

    if (!descricao.trim())      { toast.error('Informe a descrição do serviço'); return }
    if (!tomadorNome.trim())    { toast.error('Informe o nome do tomador'); return }
    if (!tomadorCpfCnpj.trim()) { toast.error('Informe o CPF ou CNPJ do tomador'); return }
    if (!validarCpfCnpj(tomadorCpfCnpj)) {
      toast.error('CPF deve ter 11 dígitos ou CNPJ 14 dígitos')
      return
    }
    if (!valor.trim()) { toast.error('Informe o valor da nota'); return }
    const valorNum = parseBRL(valor)
    if (isNaN(valorNum) || valorNum <= 0) {
      toast.error('Valor inválido. Use o formato: 3000,00')
      return
    }

    setEmitindo(true)
    try {
      const res = await fetch('/api/portal/notas-fiscais', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descricao:        descricao.trim(),
          valor:            valorNum,
          tomadorNome:      tomadorNome.trim(),
          tomadorCpfCnpj:   tomadorCpfCnpj.replace(/\D/g, ''),
          tomadorEmail:     form.tomadorEmail     || undefined,
          tomadorMunicipio: form.tomadorMunicipio || undefined,
          tomadorEstado:    form.tomadorEstado    || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Erro ao emitir nota fiscal')
        return
      }
      if (data.status === 'autorizada') {
        toast.success('NFS-e autorizada! Já disponível para download.', { duration: 5000 })
      } else if (data.status === 'rejeitada' || data.status === 'erro_interno') {
        toast.warning('NFS-e enviada, mas foi recusada pela prefeitura. Verifique o motivo na lista.', { duration: 7000 })
      } else {
        toast.success('NFS-e enviada para processamento! Acompanhe o status na lista abaixo.', { duration: 5000 })
      }
      onSuccess()
    } catch {
      toast.error('Erro de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setEmitindo(false)
    }
  }

  function handleClose() {
    if (!emitindo) onClose()
  }

  return (
    <ModalOverlay onClose={handleClose}>
      <ModalHeader
        title="Emitir NFS-e"
        subtitle="Preencha os dados da nota fiscal de serviço"
        onClose={handleClose}
      />

      <div className="p-5 space-y-4 overflow-y-auto max-h-[65vh]">
        {/* Prestador (read-only) */}
        <div className="rounded-xl border border-outline-variant/20 bg-surface-container p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50 mb-1.5">
            Prestador de serviços (você)
          </p>
          <p className="text-[13px] font-semibold text-on-surface">{prestador.razaoSocial || '—'}</p>
          {prestador.cnpj && (
            <p className="text-[12px] text-on-surface-variant/60 mt-0.5">CNPJ: {formatCnpj(prestador.cnpj)}</p>
          )}
        </div>

        {/* Orientação sobre tomador */}
        <div className="rounded-xl border border-outline-variant/15 bg-surface-container/50 p-3">
          <p className="text-[12px] font-semibold text-on-surface-variant/70 mb-1">O que é o tomador?</p>
          <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
            O <strong>tomador</strong> é a pessoa ou empresa que está <strong>contratando</strong> o seu serviço — ou seja, para quem você vai emitir a nota. Preencha os dados de quem receberá a NFS-e.
          </p>
        </div>

        <NfseFormFields
          form={form}
          onChange={handleChange}
          disabled={emitindo}
          showSectionLabels
          showValueHint
        />

        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 text-[11px] text-orange-700 leading-relaxed">
          <strong>Antes de emitir:</strong> confira todos os dados. Após autorização pela prefeitura, a NFS-e só pode ser cancelada em até 30 dias e <strong>não pode ser editada</strong>.
        </div>
      </div>

      <ModalFooter>
        <button
          onClick={handleClose}
          disabled={emitindo}
          className="rounded-xl px-4 py-2 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          onClick={handleEmitir}
          disabled={emitindo}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {emitindo
            ? <><Spinner /> Emitindo...</>
            : <><span className="material-symbols-outlined text-[15px]">send</span>Emitir NFS-e</>
          }
        </button>
      </ModalFooter>
    </ModalOverlay>
  )
}
