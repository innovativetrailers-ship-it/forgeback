# CINEMATIC FORGE — STRIPE TIERS, ACCESS GATING & DOWNLOAD PAGE
## Cursor Agent Prompt
### Simple=Pro · Advanced=Studio · Ultimate=Ultimate · Subscription gating · Download page + blog

---

## STEP 0 — READ STRIPE PRICE IDs FROM .env.local

Before writing any code, run this:

```bash
sed -n '68,73p' .env.local
```

The output will show the Stripe price ID variables. Note the EXACT variable names
and values — substitute them everywhere below where you see `[READ FROM .env.local]`.

Expected format (variable names may differ — use whatever is actually there):
```
STRIPE_PRICE_PRO=price_xxxxxxxxxxxxxxxxxx
STRIPE_PRICE_STUDIO=price_xxxxxxxxxxxxxxxxxx
STRIPE_PRICE_ULTIMATE=price_xxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PRICE_PRO=price_xxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PRICE_STUDIO=price_xxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PRICE_ULTIMATE=price_xxxxxxxxxxxxxxxxxx
```

---

## STEP 1 — TIER MAP & ACCESS RULES

**Edit** `src/lib/access/tiers.ts` — the canonical source of truth for all tier logic:

```typescript
// src/lib/access/tiers.ts

// ── Name mapping ───────────────────────────────────────────────────────
// UI label        DB value         Stripe product
// "Simple"    →   tier: 'pro'      price_xxx (Pro)
// "Advanced"  →   tier: 'studio'   price_xxx (Studio)
// "Ultimate"  →   tier: 'ultimate' price_xxx (Ultimate)
// Dev account →   role: 'ADMIN'    no subscription required

export type Tier = 'free' | 'pro' | 'studio' | 'ultimate' | 'admin'

// ── Stripe price ID → tier ────────────────────────────────────────────
// Cursor: read the ACTUAL price IDs from .env.local (Step 0) and paste them here
export const STRIPE_PRICE_TO_TIER: Record<string, Tier> = {
  [process.env.STRIPE_PRICE_PRO!]:      'pro',
  [process.env.STRIPE_PRICE_STUDIO!]:   'studio',
  [process.env.STRIPE_PRICE_ULTIMATE!]: 'ultimate',
}

// ── Display names (what users see) ────────────────────────────────────
export const TIER_DISPLAY_NAMES: Record<Tier, string> = {
  free:     'Free',
  pro:      'Simple',      // ← "Simple" in UI, "pro" in DB
  studio:   'Advanced',    // ← "Advanced" in UI, "studio" in DB
  ultimate: 'Ultimate',
  admin:    'Dev Account',
}

// ── Access rules ──────────────────────────────────────────────────────
//
// KEY RULE:
//   Pro (Simple):    NO subscription required. Users can operate purely on
//                    purchased credit tokens. Subscription offers better value
//                    but is NOT enforced.
//   Studio/Ultimate: MUST have an active Stripe subscription. No subscription
//                    = locked. ALL features display but are locked behind an
//                    upgrade prompt.
//   ADMIN (dev):     Unlimited access to everything including download.

export interface TierPermissions {
  displayName:        string
  requiresSubscription: boolean   // false = tokens-only allowed
  maxCreditsPerMonth: number       // soft cap; ADMIN = unlimited
  directorMode:       boolean      // AI Director multi-model
  maxDirectorModels:  number
  studioFeatures:     boolean      // DAW, colour science, VFX compositor
  ultimateFeatures:   boolean      // ForgeFlow, ForgeReview, advanced export
  download:           boolean      // Forge Extreme desktop download
  creditTopUp:        boolean      // can purchase additional token packs
}

export const TIER_PERMISSIONS: Record<Tier, TierPermissions> = {
  free: {
    displayName:          'Free',
    requiresSubscription: false,
    maxCreditsPerMonth:   50,
    directorMode:         false,
    maxDirectorModels:    0,
    studioFeatures:       false,
    ultimateFeatures:     false,
    download:             false,
    creditTopUp:          false,
  },
  pro: {
    displayName:          'Simple',
    requiresSubscription: false,    // ← tokens-only allowed, no sub needed
    maxCreditsPerMonth:   500,
    directorMode:         true,
    maxDirectorModels:    2,
    studioFeatures:       false,
    ultimateFeatures:     false,
    download:             false,
    creditTopUp:          true,
  },
  studio: {
    displayName:          'Advanced',
    requiresSubscription: true,     // ← MUST have active subscription
    maxCreditsPerMonth:   2000,
    directorMode:         true,
    maxDirectorModels:    7,
    studioFeatures:       true,     // DAW, colour, VFX
    ultimateFeatures:     false,
    download:             false,
    creditTopUp:          true,
  },
  ultimate: {
    displayName:          'Ultimate',
    requiresSubscription: true,     // ← MUST have active subscription
    maxCreditsPerMonth:   999999,
    directorMode:         true,
    maxDirectorModels:    21,       // full pool
    studioFeatures:       true,
    ultimateFeatures:     true,     // ForgeFlow, ForgeReview, DCP, IMF
    download:             true,     // ← Forge Extreme desktop
    creditTopUp:          true,
  },
  admin: {
    displayName:          'Dev Account',
    requiresSubscription: false,
    maxCreditsPerMonth:   999999,
    directorMode:         true,
    maxDirectorModels:    21,
    studioFeatures:       true,
    ultimateFeatures:     true,
    download:             true,
    creditTopUp:          false,    // dev accounts never get charged
  },
}
```

