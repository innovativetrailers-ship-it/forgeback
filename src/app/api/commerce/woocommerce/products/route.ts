import { type NextRequest, NextResponse } from 'next/server'
import { fetchWooProducts } from '@/lib/commerce/WooCommerceClient'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl.searchParams.get('url')
  const key = req.nextUrl.searchParams.get('key')
  const secret = req.nextUrl.searchParams.get('secret')

  if (!url || !key || !secret) return NextResponse.json({ error: 'url, key, and secret query params are required' }, { status: 400 })

  try {
    const products = await fetchWooProducts(url, key, secret)
    return NextResponse.json({ products })
  } catch (err: unknown) {
    console.warn("[caught] src/app/api/commerce/woocommerce/products/route.ts:17", err instanceof Error ? { name: err.name, message: err.message } : err)

    const message = err instanceof Error ? err.message : 'Failed to fetch products'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
