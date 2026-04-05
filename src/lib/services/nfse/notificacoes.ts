import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

// ─── Notificações internas — não exportadas via index.ts ─────────────────────

export async function notificarEquipeNfsAutorizada(
  nota: { id: string; clienteId: string; numero?: number | null; valorTotal: unknown; tomadorNome?: string | null },
  clienteNome?: string | null,
  mesAno?: string,
): Promise<void> {
  const usuarios = await prisma.usuario.findMany({
    where:  { ativo: true, tipo: { in: ['admin', 'contador'] } },
    select: { id: true },
  })
  if (!usuarios.length) return

  const numero  = nota.numero ? `nº ${nota.numero}` : ''
  const valor   = `R$ ${Number(nota.valorTotal).toFixed(2).replace('.', ',')}`
  const tomador = nota.tomadorNome ? ` → ${nota.tomadorNome}` : ''

  await prisma.notificacao.createMany({
    data: usuarios.map(u => ({
      usuarioId: u.id,
      tipo:      'nfse_autorizada',
      titulo:    `NFS-e ${numero} autorizada`,
      mensagem:  `${clienteNome ?? 'Cliente'}${tomador} • ${valor}${mesAno ? ` • ${mesAno}` : ''}`,
      url:       `/crm/clientes/${nota.clienteId}?aba=notas-fiscais`,
    })),
  })
}

export async function notificarEquipeNfsRejeitada(
  nota: { id: string; clienteId: string; erroCodigo?: string | null; erroMensagem?: string | null; valorTotal: unknown },
  clienteNome?: string | null,
): Promise<void> {
  const usuarios = await prisma.usuario.findMany({
    where:  { ativo: true, tipo: { in: ['admin', 'contador'] } },
    select: { id: true },
  })
  if (!usuarios.length) return

  const codigo = nota.erroCodigo ? ` — Código ${nota.erroCodigo}` : ''
  const motivo = nota.erroMensagem ?? 'Motivo não informado'

  await prisma.notificacao.createMany({
    data: usuarios.map(u => ({
      usuarioId: u.id,
      tipo:      'nfse_rejeitada',
      titulo:    `NFS-e rejeitada${codigo}`,
      mensagem:  `${clienteNome ?? 'Cliente'} • ${motivo.slice(0, 100)}`,
      url:       `/crm/clientes/${nota.clienteId}?aba=notas-fiscais`,
    })),
  })
}

export async function notificarEquipeNfsSolicitadaPortal(
  nota: { id: string; clienteId: string; valorTotal: unknown; descricao?: string | null },
  clienteNome?: string | null,
): Promise<void> {
  const usuarios = await prisma.usuario.findMany({
    where:  { ativo: true, tipo: { in: ['admin', 'contador'] } },
    select: { id: true },
  })
  if (!usuarios.length) return

  const valor = `R$ ${Number(nota.valorTotal).toFixed(2).replace('.', ',')}`
  const desc  = nota.descricao ? ` — ${nota.descricao.slice(0, 60)}` : ''

  await prisma.notificacao.createMany({
    data: usuarios.map(u => ({
      usuarioId: u.id,
      tipo:      'nfse_solicitada_portal',
      titulo:    `NFS-e solicitada pelo portal`,
      mensagem:  `${clienteNome ?? 'Cliente'} emitiu uma NFS-e de ${valor}${desc}`,
      url:       `/crm/clientes/${nota.clienteId}?aba=notas-fiscais`,
    })),
  })
}

export async function notificarEquipeNfsCanceladaPeloPortal(
  nota: { id: string; clienteId: string; numero?: number | null; valorTotal: unknown },
  clienteNome?: string | null,
): Promise<void> {
  const usuarios = await prisma.usuario.findMany({
    where:  { ativo: true, tipo: { in: ['admin', 'contador'] } },
    select: { id: true },
  })
  if (!usuarios.length) return

  const numero = nota.numero ? `nº ${nota.numero}` : ''
  const valor  = `R$ ${Number(nota.valorTotal).toFixed(2).replace('.', ',')}`

  await prisma.notificacao.createMany({
    data: usuarios.map(u => ({
      usuarioId: u.id,
      tipo:      'nfse_cancelada_portal',
      titulo:    `NFS-e ${numero} cancelada pelo cliente`,
      mensagem:  `${clienteNome ?? 'Cliente'} cancelou a NFS-e ${numero} de ${valor} pelo portal`,
      url:       `/crm/clientes/${nota.clienteId}?aba=notas-fiscais`,
    })),
  })
}

export async function notificarEquipeEntregaFalhou(
  notaId: string,
  clienteId: string,
  canal: 'whatsapp' | 'email',
  motivo: string,
): Promise<void> {
  try {
    const usuarios = await prisma.usuario.findMany({
      where:  { ativo: true, tipo: { in: ['admin', 'contador'] } },
      select: { id: true },
    })
    if (!usuarios.length) return

    await prisma.notificacao.createMany({
      data: usuarios.map(u => ({
        usuarioId: u.id,
        tipo:      'nfse_entrega_falhou',
        titulo:    `Falha na entrega de NFS-e por ${canal}`,
        mensagem:  `A nota ${notaId.slice(0, 8)} não pôde ser entregue ao cliente. Motivo: ${motivo.slice(0, 120)}`,
        url:       `/crm/clientes/${clienteId}?aba=notas-fiscais`,
      })),
    })
  } catch (err) {
    logger.error('nfse-notificar-entrega-falhou-erro', { notaId, err })
  }
}
