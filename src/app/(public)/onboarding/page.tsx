'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const schema = z.object({
  contato: z
    .string()
    .min(5, 'Informe seu e-mail ou WhatsApp')
    .refine(
      (v) => /\S+@\S+\.\S+/.test(v) || /\d{10,11}/.test(v.replace(/\D/g, '')),
      'Informe um e-mail ou WhatsApp válido',
    ),
})

type FormData = z.infer<typeof schema>

export default function OnboardingEntrada() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contatoEntrada: data.contato, canal: 'site' }),
      })
      if (!res.ok) throw new Error()
      const lead = await res.json()
      router.push(`/onboarding/simulador?leadId=${lead.id}`)
    } catch {
      toast.error('Erro ao iniciar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Vamos começar!</h1>
        <p className="mt-2 text-muted-foreground">
          Em 2 minutos você terá uma recomendação personalizada.
        </p>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Passo 1 de 8</CardTitle>
          <CardDescription>
            Informe seu e-mail ou WhatsApp para salvarmos seu progresso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contato">E-mail ou WhatsApp</Label>
              <Input
                id="contato"
                placeholder="seu@email.com ou (85) 99999-9999"
                {...register('contato')}
                autoFocus
              />
              {errors.contato && (
                <p className="text-sm text-destructive">{errors.contato.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              Continuar
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Seus dados são protegidos. Não enviamos spam.
      </p>
    </div>
  )
}
