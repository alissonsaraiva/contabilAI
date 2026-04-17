import { prisma } from '@/lib/prisma'
import { UsuariosClient } from '@/components/crm/usuarios-client'

export default async function UsuariosPage() {
  const [usuarios, escritorio] = await Promise.all([
    prisma.usuario.findMany({
      orderBy: { criadoEm: 'asc' },
      select: { id: true, nome: true, email: true, tipo: true, ativo: true, avatar: true, whatsapp: true, criadoEm: true },
    }),
    prisma.escritorio.findFirst({ select: { menuPermissoes: true } }),
  ])

  return <UsuariosClient usuarios={usuarios} menuPermissoes={escritorio?.menuPermissoes ?? null} />
}
