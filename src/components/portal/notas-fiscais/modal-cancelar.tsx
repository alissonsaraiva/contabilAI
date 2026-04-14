'use client'

import { useState } from 'react'
import { format, differenceInDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { type NotaFiscal } from './_shared'
import { ModalOverlay, ModalHeader, ModalFooter, Spinner } from './_modal'

type Props = {
  nota: NotaFiscal
  onClose: () => void
  onSuccess: () => void
}

export function ModalCancelar({ nota, onClose, onSuccess }: Props) {
  const [justificativa, setJustificativa] = useState('')
  const [cancelando, setCancelando]       = useState(false)

  async function handleCancelar() {
    const trimmed = justificativa.trim()
    if (trimmed.length < 15) {
      toast.error('Descreva o motivo com pelo menos 15 caracteres para continuar.')
      return
    }
    setCancelando(true)
    try {
      const res = await fetch(`/api/portal/notas-fiscais/${nota.id}/cancelar`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justificativa: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Não foi possível cancelar a nota agora. Tente novamente ou fale com o escritório.')
        return
      }
      toast.success('Nota fiscal cancelada com sucesso.')
      onSuccess()
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setCancelando(false)
    }
  }

  function handleClose() {
    if (!cancelando) onClose()
  }

  const diasDesde = nota.autorizadaEm
    ? differenceInDays(new Date(), new Date(nota.autorizadaEm))
    : null

  return (
    <ModalOverlay onClose={handleClose}>
      <ModalHeader
        title="Cancelar NFS-e"
        subtitle="Esta ação é irreversível e não pode ser desfeita"
        onClose={handleClose}
      />

      <div className="p-5 space-y-4">
        {/* Resumo da nota */}
        <div className="rounded-xl border border-outline-variant/20 bg-surface-container p-3">
          <p className="text-[13px] font-semibold text-on-surface">
            {nota.numero ? `NFS-e nº ${nota.numero}` : 'NFS-e'}
          </p>
          <p className="text-[12px] text-on-surface-variant/60 mt-0.5">
            R$ {Number(nota.valorTotal).toFixed(2).replace('.', ',')}
            {nota.tomadorNome ? ` — ${nota.tomadorNome}` : ''}
          </p>
          {nota.autorizadaEm && diasDesde !== null && (
            <p className="text-[11px] text-on-surface-variant/50 mt-0.5">
              Autorizada em {format(new Date(nota.autorizadaEm), 'dd/MM/yyyy', { locale: ptBR })}
              {' '}({diasDesde} dia{diasDesde !== 1 ? 's' : ''} atrás)
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">
            Motivo do cancelamento <span className="text-error">*</span>
          </label>
          <textarea
            value={justificativa}
            onChange={e => setJustificativa(e.target.value)}
            rows={3}
            className="w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-[13px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 resize-none"
            placeholder="Descreva o motivo do cancelamento. Ex: Serviço não foi prestado / valor incorreto / solicitação do cliente"
          />
          <p className={`mt-1 text-right text-[11px] ${justificativa.trim().length >= 15 ? 'text-green-600' : 'text-on-surface-variant/40'}`}>
            {justificativa.trim().length} / 15 caracteres mínimos
          </p>
        </div>

        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-[11px] text-red-700 leading-relaxed">
          <strong>Atenção:</strong> o cancelamento é definitivo e enviado diretamente à prefeitura. Após confirmado, a nota será <strong>invalidada para fins fiscais</strong>. Se precisar emitir uma nova nota para o mesmo tomador, use o botão "Emitir NFS-e".
        </div>
      </div>

      <ModalFooter>
        <button
          onClick={handleClose}
          disabled={cancelando}
          className="rounded-xl px-4 py-2 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
        >
          Voltar
        </button>
        <button
          onClick={handleCancelar}
          disabled={cancelando || justificativa.trim().length < 15}
          className="flex items-center gap-2 rounded-xl bg-error px-5 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-error/90 disabled:opacity-50"
        >
          {cancelando
            ? <><Spinner /> Cancelando...</>
            : <><span className="material-symbols-outlined text-[15px]">cancel</span>Confirmar cancelamento</>
          }
        </button>
      </ModalFooter>
    </ModalOverlay>
  )
}
