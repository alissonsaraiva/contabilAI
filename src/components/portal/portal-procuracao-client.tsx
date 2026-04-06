'use client'

import { useState } from 'react'

type Props = {
  nomeEscritorio: string
  procuracaoRFAtiva: boolean
  verificadaEm: string | null
}

export function PortalProcuracaoClient({ nomeEscritorio, procuracaoRFAtiva: inicialAtiva, verificadaEm: inicialVerificadaEm }: Props) {
  const [ativa, setAtiva]               = useState(inicialAtiva)
  const [verificadaEm, setVerificadaEm] = useState<string | null>(inicialVerificadaEm)
  const [verificando, setVerificando]   = useState(false)
  const [mensagem, setMensagem]         = useState<string | null>(null)
  const [mensagemTipo, setMensagemTipo] = useState<'ok' | 'erro' | 'info'>('info')

  async function verificar() {
    setVerificando(true)
    setMensagem(null)
    try {
      const res  = await fetch('/api/portal/procuracao-rf', { method: 'POST' })
      const json = await res.json()

      if (typeof json.procuracaoRFAtiva === 'boolean') setAtiva(json.procuracaoRFAtiva)
      if (json.verificadaEm) setVerificadaEm(json.verificadaEm)
      if (json.mensagem) {
        setMensagem(json.mensagem)
        setMensagemTipo(json.procuracaoRFAtiva ? 'ok' : json.erro ? 'erro' : 'info')
      }
    } catch {
      setMensagem('Não foi possível verificar agora. Tente novamente em alguns minutos.')
      setMensagemTipo('erro')
    } finally {
      setVerificando(false)
    }
  }

  const ultimaVerificacao = verificadaEm
    ? new Date(verificadaEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : null

  return (
    <div className="space-y-6">

      {/* ── Status card ──────────────────────────────────────────── */}
      <div className={`rounded-2xl border p-6 ${
        ativa
          ? 'border-green-status/25 bg-green-status/8'
          : 'border-error/25 bg-error/8'
      }`}>
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
            ativa ? 'bg-green-status/15' : 'bg-error/15'
          }`}>
            <span
              className={`material-symbols-outlined text-[24px] ${ativa ? 'text-green-status' : 'text-error'}`}
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              {ativa ? 'verified_user' : 'lock_person'}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <p className={`text-[15px] font-bold ${ativa ? 'text-green-status' : 'text-error'}`}>
              {ativa ? 'Autorização ativa' : 'Autorização pendente'}
            </p>
            <p className="mt-1 text-[13px] text-on-surface-variant/80 leading-relaxed">
              {ativa
                ? `${nomeEscritorio} tem autorização ativa para acessar seus dados na Receita Federal. Sua DAS MEI é gerada automaticamente todo mês.`
                : `${nomeEscritorio} ainda não tem autorização para acessar seus dados na Receita Federal. Você precisa conceder a procuração digital no e-CAC para que a DAS MEI seja gerada automaticamente.`
              }
            </p>
            {ultimaVerificacao && (
              <p className="mt-2 text-[11px] text-on-surface-variant/50">
                Última verificação: {ultimaVerificacao}
              </p>
            )}
          </div>
        </div>

        {/* Mensagem de retorno da verificação */}
        {mensagem && (
          <div className={`mt-4 flex items-start gap-2 rounded-xl px-4 py-3 text-[13px] ${
            mensagemTipo === 'ok'   ? 'bg-green-status/10 text-green-status' :
            mensagemTipo === 'erro' ? 'bg-error/10 text-error' :
                                     'bg-primary/10 text-primary'
          }`}>
            <span className="material-symbols-outlined shrink-0 text-[16px] mt-0.5">
              {mensagemTipo === 'ok' ? 'check_circle' : mensagemTipo === 'erro' ? 'error' : 'info'}
            </span>
            {mensagem}
          </div>
        )}

        {/* Botão "Já autorizei — verificar agora" */}
        {!ativa && (
          <button
            type="button"
            onClick={verificar}
            disabled={verificando}
            className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {verificando
              ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span> Verificando...</>
              : <><span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span> Já autorizei — verificar agora</>
            }
          </button>
        )}

        {ativa && (
          <button
            type="button"
            onClick={verificar}
            disabled={verificando}
            className="mt-4 flex items-center gap-2 rounded-xl border border-green-status/30 px-4 py-2 text-[12px] font-medium text-green-status transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {verificando
              ? <><span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span> Verificando...</>
              : <><span className="material-symbols-outlined text-[14px]">refresh</span> Verificar novamente</>
            }
          </button>
        )}
      </div>

      {/* ── Instruções (somente quando inativo) ─────────────────── */}
      {!ativa && (
        <div className="rounded-2xl border border-outline-variant/15 bg-card shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant/10">
            <span className="material-symbols-outlined text-[20px] text-primary/80" style={{ fontVariationSettings: "'FILL' 1" }}>help</span>
            <div>
              <h3 className="font-headline text-base font-semibold text-on-surface">Como conceder a procuração</h3>
              <p className="text-[11px] text-on-surface-variant/60">Passo a passo pelo Portal e-CAC da Receita Federal</p>
            </div>
          </div>

          <div className="divide-y divide-outline-variant/8">
            {[
              {
                n: '1',
                titulo: 'Acesse o Portal e-CAC',
                descricao: 'Entre em cav.receita.fazenda.gov.br usando seu certificado digital, conta gov.br ou código de acesso.',
              },
              {
                n: '2',
                titulo: 'Localize "Procuração Eletrônica"',
                descricao: 'No menu, acesse Outros serviços → Procuração Eletrônica → Cadastrar Procuração.',
              },
              {
                n: '3',
                titulo: 'Informe o CNPJ do seu escritório contábil',
                descricao: `Busque pelo CNPJ de ${nomeEscritorio} e selecione os serviços de acesso desejados (MEI, Situação Fiscal, Simples Nacional).`,
              },
              {
                n: '4',
                titulo: 'Confirme e salve',
                descricao: 'Revise as permissões e confirme a procuração. Ela fica ativa imediatamente no sistema da Receita Federal.',
              },
              {
                n: '5',
                titulo: 'Clique em "Já autorizei"',
                descricao: 'Após concluir no e-CAC, volte aqui e clique no botão acima para que confirmemos sua autorização.',
              },
            ].map(({ n, titulo, descricao }) => (
              <div key={n} className="flex gap-4 px-5 py-4">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[12px] font-extrabold text-primary">
                  {n}
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-on-surface">{titulo}</p>
                  <p className="mt-0.5 text-[12px] text-on-surface-variant/70 leading-relaxed">{descricao}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-4 border-t border-outline-variant/10 bg-surface-container-lowest/30">
            <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
              Dúvidas? Entre em contato conosco pelo suporte ou WhatsApp. Nosso time ajuda você a concluir o processo.
            </p>
          </div>
        </div>
      )}

      {/* ── O que a procuração permite ──────────────────────────── */}
      <div className="rounded-2xl border border-outline-variant/15 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant/10">
          <span className="material-symbols-outlined text-[20px] text-primary/80" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
          <h3 className="font-headline text-base font-semibold text-on-surface">Por que essa autorização é necessária?</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          {[
            { icon: 'receipt_long', texto: 'Geração automática da DAS MEI todo mês sem você precisar solicitar' },
            { icon: 'account_balance', texto: 'Consulta da situação fiscal do seu CNPJ na Receita Federal' },
            { icon: 'description', texto: 'Emissão de certidões e documentos da empresa quando necessário' },
            { icon: 'notifications', texto: 'Alertas antecipados sobre obrigações e pendências tributárias' },
          ].map(({ icon, texto }) => (
            <div key={icon} className="flex items-start gap-3">
              <span className="material-symbols-outlined shrink-0 text-[16px] text-primary/70 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
              <p className="text-[13px] text-on-surface-variant/80 leading-relaxed">{texto}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
