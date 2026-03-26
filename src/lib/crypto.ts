import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALG = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex) throw new Error('ENCRYPTION_KEY não configurada')
  const buf = Buffer.from(hex, 'hex')
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY deve ter 64 caracteres hex (256 bits)')
  return buf
}

// Formato armazenado: "iv:authTag:ciphertext" em base64
export function encrypt(plain: string): string {
  const key = getKey()
  const iv = randomBytes(12) // 96 bits — recomendado para GCM
  const cipher = createCipheriv(ALG, key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':')
}

export function decrypt(stored: string): string {
  const key = getKey()
  const [ivB64, authTagB64, encB64] = stored.split(':')
  if (!ivB64 || !authTagB64 || !encB64) throw new Error('Formato de chave encriptada inválido')
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')
  const enc = Buffer.from(encB64, 'base64')
  const decipher = createDecipheriv(ALG, key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(enc) + decipher.final('utf8')
}

// Retorna true se o valor parece ser encriptado no formato "iv:authTag:ciphertext" (AES-256-GCM base64)
// Valida que cada parte é base64 válido e tem comprimento compatível com o formato gerado por encrypt()
export function isEncrypted(val: string): boolean {
  const parts = val.split(':')
  if (parts.length !== 3) return false
  const base64Re = /^[A-Za-z0-9+/]+=*$/
  // iv: 12 bytes → 16 chars base64 | authTag: 16 bytes → 24 chars | ciphertext: >= 1 char
  const [iv, tag, cipher] = parts
  return (
    base64Re.test(iv)     && iv.length === 16 &&
    base64Re.test(tag)    && tag.length === 24 &&
    base64Re.test(cipher) && cipher.length >= 4
  )
}

// Mascara o valor para exibição: "sk-ant-...••••3f2a"
export function maskKey(val: string): string {
  if (!val || val.length < 8) return '••••••••'
  const plain = isEncrypted(val) ? tryDecryptLast4(val) : val
  if (!plain) return '••••••••'
  return `${'•'.repeat(12)}${plain.slice(-4)}`
}

function tryDecryptLast4(stored: string): string | null {
  try {
    const plain = decrypt(stored)
    return plain
  } catch {
    return null
  }
}
