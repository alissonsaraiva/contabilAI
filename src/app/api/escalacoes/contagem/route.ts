import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const total = await prisma.escalacao.count({ where: { status: 'pendente' } })
  return NextResponse.json({ total })
}
