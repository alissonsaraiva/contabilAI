'use client'

import Link from 'next/link'
import { formatBRL } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { LimiteMeiWidget } from '@/components/ui/limite-mei-widget'

import type { PortalFinanceiroProps } from './types'
import { usePortalFinanceiro } from './use-portal-financeiro'
import { CobrancaAbertaCard } from './cobranca-aberta-card'
import { CardEditavelVencimento } from './card-editavel-vencimento'
import { CardEditavelForma } from './card-editavel-forma'
import { HistoricoCobrancas } from './historico-cobrancas'
import { DasMeiSection } from './das-mei-section'

export function PortalFinanceiroClient({
  clienteId, valorMensal, vencimentoDia, formaPagamento, asaasAtivo, regime, procuracaoRFAtiva = true,
}: PortalFinanceiroProps) {
  const f = usePortalFinanceiro({ formaPagamento, vencimentoDia, regime })

  if (f.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-[24px] text-on-surface-variant/40">progress_activity</span>
      </div>
    )
  }

  const isMEI = regime === 'MEI'

  return (
    <div className="space-y-6">
      {/* Cobrança em aberto */}
      {asaasAtivo && f.cobrancaAberta && (
        <CobrancaAbertaCard
          cobranca={f.cobrancaAberta}
          copiado={f.copiado}
          segundaViaLoading={f.segundaViaLoading}
          onCopiar={f.copiar}
          onGerarSegundaVia={f.gerarSegundaVia}
        />
      )}

      {/* Erro geral */}
      {f.erro && (
        <div className="flex items-center gap-2 rounded-xl bg-error/10 px-4 py-3 text-sm text-error">
          <span className="material-symbols-outlined text-[16px]">error</span>
          {f.erro}
        </div>
      )}

      {/* Resumo da mensalidade */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Mensalidade */}
        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-5 rounded-[16px] shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-green-status/10">
            <span className="material-symbols-outlined text-[22px] text-green-status" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
          </div>
          <p className="text-[12px] font-medium text-on-surface-variant/70">Mensalidade</p>
          <p className="text-xl font-bold text-on-surface mt-1">{formatBRL(valorMensal)}</p>
        </Card>

        {/* Dia de vencimento — editável */}
        <CardEditavelVencimento
          asaasAtivo={asaasAtivo}
          diaVencimento={f.diaVencimento}
          editando={f.editandoVencimento}
          novoVencimentoDia={f.novoVencimentoDia}
          setNovoVencimentoDia={f.setNovoVencimentoDia}
          salvando={f.salvandoVencimento}
          erro={f.erroVencimento}
          onIniciarEdicao={f.iniciarEdicaoVencimento}
          onCancelar={f.cancelarEdicaoVencimento}
          onSalvar={f.salvarVencimento}
        />

        {/* Forma de pagamento — editável */}
        <CardEditavelForma
          asaasAtivo={asaasAtivo}
          forma={f.forma}
          editando={f.editandoForma}
          novaForma={f.novaForma}
          setNovaForma={f.setNovaForma}
          salvando={f.salvandoForma}
          erro={f.erroForma}
          onIniciarEdicao={f.iniciarEdicaoForma}
          onCancelar={f.cancelarEdicaoForma}
          onSalvar={f.salvarForma}
        />
      </div>

      {/* Feedbacks de sucesso nas configurações */}
      {f.sucessoVencimento && (
        <div className="flex items-center gap-2 rounded-xl bg-green-status/10 px-4 py-3 text-sm text-green-status">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          {f.sucessoVencimento}
        </div>
      )}
      {f.sucessoForma && (
        <div className="flex items-center gap-2 rounded-xl bg-green-status/10 px-4 py-3 text-sm text-green-status">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          {f.sucessoForma}
        </div>
      )}

      {/* Sem cobranças */}
      {asaasAtivo && f.cobrancaAberta === null && (
        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-6 rounded-[16px] shadow-sm">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[22px] text-green-status mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
              check_circle
            </span>
            <div>
              <p className="text-sm font-medium text-on-surface">Nenhuma cobrança em aberto</p>
              <p className="text-[12px] text-on-surface-variant/70 mt-0.5">Sua mensalidade está em dia. 🎉</p>
            </div>
          </div>
        </Card>
      )}

      {/* Sem integração Asaas */}
      {!asaasAtivo && (
        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-5 rounded-[16px] shadow-sm">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[22px] text-primary mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
              info
            </span>
            <p className="text-[13px] text-on-surface-variant/80 leading-relaxed">
              Para solicitar segunda via de boleto, tirar dúvidas sobre cobranças ou alterar sua forma de pagamento,
              entre em contato com nosso escritório pelo chat ao lado ou pelo WhatsApp.
            </p>
          </div>
        </Card>
      )}

      {/* Histórico de cobranças */}
      {asaasAtivo && (
        <HistoricoCobrancas
          historico={f.historico}
          baixandoExtrato={f.baixandoExtrato}
          onBaixarExtrato={f.baixarExtrato}
        />
      )}

      {/* Alerta procuração RF — exibido para MEI sem autorização */}
      {isMEI && !procuracaoRFAtiva && (
        <Link
          href="/portal/procuracao-rf"
          className="flex items-start gap-3.5 rounded-2xl border border-error/30 bg-error/8 px-5 py-4 transition-opacity hover:opacity-90"
        >
          <span
            className="material-symbols-outlined shrink-0 text-[22px] text-error mt-0.5"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            lock_person
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-error">Autorização Receita Federal pendente</p>
            <p className="mt-0.5 text-[12px] text-error/80 leading-relaxed">
              Você ainda não concedeu a procuração digital ao seu escritório. Sem ela, a DAS MEI não pode ser gerada automaticamente.{' '}
              <span className="font-semibold underline underline-offset-2">Clique aqui para ver como fazer</span>.
            </p>
          </div>
          <span className="material-symbols-outlined shrink-0 text-[18px] text-error/60 mt-0.5">chevron_right</span>
        </Link>
      )}

      {/* Limite MEI — régua de faturamento anual */}
      {isMEI && f.limiteMei && (
        <LimiteMeiWidget
          acumulado={f.limiteMei.acumulado}
          limite={f.limiteMei.limite}
          percentual={f.limiteMei.percentual}
          zona={f.limiteMei.zona}
          restante={f.limiteMei.restante}
          ano={f.limiteMei.ano}
          variant="portal"
        />
      )}
      {isMEI && f.limiteMeiErro && !f.limiteMei && (
        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-5 rounded-[16px] shadow-sm">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant/40 mt-0.5 shrink-0">trending_up</span>
            <div>
              <p className="text-sm font-medium text-on-surface">Limite MEI indisponível</p>
              <p className="text-[12px] text-on-surface-variant/60 mt-0.5">
                Não foi possível carregar o faturamento acumulado. Tente recarregar a página.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* DAS MEI */}
      {isMEI && (
        <DasMeiSection
          dasMeis={f.dasMeis}
          loading={f.dasLoading}
          erro={f.dasErro}
          copiandoDAS={f.copiandoDAS}
          onRecarregar={f.carregarDASMEI}
          onCopiarCodigoBarras={f.copiarCodigoBarrasDAS}
        />
      )}
    </div>
  )
}
