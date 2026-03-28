/**
 * Geração de tokens do portal.
 * Suporta titular (clienteId) e sócio (socioId) — ambos vinculados a uma Empresa.
 */
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

const baseUrl = () =>
  process.env.NEXT_PUBLIC_PORTAL_URL ??
  process.env.NEXT_PUBLIC_APP_URL    ??
  process.env.AUTH_URL               ??
  'http://localhost:3000'

async function gerarToken(
  data: { empresaId: string; clienteId?: string; socioId?: string },
  expiracaoMs: number,
): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('base64url')
  const hash     = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + expiracaoMs)

  // Invalida tokens anteriores do mesmo usuário
  if (data.clienteId) await prisma.portalToken.deleteMany({ where: { clienteId: data.clienteId } })
  if (data.socioId)   await prisma.portalToken.deleteMany({ where: { socioId: data.socioId } })

  await prisma.portalToken.create({ data: { ...data, token: hash, expiresAt } })

  return `${baseUrl()}/portal/verificar?token=${rawToken}`
}

/** Token para o titular do contrato (Cliente). */
export async function criarTokenPortal(
  clienteId: string,
  empresaId: string,
  expiracaoMs = 30 * 60 * 1000,
): Promise<string> {
  return gerarToken({ empresaId, clienteId }, expiracaoMs)
}

/** Token para um sócio com portalAccess = true. */
export async function criarTokenPortalSocio(
  socioId: string,
  empresaId: string,
  expiracaoMs = 30 * 60 * 1000,
): Promise<string> {
  return gerarToken({ empresaId, socioId }, expiracaoMs)
}
