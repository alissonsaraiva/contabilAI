/**
 * Geração de tokens do portal do cliente.
 * Usado tanto pelo magic-link (30 min) quanto pelo e-mail de boas-vindas (24h).
 */
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

export async function criarTokenPortal(
  clienteId: string,
  expiracaoMs = 30 * 60 * 1000,  // 30 minutos padrão
): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('base64url')
  const hash     = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + expiracaoMs)

  await prisma.portalToken.deleteMany({ where: { clienteId } })
  await prisma.portalToken.create({ data: { clienteId, token: hash, expiresAt } })

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  return `${baseUrl}/portal/verificar?token=${rawToken}`
}
