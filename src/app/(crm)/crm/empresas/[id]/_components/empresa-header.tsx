import type { Regime, StatusCliente } from '@prisma/client'
import { BackButton } from '@/components/ui/back-button'
import { EditarEmpresaButton } from '@/components/crm/editar-empresa-button'
import { EditarClienteButton } from '@/components/crm/editar-cliente-button'
import { PortalLinkButton } from '@/components/crm/portal-link-button'
import { PortalChatButton } from '@/components/crm/portal-chat-button'
import { WhatsAppDrawerButton } from '@/components/crm/whatsapp-drawer-button'
import { EnviarEmailDrawer } from '@/components/crm/enviar-email-drawer'
import { STATUS_CLIENTE_COLORS, STATUS_CLIENTE_LABELS, REGIME_LABELS, REGIME_COLORS } from '@/types'
import { formatCNPJ, formatCPF, formatBRL, formatDate, formatTelefone } from '@/lib/utils'
import { PLANO_LABELS, PLANO_COLORS, FORMA_PAGAMENTO_LABELS } from '@/types'

type ClienteBasico = {
  id: string
  nome: string
  cpf: string
  email: string | null
  telefone: string
  whatsapp: string | null
  rg: string | null
  dataNascimento: string | null
  estadoCivil: string | null
  profissao: string | null
  nacionalidade: string | null
  tipoContribuinte: string
  planoTipo: string
  valorMensal: number
  vencimentoDia: number
  formaPagamento: string
  cnpj: string | null
  razaoSocial: string | null
  regime: Regime | null
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
}

type EmpresaBasica = {
  id: string
  razaoSocial: string | null
  nomeFantasia: string | null
  cnpj: string | null
  regime: Regime | null
}

type Props = {
  empresa: EmpresaBasica
  cliente: ClienteBasico | null
  sociosCount: number
  nomeIaPortal: string
}

export function EmpresaHeader({ empresa, cliente, sociosCount, nomeIaPortal }: Props) {
  const nomeDisplay = empresa.razaoSocial ?? empresa.nomeFantasia ?? '(sem nome)'

  return (
    <div className="flex items-start gap-4">
      <BackButton className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
      </BackButton>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-headline text-2xl font-semibold text-on-surface">{nomeDisplay}</h1>
          {cliente && (
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${STATUS_CLIENTE_COLORS[cliente.status as keyof typeof STATUS_CLIENTE_COLORS] ?? 'bg-surface-container text-on-surface-variant'}`}>
              {STATUS_CLIENTE_LABELS[cliente.status as keyof typeof STATUS_CLIENTE_LABELS] ?? cliente.status}
            </span>
          )}
          {empresa.regime && (
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${REGIME_COLORS[empresa.regime] ?? 'bg-surface-container text-on-surface-variant'}`}>
              {REGIME_LABELS[empresa.regime] ?? empresa.regime}
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-on-surface-variant">
          {empresa.cnpj && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">badge</span>
              {formatCNPJ(empresa.cnpj)}
            </span>
          )}
          {empresa.nomeFantasia && empresa.razaoSocial && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">storefront</span>
              {empresa.nomeFantasia}
            </span>
          )}
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">group</span>
            {sociosCount} {sociosCount === 1 ? 'sócio' : 'sócios'}
          </span>
          {cliente && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">person</span>
              {cliente.nome}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <EditarEmpresaButton empresa={{
            id: empresa.id,
            razaoSocial: empresa.razaoSocial,
            nomeFantasia: empresa.nomeFantasia,
            cnpj: empresa.cnpj,
            regime: empresa.regime,
          }} />
          {cliente && (
            <>
              <WhatsAppDrawerButton clienteId={cliente.id} clienteNome={cliente.nome} />
              {cliente.email && (
                <EnviarEmailDrawer
                  clienteId={cliente.id}
                  clienteEmail={cliente.email}
                  clienteNome={cliente.nome}
                />
              )}
              <PortalChatButton clienteId={cliente.id} clienteNome={cliente.nome} status={cliente.status} nomeIa={nomeIaPortal} />
              <PortalLinkButton clienteId={cliente.id} status={cliente.status} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
