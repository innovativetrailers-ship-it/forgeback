export interface ProductTag {
  id: string
  timestamp: number      // seconds into video
  duration: number       // seconds hotspot is visible (default 3)
  productId: string
  productName: string
  productPrice: number   // in cents
  productImageUrl: string
  productPageUrl: string
  variants: Array<{ id: string; name: string; inStock: boolean }>
  hotspot: { x: number; y: number }  // normalised 0-1
  platform: 'shopify' | 'woocommerce' | 'manual'
}

export interface ShoppableConfig {
  videoUrl: string
  projectId: string
  tags: ProductTag[]
  embedId: string
}

function isProductVariant(v: unknown): v is ProductTag['variants'][number] {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.name === 'string' && typeof o.inStock === 'boolean'
}

export function isProductTag(v: unknown): v is ProductTag {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.timestamp !== 'number' || typeof o.duration !== 'number' ||
    typeof o.productId !== 'string' || typeof o.productName !== 'string' ||
    typeof o.productPrice !== 'number' || typeof o.productImageUrl !== 'string' ||
    typeof o.productPageUrl !== 'string') return false
  if (!Array.isArray(o.variants) || !(o.variants as unknown[]).every(isProductVariant)) return false
  if (typeof o.hotspot !== 'object' || o.hotspot === null) return false
  const h = o.hotspot as Record<string, unknown>
  if (typeof h.x !== 'number' || typeof h.y !== 'number') return false
  return ['shopify', 'woocommerce', 'manual'].includes(o.platform as string)
}

export function isShoppableConfig(v: unknown): v is ShoppableConfig {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.videoUrl === 'string' && typeof o.projectId === 'string' &&
    Array.isArray(o.tags) && (o.tags as unknown[]).every(isProductTag) &&
    typeof o.embedId === 'string'
}

export function generateShoppableEmbed(config: ShoppableConfig): { html: string; shareUrl: string } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const shareUrl = `${appUrl}/watch/${config.embedId}`
  const html = `<iframe\n  src="${shareUrl}"\n  width="100%"\n  style="aspect-ratio:16/9;border:none;max-width:100%"\n  allowfullscreen\n  loading="lazy"\n  title="Shoppable Video"\n></iframe>`
  return { html, shareUrl }
}

export function buildPlayerConfig(config: ShoppableConfig): string {
  return JSON.stringify(config)
}
