import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { Card } from '@/components/ui/card'
import { formatCNPJ, formatTelefone } from '@/lib/utils'

const REGIME_LABELS: Record<string, string> = {
  MEI: 'MEI',
  SimplesNacional: 'Simples Nacional',
  LucroPresumido: 'Lucro Presumido',
  LucroReal: 'Lucro Real',
  Autonomo: 'Autônomo',
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between py-3 border-b border-outline-variant/10 last:border-0">
      <span className="text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant/50">{label}</span>
      <span className="text-[14px] font-medium text-on-surface">{value}</span>
    </div>
  )
}

export default async function PortalEmpresaPage() {
  const session = await auth()
  const user = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) redirect('/portal/login')

  const clienteId = await resolveClienteId(user)
  if (!clienteId) redirect('/portal/login')

  const empresaId = user.empresaId as string | undefined

  const [cliente, empresa] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id: clienteId },
      include: {
        contratos: {
          orderBy: { criadoEm: 'desc' as const },
          take: 1,
          select: { status: true, planoTipo: true, valorMensal: true, assinadoEm: true },
        },
      },
    }),
    empresaId
      ? prisma.empresa.findUnique({
          where: { id: empresaId },
          include: { socios: { orderBy: { principal: 'desc' } } },
        })
      : Promise.resolve(null),
  ])

  if (!cliente) redirect('/portal/login')
  const plano = cliente.contratos[0]
  const isPF = cliente.tipoContribuinte === 'pf'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-semibold text-on-surface">
          {isPF ? 'Meus Dados' : 'Minha Empresa'}
        </h1>
        <p className="text-sm text-on-surface-variant/70 mt-1">
          {isPF
            ? 'Seus dados cadastrais e plano contratado.'
            : 'Dados cadastrais e composição societária da sua empresa.'}
        </p>
      </div>

      {/* PJ: dados da empresa */}
      {!isPF && (
        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-5 rounded-[16px] shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <span className="material-symbols-outlined text-[22px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                domain
              </span>
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-on-surface">
                {empresa?.razaoSocial ?? empresa?.nomeFantasia ?? 'Empresa não identificada'}
              </h2>
              {empresa?.nomeFantasia && empresa.razaoSocial !== empresa.nomeFantasia && (
                <p className="text-[12px] text-on-surface-variant/60">{empresa.nomeFantasia}</p>
              )}
            </div>
          </div>
          <div>
            <InfoRow label="CNPJ" value={empresa?.cnpj ? formatCNPJ(empresa.cnpj) : undefined} />
            <InfoRow label="Regime tributário" value={empresa?.regime ? REGIME_LABELS[empresa.regime] ?? empresa.regime : undefined} />
            <InfoRow label="Status" value={cliente.status} />
            {!empresa?.cnpj && !empresa?.razaoSocial && (
              <p className="text-[13px] text-on-surface-variant/50 py-3">
                Os dados da empresa ainda não foram preenchidos. Entre em contato com o escritório para atualizar.
              </p>
            )}
          </div>
        </Card>
      )}

      {/* PF: dados profissionais */}
      {isPF && (
        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-5 rounded-[16px] shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <span className="material-symbols-outlined text-[22px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                badge
              </span>
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-on-surface">{cliente.nome}</h2>
              {cliente.profissao && (
                <p className="text-[12px] text-on-surface-variant/60">{cliente.profissao}</p>
              )}
            </div>
          </div>
          <div>
            <InfoRow label="CPF" value={cliente.cpf} />
            {cliente.rg && <InfoRow label="RG" value={cliente.rg} />}
            {cliente.dataNascimento && (
              <InfoRow label="Nascimento" value={new Date(cliente.dataNascimento).toLocaleDateString('pt-BR')} />
            )}
            {cliente.estadoCivil && <InfoRow label="Estado civil" value={cliente.estadoCivil} />}
            {cliente.nacionalidade && <InfoRow label="Nacionalidade" value={cliente.nacionalidade} />}
            <InfoRow label="Profissão" value={cliente.profissao} />
            <InfoRow label="Regime" value={REGIME_LABELS['Autonomo']} />
          </div>
        </Card>
      )}

      {/* Titular / Responsável (só PJ) */}
      {!isPF && (
        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-5 rounded-[16px] shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant/60">person</span>
            <h2 className="text-[14px] font-semibold text-on-surface">Titular / Responsável</h2>
          </div>
          <div>
            <InfoRow label="Nome" value={cliente.nome} />
            <InfoRow label="CPF" value={cliente.cpf} />
            <InfoRow label="E-mail" value={cliente.email} />
            <InfoRow label="Telefone" value={formatTelefone(cliente.telefone)} />
            {cliente.whatsapp && <InfoRow label="WhatsApp" value={formatTelefone(cliente.whatsapp)} />}
            {(cliente.logradouro || cliente.cidade) && (
              <InfoRow
                label="Endereço"
                value={[
                  cliente.logradouro,
                  cliente.numero,
                  cliente.complemento,
                  cliente.bairro,
                  cliente.cidade,
                  cliente.uf,
                ].filter(Boolean).join(', ')}
              />
            )}
            {cliente.cep && <InfoRow label="CEP" value={cliente.cep} />}
          </div>
        </Card>
      )}

      {/* PF: contato */}
      {isPF && (
        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-5 rounded-[16px] shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant/60">contact_phone</span>
            <h2 className="text-[14px] font-semibold text-on-surface">Contato</h2>
          </div>
          <div>
            <InfoRow label="E-mail" value={cliente.email} />
            <InfoRow label="Telefone" value={formatTelefone(cliente.telefone)} />
            {cliente.whatsapp && <InfoRow label="WhatsApp" value={formatTelefone(cliente.whatsapp)} />}
            {(cliente.logradouro || cliente.cidade) && (
              <InfoRow
                label="Endereço"
                value={[
                  cliente.logradouro,
                  cliente.numero,
                  cliente.complemento,
                  cliente.bairro,
                  cliente.cidade,
                  cliente.uf,
                ].filter(Boolean).join(', ')}
              />
            )}
            {cliente.cep && <InfoRow label="CEP" value={cliente.cep} />}
          </div>
        </Card>
      )}

      {/* Plano contratado */}
      {plano && (
        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-5 rounded-[16px] shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant/60">contract</span>
            <h2 className="text-[14px] font-semibold text-on-surface">Plano contratado</h2>
          </div>
          <div>
            <InfoRow label="Plano" value={plano.planoTipo} />
            <InfoRow
              label="Valor mensal"
              value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(plano.valorMensal))}
            />
            <InfoRow label="Vencimento" value={`Dia ${cliente.vencimentoDia}`} />
            {plano.assinadoEm && (
              <InfoRow
                label="Contrato assinado"
                value={new Date(plano.assinadoEm).toLocaleDateString('pt-BR')}
              />
            )}
          </div>
        </Card>
      )}

      {/* Quadro societário (só PJ) */}
      {!isPF && empresa?.socios && empresa.socios.length > 0 && (
        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-5 rounded-[16px] shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant/60">group</span>
            <h2 className="text-[14px] font-semibold text-on-surface">Quadro societário</h2>
          </div>
          <ul className="space-y-3">
            {empresa.socios.map(socio => (
              <li key={socio.id} className="flex items-center gap-3 rounded-xl bg-surface-container-low/60 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[13px] font-bold text-primary">
                  {socio.nome.split(' ').map(n => n[0]).slice(0, 2).join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-on-surface">{socio.nome}</p>
                  <p className="text-[11px] text-on-surface-variant/60">
                    {[socio.qualificacao, socio.participacao ? `${socio.participacao}%` : null]
                      .filter(Boolean)
                      .join(' · ') || 'Sócio'}
                  </p>
                </div>
                {socio.principal && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                    Principal
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
