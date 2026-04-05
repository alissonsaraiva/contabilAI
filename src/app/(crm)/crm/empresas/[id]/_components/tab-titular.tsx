import Link from 'next/link'
import type { PlanoTipo, FormaPagamento, Regime, StatusCliente } from '@prisma/client'
import { InfoCard, InfoRow, EmptyState } from '@/components/crm/info-card'
import { EditarClienteButton } from '@/components/crm/editar-cliente-button'
import { PLANO_LABELS, PLANO_COLORS, FORMA_PAGAMENTO_LABELS, STATUS_CLIENTE_LABELS } from '@/types'
import { formatCPF, formatBRL, formatDate, formatTelefone } from '@/lib/utils'

type Props = {
  cliente: {
    id: string
    nome: string
    cpf: string
    email: string
    telefone: string
    whatsapp: string | null
    rg: string | null
    dataNascimento: Date | null
    estadoCivil: string | null
    profissao: string | null
    nacionalidade: string | null
    tipoContribuinte: string
    planoTipo: PlanoTipo
    valorMensal: number
    vencimentoDia: number
    formaPagamento: FormaPagamento
    cep: string | null
    logradouro: string | null
    numero: string | null
    complemento: string | null
    bairro: string | null
    cidade: string | null
    uf: string | null
    status: StatusCliente
    observacoesInternas: string | null
    leadId: string | null
    dataInicio: Date | null
    inativadoEm: Date | null
    reativadoEm: Date | null
    motivoInativacao: string | null
    responsavel: { nome: string } | null
  } | null
  empresa: {
    cnpj: string | null
    razaoSocial: string | null
    regime: Regime | null
  }
}

export function TabTitular({ cliente, empresa }: Props) {
  if (!cliente) {
    return <EmptyState icon="person" msg="Nenhum titular vinculado a esta empresa" />
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-end">
        <EditarClienteButton cliente={{
          id: cliente.id,
          nome: cliente.nome,
          cpf: cliente.cpf,
          email: cliente.email,
          telefone: cliente.telefone,
          whatsapp: cliente.whatsapp,
          rg: cliente.rg,
          dataNascimento: cliente.dataNascimento ? cliente.dataNascimento.toISOString() : null,
          estadoCivil: cliente.estadoCivil ?? null,
          profissao: cliente.profissao ?? null,
          nacionalidade: cliente.nacionalidade ?? null,
          tipoContribuinte: cliente.tipoContribuinte,
          planoTipo: cliente.planoTipo,
          valorMensal: cliente.valorMensal,
          vencimentoDia: cliente.vencimentoDia,
          formaPagamento: cliente.formaPagamento,
          cnpj: empresa.cnpj ?? null,
          razaoSocial: empresa.razaoSocial ?? null,
          regime: empresa.regime ?? null,
          cep: cliente.cep,
          logradouro: cliente.logradouro,
          numero: cliente.numero,
          complemento: cliente.complemento,
          bairro: cliente.bairro,
          cidade: cliente.cidade,
          uf: cliente.uf,
          status: cliente.status,
          observacoesInternas: cliente.observacoesInternas,
        }} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard title="Dados pessoais" icon="person">
          <InfoRow label="Nome completo" value={cliente.nome} />
          <InfoRow label="CPF" value={formatCPF(cliente.cpf)} />
          {cliente.rg && <InfoRow label="RG" value={cliente.rg} />}
          {cliente.dataNascimento && <InfoRow label="Nascimento" value={formatDate(cliente.dataNascimento)} />}
          {cliente.estadoCivil && <InfoRow label="Estado civil" value={cliente.estadoCivil} />}
          <InfoRow label="E-mail" value={cliente.email ?? ''} />
          <InfoRow label="Telefone" value={formatTelefone(cliente.telefone)} />
          {cliente.whatsapp && <InfoRow label="WhatsApp" value={formatTelefone(cliente.whatsapp)} />}
        </InfoCard>

        <InfoCard title="Contrato" icon="contract">
          <InfoRow label="Plano" value={PLANO_LABELS[cliente.planoTipo as keyof typeof PLANO_LABELS]} />
          <InfoRow label="Valor mensal" value={formatBRL(cliente.valorMensal)} />
          <InfoRow label="Vencimento" value={`Dia ${cliente.vencimentoDia}`} />
          <InfoRow label="Pagamento" value={FORMA_PAGAMENTO_LABELS[cliente.formaPagamento as keyof typeof FORMA_PAGAMENTO_LABELS]} />
          <div className="pt-2 flex items-center justify-between">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PLANO_COLORS[cliente.planoTipo as keyof typeof PLANO_COLORS]}`}>
              {PLANO_LABELS[cliente.planoTipo as keyof typeof PLANO_LABELS]}
            </span>
            <Link
              href={`/crm/clientes/${cliente.id}`}
              className="text-[12px] font-semibold text-primary hover:opacity-80 flex items-center gap-1"
            >
              Ver perfil completo
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </Link>
          </div>
        </InfoCard>

        {(cliente.cep || cliente.cidade) && (
          <InfoCard title="Endereço" icon="location_on">
            {cliente.logradouro && (
              <InfoRow
                label="Logradouro"
                value={`${cliente.logradouro}, ${cliente.numero ?? 's/n'}${cliente.complemento ? ` — ${cliente.complemento}` : ''}`}
              />
            )}
            {cliente.bairro && <InfoRow label="Bairro" value={cliente.bairro} />}
            {cliente.cidade && <InfoRow label="Cidade" value={[cliente.cidade, cliente.uf].filter(Boolean).join('/')} />}
            {cliente.cep && <InfoRow label="CEP" value={cliente.cep} />}
          </InfoCard>
        )}

        <InfoCard title="Gestão" icon="manage_accounts">
          <InfoRow label="Status" value={STATUS_CLIENTE_LABELS[cliente.status as keyof typeof STATUS_CLIENTE_LABELS] ?? cliente.status} />
          {cliente.responsavel && <InfoRow label="Responsável" value={cliente.responsavel.nome ?? ''} />}
          {cliente.dataInicio && <InfoRow label="Cliente desde" value={formatDate(cliente.dataInicio)} />}
          {cliente.inativadoEm && <InfoRow label="Inativado em" value={formatDate(cliente.inativadoEm)} />}
          {cliente.reativadoEm && <InfoRow label="Reativado em" value={formatDate(cliente.reativadoEm)} />}
          {cliente.motivoInativacao && (
            <div className="pt-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Motivo inativação</p>
              <p className="mt-1 text-sm leading-relaxed text-on-surface">{cliente.motivoInativacao}</p>
            </div>
          )}
          {cliente.observacoesInternas && (
            <div className="pt-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Observações</p>
              <p className="mt-1 text-sm leading-relaxed text-on-surface">{cliente.observacoesInternas}</p>
            </div>
          )}
        </InfoCard>
      </div>
    </>
  )
}
