'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { DocumentoPicker, type DocSistema } from '@/components/crm/documento-picker'

const STATUS_OPCOES = [
  { value: 'em_andamento',       label: 'Em andamento' },
  { value: 'aguardando_cliente', label: 'Aguardando cliente' },
  { value: 'resolvida',          label: 'Marcar como resolvida' },
]

const CATEGORIAS = [
  { value: '',               label: 'Detectar automaticamente' },
  { value: 'geral',          label: 'Geral' },
  { value: 'nota_fiscal',    label: 'Nota Fiscal' },
  { value: 'guias_tributos', label: 'Guias / Tributos' },
  { value: 'imposto_renda',  label: 'Imposto de Renda' },
  { value: 'relatorios',     label: 'Relatórios' },
  { value: 'outros',         label: 'Outros' },
]

type SocioContato = {
  id:       string
  nome:     string
  telefone: string  // número WhatsApp cadastrado
}

type Props = {
  ordemId:      string
  clienteId:    string
  statusAtual:  string
  temResposta:  boolean
  clienteNome:  string
  clienteEmail?: string | null
  clienteWpp?:  string | null
  socios?:      SocioContato[]
}

/** Arquivo selecionado: pode ser um File novo OU um doc já existente no sistema */
type AnexoSelecionado =
  | { tipo: 'upload'; file: File }
  | { tipo: 'sistema'; doc: DocSistema }
  | null

