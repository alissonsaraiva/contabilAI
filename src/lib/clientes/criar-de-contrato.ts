/**
 * Helper centralizado para converter Lead em Cliente + Empresa.
 * Usado pelos 3 pontos de conversão:
 *   - POST /api/leads/[id]/contrato (assinatura inline)
 *   - POST /api/webhooks/zapsign
 *   - POST /api/webhooks/clicksign
 *
 * Garante que toda conversão cria o par Cliente+Empresa atomicamente.
 */
import type { PrismaClient, PlanoTipo, FormaPagamento, StatusCliente, TipoContribuinte } from '@prisma/client'

type PrismaTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

export type DadosConversao = {
  leadId: string
  nome: string
  cpf: string
  email: string
  telefone: string
  planoTipo: PlanoTipo
  valorMensal: number | { toNumber(): number }
  vencimentoDia: number
  formaPagamento: FormaPagamento
  dataInicio: Date
  responsavelId?: string | null
  cidade?: string | null
  tipoContribuinte?: TipoContribuinte | null
  profissao?: string | null
  // Dados da empresa (vindos de dadosJson do lead) — só PJ
  cnpj?: string | null
  razaoSocial?: string | null
  nomeFantasia?: string | null
}

export type ResultadoConversao = {
  clienteId: string
  empresaId: string | null
}

/**
 * Cria Cliente + Empresa (se houver dados) dentro de uma transação.
 * Retorna os IDs criados para uso posterior (vincular contrato, RAG, etc.).
 */
export async function criarClienteDeContrato(
  tx: PrismaTx,
  dados: DadosConversao,
): Promise<ResultadoConversao> {
  const cliente = await tx.cliente.create({
    data: {
      leadId:         dados.leadId,
      nome:           dados.nome,
      cpf:            dados.cpf,
      email:          dados.email,
      telefone:       dados.telefone,
      whatsapp:       dados.telefone,
      planoTipo:      dados.planoTipo,
      valorMensal:    typeof dados.valorMensal === 'number'
                        ? dados.valorMensal
                        : dados.valorMensal.toNumber(),
      vencimentoDia:  dados.vencimentoDia,
      formaPagamento: dados.formaPagamento,
      status:           'ativo' as StatusCliente,
      dataInicio:       dados.dataInicio,
      tipoContribuinte: dados.tipoContribuinte ?? 'pj',
      ...(dados.cidade         && { cidade: dados.cidade }),
      ...(dados.profissao      && { profissao: dados.profissao }),
      ...(dados.responsavelId  && { responsavelId: dados.responsavelId }),
    },
  })

  const temEmpresa = dados.tipoContribuinte !== 'pf' && !!(dados.cnpj || dados.razaoSocial || dados.nomeFantasia)
  let empresaId: string | null = null

  if (temEmpresa) {
    const empresa = await tx.empresa.create({
      data: {
        ...(dados.cnpj         && { cnpj: dados.cnpj }),
        ...(dados.razaoSocial  && { razaoSocial: dados.razaoSocial }),
        ...(dados.nomeFantasia && { nomeFantasia: dados.nomeFantasia }),
      },
    })
    await tx.cliente.update({
      where: { id: cliente.id },
      data:  { empresaId: empresa.id },
    })
    empresaId = empresa.id
  }

  return { clienteId: cliente.id, empresaId }
}
