'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { CobrancaAberta, CobrancaHistorico, DasMEIPortal, LimiteMEIData } from './types'

type HookParams = {
  formaPagamento: string
  vencimentoDia: number
  regime?: string | null
}

export function usePortalFinanceiro({ formaPagamento, vencimentoDia, regime }: HookParams) {
  // ─── Cobrança principal ──────────────────────────────────────────────────
  const [cobrancaAberta, setCobrancaAberta] = useState<CobrancaAberta | null | undefined>(undefined)
  const [historico, setHistorico]   = useState<CobrancaHistorico[]>([])
  const [loading, setLoading]       = useState(true)
  const [copiado, setCopiado]       = useState(false)
  const [segundaViaLoading, setSegundaViaLoading] = useState(false)
  const [erro, setErro]             = useState<string | null>(null)

  // ─── Configuração editável ───────────────────────────────────────────────
  const [diaVencimento, setDiaVencimento] = useState(vencimentoDia)
  const [forma, setForma]                 = useState<'pix' | 'boleto'>(formaPagamento as 'pix' | 'boleto')

  // Edição de vencimento
  const [editandoVencimento, setEditandoVencimento]   = useState(false)
  const [novoVencimentoDia, setNovoVencimentoDia]     = useState(vencimentoDia)
  const [salvandoVencimento, setSalvandoVencimento]   = useState(false)
  const [erroVencimento, setErroVencimento]           = useState<string | null>(null)
  const [sucessoVencimento, setSucessoVencimento]     = useState<string | null>(null)

  // Edição de forma de pagamento
  const [editandoForma, setEditandoForma]   = useState(false)
  const [novaForma, setNovaForma]           = useState<'pix' | 'boleto'>(formaPagamento as 'pix' | 'boleto')
  const [salvandoForma, setSalvandoForma]   = useState(false)
  const [erroForma, setErroForma]           = useState<string | null>(null)
  const [sucessoForma, setSucessoForma]     = useState<string | null>(null)

  // Extrato
  const [baixandoExtrato, setBaixandoExtrato] = useState(false)

  // ─── DAS MEI ─────────────────────────────────────────────────────────────
  const [dasMeis, setDasMeis]         = useState<DasMEIPortal[]>([])
  const [dasLoading, setDasLoading]   = useState(false)
  const [dasErro, setDasErro]         = useState<string | null>(null)
  const [copiandoDAS, setCopiandoDAS] = useState<string | null>(null)

  // Limite MEI
  const [limiteMei, setLimiteMei]         = useState<LimiteMEIData | null>(null)
  const [limiteMeiErro, setLimiteMeiErro] = useState(false)

  // Guard de double-click para segunda via (ref é síncrono, state é assíncrono)
  const segundaViaEmAndamento = useRef(false)

  // ─── Data fetching ───────────────────────────────────────────────────────

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const [abertaRes, historicoRes] = await Promise.all([
        fetch('/api/portal/financeiro/cobranca-aberta'),
        fetch('/api/portal/financeiro/cobrancas'),
      ])
      if (abertaRes.ok)    setCobrancaAberta(await abertaRes.json())
      if (historicoRes.ok) setHistorico(await historicoRes.json())
    } finally {
      setLoading(false)
    }
  }, [])

  const carregarDASMEI = useCallback(async () => {
    if (regime !== 'MEI') return
    setDasLoading(true)
    setDasErro(null)
    try {
      const [dasRes, limiteRes] = await Promise.all([
        fetch('/api/portal/financeiro/das-mei'),
        fetch('/api/portal/financeiro/limite-mei'),
      ])
      if (!dasRes.ok) throw new Error(`Erro ${dasRes.status} ao carregar DAS.`)
      const dasJson = await dasRes.json()
      setDasMeis(dasJson.dasMeis ?? [])
      if (limiteRes.ok) {
        const limiteJson = await limiteRes.json()
        if (limiteJson.regime === 'MEI') setLimiteMei(limiteJson)
        else setLimiteMeiErro(false)
      } else {
        setLimiteMeiErro(true)
      }
    } catch (err) {
      setLimiteMeiErro(true)
      setDasErro(err instanceof Error ? err.message : 'Não foi possível carregar as DAS MEI.')
    } finally {
      setDasLoading(false)
    }
  }, [regime])

  useEffect(() => { void carregarDados() }, [carregarDados])
  useEffect(() => { void carregarDASMEI() }, [carregarDASMEI])

  // ─── Actions ─────────────────────────────────────────────────────────────

  async function copiar(texto: string) {
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  async function gerarSegundaVia(cobrancaId: string) {
    if (segundaViaEmAndamento.current) return
    segundaViaEmAndamento.current = true
    setSegundaViaLoading(true)
    setErro(null)
    try {
      const res  = await fetch('/api/portal/financeiro/segunda-via', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cobrancaId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro ao gerar segunda via.')
      await carregarDados()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar segunda via.')
    } finally {
      setSegundaViaLoading(false)
      segundaViaEmAndamento.current = false
    }
  }

  async function salvarVencimento() {
    setSalvandoVencimento(true)
    setErroVencimento(null)
    setSucessoVencimento(null)
    try {
      const res  = await fetch('/api/portal/financeiro/vencimento', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dia: novoVencimentoDia }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro ao alterar vencimento.')
      setDiaVencimento(novoVencimentoDia)
      setEditandoVencimento(false)
      setSucessoVencimento(
        body.proximoVencimento
          ? `Próximo vencimento: ${new Date(body.proximoVencimento).toLocaleDateString('pt-BR')}`
          : 'Vencimento atualizado com sucesso.',
      )
      setTimeout(() => setSucessoVencimento(null), 5000)
      await carregarDados()
    } catch (err) {
      setErroVencimento(err instanceof Error ? err.message : 'Erro ao alterar vencimento.')
    } finally {
      setSalvandoVencimento(false)
    }
  }

  async function salvarForma() {
    setSalvandoForma(true)
    setErroForma(null)
    setSucessoForma(null)
    try {
      const res  = await fetch('/api/portal/financeiro/forma-pagamento', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ forma: novaForma }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro ao alterar forma de pagamento.')
      setForma(novaForma)
      setEditandoForma(false)
      setSucessoForma('Forma de pagamento atualizada. As cobranças em aberto serão atualizadas em breve.')
      setTimeout(() => setSucessoForma(null), 6000)
      await carregarDados()
    } catch (err) {
      setErroForma(err instanceof Error ? err.message : 'Erro ao alterar forma de pagamento.')
    } finally {
      setSalvandoForma(false)
    }
  }

  async function baixarExtrato() {
    setBaixandoExtrato(true)
    try {
      const res  = await fetch('/api/portal/financeiro/extrato')
      if (!res.ok) throw new Error('Erro ao gerar extrato.')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = 'extrato-financeiro.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao baixar extrato.')
    } finally {
      setBaixandoExtrato(false)
    }
  }

  async function copiarCodigoBarrasDAS(dasId: string, codigo: string) {
    await navigator.clipboard.writeText(codigo)
    setCopiandoDAS(dasId)
    setTimeout(() => setCopiandoDAS(null), 2000)
  }

  function iniciarEdicaoVencimento() {
    setEditandoVencimento(true)
    setNovoVencimentoDia(diaVencimento)
    setErroVencimento(null)
  }

  function cancelarEdicaoVencimento() {
    setEditandoVencimento(false)
    setErroVencimento(null)
  }

  function iniciarEdicaoForma() {
    setEditandoForma(true)
    setNovaForma(forma)
    setErroForma(null)
  }

  function cancelarEdicaoForma() {
    setEditandoForma(false)
    setErroForma(null)
  }

  return {
    // Estado principal
    loading, erro, cobrancaAberta, historico, copiado,
    segundaViaLoading,

    // Configuração
    diaVencimento, forma,

    // Edição de vencimento
    editandoVencimento, novoVencimentoDia, setNovoVencimentoDia,
    salvandoVencimento, erroVencimento, sucessoVencimento,
    iniciarEdicaoVencimento, cancelarEdicaoVencimento, salvarVencimento,

    // Edição de forma
    editandoForma, novaForma, setNovaForma,
    salvandoForma, erroForma, sucessoForma,
    iniciarEdicaoForma, cancelarEdicaoForma, salvarForma,

    // Extrato
    baixandoExtrato, baixarExtrato,

    // DAS MEI
    dasMeis, dasLoading, dasErro, copiandoDAS,
    carregarDASMEI, copiarCodigoBarrasDAS,

    // Limite MEI
    limiteMei, limiteMeiErro,

    // Actions
    copiar, gerarSegundaVia,
  }
}
