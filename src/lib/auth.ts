import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'

// Auth exclusivo do CRM (usuários internos: contador, admin).
// O portal do cliente usa src/lib/auth-portal.ts com cookie separado.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // ── Provider interno: email + senha para Usuario (CRM) ──────────────────
    Credentials({
      id: 'credentials',
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
      },
      async authorize(credentials) {
        const parsed = z
          .object({
            email: z.string().email(),
            password: z.string().min(1),
          })
          .safeParse(credentials)
        if (!parsed.success) return null

        // Rate limit: 5 tentativas por e-mail a cada 15 minutos
        const rl = rateLimit(`login:${parsed.data.email.toLowerCase()}`, 5, 15 * 60_000)
        if (!rl.allowed) {
          console.warn('[auth] Login bloqueado por rate limit:', parsed.data.email)
          return null
        }

        const usuario = await prisma.usuario.findUnique({
          where: { email: parsed.data.email, ativo: true },
        })
        if (!usuario) return null

        const ok = await bcrypt.compare(parsed.data.password, usuario.senhaHash)
        if (!ok) return null

        return {
          id:                 usuario.id,
          name:               usuario.nome,
          email:              usuario.email,
          tipo:               usuario.tipo,
          precisaTrocarSenha: usuario.precisaTrocarSenha,
        }
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      // Login Google: verifica se o e-mail existe em Cliente
      if (account?.provider === 'google') {
        if (!user.email) return false
        const cliente = await prisma.cliente.findUnique({
          where:  { email: user.email },
          select: { id: true, nome: true, status: true },
        })
        if (!cliente) return '/portal/login?erro=email_nao_cadastrado'
        if (cliente.status === 'suspenso')  return '/portal/login?erro=conta_suspensa'
        if (cliente.status === 'cancelado') return '/portal/login?erro=conta_cancelada'
        // Injeta clienteId no objeto user para o jwt callback
        ;(user as any).id   = cliente.id
        ;(user as any).nome = cliente.nome
        ;(user as any).tipo = 'cliente'
        return true
      }
      return true
    },

    jwt({ token, user, account }) {
      if (user) {
        token.tipo               = (user as any).tipo
        token.id                 = user.id
        token.precisaTrocarSenha = (user as any).precisaTrocarSenha ?? false
        token.checkedAt          = Date.now()
      }
      // Google: após signIn callback, o id já foi substituído pelo clienteId
      if (account?.provider === 'google' && (user as any)?.tipo === 'cliente') {
        token.tipo = 'cliente'
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).tipo               = token.tipo
        ;(session.user as any).id                 = token.id
        ;(session.user as any).precisaTrocarSenha = token.precisaTrocarSenha
      }

      // Revalida usuário interno (não-cliente) a cada 5 minutos
      const REVALIDAR_INTERVAL = 5 * 60 * 1000
      const lastCheck = (token.checkedAt as number | undefined) ?? 0
      const tipo = token.tipo as string | undefined

      if (token.id && tipo !== 'cliente' && Date.now() - lastCheck > REVALIDAR_INTERVAL) {
        try {
          const usuario = await prisma.usuario.findUnique({
            where:  { id: token.id as string },
            select: { ativo: true, precisaTrocarSenha: true },
          })
          if (!usuario?.ativo) {
            return { ...session, user: undefined } as any
          }
          if (session.user) {
            ;(session.user as any).precisaTrocarSenha = usuario.precisaTrocarSenha
          }
          token.checkedAt = Date.now()
        } catch {
          // DB indisponível — mantém sessão com dados do token
        }
      }

      return session
    },
  },

  pages: { signIn: '/login' },
})
