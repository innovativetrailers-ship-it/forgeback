import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Providers } from '@/components/providers'
import { ToastContainer } from '@/components/ui/ToastContainer'
import { UpgradeModal } from '@/components/ui/UpgradeModal'
import { FeatureRequestButton } from '@/components/features/FeatureRequestButton'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cinema.growthengine.ai'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'CINÉMA — AI Film Production Platform',
    template: '%s | CINÉMA',
  },
  description:
    "The world's most advanced AI film and video production platform. Simple, Advanced, and Ultimate modes for every creator — from social clips to feature film.",
  keywords: [
    'AI video generation',
    'AI film production',
    'text to video',
    'video editing',
    'AI director',
    'CapCut alternative',
    'Adobe Premiere alternative',
    'Kling',
    'Runway',
    'Veo 3',
    'Luma Dream Machine',
  ],
  authors: [{ name: 'Growth Engine', url: APP_URL }],
  creator: 'Growth Engine',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: APP_URL,
    siteName: 'CINÉMA',
    title: 'CINÉMA — AI Film Production Platform',
    description:
      "The world's most advanced AI film and video production platform. Create professional-grade video with Kling, Runway, Veo 3, and more.",
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'CINÉMA — AI Film Production Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CINÉMA — AI Film Production Platform',
    description:
      "The world's most advanced AI film and video production platform.",
    images: ['/opengraph-image'],
    creator: '@growthengine',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [{ url: '/brand/icon-32.png', type: 'image/png', sizes: '32x32' }],
    apple: [{ url: '/brand/icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full bg-background text-foreground flex flex-col">
        <Providers>
          <TooltipProvider>
            {children}
            <Toaster richColors position="bottom-right" />
            <ToastContainer />
            <UpgradeModal />
            <FeatureRequestButton />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  )
}
