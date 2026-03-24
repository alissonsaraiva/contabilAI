import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { CrmSidebar } from '@/components/layout/crm-sidebar'
import { CrmHeader } from '@/components/layout/crm-header'

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden bg-surface-container-low">
      <CrmSidebar user={session.user as any} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CrmHeader user={session.user as any} />
        <main className="custom-scrollbar flex-1 overflow-y-auto px-8 py-6">{children}</main>
      </div>
    </div>
  )
}
