import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { fetchBranchConfig, isBranchingConfig } from '@/lib/export/BranchingExport'
import { BranchingPlayer } from '@/components/branch/BranchingPlayer'

interface PageProps {
  params: Promise<{ embedId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { embedId } = await params
  const config = await fetchBranchConfig(embedId)
  const title = config?.title ?? 'Interactive Video'
  return {
    title: `${title} — Cinematic Forge`,
    description: 'An interactive branching video experience.',
    openGraph: { title, type: 'video.other' },
  }
}

export default async function BranchPage({ params }: PageProps) {
  const { embedId } = await params
  const config = await fetchBranchConfig(embedId)

  if (!config || !isBranchingConfig(config)) notFound()

  return (
    <main className="flex min-h-screen items-center justify-center bg-black">
      <div className="w-full max-w-5xl">
        <BranchingPlayer config={config} />
      </div>
      <div className="fixed bottom-4 right-4 z-50">
        <a href={process.env.NEXT_PUBLIC_APP_URL ?? '/'}
          target="_blank" rel="noopener noreferrer"
          className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/40 backdrop-blur-sm transition hover:text-white/70">
          Made with Cinematic Forge
        </a>
      </div>
    </main>
  )
}
