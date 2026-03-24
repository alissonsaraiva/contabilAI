export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background px-6 py-4">
        <span className="text-lg font-bold text-primary">ContabAI</span>
        <span className="ml-2 text-sm text-muted-foreground">Portal do Cliente</span>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  )
}
