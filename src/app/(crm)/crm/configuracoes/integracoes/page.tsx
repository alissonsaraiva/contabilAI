'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Section, RadioOptionGroup, SecretField, FieldLabel,
  ToggleSwitch, BooleanRadio, InfoBox, SubSection, INPUT,
} from './components'

// ── Schema ────────────────────────────────────────────────────────────────────
const schema = z.object({
  provedorAssinatura: z.enum(['zapsign', 'clicksign']).optional(),
  zapsignToken: z.string().optional(),
  clicksignKey: z.string().optional(),
  clicksignHmacSecret: z.string().optional(),
  zapiInstanceId: z.string().optional(),
  zapiToken: z.string().optional(),
  serproCpfToken: z.string().optional(),
  serproCnpjToken: z.string().optional(),
  asaasApiKey: z.string().optional(),
  asaasAmbiente: z.enum(['sandbox', 'producao']).optional(),
  asaasWebhookToken: z.string().optional(),
  spedyApiKey: z.string().optional(),
  spedyAmbiente: z.enum(['sandbox', 'producao']).optional(),
  spedyFederalServiceCode: z.string().optional(),
  spedyCityServiceCode: z.string().optional(),
  spedyIssAliquotaPercent: z.number().min(0).max(100).optional(),
  spedyTaxationType: z.enum(['taxationInMunicipality', 'exemptFromTaxation', 'notSubjectToTaxation', 'taxationOutsideMunicipality']).optional(),
  spedyIssWithheld: z.boolean().optional(),
  spedyAutoEmitirOS: z.boolean().optional(),
  spedyEnviarAoAutorizar: z.boolean().optional(),
  spedyEnviarCanalPadrao: z.enum(['whatsapp', 'email', 'portal']).optional(),
  spedyDescricaoTemplate: z.string().optional(),
})

type FormData = z.infer<typeof schema>

type Configured = {
  zapsignToken: boolean
  clicksignKey: boolean
  clicksignHmacSecret: boolean
  zapiInstanceId: boolean
  zapiToken: boolean
  serproCpfToken: boolean
  serproCnpjToken: boolean
  asaasApiKey: boolean
  asaasWebhookToken: boolean
  spedyApiKey: boolean
}

// ── Constantes ────────────────────────────────────────────────────────────────
const AMBIENTE_OPTIONS = [
  { value: 'sandbox', label: 'Sandbox', sub: 'Testes — sem cobranças reais' },
  { value: 'producao', label: 'Produção', sub: 'Cobranças reais — use com cuidado' },
]

const MODULOS_DISPONIVEIS = [
  { id: 'integra-sitfis',       label: 'Integra-Sitfis',       desc: 'Situação Fiscal do Contribuinte' },
  { id: 'integra-sn',           label: 'Integra-SN',           desc: 'Simples Nacional (PGDAS-D)' },
  { id: 'integra-mei',          label: 'Integra-MEI',          desc: 'MEI — DAS, Certidão CCMEI, DASN-SIMEI' },
  { id: 'integra-pagamento',    label: 'Integra-Pagamento',    desc: 'Verificação de pagamento da DAS MEI (PGTOWEB)' },
  { id: 'integra-caixapostal',  label: 'Integra-CaixaPostal',  desc: 'Caixa Postal da Receita Federal' },
  { id: 'integra-dctfweb',      label: 'Integra-DCTFWeb',      desc: 'Declaração de Débitos e Créditos Tributários' },
  { id: 'integra-parcelamento', label: 'Integra-Parcelamento', desc: 'Parcelamentos junto à Receita Federal' },
  { id: 'integra-procuracoes',  label: 'Integra-Procurações',  desc: 'Consulta e gestão de procurações digitais (e-CAC)' },
]

const TAXATION_OPTIONS = [
  { value: 'taxationInMunicipality',       label: 'Tributação no município',      sub: 'ISS recolhido no município do prestador' },
  { value: 'taxationOutsideMunicipality',  label: 'Tributação fora do município', sub: 'ISS recolhido no município do tomador' },
  { value: 'exemptFromTaxation',           label: 'Isento',                       sub: 'Serviço isento de ISS' },
  { value: 'notSubjectToTaxation',         label: 'Não incidência',               sub: 'Fora do campo de incidência do ISS' },
]

