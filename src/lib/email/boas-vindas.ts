import { prisma } from '@/lib/prisma'
import { sendEmail } from './send'
import { criarTokenPortal } from '@/lib/portal/tokens'

type ClienteBasico = {
  id:    string
  nome:  string
  email: string
}

export async function enviarBoasVindas(cliente: ClienteBasico): Promise<void> {
  const escritorio = await prisma.escritorio.findFirst({
    select: { nome: true, emailNome: true },
  })

  const nomeEscritorio = escritorio?.nome ?? 'ContabAI'
  const primeiroNome   = cliente.nome.split(' ')[0]

  // Link válido por 24h — tempo suficiente para o cliente acessar com calma
  const link = await criarTokenPortal(cliente.id, 24 * 60 * 60 * 1000)

  await sendEmail({
    para:    cliente.email,
    assunto: `Bem-vindo(a) ao ${nomeEscritorio}! Acesse seu portal`,
    corpo: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:system-ui,-apple-system,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">

        <!-- Header -->
        <tr><td align="center" style="padding-bottom:28px">
          <div style="display:inline-flex;align-items:center;gap:10px">
            <div style="width:40px;height:40px;background:#6366F1;border-radius:10px;display:flex;align-items:center;justify-content:center">
              <span style="color:#fff;font-size:20px;font-weight:700">C</span>
            </div>
            <span style="font-size:22px;font-weight:700;color:#1a1a2e;letter-spacing:-0.5px">${nomeEscritorio}</span>
          </div>
        </td></tr>

        <!-- Card principal -->
        <tr><td style="background:#fff;border-radius:16px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">

          <!-- Ícone de check -->
          <div style="text-align:center;margin-bottom:24px">
            <div style="display:inline-block;width:64px;height:64px;background:#ecfdf5;border-radius:50%;line-height:64px;font-size:28px">
              ✅
            </div>
          </div>

          <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1a1a2e;text-align:center">
            Bem-vindo(a), ${primeiroNome}!
          </h1>
          <p style="margin:0 0 28px;font-size:15px;color:#666;text-align:center;line-height:1.6">
            Seu contrato foi assinado e sua conta está ativa.<br>
            Criamos sua área exclusiva no Portal do Cliente.
          </p>

          <!-- O que tem no portal -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
            <tr>
              <td style="padding:10px 12px;background:#f8f9ff;border-radius:10px;margin-bottom:8px">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td style="padding-right:12px;font-size:20px">📄</td>
                  <td>
                    <div style="font-size:13px;font-weight:600;color:#1a1a2e">Documentos</div>
                    <div style="font-size:12px;color:#888">Acesse e envie documentos do seu negócio</div>
                  </td>
                </tr></table>
              </td>
            </tr>
            <tr><td style="height:8px"></td></tr>
            <tr>
              <td style="padding:10px 12px;background:#f8f9ff;border-radius:10px">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td style="padding-right:12px;font-size:20px">💬</td>
                  <td>
                    <div style="font-size:13px;font-weight:600;color:#1a1a2e">Suporte direto</div>
                    <div style="font-size:12px;color:#888">Fale com sua equipe contábil quando precisar</div>
                  </td>
                </tr></table>
              </td>
            </tr>
            <tr><td style="height:8px"></td></tr>
            <tr>
              <td style="padding:10px 12px;background:#f8f9ff;border-radius:10px">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td style="padding-right:12px;font-size:20px">💰</td>
                  <td>
                    <div style="font-size:13px;font-weight:600;color:#1a1a2e">Financeiro</div>
                    <div style="font-size:12px;color:#888">Acompanhe seu plano e histórico de pagamentos</div>
                  </td>
                </tr></table>
              </td>
            </tr>
          </table>

          <!-- CTA -->
          <div style="text-align:center;margin-bottom:20px">
            <a href="${link}"
               style="display:inline-block;background:#6366F1;color:#fff;font-weight:600;
                      padding:14px 36px;border-radius:12px;text-decoration:none;font-size:16px;
                      letter-spacing:-0.2px;box-shadow:0 4px 12px rgba(99,102,241,0.35)">
              Acessar meu Portal →
            </a>
          </div>

          <p style="margin:0;font-size:12px;color:#aaa;text-align:center">
            Este link de acesso é válido por <strong>24 horas</strong>.<br>
            Depois disso, basta solicitar um novo link na tela de login.
          </p>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:24px;text-align:center">
          <p style="margin:0;font-size:12px;color:#aaa">
            ${nomeEscritorio} · Enviado automaticamente, não responda este e-mail.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
    `,
  })
}
