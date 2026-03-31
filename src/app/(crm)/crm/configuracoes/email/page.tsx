'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'

type EmailConfig = {
  emailRemetente: string
  emailNome:      string
  emailSenha:     string
  emailSmtpHost:  string
  emailSmtpPort:  string
  emailImapHost:  string
  emailImapPort:  string
}

const EMPTY: EmailConfig = {
  emailRemetente: '', emailNome: '', emailSenha: '',
  emailSmtpHost: '', emailSmtpPort: '',
  emailImapHost: '', emailImapPort: '',
}

export default function EmailPage() {
  const [config, setConfig]     = useState<EmailConfig>(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [testing, setTesting]       = useState(false)
  const [testingImap, setTestingImap] = useState(false)
  const [senhaSalva, setSenhaSalva] = useState(false)

  useEffect(() => {
    fetch('/api/configuracoes/email')
      .then(r => r.json())
      .then(data => {
        if (data) {
          setConfig(data)
          if (data.emailSenha) setSenhaSalva(true)
        }
      })
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
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
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

      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
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

      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
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

      <div className="flex items-center gap-3">
        <button onClick={handleTest} disabled={testing}
          className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-card px-5 py-2.5 text-[13px] font-semibold text-on-surface shadow-sm hover:bg-surface-container-low transition-colors disabled:opacity-60">
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">wifi_tethering</span>}
          Testar SMTP
        </button>
        <button onClick={handleTestImap} disabled={testingImap}
          className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-card px-5 py-2.5 text-[13px] font-semibold text-on-surface shadow-sm hover:bg-surface-container-low transition-colors disabled:opacity-60">
          {testingImap ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">inbox</span>}
          Testar IMAP
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-60 min-w-[140px] justify-center">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">save</span>}
          Salvar
        </button>
      </div>
    </div>
  )
}
