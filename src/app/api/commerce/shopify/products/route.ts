import { type NextRequest, NextResponse } from 'next/server'
import { fetchShopifyProducts } from '@/lib/commerce/ShopifyClient'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const shop = req.nextUrl.searchParams.get('shop')
  const token = req.nextUrl.searchParams.get('token')

  if (!shop || !token) return NextResponse.json({ error: 'shop and token query params are required' }, { status: 400 })

  try {
    const products = await fetchShopifyProducts(shop, token)
    return NextResponse.json({ products })
  } catch (err: unknown) {
    console.warn("[caught] src/app/api/commerce/shopify/products/route.ts:16", err instanceof Error ? { name: err.name, message: err.message } : err)

    const message = err instanceof Error ? err.message : 'Failed to fetch products'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
