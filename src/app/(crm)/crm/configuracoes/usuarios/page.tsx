import { prisma } from '@/lib/prisma'
import { UsuariosClient } from '@/components/crm/usuarios-client'

export default async function UsuariosPage() {
  const usuarios = await prisma.usuario.findMany({
    orderBy: { criadoEm: 'asc' },
    select: { id: true, nome: true, email: true, tipo: true, ativo: true, avatar: true, criadoEm: true },
  })

  return <UsuariosClient usuarios={usuarios} />
}
