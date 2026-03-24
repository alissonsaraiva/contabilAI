import NextAuth from 'next-auth'

export const { auth } = NextAuth({
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.tipo = (user as any).tipo
        token.id = user.id
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        ;(session.user as any).tipo = token.tipo
        ;(session.user as any).id = token.id
      }
      return session
    },
  },
  pages: { signIn: '/login' },
})
