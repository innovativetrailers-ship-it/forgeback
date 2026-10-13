# CINEMATIC FORGE — UI LAYOUT FIXES
## Cursor Agent Prompt
### Payment route guard · Panel resize · Timeline overflow · Tab labels · Slider deprecation

---

## CONTEXT

Three visual/functional issues found in production at forgecinema.vercel.app:
1. `/api/credits/purchase` crashing with 400/500 when Stripe env vars missing
2. Inner left content panel (`w-72` = 288px) too narrow — labels hidden, no resize handle
3. Timeline clip tracks bleeding into the left panel, top tab bar truncating

Fix all four sections below. Do not break any existing functionality.

---

## FIX 1 — PAYMENT ROUTE GUARD

**Edit** `src/app/api/credits/purchase/route.ts`

Add guards at the top so missing Stripe config returns a clear 503 instead of crashing with 500:

```typescript
import { stripe }                    from '@/lib/payments/stripe'
import { getOrCreateStripeCustomer } from '@/lib/payments/stripeCustomer'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Guard — Stripe not configured
  if (!process.env.STRIPE_SECRET_KEY) {
    return Response.json({
      error: 'Payments not configured. Add Stripe keys to Vercel environment variables.',
    }, { status: 503 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { packSize } = body
  if (!packSize) {
    return Response.json({ error: 'packSize required: 100 | 500 | 2000 | 10000' }, { status: 400 })
  }

  const PRICE_IDS: Record<string, string | undefined> = {
    '100':   process.env.STRIPE_CREDITS_100_PRICE_ID,
    '500':   process.env.STRIPE_CREDITS_500_PRICE_ID,
    '2000':  process.env.STRIPE_CREDITS_2000_PRICE_ID,
    '10000': process.env.STRIPE_CREDITS_10000_PRICE_ID,
  }

  const priceId = PRICE_IDS[String(packSize)]
  if (!priceId) {
    return Response.json({
      error: `Price ID for pack "${packSize}" not set in Vercel env. Add STRIPE_CREDITS_${packSize}_PRICE_ID.`,
    }, { status: 503 })
  }

  try {
    const stripeCustomerId = await getOrCreateStripeCustomer(userId)

    const session = await stripe.checkout.sessions.create({
      customer:   stripeCustomerId,
      mode:       'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?purchase=success&credits=${packSize}`,
      cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?purchase=cancelled`,
      metadata:    { userId, credits: String(packSize), purpose: 'credit_pack' },
    })

    return Response.json({ checkoutUrl: session.url })
  } catch (err: any) {
    console.error('[credits/purchase]', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
```

---

## FIX 2 — INNER LEFT CONTENT PANEL (resizable, min 320px)

Find the component that renders the inner left panel containing Script/Storyboard/AI Director tabs. It currently has `w-72` as a fixed class. This is the expandable sidebar **inside** the editor — not the icon sidebar on the far left.

**Replace the panel wrapper** with a resizable version:

```tsx
// Find the div with className containing "w-72" in the left content panel
// Replace the entire component wrapper with:

'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

// Wrap the existing panel JSX with this component:
export function ResizableLeftPanel({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return parseInt(localStorage.getItem('cinema-left-panel-width') ?? '320')
    }
    return 320
  })

  const isResizing = useRef(false)
  const panelRef   = useRef<HTMLDivElement>(null)

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor        = 'col-resize'
    document.body.style.userSelect    = 'none'

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current || !panelRef.current) return
      const rect     = panelRef.current.getBoundingClientRect()
      const newWidth = Math.max(280, Math.min(600, e.clientX - rect.left))
      setWidth(newWidth)
      localStorage.setItem('cinema-left-panel-width', String(newWidth))
    }

    const onMouseUp = () => {
      isResizing.current             = false
      document.body.style.cursor     = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  return (
    <div
      ref={panelRef}
      // Replace w-72 with dynamic width:
      className="relative flex flex-col border-r border-[var(--border)] transition-none flex-shrink-0 bg-[var(--bg-elevated)]"
      style={{ width: `${width}px`, minWidth: '280px', maxWidth: '600px' }}
    >
      {children}

      {/* Drag-to-resize handle — right edge */}
      <div
        onMouseDown={startResize}
        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-30 group flex items-center justify-center"
        title="Drag to resize panel"
      >
        {/* Visible indicator strip */}
        <div className="w-0.5 h-12 rounded-full bg-[#00e5c8]/0 group-hover:bg-[#00e5c8]/50 transition-all duration-150" />
      </div>
    </div>
  )
}
```

**Then wrap the existing panel JSX:**

```tsx
// In the file that renders the inner left panel, replace:
<div className="flex flex-col border-r ... w-72">
  {/* existing content */}
</div>

// With:
<ResizableLeftPanel>
  {/* existing content unchanged */}
</ResizableLeftPanel>
```

---

## FIX 3 — ALWAYS SHOW TAB LABELS (remove hidden xl:block)

Inside the inner left panel's tab navigation, labels have `hidden xl:block` — they only appear above 1280px viewport. Since this panel has its own width control, labels should always be visible.

**Find and replace all occurrences:**

