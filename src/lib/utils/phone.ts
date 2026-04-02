/**
 * Utilitários de normalização de número de telefone brasileiro.
 * Cobre variantes de formatação, código de país e migração de 8→9 dígitos.
 */

/**
 * Normaliza um número de telefone (remoteJid do WhatsApp ou string raw)
 * e retorna todas as variantes possíveis para busca em banco.
 *
 * Cobre:
 *  - com/sem código do país (+55)
 *  - com/sem DDD
 *  - celulares brasileiros com/sem 9º dígito (migração 8→9 dígitos)
 */
export function normalizarPhone(input: string): string[] {
  const digits = input.replace('@s.whatsapp.net', '').replace(/\D/g, '')
  const variants = new Set<string>([
    digits,
    digits.length > 2 ? digits.slice(2) : '',  // sem 55
    digits.length > 4 ? digits.slice(4) : '',  // sem 55+DDD
    digits.length > 3 ? digits.slice(3) : '',  // sem 55+DDD (DDDs antigos)
  ])
  // Celulares brasileiros: migração de 8→9 dígitos após o DDD
  // 12 dígitos (55+DDD+8d) → também tenta com 9 (55+DDD+9+8d = 13d)
  if (digits.length === 12 && digits.startsWith('55')) {
    const com9 = digits.slice(0, 4) + '9' + digits.slice(4)
    variants.add(com9)
    variants.add(com9.slice(2)) // sem 55
  }
  // 13 dígitos (55+DDD+9+8d) → também tenta sem 9 (55+DDD+8d = 12d)
  if (digits.length === 13 && digits.startsWith('55') && digits[4] === '9') {
    const sem9 = digits.slice(0, 4) + digits.slice(5)
    variants.add(sem9)
    variants.add(sem9.slice(2)) // sem 55
  }
  return [...variants].filter(v => v.length >= 8)
}
