'use server'

import { signOutPortal } from '@/lib/auth-portal'

export async function logoutPortal() {
  await signOutPortal({ redirectTo: '/portal/login' })
}
