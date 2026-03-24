'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
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
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      })

      if (result?.error) {
        toast.error('E-mail ou senha incorretos')
        return
      }

      router.push('/crm/dashboard')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-container-lowest px-4">
      {/* Brand */}
      <div className="mb-8 flex items-center justify-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>calculate</span>
        </div>
        <span className="font-headline text-2xl font-bold tracking-tight text-on-surface">ContabAI</span>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-[400px]">
        <Card className="border-outline-variant/15 bg-card/60 p-8 shadow-sm backdrop-blur-xl sm:rounded-[20px]">
          <div className="mb-8 text-center space-y-2">
            <h1 className="font-headline text-2xl font-semibold tracking-tight text-on-surface">Bem-vindo de volta</h1>
            <p className="text-sm text-on-surface-variant/80">Faça login para acessar o CRM administrativo</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2.5 text-left">
              <Label htmlFor="email" className="text-[13px] font-semibold text-on-surface-variant">E-mail corporativo</Label>
              <Input
                id="email"
                type="email"
                placeholder="nome@contabai.com.br"
                {...register('email')}
                autoFocus
                className="h-11 rounded-xl border-outline-variant/30 bg-surface-container-low text-[14px] shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:ring-[3px] focus:ring-primary/10"
              />
              {errors.email && (
                <p className="text-xs font-medium text-error">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2.5 text-left">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-[13px] font-semibold text-on-surface-variant">Senha segura</Label>
                <a href="#" className="text-[12px] font-semibold text-primary hover:underline">Esqueceu a senha?</a>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register('password')}
                className="h-11 rounded-xl border-outline-variant/30 bg-surface-container-low text-[14px] shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:ring-[3px] focus:ring-primary/10"
              />
              {errors.password && (
                <p className="text-xs font-medium text-error">{errors.password.message}</p>
              )}
            </div>

            <Button type="submit" className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm transition-all hover:bg-primary/90 mt-2" disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <span className="material-symbols-outlined mr-2 text-[18px]">login</span>
              )}
              Acessar Painel
            </Button>
          </form>
        </Card>

        <p className="mt-8 text-center text-[11px] font-medium uppercase tracking-wider text-on-surface-variant/40">
          © {new Date().getFullYear()} ContabAI — Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}
