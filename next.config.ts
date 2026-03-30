import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const cspDirectives = [
  "default-src 'self'",
  // Next.js requires unsafe-inline for hydration scripts; unsafe-eval for dev HMR
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // Inline styles are common in Next.js + Tailwind; Google Fonts for Material Symbols
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Material Symbols and other Google font assets
  "font-src 'self' data: https://fonts.gstatic.com",
  // Images: R2/Cloudflare storage buckets + data URIs for inline previews
  "img-src 'self' data: blob: https://*.r2.dev https://*.cloudflarestorage.com",
  // XHR/fetch: Sentry error tracking
  "connect-src 'self' https://*.sentry.io https://sentry.io",
  // DocuSeal self-hosted for contract iframe embeds
  "frame-src 'self' http://82.25.79.193:32825",
  // Block this app from being framed elsewhere (complementa X-Frame-Options)
  "frame-ancestors 'none'",
  // Only allow form submissions to same origin
  "form-action 'self'",
  // Upgrade HTTP→HTTPS for mixed content
  "upgrade-insecure-requests",
].join('; ')

const securityHeaders = [
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'X-XSS-Protection',          value: '1; mode=block' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy',   value: cspDirectives },
]

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
  output: 'standalone',
  serverExternalPackages: [
    '@prisma/client',
    'bcryptjs',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    '@react-pdf/renderer',
    'pg',
    'nodemailer',
    'imapflow',
    'mailparser',
  ],
  turbopack: {
    // node:crypto e outros built-ins Node.js não existem no Edge Runtime
    // Esta alias garante que o bundler Turbopack não os inclua no bundle Edge
    resolveAlias: {
      crypto: 'node:crypto',
    },
  },
  experimental: {
    cpus: 1,
    optimizePackageImports: [
      'lucide-react',
      '@base-ui/react',
      'framer-motion',
      'recharts',
      'date-fns',
    ],
  },
  webpack: (config, { isServer, nextRuntime }) => {
    // Previne warning de 'crypto' no Edge runtime — o código nunca executa lá
    // (instrumentation.ts só importa instrumentation-node quando NEXT_RUNTIME === 'nodejs')
    if (nextRuntime === 'edge') {
      config.resolve = config.resolve ?? {}
      config.resolve.fallback = { ...config.resolve.fallback, crypto: false }
    }
    if (!isServer) {
      config.cache = false
    }
    return config
  },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '9000' },
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'https', hostname: '*.cloudflarestorage.com' },
    ],
  },
}

export default withSentryConfig(nextConfig, {
  org:     process.env.SENTRY_ORG     ?? 'alisson-sb',
  project: process.env.SENTRY_PROJECT ?? 'avos',

  // Upload de source maps só quando SENTRY_AUTH_TOKEN estiver configurado (CI/CD)
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Sem telemetria para Sentry sobre o build
  telemetry: false,

  // Suprime warnings no console durante o build local
  silent: !process.env.CI,

  // Source maps: faz upload e remove do bundle público (produção apenas)
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },

  // Não adiciona verificação automática de release (controlamos via CI)
  autoInstrumentServerFunctions: true,
  autoInstrumentMiddleware: false,
  autoInstrumentAppDirectory: true,
})
