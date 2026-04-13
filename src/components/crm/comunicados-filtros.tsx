'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useRef, useState, useEffect } from 'react'

const TIPOS = [
  { value: '',            label: 'Todos' },
  { value: 'informativo', label: 'Informativo' },
  { value: 'alerta',      label: 'Alerta' },
  { value: 'obrigacao',   label: 'Obrigação' },
  { value: 'promocional', label: 'Promoção' },
]

type Secao = 'ativos' | 'expirados' | 'rascunhos'

interface Props {
  totalAtivos:    number
  totalExpirados: number
  totalRascunhos: number
}

export function ComunicadosFiltros({ totalAtivos, totalExpirados, totalRascunhos }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const sp       = useSearchParams()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const secaoAtual = (sp.get('secao') ?? 'ativos') as Secao
  const tipoAtual  = sp.get('tipo') ?? ''
  const buscaAtual = sp.get('busca') ?? ''

  // Input controlado — sincroniza com URL ao mudar filtros externos
  const [inputBusca, setInputBusca] = useState(buscaAtual)
  useEffect(() => {
    setInputBusca(buscaAtual)
  }, [buscaAtual])

  // Cancela timeout pendente ao desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function navegar(patch: Record<string, string>) {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    next.delete('pagina')
    router.push(`${pathname}?${next.toString()}`)
  }

  function handleSecao(s: Secao) {
    // Preserva tipo e busca ao trocar seção; reseta apenas a página
    navegar({ secao: s })
  }

  function handleTipo(t: string) {
    navegar({ tipo: t })
  }

  function handleBusca(value: string) {
    setInputBusca(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => navegar({ busca: value }), 400)
  }

  const SECOES: { value: Secao; label: string; count: number }[] = [
    { value: 'ativos',    label: 'Publicados', count: totalAtivos },
    { value: 'expirados', label: 'Expirados',  count: totalExpirados },
    { value: 'rascunhos', label: 'Rascunhos',  count: totalRascunhos },
  ]

  return (
    <div className="space-y-3">
      {/* Tabs de seção */}
      <div className="flex gap-1 rounded-xl bg-surface-container p-1">
        {SECOES.map(s => (
          <button
            key={s.value}
            onClick={() => handleSecao(s.value)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-all ${
              secaoAtual === s.value
                ? 'bg-card shadow-sm text-on-surface'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {s.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
              secaoAtual === s.value
                ? 'bg-primary/10 text-primary'
                : 'bg-on-surface-variant/10 text-on-surface-variant/50'
            }`}>
              {s.count}
            </span>
          </button>
        ))}
      </div>

      {/* Busca + filtro de tipo */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <span
            className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant/50"
            aria-hidden="true"
          >
            search
          </span>
          <input
            value={inputBusca}
            onChange={e => handleBusca(e.target.value)}
            placeholder="Buscar por título…"
            className="h-9 w-full rounded-xl border border-outline-variant/25 bg-surface-container pl-8 pr-3 text-[13px] text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TIPOS.map(t => (
            <button
              key={t.value}
              onClick={() => handleTipo(t.value)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${
                tipoAtual === t.value
                  ? 'bg-primary text-white'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
