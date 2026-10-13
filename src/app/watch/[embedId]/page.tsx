import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { isShoppableConfig } from '@/lib/commerce/ShoppableExport'
import { ShoppablePlayer } from '@/components/watch/ShoppablePlayer'

export async function generateMetadata({ params }: { params: Promise<{ embedId: string }> }) {
  const { embedId } = await params
  const embed = await db.shoppableEmbed.findUnique({ where: { embedId } })
  if (!embed) return { title: 'Not Found' }
  return { title: 'Shoppable Video', description: 'Watch and shop this shoppable video.' }
}

export default async function WatchPage({ params }: { params: Promise<{ embedId: string }> }) {
  const { embedId } = await params
  const embed = await db.shoppableEmbed.findUnique({ where: { embedId } })
  if (!embed) notFound()

  const rawConfig = { ...(embed.config as Record<string, unknown>), embedId }
  if (!isShoppableConfig(rawConfig)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">This video is unavailable.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <ShoppablePlayer config={rawConfig} />
        {rawConfig.tags.length > 0 && (
          <p className="mt-4 text-sm text-gray-500 text-center">
            Click the 🛍 icons on the video to shop featured products
          </p>
        )}
      </div>
    </div>
  )
}
