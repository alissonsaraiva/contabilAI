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

export const PORTAL_COOKIE_NAME =
  `${process.env.NODE_ENV === 'production' ? '__Secure-' : ''}portal.session-token`

const portalAuth = NextAuth({
  basePath: '/api/portal/auth',

  cookies: {
    sessionToken: {
      name: PORTAL_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },

  providers: [
    // Magic-link: token já validado em /api/portal/verificar
    Credentials({
      id: 'portal-token',
      credentials: {
        id:        { type: 'text' },
        nome:      { type: 'text' },
        email:     { type: 'email' },
        tipo:      { type: 'text' },   // 'cliente' | 'socio'
        empresaId: { type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.id || !credentials?.email || !credentials?.empresaId) return null
        return {
          id:        credentials.id        as string,
          name:      credentials.nome      as string,
          email:     credentials.email     as string,
          tipo:      credentials.tipo      as string,
          empresaId: credentials.empresaId as string,
        }
      },
    }),

    // Google OAuth — apenas titulares (clientes) — redirect URI: /api/portal/auth/callback/google
    // checks: ['state'] — desabilita PKCE para evitar falha cross-domain quando AUTH_URL
    // difere do domínio de onde o login foi iniciado (cookie de code verifier não viaja entre domínios).
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID     ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      checks:       ['state'],
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
        if (!cliente.empresaId)             return '/portal/login?erro=empresa_nao_vinculada'
        ;(user as any).id        = cliente.id
        ;(user as any).nome      = cliente.nome
        ;(user as any).tipo      = 'cliente'
        ;(user as any).empresaId = cliente.empresaId
        return true
      }
      return true
    },

    jwt({ token, user }) {
      if (user) {
        token.id        = user.id
        token.tipo      = (user as any).tipo
        token.empresaId = (user as any).empresaId
      }
      return token
    },

    session({ session, token }) {
      if (session.user) {
        ;(session.user as any).id        = token.id
        ;(session.user as any).tipo      = token.tipo
        ;(session.user as any).empresaId = token.empresaId
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
