'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const INPUT = 'w-full rounded-xl border border-transparent bg-surface-container-lowest/80 px-4 py-3 text-[14px] font-medium text-on-surface shadow-sm placeholder:text-on-surface-variant/40 transition-all hover:bg-surface-container-lowest focus:border-primary/30 focus:bg-card focus:outline-none focus:ring-4 focus:ring-primary/5'
const LABEL = 'block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2'

type EmailConfig = {
  emailRemetente: string
  emailNome: string
  emailSenha: string
  emailSmtpHost: string
  emailSmtpPort: string
  emailImapHost: string
  emailImapPort: string
}

type ImapStatus = {
  status: 'nunca' | 'ok' | 'erro'
  ultimaSync: number | null
  ultimoErro: string | null
  falhasConsecutivas: number
  processados: number
  associados: number
}

type SmtpStatus = {
  status: 'nunca' | 'ok' | 'erro'
  ultimoEnvio: number | null
  ultimoErro: string | null
  provider: 'resend' | 'smtp' | null
}

type EmailHealth = { imap: ImapStatus; smtp: SmtpStatus }

const EMPTY: EmailConfig = {
  emailRemetente: '', emailNome: '', emailSenha: '',
  emailSmtpHost: '', emailSmtpPort: '',
  emailImapHost: '', emailImapPort: '',
}

function StatusBadge({ status }: { status: 'nunca' | 'ok' | 'erro' }) {
  if (status === 'ok') return <span className="flex items-center gap-1 rounded-full bg-green-status/10 px-2.5 py-0.5 text-[11px] font-semibold text-green-status"><span className="h-1.5 w-1.5 rounded-full bg-green-status" />OK</span>
  if (status === 'erro') return <span className="flex items-center gap-1 rounded-full bg-error/10 px-2.5 py-0.5 text-[11px] font-semibold text-error"><span className="h-1.5 w-1.5 rounded-full bg-error" />Erro</span>
  return <span className="flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-0.5 text-[11px] font-semibold text-on-surface-variant"><span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/30" />Nunca usado</span>
}

