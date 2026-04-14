import Link from 'next/link'
import type { Regime, PlanoTipo, FormaPagamento, StatusCliente } from '@prisma/client'
import { InfoCard, InfoRow } from '@/components/crm/info-card'
import { REGIME_LABELS, STATUS_CLIENTE_LABELS, PLANO_LABELS, FORMA_PAGAMENTO_LABELS } from '@/types'
import { formatCNPJ, formatBRL, formatDate, formatTelefone } from '@/lib/utils'

type Props = {
  empresa: {
    razaoSocial: string | null
    nomeFantasia: string | null
    cnpj: string | null
    regime: Regime | null
    criadoEm: Date
    spedyConfigurado: boolean | null
  }
  cliente: {
    id: string
    status: StatusCliente
    planoTipo: PlanoTipo
    valorMensal: number
    vencimentoDia: number
    formaPagamento: FormaPagamento
    email: string | null
    telefone: string
    whatsapp: string | null
    responsavel: { nome: string } | null
  } | null
  nfseAutorizadasCount: number
  nfseMesValor: number
  nfseUltima: { numero: string | null; valorTotal: number } | null
  chamadosAbertos: number
  chamadosTotal: number
  documentosTotal: number
  conversasTotal: number
}

export function TabVisaoGeral({
  empresa,
  cliente,
  nfseAutorizadasCount,
  nfseMesValor,
  nfseUltima,
  chamadosAbertos,
  chamadosTotal,
  documentosTotal,
  conversasTotal,
}: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2">

      <InfoCard title="Dados da empresa" icon="domain">
        {empresa.razaoSocial && <InfoRow label="Razão social" value={empresa.razaoSocial} />}
        {empresa.nomeFantasia && <InfoRow label="Nome fantasia" value={empresa.nomeFantasia} />}
        {empresa.cnpj && <InfoRow label="CNPJ" value={formatCNPJ(empresa.cnpj)} />}
        {empresa.regime && <InfoRow label="Regime tributário" value={REGIME_LABELS[empresa.regime] ?? empresa.regime} />}
        {cliente && <InfoRow label="Status" value={STATUS_CLIENTE_LABELS[cliente.status as keyof typeof STATUS_CLIENTE_LABELS] ?? cliente.status} />}
        <InfoRow label="Cadastrada em" value={formatDate(empresa.criadoEm)} />
      </InfoCard>

      <InfoCard title="Contrato" icon="contract">
        {!cliente ? (
          <p className="text-sm text-on-surface-variant py-2">Nenhum titular vinculado a esta empresa.</p>
        ) : (
          <>
            <InfoRow label="Plano" value={PLANO_LABELS[cliente.planoTipo as keyof typeof PLANO_LABELS]} />
            <InfoRow label="Valor mensal" value={formatBRL(cliente.valorMensal)} />
            <InfoRow label="Vencimento" value={`Dia ${cliente.vencimentoDia}`} />
            <InfoRow label="Pagamento" value={FORMA_PAGAMENTO_LABELS[cliente.formaPagamento as keyof typeof FORMA_PAGAMENTO_LABELS]} />
            {cliente.email && <InfoRow label="E-mail" value={cliente.email} />}
            {cliente.whatsapp && (
              <InfoRow label="Telefone" value={formatTelefone(cliente.whatsapp)} />
            )}
            {cliente.responsavel?.nome && <InfoRow label="Responsável" value={cliente.responsavel.nome} />}
            <div className="pt-3 flex justify-end">
              <Link href={`/crm/clientes/${cliente.id}`} className="text-[12px] font-semibold text-primary hover:opacity-80 flex items-center gap-1">
                Ver perfil completo
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>
          </>
        )}
      </InfoCard>

      <InfoCard title="NFS-e" icon="receipt_long">
        <div className="flex items-center justify-between py-2 border-b border-outline-variant/5">
          <span className="text-sm text-on-surface-variant/80">Spedy</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${empresa.spedyConfigurado ? 'bg-green-status/10 text-green-status' : 'bg-surface-container text-on-surface-variant'}`}>
            {empresa.spedyConfigurado ? 'Configurada' : 'Não configurada'}
          </span>
        </div>
        {empresa.spedyConfigurado ? (
          <>
            <InfoRow label="Emitidas (total)" value={nfseAutorizadasCount > 0 ? String(nfseAutorizadasCount) : '—'} />
            <InfoRow label="Valor no mês" value={nfseMesValor > 0 ? formatBRL(nfseMesValor) : '—'} />
            {nfseUltima ? (
              <InfoRow
                label="Última nota"
                value={`${nfseUltima.numero ? `NF-${nfseUltima.numero}` : 'RPS'} · ${formatBRL(nfseUltima.valorTotal)}`}
              />
            ) : (
              <p className="text-sm text-on-surface-variant/60 py-2">Nenhuma nota emitida ainda.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-on-surface-variant/60 py-3">
            Configure a emissão de NFS-e na aba <span className="font-medium text-on-surface">Fiscal</span>.
          </p>
        )}
      </InfoCard>

      <InfoCard title="Atividade" icon="analytics">
        <InfoRow label="Chamados em aberto" value={chamadosAbertos > 0 ? String(chamadosAbertos) : '—'} />
        <InfoRow label="Total de chamados" value={chamadosTotal > 0 ? String(chamadosTotal) : '—'} />
        <InfoRow label="Documentos" value={documentosTotal > 0 ? String(documentosTotal) : '—'} />
        <InfoRow label="Conversas IA" value={conversasTotal > 0 ? String(conversasTotal) : '—'} />
        {chamadosAbertos > 0 && (
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-orange-status">
            {chamadosAbertos} chamado{chamadosAbertos !== 1 ? 's' : ''} aguardando atenção
          </p>
        )}
      </InfoCard>

    </div>
  )
}
