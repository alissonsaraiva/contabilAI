'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { INITIAL_FORM, type FormState, type NotaFiscal } from './notas-fiscais/_shared'
import { NotaFiscalCard }     from './notas-fiscais/nota-fiscal-card'
import { EmitirNfseModal }    from './notas-fiscais/emitir-modal'
import { ReemitirNfseModal }  from './notas-fiscais/reemitir-modal'
import { CancelarNfseModal }  from './notas-fiscais/cancelar-modal'
import { SpedyNaoConfigurado, EmpresaNaoCadastrada } from './notas-fiscais/empty-states'

type Props = {
  clienteId: string
  spedyConfigurado: boolean
  escritorioSpedyOk: boolean
}

export function NotasFiscaisTabContent({ clienteId, spedyConfigurado, escritorioSpedyOk }: Props) {
  const [notas, setNotas]                           = useState<NotaFiscal[]>([])
  const [total, setTotal]                           = useState(0)
  const [loading, setLoading]                       = useState(true)
  const [showModal, setShowModal]                   = useState(false)
  const [saving, setSaving]                         = useState(false)
  const [form, setForm]                             = useState<FormState>(INITIAL_FORM)
  const [sincronizando, setSincronizando]           = useState(false)
  const [spedyOk, setSpedyOk]                       = useState(spedyConfigurado)
  const [cancelando, setCancelando]                 = useState<string | null>(null)
  const [justificativa, setJustificativa]           = useState('')
  const [showCancelarModal, setShowCancelarModal]   = useState<string | null>(null)
  const [showReemitirModal, setShowReemitirModal]   = useState<string | null>(null)
  const [reemitirForm, setReemitirForm]             = useState<FormState>(INITIAL_FORM)
  const [reemitirSaving, setReemitirSaving]         = useState(false)
  const [entregando, setEntregando]                 = useState<string | null>(null)
  const [municipioIntegrado, setMunicipioIntegrado] = useState<boolean | null>(null)
  const [municipioNome, setMunicipioNome]           = useState<string | null>(null)

  const fetchNotas = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true)
    try {
      const res = await fetch(`/api/crm/notas-fiscais?clienteId=${clienteId}&pageSize=20`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setNotas(data.items ?? [])
      setTotal(data.total ?? 0)
    } catch {
      if (!silencioso) toast.error('Não foi possível carregar as notas fiscais. Recarregue a página.')
    } finally {
      if (!silencioso) setLoading(false)
    }
  }, [clienteId])

  useEffect(() => { void fetchNotas() }, [fetchNotas])

  useEffect(() => {
    if (!spedyOk) return
    fetch(`/api/crm/clientes/${clienteId}/spedy`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setMunicipioIntegrado(data.municipioIntegrado ?? null)
        setMunicipioNome(data.municipioNome ?? null)
      })
      .catch(err => console.error('[crm/notas-fiscais] falha ao buscar:', err))
  }, [clienteId, spedyOk])

  // Polling automático quando há notas em processamento — evita o usuário ter que recarregar manualmente
  useEffect(() => {
    const temNotasAtivas = notas.some(n => n.status === 'enviando' || n.status === 'processando')
    if (!temNotasAtivas) return
    const intervalo = setInterval(() => fetchNotas(true), 8000)
    return () => clearInterval(intervalo)
  }, [notas, fetchNotas])

  async function emitir() {
    if (!form.descricao || !form.valor || !form.tomadorNome || !form.tomadorCpfCnpj) {
      toast.error('Preencha todos os campos obrigatórios para continuar.')
      return
    }
    const valor = parseFloat(form.valor.replace(',', '.'))
    if (isNaN(valor) || valor <= 0) { toast.error('Informe um valor válido para a nota fiscal.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/crm/notas-fiscais', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId,
          descricao:        form.descricao,
          valor,
          tomadorNome:      form.tomadorNome,
          tomadorCpfCnpj:   form.tomadorCpfCnpj.replace(/\D/g, ''),
          tomadorEmail:     form.tomadorEmail     || undefined,
          tomadorMunicipio: form.tomadorMunicipio || undefined,
          tomadorEstado:    form.tomadorEstado    || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.erro ?? data.error ?? 'Não foi possível emitir a nota. Tente novamente.'); return }
      toast.success('NFS-e enviada para processamento.')
      setShowModal(false)
      setForm(INITIAL_FORM)
    } catch {
      toast.error('Não foi possível emitir a nota fiscal. Verifique sua conexão e tente novamente.')
    } finally {
      setSaving(false)
      void fetchNotas(true)  // FIX: sempre recarregar — nota pode já estar salva se houve timeout
    }
  }

  async function cancelar(notaId: string) {
    if (justificativa.length < 15) { toast.error('A justificativa deve ter pelo menos 15 caracteres.'); return }
    setCancelando(notaId)
    try {
      const res = await fetch(`/api/crm/notas-fiscais/${notaId}/cancelar`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justificativa }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error ?? data.erro ?? 'Não foi possível cancelar a nota. Tente novamente.'); return }
      toast.success('Nota cancelada.')
      setShowCancelarModal(null)
      setJustificativa('')
    } catch {
      toast.error('Não foi possível cancelar a nota. Verifique sua conexão e tente novamente.')
    } finally {
      setCancelando(null)
      void fetchNotas(true)  // FIX: sempre recarregar — status pode já ter mudado se houve timeout
    }
  }

  async function entregar(notaId: string, canal: 'whatsapp' | 'email') {
    if (entregando) return  // previne duplo clique
    setEntregando(notaId)
    try {
      const res = await fetch(`/api/crm/notas-fiscais/${notaId}/entregar`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canal }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Não foi possível entregar a nota. Tente novamente.'); return }
      toast.success(`Nota enviada via ${canal === 'whatsapp' ? 'WhatsApp' : 'e-mail'}.`)
    } catch {
      toast.error('Não foi possível entregar a nota. Verifique sua conexão e tente novamente.')
    } finally {
      setEntregando(null)
    }
  }

  function abrirReemitirModal(nota: NotaFiscal) {
    setReemitirForm({
      descricao:        nota.descricao,
      valor:            String(Number(nota.valorTotal).toFixed(2)).replace('.', ','),
      tomadorNome:      nota.tomadorNome,
      tomadorCpfCnpj:   nota.tomadorCpfCnpj,
      tomadorEmail:     nota.tomadorEmail     ?? '',
      tomadorMunicipio: nota.tomadorMunicipio ?? '',
      tomadorEstado:    nota.tomadorEstado    ?? '',
    })
    setShowReemitirModal(nota.id)
  }

  async function reemitir() {
    if (!showReemitirModal) return
    if (!reemitirForm.descricao || !reemitirForm.valor || !reemitirForm.tomadorNome || !reemitirForm.tomadorCpfCnpj) {
      toast.error('Preencha todos os campos obrigatórios para continuar.'); return
    }
    const valor = parseFloat(reemitirForm.valor.replace(',', '.'))
    if (isNaN(valor) || valor <= 0) { toast.error('Informe um valor válido para a nota fiscal.'); return }
    setReemitirSaving(true)
    try {
      const res = await fetch(`/api/crm/notas-fiscais/${showReemitirModal}/reemitir`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descricao:        reemitirForm.descricao,
          valor,
          tomadorNome:      reemitirForm.tomadorNome,
          tomadorCpfCnpj:   reemitirForm.tomadorCpfCnpj.replace(/\D/g, ''),
          tomadorEmail:     reemitirForm.tomadorEmail     || undefined,
          tomadorMunicipio: reemitirForm.tomadorMunicipio || undefined,
          tomadorEstado:    reemitirForm.tomadorEstado    || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Não foi possível reemitir a nota. Tente novamente.'); return }
      toast.success('NFS-e reenviada para processamento.')
      setShowReemitirModal(null)
      setReemitirForm(INITIAL_FORM)
    } catch {
      toast.error('Não foi possível reemitir a nota fiscal. Verifique sua conexão e tente novamente.')
    } finally {
      setReemitirSaving(false)
      void fetchNotas(true)  // FIX: sempre recarregar — nota pode já estar salva se houve timeout
    }
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
      toast.error('Não foi possível sincronizar com a Spedy. Verifique sua conexão e tente novamente.')
    } finally {
      setSincronizando(false)
    }
  }

  if (!escritorioSpedyOk) return <SpedyNaoConfigurado />
  if (!spedyOk) return <EmpresaNaoCadastrada sincronizando={sincronizando} onSincronizar={handleSincronizarSpedy} />

  const notaEmReemissao = notas.find(n => n.id === showReemitirModal)
  const notaEmCancelamento = notas.find(n => n.id === showCancelarModal)

  return (
    <div className="space-y-4">
      {/* Badge de cobertura do município na Spedy */}
      {municipioIntegrado === false && municipioNome && (
        <div className="flex items-center gap-2 rounded-xl border border-orange-status/30 bg-orange-status/10 px-4 py-2.5">
          <span className="material-symbols-outlined text-[16px] text-orange-status" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
          <p className="text-[13px] text-orange-status">
            Município <span className="font-semibold">{municipioNome}</span> não possui integração NFS-e na Spedy. A emissão pode falhar.
          </p>
        </div>
      )}
      {municipioIntegrado === true && municipioNome && (
        <div className="flex items-center gap-2 rounded-xl border border-green-status/30 bg-green-status/10 px-4 py-2.5">
          <span className="material-symbols-outlined text-[16px] text-green-status" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          <p className="text-[13px] text-green-status">
            Município <span className="font-semibold">{municipioNome}</span> com emissão NFS-e disponível na Spedy.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-on-surface-variant">
          {total === 0
            ? 'Nenhuma nota fiscal emitida'
            : total > notas.length
              ? `Exibindo ${notas.length} de ${total} nota${total > 1 ? 's' : ''}`
              : `${total} nota${total > 1 ? 's' : ''} emitida${total > 1 ? 's' : ''}`}
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Nova NFS-e
        </button>
      </div>

      {/* Lista */}
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
          {notas.map(nota => (
            <NotaFiscalCard
              key={nota.id}
              nota={nota}
              onEntregar={entregar}
              onCancelarClick={id => { setShowCancelarModal(id); setJustificativa('') }}
              onReemitirClick={abrirReemitirModal}
              entregando={entregando === nota.id}
            />
          ))}
        </div>
      )}

      {showModal && (
        <EmitirNfseModal
          form={form}
          setForm={setForm}
          saving={saving}
          onClose={() => setShowModal(false)}
          onSubmit={emitir}
        />
      )}

      {showReemitirModal && (
        <ReemitirNfseModal
          erroMensagem={notaEmReemissao?.erroMensagem}
          form={reemitirForm}
          setForm={setReemitirForm}
          saving={reemitirSaving}
          onClose={() => setShowReemitirModal(null)}
          onSubmit={reemitir}
        />
      )}

      {showCancelarModal && notaEmCancelamento && (
        <CancelarNfseModal
          notaId={showCancelarModal}
          autorizadaEm={notaEmCancelamento.autorizadaEm}
          justificativa={justificativa}
          onJustificativaChange={setJustificativa}
          cancelando={!!cancelando}
          onClose={() => { setShowCancelarModal(null); setJustificativa('') }}
          onConfirmar={cancelar}
        />
      )}
    </div>
  )
}