export default function EmailPage() {
  const [config, setConfig] = useState<EmailConfig>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testingImap, setTestingImap] = useState(false)
  const [senhaSalva, setSenhaSalva] = useState(false)
  const [emailHealth, setEmailHealth] = useState<EmailHealth | null>(null)

  useEffect(() => {
    fetch('/api/configuracoes/email')
      .then(r => r.json())
      .then(data => {
        if (data) {
          setConfig(data)
          if (data.emailSenha) setSenhaSalva(true)
        }
      })
    fetch('/api/email/sync')
      .then(r => r.json())
      .then(data => setEmailHealth(data))
      .catch(err => console.error('[crm/email-config] falha:', err))
  }, [])

  function set(field: keyof EmailConfig, value: string) {
    setConfig(c => ({ ...c, [field]: value }))
    if (field === 'emailSenha') setSenhaSalva(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/configuracoes/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!res.ok) throw new Error()
      toast.success('Configurações de e-mail salvas!')
      if (config.emailSenha) setSenhaSalva(true)
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestImap() {
    setTestingImap(true)
    try {
      const res = await fetch('/api/configuracoes/email', { method: 'PATCH' })
      const data = await res.json()
      if (data.ok) toast.success('Conexão IMAP OK!')
      else toast.error(`Erro IMAP: ${data.erro ?? 'Falha na conexão'}`)
    } catch {
      toast.error('Erro ao testar IMAP')
    } finally {
      setTestingImap(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    try {
      const res = await fetch('/api/configuracoes/email', { method: 'POST' })
      const data = await res.json()
      if (data.ok) toast.success('Conexão SMTP OK!')
      else toast.error(`Erro: ${data.erro ?? 'Falha na conexão'}`)
    } catch {
      toast.error('Erro ao testar conexão')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card p-4 md:p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>mail</span>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-on-surface">E-mail de envio</h3>
            <p className="text-[12px] text-on-surface-variant/80">Conta usada para enviar contratos, notificações e boletos</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          <div className="space-y-1.5">
            <label className={LABEL}>E-mail remetente</label>
            <input className={INPUT} placeholder="contato@escritorio.com.br"
              value={config.emailRemetente} onChange={e => set('emailRemetente', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className={LABEL}>Nome do remetente</label>
            <input className={INPUT} placeholder="Escritório Contábil"
              value={config.emailNome} onChange={e => set('emailNome', e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className={LABEL}>Senha do e-mail</label>
              {senhaSalva && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-green-status">
                  <span className="material-symbols-outlined text-[13px]">check_circle</span>
                  Configurada
                </span>
              )}
            </div>
            <input type="password" className={INPUT}
              placeholder={senhaSalva ? 'Nova senha (deixe em branco para manter)' : '••••••••'}
              value={config.emailSenha} onChange={e => set('emailSenha', e.target.value)}
              autoComplete="new-password" />
            <p className="text-[11px] text-on-surface-variant/50">Armazenada com encriptação AES-256-GCM.</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card p-4 md:p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>outgoing_mail</span>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-on-surface">Servidor SMTP</h3>
            <p className="text-[12px] text-on-surface-variant/80">Configurações de envio de e-mail</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          <div className="space-y-1.5">
            <label className={LABEL}>Servidor SMTP</label>
            <input className={INPUT} placeholder="smtp.hostinger.com"
              value={config.emailSmtpHost} onChange={e => set('emailSmtpHost', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className={LABEL}>Porta SMTP</label>
            <input className={INPUT} placeholder="587" inputMode="numeric"
              value={config.emailSmtpPort} onChange={e => set('emailSmtpPort', e.target.value)} />
            <p className="text-[11px] text-on-surface-variant/50">587 (TLS) ou 465 (SSL). Padrão: 587.</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card p-4 md:p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>inbox</span>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-on-surface">Servidor IMAP</h3>
            <p className="text-[12px] text-on-surface-variant/80">Configurações de recebimento de e-mail</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          <div className="space-y-1.5">
            <label className={LABEL}>Servidor IMAP</label>
            <input className={INPUT} placeholder="imap.hostinger.com"
              value={config.emailImapHost} onChange={e => set('emailImapHost', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className={LABEL}>Porta IMAP</label>
            <input className={INPUT} placeholder="993" inputMode="numeric"
              value={config.emailImapPort} onChange={e => set('emailImapPort', e.target.value)} />
            <p className="text-[11px] text-on-surface-variant/50">993 (SSL). Padrão: 993.</p>
          </div>
        </div>
      </div>

      {/* ── Saúde do e-mail ── */}
      {emailHealth && (
        <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-outline-variant/10 px-6 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>monitor_heart</span>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-on-surface">Saúde do e-mail</h3>
              <p className="text-[12px] text-on-surface-variant/80">Status dos serviços de envio e recebimento</p>
            </div>
          </div>
          <div className="divide-y divide-outline-variant/10">
            {/* SMTP / Resend */}
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">outgoing_mail</span>
                <div>
                  <p className="text-[13px] font-medium text-on-surface">
                    Envio ({emailHealth.smtp.provider === 'resend' ? 'Resend' : emailHealth.smtp.provider === 'smtp' ? 'SMTP' : '—'})
                  </p>
                  {emailHealth.smtp.ultimoEnvio && (
                    <p className="text-[11px] text-on-surface-variant/60">
                      Último envio: {new Date(emailHealth.smtp.ultimoEnvio).toLocaleString('pt-BR')}
                    </p>
                  )}
                  {emailHealth.smtp.status === 'erro' && emailHealth.smtp.ultimoErro && (
                    <p className="mt-0.5 text-[11px] text-error truncate max-w-xs">{emailHealth.smtp.ultimoErro}</p>
                  )}
                </div>
              </div>
              <StatusBadge status={emailHealth.smtp.status} />
            </div>
            {/* IMAP */}
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">inbox</span>
                <div>
                  <p className="text-[13px] font-medium text-on-surface">Recebimento (IMAP)</p>
                  {emailHealth.imap.ultimaSync && (
                    <p className="text-[11px] text-on-surface-variant/60">
                      Última sync: {new Date(emailHealth.imap.ultimaSync).toLocaleString('pt-BR')}
                      {emailHealth.imap.status === 'ok' && ` · ${emailHealth.imap.processados} processado${emailHealth.imap.processados !== 1 ? 's' : ''}`}
                    </p>
                  )}
                  {emailHealth.imap.status === 'erro' && (
                    <p className="mt-0.5 text-[11px] text-error truncate max-w-xs">
                      {emailHealth.imap.falhasConsecutivas}x consecutivas — {emailHealth.imap.ultimoErro}
                    </p>
                  )}
                </div>
              </div>
              <StatusBadge status={emailHealth.imap.status} />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col-reverse md:flex-row items-center gap-3 justify-end">
        <button onClick={handleTest} disabled={testing}
          className="w-full md:w-auto flex items-center justify-center gap-2 rounded-xl border border-outline-variant/30 bg-card px-5 py-2.5 text-[13px] font-semibold text-on-surface shadow-sm hover:bg-surface-container-low transition-colors disabled:opacity-60">
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">wifi_tethering</span>}
          Testar SMTP
        </button>
        <button onClick={handleTestImap} disabled={testingImap}
          className="w-full md:w-auto flex items-center justify-center gap-2 rounded-xl border border-outline-variant/30 bg-card px-5 py-2.5 text-[13px] font-semibold text-on-surface shadow-sm hover:bg-surface-container-low transition-colors disabled:opacity-60">
          {testingImap ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">inbox</span>}
          Testar IMAP
        </button>
        <button onClick={handleSave} disabled={saving}
          className="w-full md:w-auto flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-60 min-w-[140px]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">save</span>}
          Salvar
        </button>
      </div>
    </div>
  )
}
