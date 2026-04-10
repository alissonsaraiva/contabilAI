/**
 * Auth exclusivo do portal da empresa.
 * Cookie separado do CRM: portal.session-token
 * Endpoint: /api/portal/auth/[...nextauth]
 *
 * Session carrega: id (clienteId ou socioId), tipo ('cliente'|'socio'), empresaId.
 * Titular e sócios têm acesso total ao portal da empresa.
 */
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { prisma } from '@/lib/prisma'
import { getEmpresasCliente, getEmpresaPrincipal } from '@/lib/portal-session'

const IS_PROD = process.env.NODE_ENV === 'production'

export const PORTAL_COOKIE_NAME =
  `${IS_PROD ? '__Secure-' : ''}portal.session-token`

// Cookies OAuth (state/PKCE) precisam ser acessíveis de todos os subdomínios de avos.digital
// para que o callback em crm.avos.digital consiga ler cookies setados em avos.digital/portal.avos.digital
const OAUTH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: IS_PROD,
  domain: IS_PROD ? '.avos.digital' : undefined,
}

const portalAuth = NextAuth({
  basePath: '/api/portal/auth',

  cookies: {
    // Session e callbackUrl com domain=.avos.digital para funcionar cross-subdomain:
    // callback em crm.avos.digital cria sessão que é válida em portal.avos.digital
    sessionToken: {
      name: PORTAL_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: IS_PROD,
        domain: IS_PROD ? '.avos.digital' : undefined,
      },
    },
    callbackUrl: {
      name: IS_PROD ? '__Secure-portal-auth-callback-url' : 'portal-auth-callback-url',
      options: OAUTH_COOKIE_OPTS,
    },
    state: {
      name: IS_PROD ? '__Secure-portal-auth-state' : 'portal-auth-state',
      options: OAUTH_COOKIE_OPTS,
    },
    pkceCodeVerifier: {
      name: IS_PROD ? '__Secure-portal-auth-pkce' : 'portal-auth-pkce',
      options: OAUTH_COOKIE_OPTS,
    },
  },

  providers: [
    // Magic-link: token já validado em /api/portal/verificar
    Credentials({
      id: 'portal-token',
      credentials: {
        id:         { type: 'text' },
        nome:       { type: 'text' },
        email:      { type: 'email' },
        tipo:       { type: 'text' },   // 'cliente' | 'socio'
        empresaId:  { type: 'text' },
        empresaIds: { type: 'text' },   // JSON array
      },
      async authorize(credentials) {
        if (!credentials?.id || !credentials?.email || !credentials?.empresaId) return null
        return {
          id:         credentials.id         as string,
          name:       credentials.nome       as string,
          email:      credentials.email      as string,
          tipo:       credentials.tipo       as string,
          empresaId:  credentials.empresaId  as string,
          empresaIds: credentials.empresaIds as string,
        }
      },
    }),

    // Google OAuth — apenas titulares (clientes) — redirect URI: /api/portal/auth/callback/google
    // Cookies state/pkce configurados com domain=.avos.digital para funcionar cross-subdomain
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID     ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        if (!user.email) return false
        const cliente = await prisma.cliente.findUnique({
          where:  { email: user.email },
          select: { id: true, nome: true, status: true, empresaId: true },
        })
        if (!cliente) return '/portal/login?erro=email_nao_cadastrado'
        if (cliente.status === 'suspenso')  return '/portal/login?erro=conta_suspensa'
        if (cliente.status === 'cancelado') return '/portal/login?erro=conta_cancelada'
        const empresaIds = await getEmpresasCliente(cliente.id)
        const empresaId  = empresaIds[0] ?? cliente.empresaId
        if (!empresaId)                     return '/portal/login?erro=empresa_nao_vinculada'
        ;(user as any).id         = cliente.id
        ;(user as any).nome       = cliente.nome
        ;(user as any).tipo       = 'cliente'
        ;(user as any).empresaId  = empresaId
        ;(user as any).empresaIds = JSON.stringify(empresaIds)
        return true
      }
      return true
    },

    jwt({ token, user }) {
      if (user) {
        token.id         = user.id
        token.tipo       = (user as any).tipo
        token.empresaId  = (user as any).empresaId
        token.empresaIds = (user as any).empresaIds // JSON string
      }
      return token
    },

    session({ session, token }) {
      if (session.user) {
        ;(session.user as any).id         = token.id
        ;(session.user as any).tipo       = token.tipo
        ;(session.user as any).empresaId  = token.empresaId
        ;(session.user as any).empresaIds = token.empresaIds
      }
      return session
    },
  },

  pages: { signIn: '/portal/login' },
  trustHost: true,
})

export const portalHandlers = portalAuth.handlers
export const authPortal     = portalAuth.auth
export const auth           = portalAuth.auth
export const signInPortal   = portalAuth.signIn
export const signOutPortal  = portalAuth.signOut