export function ChamadoResponderForm({ ordemId, clienteId, statusAtual, temResposta, clienteNome, clienteEmail, clienteWpp, socios = [] }: Props) {
  const router = useRouter()

  const [resposta,      setResposta]      = useState('')
  const [notaInterna,   setNotaInterna]   = useState('')
  const [novoStatus,    setNovoStatus]    = useState(statusAtual)
  const [loading,       setLoading]       = useState(false)

  // Arquivo / documento
  const fileRef = useRef<HTMLInputElement>(null)
  const [anexo,       setAnexo]       = useState<AnexoSelecionado>(null)
  const [categoria,   setCategoria]   = useState('')
  const [pickerOpen,  setPickerOpen]  = useState(false)

  // Canais
  const [emailAtivo,   setEmailAtivo]   = useState(false)
  const [emailAssunto, setEmailAssunto] = useState('')
  const [emailCorpo,   setEmailCorpo]   = useState('')
  const [wppAtivo,     setWppAtivo]     = useState(false)
  const [wppMensagem,  setWppMensagem]  = useState('')
  // Destinatários WhatsApp selecionados: titular + sócios
  const [wppDests, setWppDests] = useState<Set<string>>(
    clienteWpp ? new Set(['__titular__']) : new Set()
  )

  function toggleDest(id: string) {
    setWppDests(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function removerAnexo() {
    setAnexo(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleDocSistema(doc: DocSistema) {
    setAnexo({ tipo: 'sistema', doc })
  }

  const isResolucao  = novoStatus === 'resolvida'
  const hasAnexo     = anexo !== null
  const hasResposta  = resposta.trim().length > 0
  const hasNota      = notaInterna.trim().length > 0
  const hasChanges   = hasResposta || hasAnexo || hasNota || novoStatus !== statusAtual

  // Label dinâmico do botão de submit
  const submitLabel = isResolucao
    ? 'Resolver chamado'
    : hasResposta || hasAnexo
      ? 'Enviar resposta'
      : hasNota
        ? 'Salvar nota'
        : 'Salvar'

  // Label do arquivo selecionado
  const anexoLabel = !anexo ? null
    : anexo.tipo === 'upload' ? anexo.file.name
    : anexo.doc.nome

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hasChanges) return
    setLoading(true)

    try {
      // Resolução com arquivo ou canais: usa multipart
      if (hasAnexo || (isResolucao && (emailAtivo || wppAtivo))) {
        const form = new FormData()
        form.append('resposta',       resposta.trim())
        if (categoria)  form.append('categoria', categoria)

        // Arquivo: upload novo OU referência ao sistema
        if (anexo?.tipo === 'upload') {
          form.append('arquivo', anexo.file)
        } else if (anexo?.tipo === 'sistema') {
          form.append('documento_id',   anexo.doc.id)
          form.append('documento_url',  anexo.doc.url)
          form.append('documento_nome', anexo.doc.nome)
          form.append('documento_mime', anexo.doc.mimeType ?? 'application/octet-stream')
        }

        if (emailAtivo && emailAssunto && emailCorpo) {
          form.append('canal_email',   '1')
          form.append('email_assunto', emailAssunto)
          form.append('email_corpo',   emailCorpo)
        }
        if (wppAtivo && wppDests.size > 0) {
          form.append('canal_whatsapp', '1')
          form.append('wpp_mensagem',   wppMensagem)
          const adicionais = socios
            .filter(s => wppDests.has(s.id))
            .map(s => ({ nome: s.nome, telefone: s.telefone }))
          if (adicionais.length) {
            form.append('wpp_destinatarios', JSON.stringify(adicionais))
          }
        }

        const res = await fetch(`/api/crm/chamados/${ordemId}`, {
          method: 'PATCH',
          body:   form,
        })
        if (!res.ok) throw new Error()
        const data = await res.json()
        const msgs: string[] = ['Chamado resolvido!']
        if (data.documentoId)  msgs.push('Documento salvo.')
        if (data.emailOk)      msgs.push('E-mail enviado.')
        if (data.whatsappOk)   msgs.push('WhatsApp enviado.')
        toast.success(msgs.join(' '))
      } else {
        // Atualização simples JSON
        const body: Record<string, unknown> = { status: novoStatus }
        if (resposta.trim())     body.resposta     = resposta.trim()
        if (notaInterna.trim())  body.nota_interna = notaInterna.trim()
        const res = await fetch(`/api/crm/chamados/${ordemId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        })
        if (!res.ok) throw new Error()
        toast.success(
          hasNota && !hasResposta && novoStatus === statusAtual
            ? 'Nota salva.'
            : 'Chamado atualizado!'
        )
      }

      router.refresh()
      setResposta('')
      setNotaInterna('')
      setAnexo(null)
      setEmailAtivo(false)
      setWppAtivo(false)
      if (fileRef.current) fileRef.current.value = ''
    } catch {
      toast.error('Não foi possível atualizar o chamado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Picker de arquivos do sistema */}
      <DocumentoPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleDocSistema}
        clienteId={clienteId}
      />

      <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
        <h3 className="text-[14px] font-semibold text-on-surface mb-4">
          {temResposta ? 'Atualizar resposta' : 'Responder chamado'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Status */}
          <div>
            <label className="block text-[12px] font-semibold text-on-surface-variant mb-1.5">Status</label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPCOES.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setNovoStatus(s.value)}
                  className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                    novoStatus === s.value
                      ? 'bg-primary text-white'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Resposta ao cliente */}
          <div>
            <label className="block text-[12px] font-semibold text-on-surface-variant mb-1.5">
              Resposta <span className="text-on-surface-variant/50">(opcional)</span>
            </label>
            <textarea
              className="w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[13px] placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 min-h-[80px] resize-y"
              placeholder="Digite a resposta para o cliente..."
              value={resposta}
              onChange={e => setResposta(e.target.value)}
              rows={3}
            />
          </div>

          {/* Nota interna */}
          <div>
            <label className="flex items-center gap-1.5 text-[12px] font-semibold text-on-surface-variant mb-1.5">
              <span className="material-symbols-outlined text-[14px] text-amber-600/70">lock</span>
              Nota interna <span className="text-on-surface-variant/50">(só o escritório vê)</span>
            </label>
            <textarea
              className="w-full rounded-[10px] border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-[13px] placeholder:text-on-surface-variant/40 focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 min-h-[70px] resize-y"
              placeholder="Observações internas, próximos passos, histórico..."
              value={notaInterna}
              onChange={e => setNotaInterna(e.target.value)}
              rows={2}
            />
          </div>

          {/* Arquivo — upload ou do sistema */}
          <div>
            <label className="block text-[12px] font-semibold text-on-surface-variant mb-1.5">
              Anexar documento <span className="text-on-surface-variant/50">(opcional)</span>
            </label>

            {/* Arquivo selecionado */}
            {anexo ? (
              <div className="flex items-center gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2.5">
                <span className="material-symbols-outlined text-[18px] text-primary/70 shrink-0">
                  {anexo.tipo === 'sistema' ? 'folder_open' : 'attach_file'}
                </span>
                <span className="flex-1 text-[12px] text-on-surface truncate">{anexoLabel}</span>
                {anexo.tipo === 'sistema' && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    do sistema
                  </span>
                )}
                <button
                  type="button"
                  onClick={removerAnexo}
                  className="shrink-0 text-[11px] text-error/70 hover:text-error transition-colors"
                >
                  remover
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {/* Upload novo */}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-2 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">attach_file</span>
                  Fazer upload
                </button>
                {/* Do sistema */}
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-2 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">folder_open</span>
                  Do sistema
                </button>
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) setAnexo({ tipo: 'upload', file })
              }}
            />

            {/* Categoria — só aparece se tiver arquivo */}
            {hasAnexo && (
              <div className="mt-2">
                <label className="block text-[11px] font-semibold text-on-surface-variant/70 mb-1">Categoria do documento</label>
                <select
                  value={categoria}
                  onChange={e => setCategoria(e.target.value)}
                  className="rounded-[8px] border border-outline-variant/30 bg-surface-container-low px-3 py-1.5 text-[12px] text-on-surface focus:outline-none focus:border-primary/50"
                >
                  {CATEGORIAS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Canais de entrega — só quando resolvendo */}
          {isResolucao && (
            <div className="rounded-[12px] border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-4">
              <p className="text-[12px] font-semibold text-on-surface-variant/70 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px]">send</span>
                Canais de entrega ao cliente
              </p>

              {/* E-mail */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={emailAtivo}
                    onChange={e => setEmailAtivo(e.target.checked)}
                    disabled={!clienteEmail}
                    className="accent-primary h-3.5 w-3.5"
                  />
                  <span className={`text-[12px] font-semibold ${!clienteEmail ? 'text-on-surface-variant/30' : 'text-on-surface-variant'}`}>
                    Enviar por e-mail
                    {clienteEmail && <span className="ml-1 font-normal text-on-surface-variant/50">({clienteEmail})</span>}
                    {!clienteEmail && <span className="ml-1 text-[10px] font-normal text-on-surface-variant/30">— e-mail não cadastrado</span>}
                  </span>
                </label>

                {emailAtivo && (
                  <div className="mt-2 space-y-2 pl-5">
                    <input
                      type="text"
                      placeholder="Assunto do e-mail"
                      value={emailAssunto}
                      onChange={e => setEmailAssunto(e.target.value)}
                      className="w-full rounded-[8px] border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-[12px] placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50"
                    />
                    <textarea
                      placeholder="Corpo do e-mail..."
                      value={emailCorpo}
                      onChange={e => setEmailCorpo(e.target.value)}
                      rows={3}
                      className="w-full rounded-[8px] border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-[12px] placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 resize-y min-h-[70px]"
                    />
                  </div>
                )}
              </div>

              {/* WhatsApp */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={wppAtivo}
                    onChange={e => setWppAtivo(e.target.checked)}
                    disabled={!clienteWpp && socios.length === 0}
                    className="accent-primary h-3.5 w-3.5"
                  />
                  <span className={`text-[12px] font-semibold ${!clienteWpp && socios.length === 0 ? 'text-on-surface-variant/30' : 'text-on-surface-variant'}`}>
                    Enviar por WhatsApp
                    {!clienteWpp && socios.length === 0 && (
                      <span className="ml-1 text-[10px] font-normal text-on-surface-variant/30">— nenhum número cadastrado</span>
                    )}
                  </span>
                </label>

                {wppAtivo && (
                  <div className="mt-2 space-y-2 pl-5">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-on-surface-variant/60">Destinatários</p>
                      {clienteWpp && (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={wppDests.has('__titular__')}
                            onChange={() => toggleDest('__titular__')}
                            className="accent-primary h-3.5 w-3.5"
                          />
                          <span className="text-[12px] text-on-surface">
                            {clienteNome}
                            <span className="ml-1 text-on-surface-variant/50 font-normal">({clienteWpp}) · Titular</span>
                          </span>
                        </label>
                      )}
                      {socios.map(s => (
                        <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={wppDests.has(s.id)}
                            onChange={() => toggleDest(s.id)}
                            className="accent-primary h-3.5 w-3.5"
                          />
                          <span className="text-[12px] text-on-surface">
                            {s.nome}
                            <span className="ml-1 text-on-surface-variant/50 font-normal">({s.telefone}) · Sócio</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <textarea
                      placeholder="Mensagem de acompanhamento (o arquivo será enviado junto)..."
                      value={wppMensagem}
                      onChange={e => setWppMensagem(e.target.value)}
                      rows={2}
                      className="w-full rounded-[8px] border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-[12px] placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 resize-y min-h-[60px]"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-3">
            <button
              type="submit"
              disabled={loading || !hasChanges}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {loading
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                : <span className="material-symbols-outlined text-[16px]">send</span>
              }
              {submitLabel}
            </button>
          </div>
        </form>
      </Card>
    </>
  )
}
