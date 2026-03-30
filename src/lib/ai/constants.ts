/**
 * Constantes compartilhadas do módulo de IA — usadas em logs, saúde, notificações, etc.
 */

export const FEATURE_LABELS: Record<string, string> = {
  crm:        'CRM',
  whatsapp:   'WhatsApp',
  onboarding: 'Onboarding',
  portal:     'Portal',
}

export const PROVIDER_LABELS: Record<string, string> = {
  claude:  'Claude (Anthropic)',
  openai:  'OpenAI',
  google:  'Google',
  groq:    'Groq',
  voyage:  'Voyage',
}
