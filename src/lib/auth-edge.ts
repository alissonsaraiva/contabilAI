import NextAuth from 'next-auth'

export const { auth } = NextAuth({
  providers: [],
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
  // Necessário para Google OAuth funcionar
  trustHost: true,
})
