'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'

const INPUT    = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL    = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'
const TEXTAREA = INPUT + ' h-40 resize-none py-3'

type Documento = {
  id:       string
  nome:     string
  url:      string
  mimeType: string | null
  tipo:     string
  categoria: string
  criadoEm: string
}

type Props = {
  clienteId:    string
  leadId?:      string
  clienteEmail: string
  clienteNome:  string
}

function mimeIcon(mime: string | null) {
  if (!mime) return 'attach_file'
  if (mime.includes('pdf'))    return 'picture_as_pdf'
  if (mime.startsWith('image')) return 'image'
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return 'table_chart'
  if (mime.includes('word') || mime.includes('msword')) return 'description'
  return 'attach_file'
}

export function EnviarEmailDrawer({ clienteId, leadId, clienteEmail, clienteNome }: Props) {
  const router = useRouter()
  const [open, setOpen]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [form, setForm]         = useState({ para: clienteEmail, assunto: '', corpo: '' })
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [erro, setErro]         = useState('')

  // Documentos disponíveis (buscados via API)
  const [documentos,    setDocumentos]    = useState<Documento[]>([])
  const [loadingDocs,   setLoadingDocs]   = useState(false)
  const [searchDocs,    setSearchDocs]    = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce da busca
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchDocs), 350)
    return () => clearTimeout(t)
  }, [searchDocs])

  // Busca documentos quando o drawer abre OU quando muda a busca
  useEffect(() => {
    if (!open) return

    async function fetchDocs() {
      setLoadingDocs(true)
      try {
        const params = new URLSearchParams({ clienteId })
        if (leadId)          params.set('leadId', leadId)
        if (debouncedSearch) params.set('search', debouncedSearch)
        const res = await fetch(`/api/crm/documentos?${params}`)
        if (res.ok) setDocumentos(await res.json())
      } catch {
        setDocumentos([])
      } finally {
        setLoadingDocs(false)
      }
    }

    void fetchDocs()
  }, [open, clienteId, leadId, debouncedSearch])

  function reset() {
    setForm({ para: clienteEmail, assunto: '', corpo: '' })
    setSelecionados([])
    setErro('')
    setSearchDocs('')
    setDocumentos([])
  }

  function toggleDoc(id: string) {
    setSelecionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')

    if (!form.para.trim())    { setErro('Destinatário obrigatório'); return }
    if (!form.assunto.trim()) { setErro('Assunto obrigatório'); return }
    if (!form.corpo.trim())   { setErro('Corpo do e-mail obrigatório'); return }

    setLoading(true)
    try {
      const anexos = documentos
        .filter(d => selecionados.includes(d.id))
        .map(d => ({ documentoId: d.id, nome: d.nome, url: d.url, mimeType: d.mimeType ?? undefined }))

      const res = await fetch('/api/email/enviar', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId,
          leadId,
          para:    form.para.trim(),
          assunto: form.assunto.trim(),
          corpo:   form.corpo.trim(),
          anexos:  anexos.length > 0 ? anexos : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao enviar')

      toast.success('E-mail enviado com sucesso!')
      setOpen(false)
      reset()
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar e-mail'
      setErro(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-card px-4 py-2 text-[13px] font-semibold text-on-surface shadow-sm hover:bg-surface-container transition-colors"
      >
        <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>mail</span>
        Enviar e-mail
      </button>

      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0 bg-card" showCloseButton={false}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>mail</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-on-surface">Enviar e-mail</h2>
            <p className="text-[12px] text-on-surface-variant">Para {clienteNome}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 custom-scrollbar">

            {/* Para */}
            <div>
              <label className={LABEL}>Para <span className="text-error">*</span></label>
              <input
                type="email"
                className={INPUT}
                placeholder="email@cliente.com.br"
                value={form.para}
                onChange={e => setForm(f => ({ ...f, para: e.target.value }))}
              />
            </div>

            {/* Assunto */}
            <div>
              <label className={LABEL}>Assunto <span className="text-error">*</span></label>
              <input
                className={INPUT}
                placeholder="Ex: Documentos do mês de março"
                value={form.assunto}
                onChange={e => setForm(f => ({ ...f, assunto: e.target.value }))}
              />
            </div>

            {/* Corpo */}
            <div>
              <label className={LABEL}>Mensagem <span className="text-error">*</span></label>
              <textarea
                className={TEXTAREA}
                placeholder="Escreva sua mensagem..."
                value={form.corpo}
                onChange={e => setForm(f => ({ ...f, corpo: e.target.value }))}
                autoFocus
              />
            </div>

            {/* Anexos — documentos do sistema */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={LABEL + ' mb-0'}>
                  Anexar do sistema
                  <span className="ml-1.5 font-normal text-on-surface-variant/60">(opcional)</span>
                </label>
                {selecionados.length > 0 && (
                  <span className="text-[11px] font-semibold text-primary">
                    {selecionados.length} selecionado{selecionados.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Campo de busca */}
              <div className="relative mb-2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[15px] text-on-surface-variant/40">search</span>
                <input
                  type="text"
                  value={searchDocs}
                  onChange={e => setSearchDocs(e.target.value)}
                  placeholder="Buscar documentos por nome ou tipo..."
                  className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-low pl-8 pr-3 py-2 text-[12px] text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10"
                />
              </div>

              {/* Lista de documentos */}
              <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/50 max-h-48 overflow-y-auto custom-scrollbar">
                {loadingDocs ? (
                  <div className="flex items-center justify-center py-6">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
                  </div>
                ) : documentos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center px-4">
                    <span className="material-symbols-outlined text-[24px] text-on-surface-variant/20 mb-1">folder_off</span>
                    <p className="text-[12px] text-on-surface-variant/50">
                      {searchDocs ? 'Nenhum documento encontrado' : 'Nenhum documento disponível'}
                    </p>
                  </div>
                ) : (
                  <div className="p-2 space-y-0.5">
                    {documentos.map(doc => {
                      const checked = selecionados.includes(doc.id)
                      return (
                        <label
                          key={doc.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors ${checked ? 'bg-primary/8' : 'hover:bg-surface-container'}`}
                        >
                          <input
                            type="checkbox"
                            className="accent-primary shrink-0"
                            checked={checked}
                            onChange={() => toggleDoc(doc.id)}
                          />
                          <span className="material-symbols-outlined text-[15px] text-on-surface-variant/50 shrink-0">
                            {mimeIcon(doc.mimeType)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] text-on-surface truncate leading-tight">{doc.nome}</p>
                            <p className="text-[10px] text-on-surface-variant/50 truncate">{doc.tipo}</p>
                          </div>
                          <span className="text-[10px] text-on-surface-variant/40 shrink-0">
                            {new Date(doc.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Aviso portal */}
            <div className="flex items-start gap-2 rounded-xl bg-primary/5 px-4 py-3">
              <span className="material-symbols-outlined mt-0.5 text-[15px] text-primary/70" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
              <p className="text-[12px] text-on-surface-variant">
                Este e-mail ficará registrado no histórico e visível no portal do cliente.
              </p>
            </div>

            {erro && (
              <p className="rounded-xl bg-error/10 px-4 py-3 text-[13px] font-medium text-error">{erro}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-outline-variant/15 px-6 py-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {loading
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                : <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
              }
              Enviar
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
