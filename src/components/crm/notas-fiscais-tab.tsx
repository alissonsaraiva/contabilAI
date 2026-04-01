'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type NotaFiscal = {
  id: string
  numero: string | null
  status: string
  descricao: string
  valorTotal: number
  issValor: number | null
  issRetido: boolean
  tomadorNome: string
  tomadorCpfCnpj: string
  protocolo: string | null
  erroCodigo: string | null
  erroMensagem: string | null
  spedyId: string | null
  autorizadaEm: string | null
  criadoEm: string
}

const STATUS_LABELS: Record<string, string> = {
  autorizada:   'Autorizada',
  rejeitada:    'Rejeitada',
  cancelada:    'Cancelada',
  processando:  'Processando',
  enviando:     'Enviando',
  rascunho:     'Rascunho',
  erro_interno: 'Erro interno',
}

const STATUS_COLORS: Record<string, string> = {
  autorizada:   'bg-green-status/10 text-green-status',
  rejeitada:    'bg-error/10 text-error',
  cancelada:    'bg-surface-container text-on-surface-variant',
  processando:  'bg-primary/10 text-primary',
  enviando:     'bg-tertiary/10 text-tertiary',
  rascunho:     'bg-surface-container text-on-surface-variant',
  erro_interno: 'bg-orange-status/10 text-orange-status',
}

const STATUS_ICONS: Record<string, string> = {
  autorizada:   'check_circle',
  rejeitada:    'cancel',
  cancelada:    'remove_circle',
  processando:  'hourglass_empty',
  enviando:     'upload',
  rascunho:     'draft',
  erro_interno: 'error',
}

type Props = {
  clienteId: string
  spedyConfigurado: boolean
  escritorioSpedyOk: boolean
}

type FormState = {
  descricao: string
  valor: string
  tomadorNome: string
  tomadorCpfCnpj: string
  tomadorEmail: string
  tomadorMunicipio: string
  tomadorEstado: string
}

const INITIAL_FORM: FormState = {
  descricao: '',
  valor: '',
  tomadorNome: '',
  tomadorCpfCnpj: '',
  tomadorEmail: '',
  tomadorMunicipio: '',
  tomadorEstado: '',
}

const INPUT = 'w-full h-10 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-3 text-[13px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'

