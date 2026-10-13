export interface ShopifyProduct {
  id: string
  title: string
  price: number      // cents
  imageUrl: string
  handle: string
  variants: Array<{ id: string; title: string; availableForSale: boolean; price: number }>
}

interface RawVariant { id: unknown; title: unknown; price: unknown; inventory_quantity: unknown }
interface RawProduct { id: unknown; title: unknown; handle: unknown; image: unknown; variants: unknown }

function isRawVariant(v: unknown): v is RawVariant {
  if (typeof v !== 'object' || v === null) return false
  return true // loose check — coerce below
}

function mapVariant(v: RawVariant): ShopifyProduct['variants'][number] {
  return {
    id: String(v.id),
    title: typeof v.title === 'string' ? v.title : 'Default',
    availableForSale: typeof v.inventory_quantity === 'number' ? v.inventory_quantity > 0 : true,
    price: Math.round(parseFloat(String(v.price ?? '0')) * 100),
  }
}

function mapProduct(p: RawProduct): ShopifyProduct {
  const img = p.image as Record<string, unknown> | null | undefined
  const variants = Array.isArray(p.variants) ? (p.variants as unknown[]).filter(isRawVariant).map((v) => mapVariant(v as RawVariant)) : []
  return {
    id: String(p.id),
    title: typeof p.title === 'string' ? p.title : '',
    price: variants[0]?.price ?? 0,
    imageUrl: typeof img?.src === 'string' ? img.src : '',
    handle: typeof p.handle === 'string' ? p.handle : '',
    variants,
  }
}

export function isShopifyProduct(v: unknown): v is ShopifyProduct {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.title === 'string' &&
    typeof o.price === 'number' && typeof o.imageUrl === 'string' &&
    typeof o.handle === 'string' && Array.isArray(o.variants)
}

export async function fetchShopifyProducts(shopDomain: string, accessToken: string): Promise<ShopifyProduct[]> {
  const url = `https://${shopDomain}/admin/api/2024-01/products.json?limit=250`
  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Shopify products API error: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as Record<string, unknown>
  if (!Array.isArray(data.products)) throw new Error('Unexpected Shopify response shape')
  return (data.products as unknown[])
    .filter((p): p is RawProduct => typeof p === 'object' && p !== null)
    .map(mapProduct)
}

export async function createShopifyCart(
  shopDomain: string,
  variantId: string,
  quantity: number,
  storefrontAccessToken: string,
): Promise<{ checkoutUrl: string }> {
  const gid = variantId.startsWith('gid://') ? variantId : `gid://shopify/ProductVariant/${variantId}`
  const query = `
    mutation CartCreate($lines: [CartLineInput!]!) {
      cartCreate(input: { lines: $lines }) {
        cart { checkoutUrl }
        userErrors { field message }
      }
    }`

  const res = await fetch(`https://${shopDomain}/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': storefrontAccessToken,
    },
    body: JSON.stringify({ query, variables: { lines: [{ merchandiseId: gid, quantity }] } }),
  })

  if (!res.ok) throw new Error(`Shopify Storefront API error: ${res.status}`)
  const json = (await res.json()) as Record<string, unknown>
  const cart = (json?.data as Record<string, unknown>)?.cartCreate as Record<string, unknown> | undefined
  const checkoutUrl = (cart?.cart as Record<string, unknown>)?.checkoutUrl
  if (typeof checkoutUrl !== 'string') throw new Error('Could not create Shopify cart')
  return { checkoutUrl }
}