---

## STEP 2 — SUBSCRIPTION CHECK MIDDLEWARE

**Edit** `src/lib/access/guard.ts`:

```typescript
// src/lib/access/guard.ts

import { db }               from '@/lib/db'
import { TIER_PERMISSIONS } from './tiers'
import type { Tier }        from './tiers'

export interface AccessResult {
  allowed:  boolean
  tier:     Tier
  isAdmin:  boolean
  reason?:  string
  code?:    number
}

export async function checkAccess(
  userId:      string | null,
  creditCost:  number = 0,
  featureFlag?: keyof typeof TIER_PERMISSIONS[Tier]
): Promise<AccessResult> {
  if (!userId) return { allowed: false, tier: 'free', isAdmin: false, reason: 'Not authenticated', code: 401 }

  const user = await db.user.findUnique({
    where:  { id: userId },
    select: {
      role:              true,
      subscriptionTier:  true,
      subscriptionStatus:true,   // 'active' | 'past_due' | 'canceled' | null
      creditBalance:     true,
    },
  })

  if (!user) return { allowed: false, tier: 'free', isAdmin: false, reason: 'User not found', code: 404 }

  const isAdmin = user.role === 'ADMIN'
  if (isAdmin) return { allowed: true, tier: 'admin', isAdmin: true }

  const tier     = (user.subscriptionTier?.toLowerCase() ?? 'free') as Tier
  const perms    = TIER_PERMISSIONS[tier] ?? TIER_PERMISSIONS.free
  const hasActiveSub = user.subscriptionStatus === 'active'

  // ── Subscription gate (Studio + Ultimate) ─────────────────────────
  if (perms.requiresSubscription && !hasActiveSub) {
    return {
      allowed:  false,
      tier,
      isAdmin:  false,
      reason:   `${perms.displayName} features require an active subscription.`,
      code:     402,   // Payment Required — triggers upgrade modal in frontend
    }
  }

  // ── Credit gate (all tiers) ───────────────────────────────────────
  if (creditCost > 0 && user.creditBalance < creditCost) {
    return {
      allowed:  false,
      tier,
      isAdmin:  false,
      reason:   `Insufficient credits. Need ${creditCost}, have ${user.creditBalance}.`,
      code:     402,
    }
  }

  // ── Feature gate ─────────────────────────────────────────────────
  if (featureFlag && !(perms as any)[featureFlag]) {
    return {
      allowed:  false,
      tier,
      isAdmin:  false,
      reason:   `${String(featureFlag)} requires ${perms.requiresSubscription ? 'a higher subscription tier' : 'an upgrade'}.`,
      code:     403,
    }
  }

  return { allowed: true, tier, isAdmin: false }
}

export async function deductUserCredits(
  userId:      string,
  amount:      number,
  description: string,
  vendor:      string,
  vendorCost?: number
): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (user?.role === 'ADMIN') return   // dev accounts never deducted

  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { creditBalance: { decrement: amount } } }),
    db.creditTransaction.create({
      data: { userId, amount: -amount, description, vendor, vendorCost: vendorCost ?? 0,
              balanceAfter: 0 },   // balanceAfter computed separately if needed
    }),
  ])
}
```

---

## STEP 3 — PRISMA SCHEMA: subscriptionStatus FIELD

**Edit** `prisma/schema.prisma` — ensure User has `subscriptionStatus`:

```prisma
model User {
  id                 String    @id @default(cuid())
  email              String?   @unique
  name               String?
  image              String?
  role               String    @default("USER")
  subscriptionTier   String?   @default("free")
  subscriptionStatus String?   @default(null)   // ← add if missing: 'active' | 'past_due' | 'canceled'
  stripeCustomerId   String?
  creditBalance      Int       @default(50)
  // ... other relations
}
```

```bash
npx prisma migrate dev --name add_subscription_status
npx prisma generate
```

---

## STEP 4 — STRIPE WEBHOOK: KEEP subscriptionStatus IN SYNC

**Edit** `src/app/api/webhooks/stripe/route.ts`:

