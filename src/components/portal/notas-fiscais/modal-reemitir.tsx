'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { type NotaFiscal, type FormState, parseBRL, validarCpfCnpj } from './_shared'
import { ModalOverlay, ModalHeader, ModalFooter, Spinner } from './_modal'
import { NfseFormFields } from './nfse-form-fields'

type Props = {
  nota: NotaFiscal
  onClose: () => void
  onSuccess: () => void
}

export function ModalReemitir({ nota, onClose, onSuccess }: Props) {
  const [form, setForm]         = useState<FormState>({
    descricao:        nota.descricao ?? '',
    valor:            String(Number(nota.valorTotal).toFixed(2)).replace('.', ','),
    tomadorNome:      nota.tomadorNome      ?? '',
    tomadorCpfCnpj:   nota.tomadorCpfCnpj   ?? '',
    tomadorEmail:     nota.tomadorEmail     ?? '',
    tomadorMunicipio: nota.tomadorMunicipio ?? '',
    tomadorEstado:    nota.tomadorEstado    ?? '',
  })
  const [reemitindo, setReemitindo] = useState(false)

  function handleChange(patch: Partial<FormState>) {
    setForm(f => ({ ...f, ...patch }))
  }

  async function handleReemitir() {
    const { descricao, valor, tomadorNome, tomadorCpfCnpj } = form

    if (!descricao.trim())      { toast.error('Informe a descrição do serviço'); return }
    if (!tomadorNome.trim())    { toast.error('Informe o nome do tomador'); return }
    if (!tomadorCpfCnpj.trim()) { toast.error('Informe o CPF ou CNPJ do tomador'); return }
    if (!validarCpfCnpj(tomadorCpfCnpj)) {
      toast.error('CPF deve ter 11 dígitos ou CNPJ 14 dígitos')
      return
    }
    const valorNum = parseBRL(valor)
    if (isNaN(valorNum) || valorNum <= 0) {
      toast.error('Valor inválido. Use o formato: 3000,00')
      return
    }

    setReemitindo(true)
    try {
      const res = await fetch(`/api/portal/notas-fiscais/${nota.id}/reemitir`, {
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
        toast.error(data.error ?? 'Erro ao reemitir nota fiscal')
        return
      }
      toast.success('NFS-e reenviada para processamento!')
      onSuccess()
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setReemitindo(false)
    }
  }

  function handleClose() {
    if (!reemitindo) onClose()
  }

  return (
    <ModalOverlay onClose={handleClose}>
      <ModalHeader
        title="Corrigir e reemitir NFS-e"
        subtitle="Ajuste os dados e reenvie para a prefeitura"
        onClose={handleClose}
      />

      <div className="p-5 space-y-4 overflow-y-auto max-h-[65vh]">
        {/* Motivo da rejeição */}
        {nota.erroMensagem && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
            <p className="text-[11px] font-semibold text-red-600 mb-1">Motivo da rejeição pela prefeitura:</p>
            <p className="text-[12px] text-red-700">{nota.erroMensagem}</p>
            <p className="mt-2 text-[11px] text-red-600/80">
              Corrija os dados abaixo conforme o motivo indicado e reenvie.
            </p>
          </div>
        )}

        <NfseFormFields
          form={form}
          onChange={handleChange}
          disabled={reemitindo}
          showSectionLabels={false}
          showValueHint={false}
        />
      </div>

      <ModalFooter>
        <button
          onClick={handleClose}
          disabled={reemitindo}
          className="rounded-xl px-4 py-2 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          onClick={handleReemitir}
          disabled={reemitindo}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {reemitindo
            ? <><Spinner /> Enviando...</>
            : <><span className="material-symbols-outlined text-[15px]">replay</span>Reemitir NFS-e</>
          }
        </button>
      </ModalFooter>
    </ModalOverlay>
  )
}
