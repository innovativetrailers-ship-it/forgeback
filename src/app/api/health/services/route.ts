import { checkServiceHealth, SERVICE_REGISTRY } from '@/lib/services/registry'

export async function GET(req: Request) {
  const role = req.headers.get('x-user-role')
  if (role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })

  const health = checkServiceHealth()
  const report = Object.entries(SERVICE_REGISTRY).map(([key, config]) => ({
    service:   config.name,
    category:  config.category,
    access:    config.access,
    connected: health[key],
  }))

  const allConnected = Object.values(health).every(Boolean)

  return Response.json({
    allConnected,
    services: report,
    summary: {
      total:     report.length,
      connected: report.filter(r => r.connected).length,
      missing:   report.filter(r => !r.connected).map(r => r.service),
    },
  })
}
