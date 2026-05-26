import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'https', hostname: 'fal.media' },
      { protocol: 'https', hostname: '*.fal.run' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'lh4.googleusercontent.com' },
      { protocol: 'https', hostname: 'lh5.googleusercontent.com' },
      { protocol: 'https', hostname: 'lh6.googleusercontent.com' },
    ],
  },

  // Prevent these native/server-only packages from being bundled by webpack.
  // They must be loaded at runtime from node_modules, not inlined at build.
  serverExternalPackages: [
    'fluent-ffmpeg',
    'sharp',
    'music-metadata',
    '@prisma/client',
    '@prisma/adapter-pg',
    'prisma',
    'ioredis',
    'bullmq',
    'better-sqlite3',
  ],

  typedRoutes: false,
  allowedDevOrigins: ['192.168.1.208', 'localhost'],
  turbopack: {},
}

export default nextConfig
