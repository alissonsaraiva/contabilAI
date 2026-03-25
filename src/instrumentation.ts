export async function register() {
  // Apenas no servidor Node.js (não no Edge runtime)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // Polling IMAP a cada 2 minutos — busca emails novos e processa
  const INTERVALO_MS = 2 * 60 * 1000

  async function syncEmail() {
    try {
      const secret = process.env.CRON_SECRET
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (secret) headers['authorization'] = `Bearer ${secret}`

      const base = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
      await fetch(`${base}/api/email/sync`, { method: 'POST', headers })
    } catch {
      // Silencia erros — não deve derrubar o servidor
    }
  }

  // Aguarda 30s após startup antes do primeiro ciclo
  setTimeout(() => {
    syncEmail()
    setInterval(syncEmail, INTERVALO_MS)
  }, 30_000)
}
