'use client'

import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import type { ShoppableConfig, ProductTag } from '@/lib/commerce/ShoppableExport'

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function ShoppablePlayer({ config }: { config: ShoppableConfig }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [selectedTag, setSelectedTag] = useState<ProductTag | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const handler = () => setCurrentTime(video.currentTime)
    video.addEventListener('timeupdate', handler)
    return () => video.removeEventListener('timeupdate', handler)
  }, [])

  const activeHotspots = useMemo(() =>
    config.tags.filter((t) => currentTime >= t.timestamp && currentTime < t.timestamp + (t.duration || 3)),
    [config.tags, currentTime],
  )

  const handleTagClick = useCallback((tag: ProductTag) => {
    setSelectedTag((prev) => prev?.id === tag.id ? null : tag)
  }, [])

  return (
    <div className="relative w-full bg-black">
      {/* Video */}
      <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} src={config.videoUrl} controls className="w-full h-full object-cover" />

        {/* Hotspot overlays */}
        {activeHotspots.map((tag) => (
          <button
            key={tag.id}
            onClick={() => handleTagClick(tag)}
            title={tag.productName}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 z-10"
            style={{ left: `${tag.hotspot.x * 100}%`, top: `${tag.hotspot.y * 100}%` }}
          >
            <span className="relative flex h-8 w-8">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-50" />
              <span className="relative inline-flex rounded-full h-8 w-8 bg-white shadow-lg items-center justify-center">
                <span className="text-xs font-bold text-gray-800">🛍</span>
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* Product card slide-in */}
      <div className={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out ${selectedTag ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedTag && (
          <div className="flex flex-col h-full">
            {/* Close */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-900 text-sm">Product</h3>
              <button onClick={() => setSelectedTag(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            {/* Product image */}
            {selectedTag.productImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedTag.productImageUrl} alt={selectedTag.productName}
                className="w-full h-48 object-cover" />
            )}

            {/* Product info */}
            <div className="flex-1 p-4 overflow-y-auto">
              <h2 className="text-lg font-bold text-gray-900">{selectedTag.productName}</h2>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatPrice(selectedTag.productPrice)}</p>

              {/* Variants */}
              {selectedTag.variants.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Options</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTag.variants.map((v) => (
                      <span key={v.id} className={`text-xs px-2 py-1 rounded border ${
                        v.inStock ? 'border-gray-300 text-gray-700' : 'border-gray-200 text-gray-400 line-through'
                      }`}>
                        {v.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Add to cart */}
            <div className="p-4 border-t">
              <a href={selectedTag.productPageUrl} target="_blank" rel="noopener noreferrer"
                className="block w-full py-3 bg-black text-white text-sm font-semibold text-center rounded-lg hover:bg-gray-800 transition">
                Add to Cart →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
