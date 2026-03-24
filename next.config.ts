import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: [
    '@prisma/client',
    'bcryptjs',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    '@react-pdf/renderer',
  ],
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@base-ui/react',
      'framer-motion',
      'recharts',
      'date-fns',
    ],
  },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '9000' },
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'https', hostname: '*.cloudflarestorage.com' },
    ],
  },
}

export default nextConfig
