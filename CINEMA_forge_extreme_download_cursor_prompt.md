# CINEMATIC FORGE — FORGE EXTREME DOWNLOAD FEATURE
## Cursor Agent Prompt
### Ultimate-tier gated desktop app download · Nav bar integration · Upgrade prompt for lower tiers

---

## WHAT THIS ADDS

A "Forge Extreme" download call-to-action in the web app nav bar, visible only to
**Ultimate subscribers** (and ADMIN accounts). All other tiers see a teaser that leads
to an upgrade modal. The V3 desktop app is branded as "Forge Extreme" in the web app.

---

## STEP 1 — NAV BAR COMPONENT

**Edit** the top nav bar (search for the component rendering the nav — likely
`src/components/layout/TopBar.tsx`, `src/components/ui/Navbar.tsx`, or similar):

```bash
# Find the nav bar:
grep -rln "Sign Out\|credit.*balance\|Export Film\|Get Credits\|subscription" src/components --include="*.tsx" | head -5
```

Add the Forge Extreme badge to the right side of the nav bar, after the credits display:

```tsx
import { useUserTier } from '@/hooks/useUserTier'
import { Monitor, Download, Lock } from 'lucide-react'

// Inside the nav bar component:
function ForgeExtremeButton() {
  const { tier, isAdmin } = useUserTier()
  const isUltimate = isAdmin || tier === 'ultimate'

  if (isUltimate) {
    return (
      <a
        href="/download"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                   bg-gradient-to-r from-[#00e5c8] to-[#00b8a0]
                   text-black text-xs font-bold tracking-wide
                   hover:from-[#00f0d5] hover:to-[#00c8ae]
                   transition-all duration-200 shadow-sm
                   border border-[#00e5c8]/30"
      >
        <Monitor className="w-3.5 h-3.5" />
        <span>Forge Extreme</span>
        <Download className="w-3 h-3 opacity-70" />
      </a>
    )
  }

  // Non-Ultimate: teaser that opens upgrade modal
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent('show-upgrade-modal', {
        detail: {
          requiredTier: 'ultimate',
          feature:      'Forge Extreme Desktop',
          message:      'Forge Extreme is the professional desktop studio — Premiere Pro, DaVinci Resolve, After Effects, ShotGrid, and Frame.io in one app. Included with Ultimate.',
        },
      }))}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                 border border-white/15 text-white/50 text-xs font-medium
                 hover:border-[#00e5c8]/40 hover:text-white/70
                 transition-all duration-200 group"
    >
      <Monitor className="w-3.5 h-3.5" />
      <span>Forge Extreme</span>
      <Lock className="w-3 h-3 opacity-50 group-hover:opacity-80" />
    </button>
  )
}
```

**Add `<ForgeExtremeButton />` to the nav bar JSX**, before the user avatar/sign-out area.

---

## STEP 2 — DOWNLOAD PAGE

**Create** `src/app/download/page.tsx`:

