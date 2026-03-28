import { prisma } from '@/lib/prisma'
import { criarTokenPortalSocio } from '@/lib/portal/tokens'
import { sendEmail } from '@/lib/email/send'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const convidarSocioPortalTool: Tool = {
  definition: {
    name: 'convidarSocioPortal',
    description:
      'Envia um convite de acesso ao portal para um sócio da empresa. O sócio precisa ter e-mail cadastrado e portalAccess = true. Use quando o operador disser "envia acesso ao portal para o sócio", "convida o sócio X para o portal", "libera acesso portal para a sócia tal", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        socioId: {
          type: 'string',
          description: 'ID do sócio para enviar o convite.',
        },
        clienteId: {
          type: 'string',
          description: 'ID do cliente titular (para buscar os sócios da empresa, quando socioId não for informado).',
        },
        nomeSocio: {
          type: 'string',
          description: 'Nome do sócio para localizar quando não tiver o ID.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Convidar sócio para o portal',
    descricao: 'Envia magic link de acesso ao portal para um sócio da empresa via e-mail.',
    categoria: 'Clientes',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    let socioId   = input.socioId   as string | undefined
    const clienteId = (input.clienteId as string | undefined) ?? ctx.clienteId
    const nomeSocio = input.nomeSocio as string | undefined

    // Se não tem socioId, tenta localizar pelo nome ou listar os disponíveis
    if (!socioId) {
      if (!clienteId) {
        return {
          sucesso: false,
          erro:   'Forneça socioId ou clienteId para localizar o sócio.',
          resumo: 'Não foi possível localizar o sócio: nenhum identificador fornecido.',
        }
      }

      const cliente = await prisma.cliente.findUnique({
        where:   { id: clienteId },
        select:  { empresaId: true },
      })

      if (!cliente?.empresaId) {
        return {
          sucesso: false,
          erro:   'Cliente não possui empresa vinculada.',
          resumo: 'Este cliente não tem empresa cadastrada — sócios são vinculados à empresa.',
        }
      }

      const socios = await prisma.socio.findMany({
        where: { empresaId: cliente.empresaId },
        select: { id: true, nome: true, email: true, portalAccess: true },
      })

      if (socios.length === 0) {
        return {
          sucesso: false,
          erro:   'Nenhum sócio cadastrado.',
          resumo: 'Esta empresa não tem sócios cadastrados. Cadastre o sócio no CRM primeiro.',
        }
      }

      if (nomeSocio) {
        const encontrado = socios.find(s => s.nome.toLowerCase().includes(nomeSocio.toLowerCase()))
        if (!encontrado) {
          const lista = socios.map(s => `• ${s.nome}`).join('\n')
          return {
            sucesso: false,
            erro:   `Sócio "${nomeSocio}" não encontrado.`,
            resumo: `Sócio não encontrado. Sócios disponíveis:\n${lista}`,
          }
        }
        socioId = encontrado.id
      } else {
        // Lista os sócios para o operador escolher
        const lista = socios.map(s => `• ${s.nome} — ${s.email ?? 'sem e-mail'} [acesso: ${s.portalAccess ? 'habilitado' : 'desabilitado'}]`).join('\n')
        return {
          sucesso: false,
          erro:   'Especifique qual sócio.',
          resumo: `Qual sócio deseja convidar? Sócios da empresa:\n${lista}\nInforme o nome ou ID do sócio.`,
        }
      }
    }

    const socio = await prisma.socio.findUnique({
      where:  { id: socioId },
      select: { id: true, nome: true, email: true, portalAccess: true, empresaId: true },
    })

    if (!socio) {
      return { sucesso: false, erro: 'Sócio não encontrado.', resumo: 'Sócio não encontrado no sistema.' }
    }
    if (!socio.email) {
      return {
        sucesso: false,
        erro:   'Sócio sem e-mail cadastrado.',
        resumo: `${socio.nome} não tem e-mail cadastrado. Cadastre o e-mail do sócio antes de enviar o convite.`,
      }
    }

    // Habilita acesso ao portal se ainda não estiver habilitado
    if (!socio.portalAccess) {
      await prisma.socio.update({
        where: { id: socioId },
        data:  { portalAccess: true },
      })
    }

    const link = await criarTokenPortalSocio(socio.id, socio.empresaId, 24 * 60 * 60 * 1000) // 24h para convite

    const nome = socio.nome.split(' ')[0]
    await sendEmail({
      para:    socio.email,
      assunto: 'Convite de acesso ao Portal da Empresa',
      corpo: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="margin-bottom:8px;font-size:20px">Olá, ${nome}!</h2>
          <p style="color:#555;margin-bottom:24px">
            Você foi convidado(a) a acessar o Portal da Empresa no ContabAI.<br>
            Clique no botão abaixo para criar seu acesso. O link é válido por <strong>24 horas</strong>.
          </p>
          <a href="${link}"
             style="display:inline-block;background:#6366F1;color:#fff;font-weight:600;
                    padding:12px 28px;border-radius:10px;text-decoration:none;font-size:15px">
            Acessar Portal
          </a>
          <p style="margin-top:24px;font-size:12px;color:#999">
            Se você não esperava este e-mail, pode ignorá-lo com segurança.<br>
            Nunca compartilhe este link com ninguém.
          </p>
        </div>
      `,
    })

    return {
      sucesso: true,
      dados:   { socioId: socio.id, email: socio.email },
      resumo:  `Convite enviado para ${socio.nome} (${socio.email}). O link é válido por 24 horas.`,
    }
  },
}

registrarTool(convidarSocioPortalTool)
