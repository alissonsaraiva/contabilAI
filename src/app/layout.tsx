import type { Metadata } from 'next'
import { GeistMono } from 'geist/font/mono'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import { SuppressThemeScriptWarning } from '@/components/suppress-theme-script-warning'
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'ContabAI — Contabilidade Digital',
    template: '%s | ContabAI',
  },
  description: 'Contabilidade digital com IA para MEI, EPP e autônomos.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${plusJakarta.variable} ${GeistMono.variable}`}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <SuppressThemeScriptWarning />
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