```tsx
// src/app/download/page.tsx
// Forge Extreme desktop app download page — Ultimate subscribers only

'use client'

import { useEffect, useState } from 'react'
import { Monitor, Apple, ExternalLink, CheckCircle2, Lock } from 'lucide-react'
import { useRouter } from 'next/navigation'

// Platform detection
function detectPlatform(): 'mac' | 'windows' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'mac'
  if (ua.includes('win')) return 'windows'
  return 'unknown'
}

// ── DOWNLOAD URLS — update when V3 builds are ready ────────────────────
const DOWNLOAD_URLS = {
  mac_arm:    'https://releases.forgecinema.app/v3/latest/CinematicForge-arm64.dmg',
  mac_intel:  'https://releases.forgecinema.app/v3/latest/CinematicForge-x64.dmg',
  windows:    'https://releases.forgecinema.app/v3/latest/CinematicForge-Setup.exe',
}

const FEATURES = [
  'Full NLE editor — replaces Adobe Premiere Pro',
  'Professional colour science — replaces DaVinci Resolve',
  'Node compositor — replaces After Effects',
  'Complete audio DAW — replaces Logic Pro / Fairlight',
  'Forge Spectrum EQ — 20-band professional equalizer',
  'Forge Master Suite — 9-stage mastering chain',
  '200+ pre-rendered VFX effects library',
  'ForgeFlow — replaces Autodesk ShotGrid ($800/seat/yr)',
  'ForgeReview — replaces Adobe Frame.io ($15/seat/mo)',
  '21 AI video models — routed per shot automatically',
  'Offline-first — edit without internet',
  'API keys in OS keychain — enterprise security',
]

export default function DownloadPage() {
  const [platform, setPlatform] = useState<'mac' | 'windows' | 'unknown'>('unknown')
  const [tier, setTier] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    setPlatform(detectPlatform())
    // Check tier from session
    fetch('/api/user/tier', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setTier(d.tier))
      .catch(() => setTier(null))
  }, [])

  const isAllowed = tier === 'ultimate' || tier === 'admin'

  return (
    <div className="min-h-screen bg-[#070d1a] text-white">
      <div className="max-w-3xl mx-auto px-6 py-16">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Monitor className="w-8 h-8 text-[#00e5c8]" />
          <h1 className="text-3xl font-bold tracking-tight">Forge Extreme</h1>
        </div>
        <p className="text-gray-400 mb-10">
          The professional desktop studio. Everything in the web app, plus the full NLE, colour
          science, compositing, audio mastering, ForgeFlow, and ForgeReview — offline-first.
        </p>

        {!isAllowed ? (
          /* ── Locked state ── */
          <div className="border border-white/10 rounded-2xl p-8 text-center bg-[#0d1425]">
            <Lock className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Ultimate Plan Required</h2>
            <p className="text-gray-400 text-sm mb-6">
              Forge Extreme is included with the Ultimate subscription at no extra charge.
            </p>
            <button
              onClick={() => router.push('/upgrade')}
              className="px-6 py-3 rounded-xl bg-[#00e5c8] text-black font-bold hover:bg-[#00f0d5]"
            >
              Upgrade to Ultimate
            </button>
          </div>
        ) : (
          <>
            {/* ── Download buttons ── */}
            <div className="grid gap-4 mb-12">
              {(platform === 'mac' || platform === 'unknown') && (
                <>
                  <a href={DOWNLOAD_URLS.mac_arm}
                     className="flex items-center justify-between p-5 rounded-xl
                                bg-[#0d1425] border border-[#00e5c8]/30
                                hover:border-[#00e5c8] transition-all group">
                    <div className="flex items-center gap-4">
                      <Apple className="w-7 h-7 text-[#00e5c8]" />
                      <div>
                        <p className="font-semibold">macOS — Apple Silicon</p>
                        <p className="text-xs text-gray-500">M1 / M2 / M3 / M4 (arm64) · Recommended</p>
                      </div>
                    </div>
                    <span className="text-[#00e5c8] text-sm font-medium opacity-0 group-hover:opacity-100">
                      Download →
                    </span>
                  </a>
                  <a href={DOWNLOAD_URLS.mac_intel}
                     className="flex items-center justify-between p-5 rounded-xl
                                bg-[#0d1425] border border-white/10
                                hover:border-white/25 transition-all group">
                    <div className="flex items-center gap-4">
                      <Apple className="w-7 h-7 text-gray-400" />
                      <div>
                        <p className="font-semibold text-white/80">macOS — Intel</p>
                        <p className="text-xs text-gray-500">x86_64 · macOS 13 Ventura minimum</p>
                      </div>
                    </div>
                    <span className="text-gray-400 text-sm font-medium opacity-0 group-hover:opacity-100">
                      Download →
                    </span>
                  </a>
                </>
              )}
              {(platform === 'windows' || platform === 'unknown') && (
                <a href={DOWNLOAD_URLS.windows}
                   className="flex items-center justify-between p-5 rounded-xl
                              bg-[#0d1425] border border-white/10
                              hover:border-white/25 transition-all group">
                  <div className="flex items-center gap-4">
                    <Monitor className="w-7 h-7 text-gray-400" />
                    <div>
                      <p className="font-semibold text-white/80">Windows</p>
                      <p className="text-xs text-gray-500">x64 + arm64 · Windows 10/11</p>
                    </div>
                  </div>
                  <span className="text-gray-400 text-sm font-medium opacity-0 group-hover:opacity-100">
                    Download →
                  </span>
                </a>
              )}
            </div>

            {/* ── Install note ── */}
            <div className="bg-[#0d1425] border border-white/8 rounded-xl p-5 mb-10 text-sm text-gray-400">
              <p className="font-medium text-white/70 mb-1">First launch</p>
              <p>Open the app → enter your Cinematic Forge email + subscription key →
                 follow the API key setup wizard to store keys in your system keychain.
                 Your subscription is automatically verified. No re-purchase required.</p>
            </div>
          </>
        )}

        {/* ── Feature list (visible to all) ── */}
        <h2 className="text-lg font-semibold mb-4 text-white/80">What's included</h2>
        <div className="grid grid-cols-1 gap-2">
          {FEATURES.map(f => (
            <div key={f} className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-[#00e5c8] mt-0.5 flex-shrink-0" />
              <span className="text-sm text-gray-300">{f}</span>
            </div>
          ))}
        </div>

        <p className="mt-10 text-xs text-gray-600">
          Forge Extreme requires macOS 13+ (arm64 or x86_64) or Windows 10/11 (x64 or arm64).
          Internet required only for AI generation. All editing and playback works offline.
        </p>

      </div>
    </div>
  )
}
```

