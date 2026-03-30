'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

const CATEGORIAS = [
  { value: 'geral',          label: 'Geral',              desc: 'Documentos gerais, contratos, correspondências' },
  { value: 'nota_fiscal',    label: 'Nota Fiscal',        desc: 'NF-e, NFS-e, notas de produto ou serviço' },
  { value: 'imposto_renda',  label: 'Imposto de Renda',   desc: 'DIRPF, informe de rendimentos, DIRF' },
  { value: 'guias_tributos', label: 'Guias / Tributos',   desc: 'DAS, DARF, GNRE, GPS, parcelamentos' },
  { value: 'relatorios',     label: 'Relatórios',         desc: 'Balancete, DRE, fluxo de caixa, relatórios contábeis' },
  { value: 'outros',         label: 'Outros',             desc: 'Documentos que não se encaixam nas demais categorias' },
]

type Props = {
  clienteId: string
  empresaId: string
}

export function EmpresaDocumentoUpload({ clienteId, empresaId }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [tipo, setTipo] = useState('')
  const [categoria, setCategoria] = useState('geral')

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('arquivo', file)
      fd.append('tipo', tipo.trim() || file.name)
      fd.append('categoria', categoria)
      fd.append('empresaId', empresaId)

      const res = await fetch(`/api/crm/clientes/${clienteId}/documentos`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) throw new Error()
      toast.success('Documento enviado!')
      router.refresh()
    } catch {
      toast.error('Erro ao enviar documento')
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const categoriaDesc = CATEGORIAS.find(c => c.value === categoria)?.desc ?? ''

  return (
    <div className="flex flex-wrap items-start gap-2">
      <input
        type="text"
        placeholder="Tipo (ex: Guia DAS, DCTF...)"
        value={tipo}
        onChange={e => setTipo(e.target.value)}
        className="h-9 w-48 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-3 text-[13px] text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10"
      />
      <div className="flex flex-col gap-0.5">
        <select
          value={categoria}
          onChange={e => setCategoria(e.target.value)}
          className="h-9 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-3 text-[13px] text-on-surface focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10 cursor-pointer"
        >
          {CATEGORIAS.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        {categoriaDesc && (
          <p className="text-[11px] text-on-surface-variant/50 px-1">{categoriaDesc}</p>
        )}
      </div>
      <label className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors cursor-pointer ${
        loading
          ? 'bg-primary/50 text-white cursor-not-allowed'
          : 'bg-primary text-primary-foreground hover:bg-primary/90'
      }`}>
        {loading ? (
          <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
        ) : (
          <span className="material-symbols-outlined text-[16px]">upload</span>
        )}
        {loading ? 'Enviando...' : 'Enviar documento'}
        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          disabled={loading}
          onChange={handleChange}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.xml"
        />
      </label>
    </div>
  )
}
