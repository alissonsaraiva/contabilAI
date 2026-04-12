'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { PORTAL_COOKIE_NAME } from '@/lib/auth-portal'

export async function logoutPortal() {
  const cookieStore = await cookies()
  const isProduction = process.env.NODE_ENV === 'production'

  cookieStore.set(PORTAL_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isProduction,
    domain: isProduction ? '.avos.digital' : undefined,
    maxAge: 0,
  })

  redirect('/portal/login')
}
