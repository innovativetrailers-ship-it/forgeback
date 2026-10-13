import type { ShopifyProduct } from './ShopifyClient'

interface RawWooProduct {
  id: unknown
  name: unknown
  price: unknown
  images: unknown
  slug: unknown
  stock_status: unknown
}

function isRawWooProduct(v: unknown): v is RawWooProduct {
  return typeof v === 'object' && v !== null
}

function mapWooProduct(p: RawWooProduct): ShopifyProduct {
  const images = Array.isArray(p.images) ? p.images as Array<Record<string, unknown>> : []
  const price = Math.round(parseFloat(String(p.price ?? '0')) * 100)
  return {
    id: String(p.id),
    title: typeof p.name === 'string' ? p.name : '',
    price,
    imageUrl: typeof images[0]?.src === 'string' ? images[0].src : '',
    handle: typeof p.slug === 'string' ? p.slug : '',
    variants: [{
      id: String(p.id),
      title: 'Default',
      availableForSale: p.stock_status === 'instock',
      price,
    }],
  }
}

export async function fetchWooProducts(
  baseUrl: string,
  consumerKey: string,
  consumerSecret: string,
): Promise<ShopifyProduct[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wc/v3/products?per_page=100`
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`WooCommerce API error: ${res.status} ${await res.text()}`)

  const data = (await res.json()) as unknown
  if (!Array.isArray(data)) throw new Error('Unexpected WooCommerce response shape')
  return (data as unknown[]).filter(isRawWooProduct).map(mapWooProduct)
}