const CANAL_OPTIONS = [
  { value: 'whatsapp', label: 'WhatsApp', icon: 'chat' },
  { value: 'email',    label: 'E-mail',   icon: 'mail' },
  { value: 'portal',   label: 'Portal',   icon: 'open_in_browser' },
]

// ─── Integra Contador (SERPRO) ────────────────────────────────────────────────
function IntegraContadorSection() {
  const [loading,  setLoading]  = useState(false)
  const [testing,  setTesting]  = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; label?: string; erro?: string } | null>(null)

  const [clientId,  setClientId]  = useState('')
  const [secret,    setSecret]    = useState('')
  const [ambiente,  setAmbiente]  = useState<'homologacao' | 'producao'>('homologacao')
  const [certSenha, setCertSenha] = useState('')
  const [enabled,   setEnabled]   = useState(false)
  const [modulos,   setModulos]   = useState<string[]>([])

  const [certBase64,  setCertBase64]  = useState('')
  const [certFileName, setCertFileName] = useState('')

  const [configured, setConfigured] = useState({
    secret: false, certBase64: false, certSenha: false,
  })

  const [dasMeiVencimentoDia,    setDasMeiVencimentoDia]    = useState(20)
  const [dasMeiDiasAntecedencia, setDasMeiDiasAntecedencia] = useState(5)
  const [dasMeiCanalEmail,       setDasMeiCanalEmail]       = useState(true)
  const [dasMeiCanalWhatsapp,    setDasMeiCanalWhatsapp]    = useState(true)
  const [dasMeiCanalPwa,         setDasMeiCanalPwa]         = useState(true)

  const certInputRef = useRef<HTMLInputElement>(null)

  const configCount =
    (clientId ? 1 : 0) +
    (configured.secret ? 1 : 0) +
    (configured.certBase64 ? 1 : 0) +
    (modulos.length > 0 ? 1 : 0)

  useEffect(() => {
    fetch('/api/configuracoes/integra-contador')
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        if (!data) return
        setClientId((data.integraContadorClientId as string) ?? '')
        setAmbiente((data.integraContadorAmbiente as 'homologacao' | 'producao') ?? 'homologacao')
        setEnabled(Boolean(data.integraContadorEnabled))
        try {
          const mods = JSON.parse((data.integraContadorModulos as string) ?? '[]')
          setModulos(Array.isArray(mods) ? mods : [])
        } catch { setModulos([]) }
        setConfigured({
          secret:     Boolean(data.integraContadorClientSecretConfigured),
          certBase64: Boolean(data.integraContadorCertBase64Configured),
          certSenha:  Boolean(data.integraContadorCertSenhaConfigured),
        })
        if (data.dasMeiVencimentoDia    != null) setDasMeiVencimentoDia(Number(data.dasMeiVencimentoDia))
        if (data.dasMeiDiasAntecedencia != null) setDasMeiDiasAntecedencia(Number(data.dasMeiDiasAntecedencia))
        if (data.dasMeiCanalEmail       != null) setDasMeiCanalEmail(Boolean(data.dasMeiCanalEmail))
        if (data.dasMeiCanalWhatsapp    != null) setDasMeiCanalWhatsapp(Boolean(data.dasMeiCanalWhatsapp))
        if (data.dasMeiCanalPwa         != null) setDasMeiCanalPwa(Boolean(data.dasMeiCanalPwa))
      })
      .catch(err => console.error('[crm/integracoes] falha ao reindexar:', err))
  }, [])

  const handleCertFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      setCertBase64(result.split(',')[1] ?? '')
      setCertFileName(file.name)
    }
    reader.readAsDataURL(file)
  }, [])

  const toggleModulo = useCallback((id: string) => {
    setModulos(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id],
    )
  }, [])

  async function handleSave() {
    setLoading(true)
    try {
      const payload: Record<string, unknown> = {
        integraContadorClientId: clientId,
        integraContadorAmbiente: ambiente,
        integraContadorEnabled: enabled,
        integraContadorModulos: JSON.stringify(modulos),
        dasMeiVencimentoDia, dasMeiDiasAntecedencia,
        dasMeiCanalEmail, dasMeiCanalWhatsapp, dasMeiCanalPwa,
      }
      if (secret    && !secret.startsWith('•'))    payload.integraContadorClientSecret = secret
      if (certBase64)                              payload.integraContadorCertBase64   = certBase64
      if (certSenha  && !certSenha.startsWith('•')) payload.integraContadorCertSenha    = certSenha

      const res = await fetch('/api/configuracoes/integra-contador', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()

      setConfigured(prev => ({
        secret:    prev.secret || (!!secret && !secret.startsWith('•')),
        certBase64: prev.certBase64 || !!certBase64,
        certSenha:  prev.certSenha  || (!!certSenha && !certSenha.startsWith('•')),
      }))
      setSecret('')
      setCertSenha('')
      setCertBase64('')
      setCertFileName('')
      toast.success('Integra Contador salvo.')
    } catch {
      toast.error('Não foi possível salvar o Integra Contador. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res  = await fetch('/api/configuracoes/integra-contador', { method: 'POST' })
      const data = await res.json() as { ok: boolean; label?: string; erro?: string }
      setTestResult(data)
    } catch {
      setTestResult({ ok: false, erro: 'Erro de rede ao testar conexão' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Section
      icon="account_balance"
      title="Integra Contador — SERPRO"
      subtitle="Acesso a serviços da Receita Federal: Situação Fiscal, MEI, Simples Nacional, Caixa Postal e mais"
      configCount={configCount}
    >
      <ToggleSwitch
        label="Integração habilitada"
        subtitle="Ativa as ferramentas da IA e o acesso ao painel"
        checked={enabled}
        onChange={setEnabled}
      />

      <RadioOptionGroup
        label="Ambiente"
        options={[
          { value: 'homologacao', label: 'Homologação', sub: 'Testes — dados simulados pelo SERPRO' },
          { value: 'producao',    label: 'Produção',    sub: 'Dados reais da Receita Federal' },
        ]}
        selected={ambiente}
        onChange={v => setAmbiente(v as 'homologacao' | 'producao')}
      />

      <SubSection title="Credenciais OAuth" subtitle="Obtidas ao contratar o serviço Integra Contador no portal apicenter.estaleiro.serpro.gov.br.">
        <div>
          <FieldLabel label="Consumer Key (Client ID)" configured={!!clientId} />
          <input value={clientId} onChange={e => setClientId(e.target.value)} className={INPUT} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" autoComplete="off" />
        </div>
        <SecretField
          label="Consumer Secret"
          configured={configured.secret}
          placeholder={configured.secret ? 'Novo secret (deixe em branco para manter)' : 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}
          value={secret}
          onChange={setSecret}
        />
      </SubSection>

      <SubSection title="Certificado e-CNPJ do Escritório" subtitle="Necessário para serviços que exigem assinatura digital. Arquivo .pfx/.p12 do certificado e-CNPJ do escritório.">
        <div>
          <FieldLabel label="Arquivo do certificado (.pfx / .p12)" configured={configured.certBase64} />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => certInputRef.current?.click()}
              className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-2.5 text-[13px] font-semibold text-on-surface transition-colors hover:bg-surface-container"
            >
              <span className="material-symbols-outlined text-[16px]">upload_file</span>
              {certFileName ? 'Trocar arquivo' : 'Selecionar arquivo'}
            </button>
            {certFileName ? (
              <span className="text-[12px] font-mono text-on-surface-variant truncate max-w-[200px]">{certFileName}</span>
            ) : configured.certBase64 ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-green-600">
                <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                Certificado configurado
              </span>
            ) : (
              <span className="text-[11px] text-on-surface-variant/50">Nenhum arquivo selecionado</span>
            )}
          </div>
          <input ref={certInputRef} type="file" accept=".pfx,.p12" onChange={handleCertFile} className="hidden" />
        </div>
        <SecretField
          label="Senha do certificado"
          configured={configured.certSenha}
          placeholder={configured.certSenha ? 'Nova senha (deixe em branco para manter)' : 'Senha do arquivo .pfx'}
          value={certSenha}
          onChange={setCertSenha}
        />
      </SubSection>

      {/* Módulos contratados */}
      <div>
        <label className="mb-2 block text-[13px] font-semibold text-on-surface-variant">Módulos Contratados</label>
        <p className="mb-3 text-[11px] text-on-surface-variant/70">
          Selecione apenas os módulos que constam no seu contrato SERPRO. A IA só usará os módulos habilitados.
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {MODULOS_DISPONIVEIS.map(mod => (
            <label
              key={mod.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                modulos.includes(mod.id)
                  ? 'border-primary/50 bg-primary/5 ring-2 ring-primary/20'
                  : 'border-outline-variant/20 hover:border-outline-variant/40',
              )}
            >
              <input type="checkbox" checked={modulos.includes(mod.id)} onChange={() => toggleModulo(mod.id)} className="mt-0.5 accent-primary shrink-0" />
              <div>
                <p className={cn('text-[12px] font-semibold', modulos.includes(mod.id) ? 'text-primary' : 'text-on-surface')}>{mod.label}</p>
                <p className="text-[10px] text-on-surface-variant/70">{mod.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* DAS MEI — automação */}
      {modulos.includes('integra-mei') && (
        <div className="space-y-3 rounded-xl border border-outline-variant/20 bg-surface-container-low/30 p-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>receipt_long</span>
            <p className="text-[13px] font-semibold text-on-surface">Automação DAS MEI</p>
          </div>
          <p className="text-[11px] text-on-surface-variant/70">
            Configurações para geração automática e notificação da DAS de clientes MEI.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">Dia de vencimento</label>
              <input type="number" min={1} max={31} value={dasMeiVencimentoDia} onChange={e => setDasMeiVencimentoDia(Number(e.target.value))} className={cn(INPUT, 'h-10 text-[13px]')} placeholder="20" />
              <p className="mt-1 text-[10px] text-on-surface-variant/60">Ex: 20 = todo dia 20 do mês</p>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">Dias de antecedência</label>
              <input type="number" min={1} max={15} value={dasMeiDiasAntecedencia} onChange={e => setDasMeiDiasAntecedencia(Number(e.target.value))} className={cn(INPUT, 'h-10 text-[13px]')} placeholder="5" />
              <p className="mt-1 text-[10px] text-on-surface-variant/60">Dias antes do vencimento para gerar a DAS</p>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[12px] font-semibold text-on-surface-variant">Canais de notificação</label>
            <div className="space-y-2">
              {[
                { label: 'E-mail',     icon: 'email',         val: dasMeiCanalEmail,    set: setDasMeiCanalEmail },
                { label: 'WhatsApp',   icon: 'chat',          val: dasMeiCanalWhatsapp, set: setDasMeiCanalWhatsapp },
                { label: 'Push (PWA)', icon: 'notifications', val: dasMeiCanalPwa,      set: setDasMeiCanalPwa },
              ].map(ch => (
                <label key={ch.label} className="flex cursor-pointer items-center justify-between rounded-lg border border-outline-variant/15 bg-surface-container-lowest/60 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[15px] text-on-surface-variant">{ch.icon}</span>
                    <span className="text-[12px] text-on-surface">{ch.label}</span>
                  </div>
                  <ToggleSwitch label="" checked={ch.val} onChange={ch.set} size="sm" />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Resultado do teste */}
      {testResult && (
        <div className={cn(
          'rounded-xl border p-3 text-[12px]',
          testResult.ok ? 'border-green-500/30 bg-green-500/5 text-green-700' : 'border-red-500/30 bg-red-500/5 text-red-700',
        )}>
          <div className="flex items-center gap-2 font-semibold">
            <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              {testResult.ok ? 'check_circle' : 'error'}
            </span>
            {testResult.ok ? testResult.label : 'Falha na conexão'}
          </div>
          {testResult.erro && <p className="mt-1 text-[11px] opacity-80">{testResult.erro}</p>}
        </div>
      )}

      <InfoBox
        title="Pré-requisitos"
        items={[
          'Contrato ativo com o SERPRO para o produto Integra Contador',
          'Cada cliente precisa conceder procuração digital ao escritório via e-CAC (portal.estaleiro.serpro.gov.br)',
          'O certificado e-CNPJ é o do escritório, não de cada cliente',
          'Sem procuração, as consultas daquele CNPJ retornam erro 403',
        ]}
      />

      {/* Botões de ação */}
      <div className="flex items-center justify-end gap-3 pt-1">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || loading}
          className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-2.5 text-[13px] font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60"
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">wifi_tethering</span>}
          Testar conexão
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || testing}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">save</span>}
          Salvar
        </button>
      </div>
    </Section>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function IntegracoesPage() {
  const [loading, setLoading] = useState(false)
  const [configured, setConfigured] = useState<Configured>({
    zapsignToken: false, clicksignKey: false, clicksignHmacSecret: false,
    zapiInstanceId: false, zapiToken: false, serproCpfToken: false, serproCnpjToken: false,
    asaasApiKey: false, asaasWebhookToken: false, spedyApiKey: false,
  })

  const { register, handleSubmit, reset, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { provedorAssinatura: 'zapsign' },
  })

  const provedor = watch('provedorAssinatura')
  const asaasAmbiente = watch('asaasAmbiente')
  const spedyAmbiente = watch('spedyAmbiente')
  const spedyIssWithheld = watch('spedyIssWithheld')
  const spedyAutoEmitirOS = watch('spedyAutoEmitirOS')
  const spedyEnviarAoAutorizar = watch('spedyEnviarAoAutorizar')
  const spedyEnviarCanalPadrao = watch('spedyEnviarCanalPadrao')
  const spedyTaxationType = watch('spedyTaxationType')

  useEffect(() => {
    void fetch('/api/escritorio')
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        if (!data) return
        const issAliquotaDecimal = data.spedyIssAliquota != null ? Number(data.spedyIssAliquota) : null
        reset({
          provedorAssinatura: (data.provedorAssinatura as string) === 'clicksign' ? 'clicksign' : 'zapsign',
          asaasAmbiente: (data.asaasAmbiente as string) === 'producao' ? 'producao' : 'sandbox',
          spedyAmbiente: (data.spedyAmbiente as string) === 'producao' ? 'producao' : 'sandbox',
          zapsignToken: '', clicksignKey: '', clicksignHmacSecret: '',
          zapiInstanceId: '', zapiToken: '', serproCpfToken: '', serproCnpjToken: '',
          asaasApiKey: '', asaasWebhookToken: '', spedyApiKey: '',
          spedyFederalServiceCode: (data.spedyFederalServiceCode as string) ?? '',
          spedyCityServiceCode: (data.spedyCityServiceCode as string) ?? '',
          spedyIssAliquotaPercent: issAliquotaDecimal != null ? Math.round(issAliquotaDecimal * 10000) / 100 : 5,
          spedyTaxationType: (data.spedyTaxationType as FormData['spedyTaxationType']) ?? 'taxationInMunicipality',
          spedyIssWithheld: (data.spedyIssWithheld as boolean) ?? false,
          spedyAutoEmitirOS: (data.spedyAutoEmitirOS as boolean) ?? false,
          spedyEnviarAoAutorizar: (data.spedyEnviarAoAutorizar as boolean) ?? true,
          spedyEnviarCanalPadrao: (data.spedyEnviarCanalPadrao as FormData['spedyEnviarCanalPadrao']) ?? 'whatsapp',
          spedyDescricaoTemplate: (data.spedyDescricaoTemplate as string) ?? '',
        })
        setConfigured({
          zapsignToken: !!data.zapsignToken, clicksignKey: !!data.clicksignKey,
          clicksignHmacSecret: !!data.clicksignHmacSecret, zapiInstanceId: !!data.zapiInstanceId,
          zapiToken: !!data.zapiToken, serproCpfToken: !!data.serproCpfToken,
          serproCnpjToken: !!data.serproCnpjToken, asaasApiKey: !!data.asaasApiKey,
          asaasWebhookToken: !!data.asaasWebhookToken, spedyApiKey: !!data.spedyApiKey,
        })
      })
  }, [reset])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const payload: Record<string, unknown> = {
        provedorAssinatura: data.provedorAssinatura,
        asaasAmbiente: data.asaasAmbiente ?? 'sandbox',
        spedyAmbiente: data.spedyAmbiente ?? 'sandbox',
      }
      // Só envia campos secretos se foram alterados
      const secretFields = [
        'zapsignToken', 'clicksignKey', 'clicksignHmacSecret',
        'zapiInstanceId', 'zapiToken', 'serproCpfToken', 'serproCnpjToken',
        'asaasApiKey', 'asaasWebhookToken', 'spedyApiKey',
      ] as const
      for (const key of secretFields) {
        if (data[key]) payload[key] = data[key]
      }

      // Configuração fiscal Spedy
      payload.spedyFederalServiceCode = data.spedyFederalServiceCode ?? ''
      payload.spedyCityServiceCode    = data.spedyCityServiceCode ?? ''
      payload.spedyIssAliquota        = data.spedyIssAliquotaPercent != null
        ? Math.round(data.spedyIssAliquotaPercent * 100) / 10000
        : 0.05
      payload.spedyTaxationType       = data.spedyTaxationType ?? 'taxationInMunicipality'
      payload.spedyIssWithheld        = data.spedyIssWithheld ?? false
      payload.spedyAutoEmitirOS       = data.spedyAutoEmitirOS ?? false
      payload.spedyEnviarAoAutorizar  = data.spedyEnviarAoAutorizar ?? true
      payload.spedyEnviarCanalPadrao  = data.spedyEnviarCanalPadrao ?? 'whatsapp'
      payload.spedyDescricaoTemplate  = data.spedyDescricaoTemplate ?? ''

      const res = await fetch('/api/escritorio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()

      setConfigured(prev => {
        const next = { ...prev }
        for (const key of secretFields) {
          next[key] = prev[key] || !!data[key]
        }
        return next
      })
      toast.success('Integrações salvas.')
    } catch {
      toast.error('Não foi possível salvar as integrações. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const spedyCount = configured.spedyApiKey ? 1 : 0
  const assinaturaCount =
    (provedor === 'zapsign' ? (configured.zapsignToken ? 1 : 0) : 0) +
    (provedor === 'clicksign' ? (configured.clicksignKey ? 1 : 0) + (configured.clicksignHmacSecret ? 1 : 0) : 0)
  const zapiCount = (configured.zapiInstanceId ? 1 : 0) + (configured.zapiToken ? 1 : 0)
  const serproCount = (configured.serproCpfToken ? 1 : 0) + (configured.serproCnpjToken ? 1 : 0)
  const asaasCount = (configured.asaasApiKey ? 1 : 0) + (configured.asaasWebhookToken ? 1 : 0)

  return (
    <div className="space-y-3">

      {/* ── Assinatura Eletrônica ──────────────────────────────────────── */}
      <Section icon="draw" title="Assinatura Eletrônica" subtitle="Provedor para envio e assinatura de contratos" configCount={assinaturaCount} defaultOpen>
        <RadioOptionGroup
          options={[
            { value: 'zapsign',  label: 'ZapSign',   sub: 'Brasileira · ICP-Basic' },
            { value: 'clicksign', label: 'ClickSign', sub: 'Brasileira · ICP-Basic' },
          ]}
          selected={provedor}
          register={register('provedorAssinatura')}
        />

        {provedor === 'zapsign' && (
          <SubSection title="ZapSign" badge="Ativo">
            <SecretField
              label="API Token"
              configured={configured.zapsignToken}
              placeholder={configured.zapsignToken ? 'Nova chave (deixe em branco para manter)' : 'Cole o token da aba Configurações → Integrações do ZapSign'}
              hint="Dashboard ZapSign → Configurações → Integrações → API Token"
              register={register('zapsignToken')}
            />
          </SubSection>
        )}

        {provedor === 'clicksign' && (
          <SubSection title="ClickSign" badge="Ativo">
            <SecretField
              label="Access Token (API Key)"
              configured={configured.clicksignKey}
              placeholder={configured.clicksignKey ? 'Nova chave (deixe em branco para manter)' : 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
              hint="ClickSign → Conta → Integrações → Access Token"
              register={register('clicksignKey')}
            />
            <SecretField
              label="HMAC Secret (Webhook)"
              configured={configured.clicksignHmacSecret}
              placeholder={configured.clicksignHmacSecret ? 'Nova chave (deixe em branco para manter)' : 'Chave HMAC SHA256 fornecida pelo ClickSign'}
              hint="ClickSign → Configurações → Webhooks → HMAC SHA256 Secret"
              register={register('clicksignHmacSecret')}
            />
          </SubSection>
        )}
      </Section>

      {/* ── Asaas (Cobranças) ─────────────────────────────────────────── */}
      <Section icon="payments" title="Asaas" subtitle="Gestão de cobranças, boletos e PIX recorrentes" configCount={asaasCount}>
        <RadioOptionGroup
          label="Ambiente"
          options={AMBIENTE_OPTIONS}
          selected={asaasAmbiente}
          register={register('asaasAmbiente')}
        />
        <SecretField
          label="API Key"
          configured={configured.asaasApiKey}
          placeholder={configured.asaasApiKey ? 'Nova chave (deixe em branco para manter)' : '$aact_... (API Key do painel Asaas)'}
          hint="Asaas → Minha Conta → Integrações → API Key"
          register={register('asaasApiKey')}
        />
        <SecretField
          label="Webhook Token"
          configured={configured.asaasWebhookToken}
          placeholder={configured.asaasWebhookToken ? 'Novo token (deixe em branco para manter)' : 'Token secreto para validar eventos do webhook'}
          hint="Defina um token secreto qualquer. Configure o mesmo no Asaas → Configurações → Notificações → Webhook. URL: https://seudominio/api/webhooks/asaas"
          register={register('asaasWebhookToken')}
        />
      </Section>

      {/* ── Z-API (WhatsApp) ──────────────────────────────────────────── */}
      <Section icon="chat" title="Z-API (WhatsApp)" subtitle="Envio de mensagens automáticas via WhatsApp" configCount={zapiCount}>
        <div className="grid gap-4 md:grid-cols-2">
          {([
            { name: 'zapiInstanceId' as const, label: 'Instance ID', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxx' },
            { name: 'zapiToken' as const,      label: 'Token',       placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxx' },
          ] as const).map(campo => (
            <SecretField
              key={campo.name}
              label={campo.label}
              configured={configured[campo.name]}
              placeholder={configured[campo.name] ? 'Nova chave (deixe em branco para manter)' : campo.placeholder}
              register={register(campo.name)}
            />
          ))}
        </div>
      </Section>

      {/* ── Spedy (NFS-e) ─────────────────────────────────────────────── */}
      <Section icon="receipt_long" title="Spedy — Nota Fiscal de Serviço" subtitle="Emissão de NFS-e automatizada para clientes via IA ou painel" configCount={spedyCount}>
        <RadioOptionGroup
          label="Ambiente"
          options={[
            { value: 'sandbox',  label: 'Sandbox',  sub: 'Testes — notas não são registradas na prefeitura' },
            { value: 'producao', label: 'Produção', sub: 'Emissão real — notas enviadas à prefeitura' },
          ]}
          selected={spedyAmbiente}
          register={register('spedyAmbiente')}
        />
        <SecretField
          label="API Key Owner (chave mestra)"
          configured={configured.spedyApiKey}
          placeholder={configured.spedyApiKey ? 'Nova chave (deixe em branco para manter)' : 'sk_... (Owner API Key do painel Spedy)'}
          hint="Painel Spedy → Configurações → Integrações → API Keys → Owner Key. Essa chave permite criar empresas secundárias para cada cliente."
          register={register('spedyApiKey')}
        />

        {/* Configuração Fiscal Padrão */}
        <SubSection title="Configuração Fiscal Padrão" subtitle="Usados como fallback em toda emissão — podem ser sobrescritos por cliente.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-semibold text-on-surface-variant mb-1.5">Código LC 116/03</label>
              <input {...register('spedyFederalServiceCode')} className={INPUT} placeholder="ex: 1.07" />
              <p className="mt-1 text-[11px] text-on-surface-variant/60">Código federal de serviço (tabela LC 116)</p>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-on-surface-variant mb-1.5">Código Municipal</label>
              <input {...register('spedyCityServiceCode')} className={INPUT} placeholder="ex: 0107" />
              <p className="mt-1 text-[11px] text-on-surface-variant/60">Código de serviço da prefeitura</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-semibold text-on-surface-variant mb-1.5">Alíquota ISS (%)</label>
              <input {...register('spedyIssAliquotaPercent', { valueAsNumber: true })} type="number" step="0.01" min="0" max="100" className={INPUT} placeholder="5" />
              <p className="mt-1 text-[11px] text-on-surface-variant/60">Ex: 5 = 5% de ISS. Padrão: 5%.</p>
            </div>
            <BooleanRadio
              label="ISS Retido na Fonte"
              value={spedyIssWithheld ?? false}
              onChange={v => setValue('spedyIssWithheld', v)}
              labels={{ true: 'Retido', false: 'Não retido' }}
            />
          </div>

          <RadioOptionGroup
            label="Tipo de Tributação"
            options={TAXATION_OPTIONS}
            selected={spedyTaxationType}
            register={register('spedyTaxationType')}
          />
        </SubSection>

        {/* Entrega */}
        <SubSection title="Entrega ao Cliente">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BooleanRadio
              label="Auto-emitir ao fechar OS"
              hint="Emite a NFS-e automaticamente quando uma OS é resolvida"
              value={spedyAutoEmitirOS ?? false}
              onChange={v => setValue('spedyAutoEmitirOS', v)}
            />
            <BooleanRadio
              label="Enviar PDF ao autorizar"
              hint="Entrega o PDF da NFS-e ao cliente logo após a autorização da prefeitura"
              value={spedyEnviarAoAutorizar ?? true}
              onChange={v => setValue('spedyEnviarAoAutorizar', v)}
            />
          </div>

          <RadioOptionGroup
            label="Canal de entrega padrão"
            options={CANAL_OPTIONS}
            selected={spedyEnviarCanalPadrao}
            register={register('spedyEnviarCanalPadrao')}
            cols={3}
          />
          <p className="-mt-3 text-[11px] text-on-surface-variant/60">Canal usado quando a entrega é disparada automaticamente. Sempre disponível no portal independente da escolha.</p>

          <div>
            <label className="block text-[13px] font-semibold text-on-surface-variant mb-1.5">Template de descrição da NFS-e</label>
            <textarea
              {...register('spedyDescricaoTemplate')}
              rows={3}
              className="w-full resize-y rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[13px] font-mono text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 placeholder:font-sans custom-scrollbar"
              placeholder="Deixe em branco para usar a descrição informada em cada emissão."
            />
            <p className="mt-1 text-[11px] text-on-surface-variant/60">
              Variáveis: <code className="rounded bg-surface-container px-1 py-0.5 text-[10px]">{'{{cliente.nome}}'}</code>{' '}
              <code className="rounded bg-surface-container px-1 py-0.5 text-[10px]">{'{{os.numero}}'}</code>{' '}
              <code className="rounded bg-surface-container px-1 py-0.5 text-[10px]">{'{{competencia}}'}</code>
            </p>
          </div>
        </SubSection>

        <InfoBox
          title="Como funciona"
          items={[
            'A chave Owner permite gerenciar NFS-e de todos os clientes via uma única conta Spedy',
            'Cada cliente recebe uma empresa secundária com API Key própria (criada automaticamente pelo AVOS)',
            'A IA consegue emitir, consultar e cancelar notas diretamente pelo chat (WhatsApp, portal e CRM)',
            'O webhook de status é configurado automaticamente ao salvar a chave',
          ]}
          footer="Webhook URL: https://seudominio/api/webhooks/spedy/[token] — configurado automaticamente"
        />
      </Section>

      {/* ── Integra Contador (SERPRO) ─────────────────────────────────── */}
      <IntegraContadorSection />

      {/* ── Serpro ────────────────────────────────────────────────────── */}
      <Section icon="verified_user" title="Serpro" subtitle="Validação de CPF e CNPJ" configCount={serproCount}>
        <div className="grid gap-4 md:grid-cols-2">
          {([
            { name: 'serproCpfToken' as const,  label: 'Token CPF',  placeholder: 'Bearer xxxxxxxxxxxxxxxx' },
            { name: 'serproCnpjToken' as const, label: 'Token CNPJ', placeholder: 'Bearer xxxxxxxxxxxxxxxx' },
          ] as const).map(campo => (
            <SecretField
              key={campo.name}
              label={campo.label}
              configured={configured[campo.name]}
              placeholder={configured[campo.name] ? 'Nova chave (deixe em branco para manter)' : campo.placeholder}
              register={register(campo.name)}
            />
          ))}
        </div>
      </Section>

      <div className="flex flex-col-reverse md:flex-row md:items-center justify-end gap-3 pt-1">
        <button
          onClick={handleSubmit(onSubmit)}
          disabled={loading}
          className="w-full md:w-auto flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60 min-w-[160px]"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">save</span>}
          Salvar integrações
        </button>
      </div>
    </div>
  )
}
