import { PortalSessionProvider } from '@/components/portal/portal-session-provider'

export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return <PortalSessionProvider>{children}</PortalSessionProvider>
}
