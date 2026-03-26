import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
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
          id: usuario.id,
          name: usuario.nome,
          email: usuario.email,
          tipo: usuario.tipo,
          precisaTrocarSenha: usuario.precisaTrocarSenha,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.tipo = (user as any).tipo
        token.id = user.id
        token.precisaTrocarSenha = (user as any).precisaTrocarSenha
        token.checkedAt = Date.now()
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).tipo = token.tipo
        ;(session.user as any).id = token.id
        ;(session.user as any).precisaTrocarSenha = token.precisaTrocarSenha
      }

      // Revalida que o usuário ainda está ativo a cada 5 minutos
      const REVALIDAR_INTERVAL = 5 * 60 * 1000
      const lastCheck = (token.checkedAt as number | undefined) ?? 0
      if (token.id && Date.now() - lastCheck > REVALIDAR_INTERVAL) {
        try {
          const usuario = await prisma.usuario.findUnique({
            where: { id: token.id as string },
            select: { ativo: true, precisaTrocarSenha: true },
          })
          if (!usuario?.ativo) {
            // Usuário desativado — invalida sessão retornando objeto sem user
            return { ...session, user: undefined } as any
          }
          // Atualiza flag de troca de senha caso tenha mudado
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
