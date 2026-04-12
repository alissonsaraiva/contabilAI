import { prisma } from '@/lib/prisma'
import { searchClienteIds } from '@/lib/search'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const buscarDadosClienteTool: Tool = {
  definition: {
    name: 'buscarDadosCliente',
    description: 'Busca dados completos de um cliente: cadastro, plano, status, responsável, tarefas em aberto e últimas interações. Use quando o operador perguntar sobre um cliente específico pelo nome, CPF, CNPJ ou email.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente (quando já disponível no contexto).',
        },
        busca: {
          type: 'string',
          description: 'Nome, CPF, CNPJ ou email do cliente para busca textual.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Buscar dados do cliente',
    descricao: 'Retorna perfil completo por nome, CPF, CNPJ ou e-mail — plano, status, últimas tarefas e interações.',
    categoria: 'Clientes',
    canais: ['crm', 'whatsapp', 'portal'],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId = (input.clienteId as string | undefined) ?? ctx.clienteId
    let busca       = input.busca as string | undefined

    if (!clienteId && !busca) {
      return {
        sucesso: false,
        erro: 'Forneça clienteId ou busca (nome/CPF/CNPJ/email).',
        resumo: 'Não foi possível buscar o cliente: nenhum identificador fornecido.',
      }
    }

    // Segurança: canais não-CRM (portal, whatsapp, onboarding) só podem consultar
    // o cliente vinculado ao contexto da sessão — busca textual é bloqueada para
    // evitar vazamento de dados entre clientes.
    if (ctx.solicitanteAI !== 'crm') {
      if (!clienteId) {
        return {
          sucesso: false,
          erro: 'Identificação do cliente não disponível neste canal.',
          resumo: 'Não foi possível buscar o cliente: contexto de cliente não identificado.',
        }
      }
      // Força lookup exclusivo por clienteId — ignora qualquer parâmetro de busca textual
      // que poderia retornar dados de outro cliente.
      busca = undefined
    }

    // Normaliza CPF/CNPJ removendo formatação antes de buscar
    const buscaNorm = busca ? busca.replace(/[.\-\/\s]/g, '') : undefined

    const incluirCobranca = {
      cobrancasAsaas: {
        where:   { status: { in: ['PENDING', 'OVERDUE'] as import('@prisma/client').AsaasStatusCobranca[] } },
        orderBy: { vencimento: 'asc' as const },
        take:    1,
        select:  { id: true, valor: true, vencimento: true, status: true, formaPagamento: true, pixCopiaECola: true, linkBoleto: true },
      },
    }

    const incluirEmpresas = {
      empresa: true,
      clienteEmpresas: {
        include: {
          empresa: {
            select: {
              id: true, cnpj: true, razaoSocial: true, nomeFantasia: true,
              regime: true, procuracaoRFAtiva: true, procuracaoRFVerificadaEm: true,
            },
          },
        },
        orderBy: { principal: 'desc' as const },
      },
    }

    const cliente = clienteId
      ? await prisma.cliente.findUnique({
          where: { id: clienteId },
          include: {
            ...incluirEmpresas,
            responsavel: { select: { nome: true } },
            interacoes: {
              where: ctx.solicitanteAI === 'portal'
                ? { tipo: { in: ['email_enviado', 'email_recebido', 'documento_enviado', 'status_mudou', 'whatsapp_enviado'] } }
                : undefined,
              select: { tipo: true, titulo: true, criadoEm: true },
              orderBy: { criadoEm: 'desc' },
              take: 5,
            },
            ...incluirCobranca,
          },
        })
      : await prisma.cliente.findFirst({
          where: {
            id: { in: await searchClienteIds(busca!, buscaNorm) },
          },
          include: {
            ...incluirEmpresas,
            responsavel: { select: { nome: true } },
            interacoes: {
              where: ctx.solicitanteAI === 'portal'
                ? { tipo: { in: ['email_enviado', 'email_recebido', 'documento_enviado', 'status_mudou', 'whatsapp_enviado'] } }
                : undefined,
              select: { tipo: true, titulo: true, criadoEm: true },
              orderBy: { criadoEm: 'desc' },
              take: 5,
            },
            ...incluirCobranca,
          },
        })

    if (!cliente) {
      return {
        sucesso: false,
        erro: 'Cliente não encontrado.',
        resumo: `Cliente não encontrado${busca ? ` para a busca "${busca}"` : ''}.`,
      }
    }

    type EmpresaInfo = {
      id?: string; cnpj?: string | null; razaoSocial?: string | null; nomeFantasia?: string | null;
      regime?: string | null; procuracaoRFAtiva?: boolean; procuracaoRFVerificadaEm?: Date | null
    }
    type VinculoEmpresa = { principal: boolean; empresa: EmpresaInfo }

    // Prefere relação N:N (clienteEmpresas); cai no legado 1:1 se vazio
    const vinculosEmpresas: VinculoEmpresa[] = (() => {
      const vinculos = (cliente as any).clienteEmpresas as VinculoEmpresa[] | undefined
      if (vinculos && vinculos.length > 0) return vinculos
      const legado = (cliente as any).empresa as EmpresaInfo | null
      return legado ? [{ principal: true, empresa: legado }] : []
    })()

    const empresaPrincipal = vinculosEmpresas.find(v => v.principal)?.empresa ?? vinculosEmpresas[0]?.empresa ?? null

    const cobrancaAberta = (cliente as any).cobrancasAsaas?.[0] as {
      id: string; valor: unknown; vencimento: Date; status: string;
      formaPagamento: string; pixCopiaECola: string | null; linkBoleto: string | null
    } | undefined

    const linhas: string[] = [
      `Cliente: ${cliente.nome}`,
      `Status: ${cliente.status}`,
      `Plano: ${cliente.planoTipo} — R$ ${cliente.valorMensal}/mês`,
      `Regime (principal): ${empresaPrincipal?.regime ?? 'não informado'}`,
      `Email: ${cliente.email}`,
      `Telefone: ${cliente.telefone}`,
      `Responsável: ${(cliente as any).responsavel?.nome ?? 'não atribuído'}`,
      `Vencimento: dia ${cliente.vencimentoDia}`,
      `Pagamento: ${cliente.formaPagamento}`,
    ]

    // Lista todas as empresas vinculadas
    if (vinculosEmpresas.length > 0) {
      linhas.push('', `Empresas (${vinculosEmpresas.length}):`)
      vinculosEmpresas.forEach((v, i) => {
        const e = v.empresa
        const nome = e.razaoSocial ?? e.nomeFantasia ?? '(sem nome)'
        const tag  = v.principal ? ' [PRINCIPAL]' : ''
        linhas.push(`  ${i + 1}. ${nome}${tag}`)
        if (e.cnpj)   linhas.push(`     CNPJ: ${e.cnpj}`)
        if (e.regime) linhas.push(`     Regime: ${e.regime}`)
        if (e.regime === 'MEI') {
          linhas.push(`     Procuração RF (e-CAC): ${e.procuracaoRFAtiva ? 'ativa' : 'PENDENTE'}`)
          if (e.procuracaoRFVerificadaEm)
            linhas.push(`     Última verificação RF: ${new Date(e.procuracaoRFVerificadaEm).toLocaleDateString('pt-BR')}`)
        }
      })
    }

    // Situação financeira — inclui cobrança em aberto se existir
    if (cobrancaAberta) {
      const hoje       = new Date()
      const valorStr   = Number(cobrancaAberta.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      const vencStr    = new Date(cobrancaAberta.vencimento).toLocaleDateString('pt-BR')
      const diasAtraso = cobrancaAberta.vencimento < hoje
        ? Math.floor((hoje.getTime() - new Date(cobrancaAberta.vencimento).getTime()) / 86400000)
        : 0
      linhas.push(
        '',
        `Cobrança em aberto: ${valorStr} — vencto ${vencStr}${diasAtraso > 0 ? ` (${diasAtraso}d em atraso)` : ''}`,
        cobrancaAberta.pixCopiaECola
          ? `PIX: ${cobrancaAberta.pixCopiaECola}`
          : cobrancaAberta.linkBoleto
          ? `Boleto: ${cobrancaAberta.linkBoleto}`
          : 'Sem PIX/boleto registrado — gerar segunda via se necessário',
      )
    } else if (cliente.status === 'inadimplente') {
      linhas.push('', 'Situação financeira: inadimplente — nenhuma cobrança Asaas registrada (cliente sem subscription?)')
    }

    const interacoes = (cliente as any).interacoes as Array<{ tipo: string; titulo: string | null; criadoEm: Date }>
    if (interacoes.length > 0) {
      linhas.push('', 'Últimas interações:')
      interacoes.forEach(i => {
        const data = i.criadoEm.toLocaleDateString('pt-BR')
        linhas.push(`• ${data} — ${i.tipo}${i.titulo ? `: ${i.titulo}` : ''}`)
      })
    }

    return {
      sucesso: true,
      dados: cliente,
      resumo: linhas.join('\n'),
    }
  },
}

registrarTool(buscarDadosClienteTool)