---

## STEP 3 — USER TIER API ENDPOINT

**Create** `src/app/api/user/tier/route.ts` (used by the download page):

```typescript
import { db } from '@/lib/db'

export async function GET(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ tier: null })

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true, role: true },
  }).catch(() => null)

  const tier = user?.role === 'ADMIN' ? 'admin'
    : (user?.subscriptionTier?.toLowerCase() ?? 'free')

  return Response.json({ tier })
}
```

---

## STEP 4 — UPGRADE MODAL HANDLES FORGE EXTREME

**Edit** `UpgradeModal.tsx` — the event listener should catch the Forge Extreme event and
render a specific message for it:

```tsx
// In the modal's useEffect event listener:
window.addEventListener('show-upgrade-modal', (e: any) => {
  const { requiredTier, feature, message } = e.detail
  setRequiredTier(requiredTier)
  setFeatureName(feature ?? 'This feature')
  setMessage(message ?? `Upgrade to ${requiredTier} to access ${feature}.`)
  setOpen(true)
})

// In the modal JSX — when feature === 'Forge Extreme Desktop', show the app icon:
{featureName === 'Forge Extreme Desktop' && (
  <Monitor className="w-10 h-10 text-[#00e5c8] mx-auto mb-4" />
)}
```

---

## STEP 5 — PRICING PAGE UPDATE

**Edit** the pricing/tiers page — add Forge Extreme as a callout on the Ultimate tier card:

```tsx
// On the Ultimate tier card, add:
<div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-[#00e5c8]/8 border border-[#00e5c8]/20">
  <Monitor className="w-4 h-4 text-[#00e5c8] flex-shrink-0" />
  <div>
    <p className="text-xs font-semibold text-[#00e5c8]">Includes Forge Extreme Desktop</p>
    <p className="text-[10px] text-gray-500">Full professional studio app — macOS + Windows</p>
  </div>
</div>
```

---

## SUMMARY

| File | Action |
|---|---|
| Nav bar component | EDIT — add `<ForgeExtremeButton />` |
| `src/app/download/page.tsx` | CREATE — download page with tier gate |
| `src/app/api/user/tier/route.ts` | CREATE — tier check for download page |
| `UpgradeModal.tsx` | EDIT — handle Forge Extreme event |
| Pricing/tiers page | EDIT — Forge Extreme callout on Ultimate card |

---

## VERIFICATION

```bash
# 1. Ultimate user — sees teal Download button in nav
# 2. Click → /download — sees platform-specific download buttons
# 3. Non-Ultimate user — sees greyed lock button
# 4. Click → upgrade modal with Forge Extreme description and "Upgrade to Ultimate" CTA
# 5. Pricing page → Ultimate card shows Forge Extreme desktop callout
```
