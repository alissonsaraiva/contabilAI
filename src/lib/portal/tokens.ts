/**
 * Geração de tokens do portal.
 * Suporta titular (clienteId) e sócio (socioId) — ambos vinculados a uma Empresa.
 *
 * Cada chamada gera simultaneamente:
 *   - Um magic link (token aleatório de 32 bytes, usado em e-mails desktop)
 *   - Um OTP de 6 dígitos (usado em apps PWA e WhatsApp)
 */
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

const baseUrl = () =>
  process.env.NEXT_PUBLIC_PORTAL_URL ??
  process.env.NEXT_PUBLIC_APP_URL    ??
  process.env.AUTH_URL               ??
  'http://localhost:3000'

export type TokenResult = { link: string; otp: string }

function gerarOtpRaw(): { raw: string; hash: string } {
  const raw  = String(Math.floor(100_000 + crypto.randomInt(900_000)))
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  return { raw, hash }
}

async function gerarToken(
  data: { empresaId: string; clienteId?: string; socioId?: string },
  expiracaoMs: number,
): Promise<TokenResult> {
  const rawToken  = crypto.randomBytes(32).toString('base64url')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + expiracaoMs)

  const { raw: otpRaw, hash: otpHash } = gerarOtpRaw()
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000) // OTP expira em 10 min

  // Invalida tokens anteriores do mesmo usuário
  if (data.clienteId) await prisma.portalToken.deleteMany({ where: { clienteId: data.clienteId } })
  if (data.socioId)   await prisma.portalToken.deleteMany({ where: { socioId: data.socioId } })

  await prisma.portalToken.create({
    data: { ...data, token: tokenHash, expiresAt, otp: otpHash, otpExpiresAt },
  })

  return {
    link: `${baseUrl()}/portal/verificar?token=${rawToken}`,
    otp:  otpRaw,
  }
}

/** Token para o titular do contrato (Cliente). */
export async function criarTokenPortal(
  clienteId: string,
  empresaId: string,
  expiracaoMs = 30 * 60 * 1000,
): Promise<TokenResult> {
  return gerarToken({ empresaId, clienteId }, expiracaoMs)
}

/** Token para um sócio com portalAccess = true. */
export async function criarTokenPortalSocio(
  socioId: string,
  empresaId: string,
  expiracaoMs = 30 * 60 * 1000,
): Promise<TokenResult> {
  return gerarToken({ empresaId, socioId }, expiracaoMs)
}