```typescript
import Stripe from 'stripe'
import { db } from '@/lib/db'
import { STRIPE_PRICE_TO_TIER } from '@/lib/access/tiers'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: Request) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')!
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch { return Response.json({ error: 'Invalid signature' }, { status: 400 }) }

  const sub = event.data.object as Stripe.Subscription

  switch (event.type) {
    // Subscription created or renewed successfully
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const priceId = sub.items.data[0]?.price.id
      const tier    = STRIPE_PRICE_TO_TIER[priceId] ?? 'free'
      const status  = sub.status   // 'active' | 'past_due' | 'canceled' etc.

      await db.user.updateMany({
        where: { stripeCustomerId: sub.customer as string },
        data:  { subscriptionTier: tier, subscriptionStatus: status },
      })
      break
    }

    // Subscription cancelled or payment failed
    case 'customer.subscription.deleted': {
      await db.user.updateMany({
        where: { stripeCustomerId: sub.customer as string },
        data:  { subscriptionStatus: 'canceled' },
        // Note: we do NOT reset subscriptionTier here — user keeps their tier label
        // but requiresSubscription check will block access (status != 'active')
      })
      break
    }

    // Payment failed — keep access for grace period ('past_due')
    case 'invoice.payment_failed': {
      const invoice   = event.data.object as Stripe.Invoice
      await db.user.updateMany({
        where: { stripeCustomerId: invoice.customer as string },
        data:  { subscriptionStatus: 'past_due' },
      })
      break
    }

    // Payment recovered after failure
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      await db.user.updateMany({
        where: { stripeCustomerId: invoice.customer as string },
        data:  { subscriptionStatus: 'active' },
      })
      break
    }
  }

  return Response.json({ received: true })
}
```

---

## STEP 5 — STRIPE CHECKOUT: CREATE SUBSCRIPTION

**Edit** `src/app/api/credits/subscribe/route.ts`:

```typescript
import Stripe from 'stripe'
import { db } from '@/lib/db'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Map tier name → Stripe price ID (read from env)
const TIER_PRICE_IDS: Record<string, string> = {
  pro:      process.env.STRIPE_PRICE_PRO!,
  studio:   process.env.STRIPE_PRICE_STUDIO!,
  ultimate: process.env.STRIPE_PRICE_ULTIMATE!,
}

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  const { tier } = await req.json()   // 'pro' | 'studio' | 'ultimate'

  if (!userId || !TIER_PRICE_IDS[tier]) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const user = await db.user.findUnique({
    where:  { id: userId },
    select: { email: true, stripeCustomerId: true },
  })

  // Get or create Stripe customer
  let customerId = user?.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user?.email ?? undefined })
    customerId = customer.id
    await db.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } })
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer:   customerId,
    mode:       'subscription',
    line_items: [{ price: TIER_PRICE_IDS[tier], quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/upgrade/success?tier=${tier}`,
    cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL}/upgrade`,
    subscription_data: {
      metadata: { userId, tier },
    },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
  })

  return Response.json({ url: session.url })
}
```

---

## STEP 6 — PRICING PAGE (tiered display with lock icons)

**Create/replace** `src/app/upgrade/page.tsx`:

