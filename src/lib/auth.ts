import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

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
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        ;(session.user as any).tipo = token.tipo
        ;(session.user as any).id = token.id
        ;(session.user as any).precisaTrocarSenha = token.precisaTrocarSenha
      }
      return session
    },
  },
  pages: { signIn: '/login' },
})
