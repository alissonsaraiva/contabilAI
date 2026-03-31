'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'

type Nivel = 'gentil' | 'urgente' | 'reforco'

type Row = {
  id:            string
  nome:          string
  nomeCliente:   string
  planoTipo:     string
  valorMensal:   number
  responsavel:   string | null
  temWhatsapp:   boolean
  cobranca: {
    id:        string
    valor:     number
    vencimento: string
    diasAtraso: number | null
  } | null
  ultimaEscalacao: {
    titulo:   string
    criadoEm: string
  } | null
}

const NIVEL_LABELS: Record<Nivel, string> = {
  gentil:  'Gentil',
  urgente: 'Urgente',
  reforco: 'Reforço Urgente',
}

const DIAS_COR = (dias: number | null | undefined) => {
  if (!dias) return 'text-muted-foreground'
  if (dias >= 15) return 'text-red-500 font-semibold'
  if (dias >= 7)  return 'text-orange-500 font-medium'
  return 'text-yellow-600'
}

export function InadimplentesClient({ rows }: { rows: Row[] }) {
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [busca,     setBusca]     = useState('')
  const [nivelModal, setNivelModal] = useState<Nivel>('gentil')
  const [modalId,   setModalId]   = useState<string | null>(null) // null = bulk
  const [isPending, startTransition] = useTransition()

  const filtrados = rows.filter(r =>
    r.nome.toLowerCase().includes(busca.toLowerCase()) ||
    r.nomeCliente.toLowerCase().includes(busca.toLowerCase())
  )

  function toggleAll() {
    const withWA = filtrados.filter(r => r.temWhatsapp).map(r => r.id)
    if (selected.size === withWA.length) setSelected(new Set())
    else setSelected(new Set(withWA))
  }

  function toggleOne(id: string) {
    const s = new Set(selected)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSelected(s)
  }

  async function enviar(clienteIds: string[], nivel: Nivel) {
    const res = await fetch('/api/crm/inadimplentes/mensagem', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ clienteIds, nivel }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Erro ao enviar mensagens')
    return json
  }

  function handleEnviar(clienteId: string | null) {
    const ids = clienteId ? [clienteId] : [...selected]
    if (!ids.length) return
    startTransition(async () => {
      try {
        const { enviados, erros } = await enviar(ids, nivelModal)
        toast.success(`${enviados} mensagem(ns) enviada(s)`)
        if (erros?.length) toast.error(`${erros.length} falha(s): ${erros.map((e: any) => e.erro).join(', ')}`)
        setModalId(null)
        setSelected(new Set())
      } catch (err: any) {
        toast.error(err.message ?? 'Erro ao enviar mensagens')
      }
    })
  }

  const hasSelected = selected.size > 0

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Buscar cliente..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="h-9 rounded-lg border bg-card px-3 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {hasSelected && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">{selected.size} selecionado(s)</span>
            <select
              value={nivelModal}
              onChange={e => setNivelModal(e.target.value as Nivel)}
              className="h-9 rounded-lg border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="gentil">Gentil</option>
              <option value="urgente">Urgente</option>
              <option value="reforco">Reforço Urgente</option>
            </select>
            <button
              onClick={() => handleEnviar(null)}
              disabled={isPending}
              className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? 'Enviando…' : `Enviar para ${selected.size}`}
            </button>
          </div>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === filtrados.filter(r => r.temWhatsapp).length}
                  onChange={toggleAll}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cliente</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Plano</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground hidden md:table-cell">Valor</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Dias atraso</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Último contato</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum cliente inadimplente encontrado.
                </td>
              </tr>
            )}
            {filtrados.map(row => (
              <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  {row.temWhatsapp && (
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      className="rounded"
                    />
                  )}
                </td>

                <td className="px-4 py-3">
                  <div className="font-medium">{row.nome}</div>
                  {row.responsavel && (
                    <div className="text-xs text-muted-foreground">{row.responsavel}</div>
                  )}
                </td>

                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize">
                    {row.planoTipo}
                  </span>
                </td>

                <td className="px-4 py-3 text-right hidden md:table-cell">
                  {row.cobranca
                    ? Number(row.cobranca.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : <span className="text-muted-foreground">—</span>
                  }
                </td>

                <td className={`px-4 py-3 text-right ${DIAS_COR(row.cobranca?.diasAtraso)}`}>
                  {row.cobranca?.diasAtraso != null ? `${row.cobranca.diasAtraso}d` : '—'}
                </td>

                <td className="px-4 py-3 hidden lg:table-cell">
                  {row.ultimaEscalacao ? (
                    <div>
                      <div className="text-xs font-medium">
                        {row.ultimaEscalacao.titulo.replace(/^Cobrança [^ ]+ — /, '')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(row.ultimaEscalacao.criadoEm).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Nenhum</span>
                  )}
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/crm/clientes/${row.id}`}
                      className="h-7 rounded-md border px-2 text-xs font-medium hover:bg-muted transition-colors inline-flex items-center"
                    >
                      Ver
                    </Link>

                    {row.temWhatsapp && (
                      <IndividualSendButton
                        row={row}
                        onSend={handleEnviar}
                        isPending={isPending}
                        nivelDefault={nivelModal}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtrados.length} cliente(s) — o escalonamento automático roda diariamente às 9h (D+3 gentil, D+7 urgente, D+15 reforço).
      </p>
    </div>
  )
}

// ─── Botão individual com seletor de nível ───────────────────────────────────

function IndividualSendButton({
  row,
  onSend,
  isPending,
  nivelDefault,
}: {
  row: Row
  onSend: (id: string | null) => void
  isPending: boolean
  nivelDefault: Nivel
}) {
  const [open,  setOpen]  = useState(false)
  const [nivel, setNivel] = useState<Nivel>(nivelDefault)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-7 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1"
      >
        📱 Cobrar
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={nivel}
        onChange={e => setNivel(e.target.value as Nivel)}
        className="h-7 rounded-md border bg-card px-1 text-xs focus:outline-none"
      >
        <option value="gentil">Gentil</option>
        <option value="urgente">Urgente</option>
        <option value="reforco">Reforço</option>
      </select>
      <button
        onClick={() => { onSend(row.id); setOpen(false) }}
        disabled={isPending}
        className="h-7 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        ✓
      </button>
      <button
        onClick={() => setOpen(false)}
        className="h-7 rounded-md border px-2 text-xs hover:bg-muted"
      >
        ✕
      </button>
    </div>
  )
}