```tsx
'use client'

import { useState }     from 'react'
import { useUserTier }  from '@/hooks/useUserTier'
import { TIER_PERMISSIONS, TIER_DISPLAY_NAMES } from '@/lib/access/tiers'
import { Check, Lock, Zap, Monitor, Download } from 'lucide-react'
import Link from 'next/link'

const PLANS = [
  {
    id:       'pro' as const,
    label:    'Simple',
    price:    '$19',
    period:   '/mo or pay-as-you-go',
    color:    '#10b981',
    desc:     'Start creating with AI generation. No subscription required — just buy credits.',
    tokens:   '500 credits/month',
    highlight: false,
    noSubNote: 'Use with credits only — subscription optional',
    features: [
      'AI Simple Mode generation',
      'Director Mode (2 models)',
      'All 17 video models available',
      'Voice synthesis',
      'Music generation',
      'Location scouting',
      'SFX tools',
      'Export HD video',
    ],
    locked: [],
  },
  {
    id:       'studio' as const,
    label:    'Advanced',
    price:    '$49',
    period:   '/mo',
    color:    '#8b5cf6',
    desc:     'The full professional toolkit. Subscription required.',
    tokens:   '2,000 credits/month',
    highlight: true,
    noSubNote: null,
    features: [
      'Everything in Simple',
      'Director Mode (7 models)',
      'Live interactive player',
      'Object removal & gore FX',
      'IC-Light AI relighting',
      'Defect correction',
      'Multi-track audio mixer',
      'Real-time EQ & grading',
      'Advanced export formats',
      'Cognitive Director AI',
    ],
    locked: [],
  },
  {
    id:       'ultimate' as const,
    label:    'Ultimate',
    price:    '$99',
    period:   '/mo',
    color:    '#00e5c8',
    desc:     'Every capability unlocked. Includes Forge Extreme desktop.',
    tokens:   'Unlimited credits',
    highlight: false,
    noSubNote: null,
    features: [
      'Everything in Advanced',
      'Director Mode (all 21 models)',
      'ForgeFlow production tracking',
      'ForgeReview collaboration',
      'DCP & IMF export',
      'C2PA content authenticity',
      'Character pipeline (InstantID)',
      'Anime transformation engine',
      'Real-time collaboration',
      'Priority generation queue',
    ],
    locked: [],
  },
]

export default function UpgradePage() {
  const { tier, isAdmin } = useUserTier()
  const [loading, setLoading] = useState<string | null>(null)

  const handleSubscribe = async (planId: string) => {
    setLoading(planId)
    const res  = await fetch('/api/credits/subscribe', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: planId }),
    })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    setLoading(null)
  }

  const isCurrentPlan = (planId: string) =>
    tier === planId || (isAdmin && planId === 'ultimate')

  return (
    <div className="min-h-screen bg-[#070d1a] text-white px-4 py-16">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-3">Choose Your Plan</h1>
          <p className="text-gray-400 max-w-xl mx-auto">
            Simple works with credits only — no subscription needed.
            Advanced and Ultimate require an active subscription for full access.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {PLANS.map(plan => {
            const perms    = TIER_PERMISSIONS[plan.id]
            const isCurrent = isCurrentPlan(plan.id)

            return (
              <div key={plan.id}
                className={`relative rounded-2xl border p-6 flex flex-col ${
                  plan.highlight
                    ? 'border-purple-500/60 bg-purple-500/5'
                    : 'border-white/10 bg-[#0d1425]'
                }`}>

                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1
                                  rounded-full bg-purple-600 text-xs font-bold">
                    MOST POPULAR
                  </div>
                )}

                {/* Plan header */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl font-bold">{plan.label}</span>
                    {plan.id === 'ultimate' && (
                      <Link href="/download"
                        className="flex items-center gap-1 px-2 py-0.5 rounded-md
                                   bg-[#00e5c8]/15 border border-[#00e5c8]/30
                                   text-[#00e5c8] text-[10px] font-semibold
                                   hover:bg-[#00e5c8]/25 transition">
                        <Monitor className="w-3 h-3" />
                        Forge Extreme
                      </Link>
                    )}
                  </div>
                  <div className="text-3xl font-bold" style={{ color: plan.color }}>
                    {plan.price}
                    <span className="text-sm font-normal text-gray-400 ml-1">{plan.period}</span>
                  </div>
                  <p className="text-sm text-gray-400 mt-2">{plan.desc}</p>
                  {plan.noSubNote && (
                    <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> {plan.noSubNote}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-500 mt-1">{plan.tokens}</p>
                </div>

                {/* Features */}
                <div className="flex-1 space-y-2 mb-6">
                  {plan.features.map(f => (
                    <div key={f} className="flex items-center gap-2 text-sm">
                      <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: plan.color }} />
                      <span className="text-gray-300">{f}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                {isCurrent ? (
                  <div className="py-2.5 text-center text-sm text-white/50 border border-white/10 rounded-xl">
                    Current Plan
                  </div>
                ) : (
                  <button
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={!!loading}
                    className="py-2.5 rounded-xl font-semibold text-sm transition"
                    style={{
                      background: plan.highlight ? '#8b5cf6' : plan.color,
                      color:      '#000',
                    }}>
                    {loading === plan.id ? 'Redirecting…' : `Get ${plan.label}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Forge Extreme download CTA */}
        <div className="border border-[#00e5c8]/20 rounded-2xl p-6
                        bg-gradient-to-r from-[#00e5c8]/5 to-transparent
                        flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Monitor className="w-10 h-10 text-[#00e5c8]" />
            <div>
              <h3 className="font-bold text-lg">Forge Extreme Desktop</h3>
              <p className="text-sm text-gray-400">
                Included with Ultimate — replaces Premiere, DaVinci, After Effects,
                Logic Pro, ShotGrid and Frame.io in one app.
              </p>
            </div>
          </div>
          {TIER_PERMISSIONS[tier]?.download || isAdmin ? (
            <Link href="/download"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl
                         bg-[#00e5c8] text-black font-bold hover:bg-[#00f0d5] transition">
              <Download className="w-4 h-4" /> Download
            </Link>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Lock className="w-4 h-4" />
              <span>Requires Ultimate</span>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
```

---

## STEP 7 — FEATURE LOCK COMPONENT (used across all panels)

**Create** `src/components/ui/FeatureLock.tsx`:

```tsx
'use client'

import { Lock }         from 'lucide-react'
import { useUserTier }  from '@/hooks/useUserTier'
import { TIER_PERMISSIONS } from '@/lib/access/tiers'
import type { Tier }    from '@/lib/access/tiers'
import { useRouter }    from 'next/navigation'

interface FeatureLockProps {
  requiredTier: 'studio' | 'ultimate'
  featureName:  string
  children:     React.ReactNode
}

const TIER_LABELS: Record<string, string> = {
  studio:   'Advanced',
  ultimate: 'Ultimate',
}

export function FeatureLock({ requiredTier, featureName, children }: FeatureLockProps) {
  const { tier, isAdmin } = useUserTier()
  const router = useRouter()

  const perms      = TIER_PERMISSIONS[tier as Tier]
  const hasAccess  = isAdmin
    || (requiredTier === 'studio'   && perms?.studioFeatures)
    || (requiredTier === 'ultimate' && perms?.ultimateFeatures)

  if (hasAccess) return <>{children}</>

  // Feature is visible but locked — overlay on top of children
  return (
    <div className="relative">
      {/* Render children dimmed */}
      <div className="pointer-events-none opacity-30 select-none">
        {children}
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center
                      bg-[#070d1a]/80 rounded-lg backdrop-blur-sm">
        <Lock className="w-6 h-6 text-white/40 mb-2" />
        <p className="text-sm font-semibold text-white/70">{featureName}</p>
        <p className="text-[11px] text-gray-500 mb-3">
          Requires {TIER_LABELS[requiredTier]} subscription
        </p>
        <button
          onClick={() => router.push('/upgrade')}
          className="px-4 py-1.5 rounded-lg text-[11px] font-semibold
                     bg-[#00e5c8] text-black hover:bg-[#00f0d5] transition">
          Upgrade to {TIER_LABELS[requiredTier]}
        </button>
      </div>
    </div>
  )
}
```

**Usage throughout the app** — wrap any Studio/Ultimate feature:

```tsx
// Studio features (Advanced subscription):
<FeatureLock requiredTier="studio" featureName="Live Grade Tools">
  <InteractivePlayer />
</FeatureLock>

<FeatureLock requiredTier="studio" featureName="AI Director — Full Model Pool">
  <ModelCouncil />
</FeatureLock>

// Ultimate features:
<FeatureLock requiredTier="ultimate" featureName="ForgeFlow Production Tracking">
  <ForgeFlowPanel />
</FeatureLock>
```

---

## STEP 8 — useUserTier HOOK (updated)

**Edit** `src/hooks/useUserTier.ts`:

```typescript
'use client'

import { useSession } from 'next-auth/react'
import { TIER_PERMISSIONS, TIER_DISPLAY_NAMES } from '@/lib/access/tiers'
import type { Tier } from '@/lib/access/tiers'

export function useUserTier() {
  const { data: session } = useSession()
  const rawTier     = (session?.user as any)?.subscriptionTier ?? 'free'
  const subStatus   = (session?.user as any)?.subscriptionStatus ?? null
  const role        = (session?.user as any)?.role ?? 'USER'
  const isAdmin     = role === 'ADMIN'

  const tier = isAdmin ? 'admin' : rawTier as Tier
  const perms = TIER_PERMISSIONS[tier] ?? TIER_PERMISSIONS.free

  // For Studio/Ultimate: check subscription is actually active
  const hasActiveSubscription =
    isAdmin || !perms.requiresSubscription || subStatus === 'active'

  // Effective tier: if subscription required but not active, treat as 'free' for gating
  const effectiveTier: Tier = (!hasActiveSubscription && perms.requiresSubscription)
    ? 'free' : tier

  return {
    tier:                 tier,
    effectiveTier,        // use this for feature gating
    displayName:          TIER_DISPLAY_NAMES[tier],
    isAdmin,
    hasActiveSubscription,
    permissions:          TIER_PERMISSIONS[effectiveTier],
    canUseStudio:         TIER_PERMISSIONS[effectiveTier]?.studioFeatures ?? false,
    canUseUltimate:       TIER_PERMISSIONS[effectiveTier]?.ultimateFeatures ?? false,
    canDownload:          TIER_PERMISSIONS[effectiveTier]?.download ?? false,
  }
}
```

---

## STEP 9 — DOWNLOAD PAGE WITH FEATURE BLOG

**Create** `src/app/download/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useUserTier }         from '@/hooks/useUserTier'
import { useRouter }           from 'next/navigation'
import Link                    from 'next/link'
import {
  Monitor, Apple, Download, Lock, CheckCircle2,
  Cpu, Palette, Music, Layers, Users, Star,
  Zap, Shield, Globe, Film
} from 'lucide-react'

const FEATURES = [
  {
    icon: <Film className="w-5 h-5" />,
    title: 'Professional NLE — Replaces Adobe Premiere Pro',
    desc: 'A full non-linear editor with unlimited tracks, advanced trimming tools, multicam editing, proxy workflows, J/L cuts, and slip/slide/roll edit tools. Frame-accurate cutting on any format — ProRes, BRAW, RED R3D, ARRI, AVCHD, MXF, HEVC, AV1. Surpasses Premiere in AI-assisted editing tools.',
  },
  {
    icon: <Palette className="w-5 h-5" />,
    title: 'Complete Colour Science — Replaces DaVinci Resolve',
    desc: 'Node-based colour grading with primary wheels, advanced curves (HvS, HvH, SvL), HSL qualifier, Power Windows with object tracking, ACES/OCIO pipeline, LUT import, AI shot match, and all scopes (waveform, vectorscope, histogram, CIE chromaticity). Forge Micro Colour panel with 0.001-stop precision, Zone System, 10-stop zone control, and HDR nit targeting up to 10,000 nits.',
  },
  {
    icon: <Layers className="w-5 h-5" />,
    title: 'Full VFX Compositing — Replaces After Effects',
    desc: 'Node-based compositor with 28 blend modes, 3D layer space, AI roto brush, planar tracking, 3D camera solve, particle systems, 200+ pre-rendered ProRes 4444 effects (pyro, destruction, fluid, ballistic, atmospheric, energy, practical, crowd, lens), and an AI text-to-VFX generator. Motion graphics with 200+ MoGRT templates.',
  },
  {
    icon: <Music className="w-5 h-5" />,
    title: '20-Band Professional DAW — Replaces Logic Pro & Fairlight',
    desc: 'A complete digital audio workstation with unlimited tracks, bus routing, sends, aux returns, stem separation (5-stem Demucs), Dolby Atmos 7.1.4, AI vocal pitch correction, noise reduction, and de-breather. The Forge Spectrum EQ offers 20 bands with 4 modes: Standard, Linear Phase, Dynamic EQ, and Analog Character — emulating Neve 1073, SSL G-Bus, API 550, Pultec EQP-1A, and more. The 9-stage Forge Master Suite gives broadcast-ready masters in minutes.',
  },
  {
    icon: <Users className="w-5 h-5" />,
    title: 'ForgeFlow — Replaces Autodesk ShotGrid ($800+/seat/year)',
    desc: 'Complete production tracking with shot management, 8-stage workflow, asset tracking, Gantt scheduling, resource calendar, budget reports, and bidirectional timeline linking. Approve a shot in ForgeFlow and the timeline clip turns green. Save $800+ per seat per year.',
  },
  {
    icon: <Globe className="w-5 h-5" />,
    title: 'ForgeReview — Replaces Adobe Frame.io ($15+/seat/month)',
    desc: 'Professional media review with timestamped annotations, threaded comments, voice notes, approval workflows, and client portal links — no account required for clients. Version stacking, A/B comparison, C2PA content authenticity certificates. Share a password-protected link, track views, control downloads.',
  },
  {
    icon: <Zap className="w-5 h-5" />,
    title: 'AI Generation Studio — All 21 Models, Cognitive Director',
    desc: 'The full Forge Intelligence model pool (21 models) with the Cognitive Director AI reasoning system — intent modeling, emotional arc design, Tree-of-Thoughts creative ideation, Reflexion self-critique, and a four-memory learning system that improves with every project. Character pipeline with InstantID face embedding, DWPose motion capture, and CatVTON apparel locking ensures consistent characters across every shot.',
  },
  {
    icon: <Shield className="w-5 h-5" />,
    title: 'Offline-First. Enterprise Secure.',
    desc: 'All project data lives locally in a SQLite .cfp file — your footage never leaves your machine unless you choose to collaborate. API keys are stored in your OS keychain (macOS Keychain / Windows Credential Manager), not in config files. Edit, grade, mix, and export with zero internet connection. Cloud sync only when you need it.',
  },
  {
    icon: <Cpu className="w-5 h-5" />,
    title: 'Native Desktop Performance',
    desc: 'Built on Electron 34 with WebGPU rendering. The timeline canvas renders 1080p/24fps at p95 <16ms. Colour edits appear in <50ms. Local FFmpeg processes export on your hardware — no upload, no queue, no waiting. On Apple Silicon M3 Ultra, a 30-minute ProRes master renders in under 4 minutes.',
  },
]

const REPLACES = [
  { app: 'Adobe Premiere Pro',    cost: '$659/yr',  what: 'Professional NLE' },
  { app: 'DaVinci Resolve Studio',cost: '$470 one-off', what: 'Colour science' },
  { app: 'After Effects',         cost: '$659/yr',  what: 'VFX & motion graphics' },
  { app: 'Logic Pro',             cost: '$299 one-off', what: 'Audio DAW' },
  { app: 'Autodesk ShotGrid',     cost: '$800+/seat/yr', what: 'Production tracking' },
  { app: 'Adobe Frame.io',        cost: '$180+/yr', what: 'Media review' },
]

function detectPlatform(): 'mac' | 'windows' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'mac'
  if (ua.includes('win')) return 'windows'
  return 'unknown'
}

export default function DownloadPage() {
  const { canDownload, isAdmin, tier } = useUserTier()
  const [platform, setPlatform]         = useState<'mac' | 'windows' | 'unknown'>('unknown')
  const router = useRouter()

  useEffect(() => setPlatform(detectPlatform()), [])

  // Fetch latest version from R2 update feed
  const [version, setVersion] = useState('3.0.0')
  useEffect(() => {
    fetch('https://releases.forgecinema.app/latest-mac.yml')
      .then(r => r.text())
      .then(yaml => {
        const v = yaml.match(/version: (.+)/)?.[1]?.trim()
        if (v) setVersion(v)
      }).catch(() => {})
  }, [])

  const DOWNLOAD_URLS = {
    mac_arm:   `https://releases.forgecinema.app/CinematicForge-${version}-arm64.dmg`,
    mac_intel: `https://releases.forgecinema.app/CinematicForge-${version}.dmg`,
    windows:   `https://releases.forgecinema.app/CinematicForge-Setup-${version}.exe`,
  }

  return (
    <div className="min-h-screen bg-[#070d1a] text-white">

      {/* Hero */}
      <div className="border-b border-white/8">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Monitor className="w-10 h-10 text-[#00e5c8]" />
            <h1 className="text-4xl font-bold">Forge Extreme</h1>
          </div>
          <p className="text-xl text-gray-400 mb-2">The Professional Desktop Studio</p>
          <p className="text-sm text-gray-500 max-w-2xl mx-auto mb-8">
            Replace your entire creative software stack — Premiere Pro, DaVinci Resolve,
            After Effects, Logic Pro, ShotGrid, and Frame.io — in a single desktop application.
            Included with your Ultimate subscription.
          </p>

          {/* Download or upgrade CTA */}
          {canDownload ? (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              {(platform === 'mac' || platform === 'unknown') && (
                <>
                  <a href={DOWNLOAD_URLS.mac_arm}
                     className="flex items-center gap-2 px-6 py-3 rounded-xl
                                bg-[#00e5c8] text-black font-bold hover:bg-[#00f0d5] transition">
                    <Apple className="w-5 h-5" />
                    Download for Mac — Apple Silicon
                  </a>
                  <a href={DOWNLOAD_URLS.mac_intel}
                     className="flex items-center gap-2 px-6 py-3 rounded-xl
                                border border-white/20 text-white hover:bg-white/5 transition">
                    <Apple className="w-5 h-5" />
                    Mac — Intel
                  </a>
                </>
              )}
              {(platform === 'windows' || platform === 'unknown') && (
                <a href={DOWNLOAD_URLS.windows}
                   className="flex items-center gap-2 px-6 py-3 rounded-xl
                              border border-white/20 text-white hover:bg-white/5 transition">
                  <Monitor className="w-5 h-5" />
                  Download for Windows
                </a>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 text-gray-500">
                <Lock className="w-5 h-5" />
                <span>Download requires an Ultimate subscription or Dev Account</span>
              </div>
              <Link href="/upgrade"
                className="px-8 py-3 rounded-xl bg-[#00e5c8] text-black font-bold
                           hover:bg-[#00f0d5] transition">
                Upgrade to Ultimate
              </Link>
            </div>
          )}

          {canDownload && (
            <p className="text-[11px] text-gray-600 mt-4">
              Version {version} · macOS 13+ · Windows 10/11 · Requires internet for AI generation
            </p>
          )}
        </div>
      </div>

      {/* What it replaces */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-center mb-2">
          Replace <span className="text-[#00e5c8]">$2,000–$6,000</span> in software
        </h2>
        <p className="text-gray-400 text-center text-sm mb-8">
          One subscription. Everything you need.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {REPLACES.map(r => (
            <div key={r.app} className="bg-[#0d1425] border border-white/8 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">{r.what}</p>
              <p className="font-semibold text-sm">{r.app}</p>
              <p className="text-[#00e5c8] text-xs mt-1">
                Saves {r.cost}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Feature breakdown blog */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-2">
          What's inside Forge Extreme
        </h2>
        <p className="text-gray-400 text-sm mb-10">
          Every tool a professional production needs. Built for desktop.
        </p>
        <div className="space-y-10">
          {FEATURES.map(f => (
            <div key={f.title} className="flex gap-5">
              <div className="w-10 h-10 rounded-xl bg-[#00e5c8]/10 border border-[#00e5c8]/20
                              flex items-center justify-center flex-shrink-0 text-[#00e5c8]">
                {f.icon}
              </div>
              <div>
                <h3 className="font-bold text-base mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* System requirements */}
      <div className="max-w-4xl mx-auto px-6 py-10 border-t border-white/8">
        <h2 className="text-lg font-bold mb-4">System Requirements</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <p className="font-semibold text-[#00e5c8] mb-2 flex items-center gap-2">
              <Apple className="w-4 h-4" /> macOS
            </p>
            <ul className="space-y-1 text-gray-400">
              <li>macOS 13 Ventura or later</li>
              <li>Apple Silicon (arm64) — recommended</li>
              <li>Intel (x86_64) — supported</li>
              <li>8GB RAM minimum, 16GB recommended</li>
              <li>10GB storage for app + cache</li>
              <li>Internet required for AI generation</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-[#00e5c8] mb-2 flex items-center gap-2">
              <Monitor className="w-4 h-4" /> Windows
            </p>
            <ul className="space-y-1 text-gray-400">
              <li>Windows 10 or Windows 11</li>
              <li>x64 architecture</li>
              <li>8GB RAM minimum, 16GB recommended</li>
              <li>DirectX 12 compatible GPU</li>
              <li>10GB storage for app + cache</li>
              <li>Internet required for AI generation</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      {!canDownload && (
        <div className="border-t border-white/8">
          <div className="max-w-4xl mx-auto px-6 py-12 text-center">
            <h2 className="text-2xl font-bold mb-3">Get Forge Extreme with Ultimate</h2>
            <p className="text-gray-400 mb-6">
              One subscription. Replace $6,000+ in annual software costs.
            </p>
            <Link href="/upgrade"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl
                         bg-[#00e5c8] text-black font-bold hover:bg-[#00f0d5] transition">
              <Star className="w-4 h-4" />
              Upgrade to Ultimate — $99/mo
            </Link>
          </div>
        </div>
      )}

    </div>
  )
}
```

---

## STEP 10 — NAV BAR: DOWNLOAD BUTTON BESIDE ULTIMATE TAB

**Edit** the nav bar component:

```tsx
import { useUserTier } from '@/hooks/useUserTier'
import { Monitor }     from 'lucide-react'
import Link            from 'next/link'

function ForgeExtremeNavButton() {
  const { canDownload, tier } = useUserTier()

  if (canDownload) {
    return (
      <Link href="/download"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                   bg-gradient-to-r from-[#00e5c8] to-[#00b8a0]
                   text-black text-xs font-bold hover:opacity-90 transition">
        <Monitor className="w-3.5 h-3.5" />
        Forge Extreme
      </Link>
    )
  }

  // Non-Ultimate: show locked teaser
  return (
    <Link href="/upgrade"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                 border border-white/15 text-white/40 text-xs
                 hover:border-[#00e5c8]/40 hover:text-white/60 transition">
      <Monitor className="w-3.5 h-3.5" />
      Forge Extreme
    </Link>
  )
}
```

---

## SUMMARY

| File | Action |
|---|---|
| `src/lib/access/tiers.ts` | EDIT — full tier map with Simple/Advanced/Ultimate labels |
| `src/lib/access/guard.ts` | EDIT — subscription check + credit gate |
| `prisma/schema.prisma` | EDIT — add `subscriptionStatus` field |
| `src/app/api/webhooks/stripe/route.ts` | EDIT — sync subscription status from Stripe events |
| `src/app/api/credits/subscribe/route.ts` | EDIT — checkout sessions with correct price IDs |
| `src/app/upgrade/page.tsx` | CREATE — pricing page with lock icons + Forge Extreme CTA |
| `src/components/ui/FeatureLock.tsx` | CREATE — reusable lock overlay component |
| `src/hooks/useUserTier.ts` | EDIT — include hasActiveSubscription |
| `src/app/download/page.tsx` | CREATE — blog + download links |
| Nav bar component | EDIT — Forge Extreme button beside Ultimate |

## VERIFICATION

```bash
npx prisma migrate dev --name add_subscription_status
npx tsc --noEmit

# Test the tier rules:
# 1. Free user → Simple features work, Studio/Ultimate panels show but locked
# 2. Pro user (no subscription) → credits work, Studio panels locked with upgrade prompt
# 3. Studio user (active sub) → Studio features unlocked, Ultimate panels locked
# 4. Ultimate user (active sub) → everything unlocked, Forge Extreme download visible
# 5. Stripe webhook: cancel subscription → subscriptionStatus='canceled' → Studio features lock
# 6. Download page: Ultimate user → download buttons visible; others → upgrade CTA
```