```tsx
// FIND this pattern in the tab buttons of the left panel:
<span className="hidden xl:block">Script</span>
<span className="hidden xl:block">Storyboard</span>
<span className="hidden xl:block">AI Director</span>
<span className="hidden xl:block">CGI</span>
<span className="hidden xl:block">Continuity</span>
<span className="hidden xl:block">Audio Mix</span>
// (and any other tab labels with this pattern)

// REPLACE WITH (remove the hidden class entirely):
<span>Script</span>
<span>Storyboard</span>
<span>AI Director</span>
<span>CGI</span>
<span>Continuity</span>
<span>Audio Mix</span>
```

**Bash command to find all occurrences:**
```bash
grep -rn "hidden xl:block" src/components/ --include="*.tsx" -l
```

---

## FIX 4 — TIMELINE BLEED INTO LEFT PANEL

Timeline clip tracks are rendering outside their container and overlapping the left content panel. Fix is `overflow-hidden` at two levels.

### 4a — Main editor layout wrapper

Find the top-level editor layout (the component that places the left panel next to the preview/timeline area):

```tsx
// Find the main editor flex container — it currently looks like:
<div className="flex h-full">
  {/* left panel */}
  {/* main area */}
</div>

// Add overflow-hidden:
<div className="flex h-full w-full overflow-hidden">   {/* ← ADD overflow-hidden */}
  <ResizableLeftPanel>...</ResizableLeftPanel>
  <div className="flex-1 flex flex-col overflow-hidden min-w-0">  {/* ← ADD overflow-hidden + min-w-0 */}
    <PreviewArea />
    <Timeline />
  </div>
</div>
```

`min-w-0` is critical — without it, flex children can overflow their parent even with `flex-1`.

### 4b — Timeline track container

Find the component that renders the track lanes (VID, VFX, CGI coloured bars):

```tsx
// Timeline tracks wrapper — add overflow-hidden:
<div className="flex-1 overflow-hidden relative">    {/* ← overflow-hidden */}
  <div className="timeline-tracks h-full overflow-x-auto overflow-y-hidden">
    {/* track lanes */}
  </div>
</div>
```

### 4c — Z-index hierarchy

Ensure the drag handle doesn't capture timeline pointer events:

```tsx
// Left panel resize handle:
<div onMouseDown={startResize} className="... z-30" />

// Timeline container:
<div className="flex-1 overflow-hidden relative z-10">

// Left panel itself:
<div className="relative ... z-20">
```

---

## FIX 5 — TOP FILM TOOLBAR TAB SCROLL

The top toolbar tabs (Script, Storyboard, AI Director, Continuity, Cast, Locations...) are truncating. Add horizontal scroll so all tabs remain accessible:

```tsx
// Find the top film toolbar tab row
// Currently:
<div className="flex items-center border-b border-[var(--border)]">

// Replace with:
<div className="flex items-center border-b border-[var(--border)] overflow-x-auto scrollbar-none flex-shrink-0">
```

**Add to `src/app/globals.css`:**

```css
/* Hide scrollbar visually but keep scrollability */
.scrollbar-none {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
```

---

## FIX 6 — SLIDER VERTICAL DEPRECATION

`appearance: slider-vertical` is deprecated. Find and fix wherever vertical range inputs are used (audio mixer faders, volume controls):

```bash
# Find all occurrences:
grep -rn "slider-vertical" src/ --include="*.tsx" --include="*.css" --include="*.ts"
```

```tsx
// ❌ Deprecated — remove this:
<input type="range" className="[appearance:slider-vertical]" />
// or in CSS: appearance: slider-vertical;

// ✅ Replace with standard:
<input
  type="range"
  style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
  className="h-24 w-2 cursor-pointer"
/>
```

For Tailwind, add a custom utility to `globals.css`:
```css
.slider-vertical {
  writing-mode: vertical-lr;
  direction: rtl;
}
```

Then use `className="slider-vertical"` instead of the deprecated appearance value.

---

## VERIFICATION

```bash
# 1. TypeScript passes
npx tsc --noEmit

# 2. No slider-vertical remaining
grep -rn "slider-vertical" src/ --include="*.tsx" --include="*.css"
# Expected: no results

# 3. No hidden xl:block on panel tab labels
grep -rn "hidden xl:block" src/components/ --include="*.tsx"
# Expected: no results (or only on elements outside the left panel)

# 4. Payment route returns clear error when Stripe not configured
# Test in browser: click "+ Get Credits" → should show helpful error, not crash
```

---

## SUMMARY — FILES TO CHANGE

| File | Change |
|---|---|
| `src/app/api/credits/purchase/route.ts` | Add Stripe config guards, proper 400/503 errors |
| Left panel component (has `w-72`) | Wrap with `ResizableLeftPanel`, remove fixed width |
| Left panel tab nav | Remove `hidden xl:block` from all tab label spans |
| Main editor layout | Add `overflow-hidden` + `min-w-0` to flex containers |
| Timeline track wrapper | Add `overflow-hidden` to contain clip tracks |
| Audio mixer / fader components | Replace `slider-vertical` with `writing-mode: vertical-lr` |
| `src/app/globals.css` | Add `.scrollbar-none` + `.slider-vertical` utilities |
