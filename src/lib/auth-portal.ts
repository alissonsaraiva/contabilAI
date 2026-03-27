/**
 * Auth exclusivo do portal do cliente.
 * Cookie separado do CRM: portal.session-token
 * Endpoint: /api/portal/auth/[...nextauth]
 *
 * Assim CRM e Portal têm sessões completamente independentes — um login
 * não interfere no outro, mesmo no mesmo navegador.
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
        clienteId: { type: 'text' },
        nome:      { type: 'text' },
        email:     { type: 'email' },
      },
      async authorize(credentials) {
        if (!credentials?.clienteId || !credentials?.email) return null
        return {
          id:    credentials.clienteId as string,
          name:  credentials.nome      as string,
          email: credentials.email     as string,
          tipo:  'cliente',
        }
      },
    }),

    // Google OAuth — redirect URI: /api/portal/auth/callback/google
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
          select: { id: true, nome: true, status: true },
        })
        if (!cliente) return '/portal/login?erro=email_nao_cadastrado'
        if (cliente.status === 'suspenso')  return '/portal/login?erro=conta_suspensa'
        if (cliente.status === 'cancelado') return '/portal/login?erro=conta_cancelada'
        ;(user as any).id   = cliente.id
        ;(user as any).nome = cliente.nome
        ;(user as any).tipo = 'cliente'
        return true
      }
      return true
    },

    jwt({ token, user, account }) {
      if (user) {
        token.tipo = (user as any).tipo
        token.id   = user.id
      }
      if (account?.provider === 'google' && (user as any)?.tipo === 'cliente') {
        token.tipo = 'cliente'
      }
      return token
    },

    session({ session, token }) {
      if (session.user) {
        ;(session.user as any).tipo = token.tipo
        ;(session.user as any).id   = token.id
      }
      return session
    },
  },

  pages: { signIn: '/portal/login' },
  trustHost: true,
})

// Exports nomeados para uso nos diferentes contextos:
// - portalHandlers → route handler em /api/portal/auth/[...nextauth]
// - authPortal     → uso explícito para diferenciar do auth do CRM
// - auth           → alias para páginas/rotas do portal que importam { auth }
export const portalHandlers = portalAuth.handlers
export const authPortal     = portalAuth.auth
export const auth           = portalAuth.auth
export const signInPortal   = portalAuth.signIn
export const signOutPortal  = portalAuth.signOut