export function NotasFiscaisTabContent({ clienteId, spedyConfigurado, escritorioSpedyOk }: Props) {
  const [notas, setNotas] = useState<NotaFiscal[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [sincronizando, setSincronizando] = useState(false)
  const [spedyOk, setSpedyOk] = useState(spedyConfigurado)
  const [cancelando, setCancelando] = useState<string | null>(null)
  const [justificativa, setJustificativa] = useState('')
  const [showCancelarModal, setShowCancelarModal] = useState<string | null>(null)

  const fetchNotas = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/notas-fiscais?clienteId=${clienteId}&limit=20`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setNotas(data.notas ?? [])
      setTotal(data.total ?? 0)
    } catch {
      toast.error('Erro ao carregar notas fiscais')
    } finally {
      setLoading(false)
    }
  }, [clienteId])

  useEffect(() => { fetchNotas() }, [fetchNotas])

  async function emitir() {
    if (!form.descricao || !form.valor || !form.tomadorNome || !form.tomadorCpfCnpj) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }
    const valor = parseFloat(form.valor.replace(',', '.'))
    if (isNaN(valor) || valor <= 0) {
      toast.error('Valor inválido')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/crm/notas-fiscais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId,
          descricao: form.descricao,
          valor,
          tomadorNome: form.tomadorNome,
          tomadorCpfCnpj: form.tomadorCpfCnpj.replace(/\D/g, ''),
          tomadorEmail: form.tomadorEmail || undefined,
          tomadorMunicipio: form.tomadorMunicipio || undefined,
          tomadorEstado: form.tomadorEstado || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.erro ?? data.error ?? 'Erro ao emitir nota')
        return
      }
      toast.success('NFS-e enviada para processamento!')
      setShowModal(false)
      setForm(INITIAL_FORM)
      fetchNotas()
    } catch {
      toast.error('Erro ao emitir nota fiscal')
    } finally {
      setSaving(false)
    }
  }

  async function cancelar(notaId: string) {
    if (justificativa.length < 15) {
      toast.error('Justificativa deve ter pelo menos 15 caracteres')
      return
    }
    setCancelando(notaId)
    try {
      const res = await fetch(`/api/crm/notas-fiscais/${notaId}/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justificativa }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.erro ?? 'Erro ao cancelar nota')
        return
      }
      toast.success('Nota cancelada com sucesso')
      setShowCancelarModal(null)
      setJustificativa('')
      fetchNotas()
    } catch {
      toast.error('Erro ao cancelar')
    } finally {
      setCancelando(null)
    }
  }

  async function entregar(notaId: string, canal: 'whatsapp' | 'email') {
    try {
      const res = await fetch(`/api/crm/notas-fiscais/${notaId}/entregar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canal }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Nota enviada via ${canal === 'whatsapp' ? 'WhatsApp' : 'e-mail'}`)
    } catch {
      toast.error('Erro ao entregar nota')
    }
  }

  if (!escritorioSpedyOk) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-outline-variant/30 p-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container">
          <span className="material-symbols-outlined text-[24px] text-on-surface-variant">receipt_long</span>
        </div>
        <div>
          <p className="text-[14px] font-semibold text-on-surface">Spedy não configurado</p>
          <p className="mt-1 text-[12px] text-on-surface-variant/70">Configure a integração Spedy em Configurações → Integrações para habilitar emissão de NFS-e.</p>
        </div>
        <a href="/crm/configuracoes/integracoes" className="rounded-xl bg-primary/10 px-4 py-2 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/20">
          Ir para Integrações
        </a>
      </div>
    )
  }

  async function handleSincronizarSpedy() {
    setSincronizando(true)
    try {
      const res = await fetch(`/api/crm/clientes/${clienteId}/spedy`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ modo: 'sincronizar' }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Falha ao cadastrar na Spedy')
      } else {
        toast.success(data.acao === 'atualizada' ? 'Dados atualizados na Spedy.' : 'Empresa cadastrada na Spedy com sucesso.')
        setSpedyOk(true)
      }
    } catch {
      toast.error('Erro de conexão ao tentar sincronizar com a Spedy')
    } finally {
      setSincronizando(false)
    }
  }

  if (!spedyOk) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-outline-variant/30 p-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container">
          <span className="material-symbols-outlined text-[24px] text-on-surface-variant">business</span>
        </div>
        <div>
          <p className="text-[14px] font-semibold text-on-surface">Empresa não cadastrada na Spedy</p>
          <p className="mt-1 text-[12px] text-on-surface-variant/70">
            O cadastro é feito automaticamente ao salvar o CNPJ da empresa. Se o cadastro automático falhou, clique abaixo para tentar novamente.
          </p>
        </div>
        <button
          onClick={handleSincronizarSpedy}
          disabled={sincronizando}
          className="flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
        >
          {sincronizando ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : (
            <span className="material-symbols-outlined text-[16px]">sync</span>
          )}
          {sincronizando ? 'Cadastrando...' : 'Cadastrar na Spedy'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header com botão emitir */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-on-surface-variant">
            {total > 0 ? `${total} nota${total > 1 ? 's' : ''} emitida${total > 1 ? 's' : ''}` : 'Nenhuma nota fiscal emitida'}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Nova NFS-e
        </button>
      </div>

      {/* Lista de notas */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : notas.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-outline-variant/30 py-12 text-center">
          <span className="material-symbols-outlined text-[32px] text-on-surface-variant/40">receipt_long</span>
          <p className="text-[13px] text-on-surface-variant/60">Nenhuma NFS-e emitida ainda</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notas.map(nota => {
            const statusColor = STATUS_COLORS[nota.status] ?? 'bg-surface-container text-on-surface-variant'
            const statusLabel = STATUS_LABELS[nota.status] ?? nota.status
            const statusIcon  = STATUS_ICONS[nota.status] ?? 'help'
            const dataRef     = nota.autorizadaEm ?? nota.criadoEm
            const dataFmt     = format(new Date(dataRef), 'dd/MM/yyyy', { locale: ptBR })
            const valorFmt    = `R$ ${Number(nota.valorTotal).toFixed(2).replace('.', ',')}`

            return (
              <div key={nota.id} className="rounded-xl border border-outline-variant/15 bg-card p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {nota.numero && (
                        <span className="text-[13px] font-bold text-on-surface">NFS-e nº {nota.numero}</span>
                      )}
                      <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColor}`}>
                        <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>{statusIcon}</span>
                        {statusLabel}
                      </span>
                      <span className="text-[11px] text-on-surface-variant/60">{dataFmt}</span>
                    </div>
                    <p className="mt-1 text-[12px] text-on-surface-variant/70 truncate">{nota.descricao}</p>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-[13px] font-semibold text-on-surface">{valorFmt}</span>
                      <span className="text-[11px] text-on-surface-variant/60">→ {nota.tomadorNome}</span>
                    </div>
                    {nota.protocolo && (
                      <p className="mt-0.5 text-[11px] text-on-surface-variant/50">Protocolo: {nota.protocolo}</p>
                    )}
                    {nota.erroMensagem && (
                      <p className="mt-1 text-[11px] text-error/80">Erro: {nota.erroMensagem.slice(0, 100)}</p>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1 shrink-0">
                    {nota.status === 'autorizada' && nota.spedyId && (
                      <>
                        <a
                          href={`/api/crm/notas-fiscais/${nota.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Baixar PDF"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                        >
                          <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                        </a>
                        <button
                          title="Enviar via WhatsApp"
                          onClick={() => entregar(nota.id, 'whatsapp')}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-green-status"
                        >
                          <span className="material-symbols-outlined text-[18px]">phone_iphone</span>
                        </button>
                        <button
                          title="Enviar por e-mail"
                          onClick={() => entregar(nota.id, 'email')}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                        >
                          <span className="material-symbols-outlined text-[18px]">mail</span>
                        </button>
                        <button
                          title="Cancelar nota"
                          onClick={() => { setShowCancelarModal(nota.id); setJustificativa('') }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
                        >
                          <span className="material-symbols-outlined text-[18px]">remove_circle</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal: Nova NFS-e */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-outline-variant/15 p-5">
              <div>
                <h2 className="text-[15px] font-bold text-on-surface">Emitir NFS-e</h2>
                <p className="text-[12px] text-on-surface-variant/70">Revise os dados antes de emitir</p>
              </div>
              <button onClick={() => setShowModal(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">
                  Descrição do serviço <span className="text-error">*</span>
                </label>
                <textarea
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  rows={2}
                  className="w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-[13px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 resize-none"
                  placeholder="Ex: Consultoria contábil mensal — março/2026"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">
                  Valor total (R$) <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.valor}
                  onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                  className={INPUT}
                  placeholder="3000,00"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">
                    Nome do tomador <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.tomadorNome}
                    onChange={e => setForm(f => ({ ...f, tomadorNome: e.target.value }))}
                    className={INPUT}
                    placeholder="Empresa ABC Ltda"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">
                    CPF/CNPJ do tomador <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.tomadorCpfCnpj}
                    onChange={e => setForm(f => ({ ...f, tomadorCpfCnpj: e.target.value }))}
                    className={INPUT}
                    placeholder="12.345.678/0001-90"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">E-mail do tomador</label>
                  <input
                    type="email"
                    value={form.tomadorEmail}
                    onChange={e => setForm(f => ({ ...f, tomadorEmail: e.target.value }))}
                    className={INPUT}
                    placeholder="financeiro@empresa.com"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">Município do tomador</label>
                  <input
                    type="text"
                    value={form.tomadorMunicipio}
                    onChange={e => setForm(f => ({ ...f, tomadorMunicipio: e.target.value }))}
                    className={INPUT}
                    placeholder="São Paulo"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-orange-status/20 bg-orange-status/5 p-3 text-[11px] text-on-surface-variant/80">
                <strong className="text-orange-status">Atenção:</strong> a NFS-e será enviada para processamento na prefeitura e o status será atualizado automaticamente. A emissão pode ser irreversível após a autorização.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-outline-variant/15 p-4">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-xl px-4 py-2 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container"
              >
                Cancelar
              </button>
              <button
                onClick={emitir}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <span className="material-symbols-outlined text-[15px]">send</span>
                )}
                Emitir NFS-e
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Cancelar nota */}
      {showCancelarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl">
            <div className="border-b border-outline-variant/15 p-5">
              <h2 className="text-[15px] font-bold text-error">Cancelar NFS-e</h2>
              <p className="text-[12px] text-on-surface-variant/70">Esta ação pode não ser reversível dependendo do município e prazo legal.</p>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-[12px] font-semibold text-on-surface-variant">
                Justificativa do cancelamento <span className="text-error">*</span> <span className="text-on-surface-variant/50">(mín. 15 caracteres)</span>
              </label>
              <textarea
                value={justificativa}
                onChange={e => setJustificativa(e.target.value)}
                rows={3}
                className="w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-[13px] text-on-surface shadow-sm transition-colors focus:border-error/50 focus:outline-none focus:ring-[3px] focus:ring-error/10 placeholder:text-on-surface-variant/40 resize-none"
                placeholder="Descreva o motivo do cancelamento..."
              />
              <p className="text-[11px] text-on-surface-variant/50">{justificativa.length}/15 caracteres mínimos</p>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-outline-variant/15 p-4">
              <button
                onClick={() => { setShowCancelarModal(null); setJustificativa('') }}
                className="rounded-xl px-4 py-2 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container"
              >
                Voltar
              </button>
              <button
                onClick={() => cancelar(showCancelarModal)}
                disabled={!!cancelando || justificativa.length < 15}
                className="flex items-center gap-2 rounded-xl bg-error px-5 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-error/90 disabled:opacity-60"
              >
                {cancelando ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <span className="material-symbols-outlined text-[15px]">remove_circle</span>
                )}
                Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
