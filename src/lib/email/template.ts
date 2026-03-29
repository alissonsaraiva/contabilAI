/**
 * Wrapper HTML reutilizável para e-mails avulsos enviados via IA ou sistema.
 * Garante que qualquer corpo de texto simples chegue formatado ao destinatário.
 */

/** Retorna true se a string já contém tags HTML */
function isHtml(texto: string): boolean {
  return /<[a-z][\s\S]*>/i.test(texto)
}

/** Converte texto simples em parágrafos HTML */
function textToHtml(texto: string): string {
  return texto
    .split(/\n+/)
    .map(linha => linha.trim())
    .filter(Boolean)
    .map(linha => `<p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7">${linha}</p>`)
    .join('')
}

export type WrapOptions = {
  nomeEscritorio?: string
  assunto?: string
}

/**
 * Envolve `corpo` em um template HTML responsivo.
 * Se `corpo` já for HTML, devolve como está.
 */
export function wrapEmailHtml(corpo: string, opts: WrapOptions = {}): string {
  if (isHtml(corpo)) return corpo

  const { nomeEscritorio = 'Avos', assunto } = opts
  const conteudo = textToHtml(corpo)

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:system-ui,-apple-system,Segoe UI,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px">

        <!-- Header -->
        <tr><td align="center" style="padding-bottom:24px">
          <div style="display:inline-flex;align-items:center;gap:10px">
            <div style="width:36px;height:36px;background:#6366F1;border-radius:8px;text-align:center;line-height:36px">
              <span style="color:#fff;font-size:18px;font-weight:700">${nomeEscritorio.charAt(0).toUpperCase()}</span>
            </div>
            <span style="font-size:20px;font-weight:700;color:#1a1a2e">${nomeEscritorio}</span>
          </div>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#fff;border-radius:16px;padding:36px 40px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
          ${assunto ? `<h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#111827">${assunto}</h2>` : ''}
          ${conteudo}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:20px;text-align:center">
          <p style="margin:0;font-size:12px;color:#9ca3af">
            ${nomeEscritorio} · Não responda este e-mail.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
