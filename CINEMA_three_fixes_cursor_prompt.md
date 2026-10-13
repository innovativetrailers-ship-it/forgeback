# CINEMATIC FORGE — THREE FIXES
## Cursor Agent Prompt
### 1. Model Council must show ALL models · 2. Fix /api/vault/location/list 500 · 3. Panel width on tall menus

---

## FIX 1 — MODEL COUNCIL SHOWS ALL MODELS (currently only 6)

The AI Director "Model Council" only lists 6 models (Veo 3, Kling, Seedance, Runway, Luma,
Minimax). It must list EVERY video model in the registry. The picker is hardcoded — make it
registry-driven so no model is ever missing.

### 1a — Add display metadata to the registry

**Edit** `src/lib/routing/engineRegistry.ts` — add a display map covering ALL video models:

```typescript
// Friendly display data for the Model Council picker — EVERY video model
export const MODEL_COUNCIL_DISPLAY: Array<{
  id:       string
  name:     string
  role:     string
  tagline:  string
  dotColor: string
}> = [
  { id: 'veo-3.1',            name: 'Veo 3',         role: 'Visual Lead',       tagline: 'Photorealism, physics, native audio', dotColor: '#a855f7' },
  { id: 'kling-3.0',          name: 'Kling Pro',     role: 'Motion Expert',     tagline: 'Camera movement, locomotion',         dotColor: '#3b82f6' },
  { id: 'seedance-2.0',       name: 'Seedance',      role: 'Scene Architect',   tagline: 'Long scenes, continuity, dialogue',   dotColor: '#22c55e' },
  { id: 'runway-gen4',        name: 'Runway',        role: 'Style Artist',      tagline: 'Camera control, Motion Brush, Aleph',  dotColor: '#ec4899' },
  { id: 'luma-ray3',          name: 'Luma',          role: 'Action Director',   tagline: 'Aerial, landscape, dynamic motion',   dotColor: '#10b981' },
  { id: 'minimax-2.3',        name: 'Minimax',       role: 'Dialogue Expert',   tagline: 'Talking heads, facial sync',          dotColor: '#f59e0b' },
  { id: 'pixverse-c1',        name: 'PixVerse C1',   role: 'VFX Specialist',    tagline: 'Particles, fluid, atmospheric',       dotColor: '#06b6d4' },
  { id: 'pixverse-v6',        name: 'PixVerse V6',   role: 'Stylist',           tagline: 'General stylised video',              dotColor: '#0ea5e9' },
  { id: 'skyreels-v3',        name: 'SkyReels V3',   role: 'Long-form Director',tagline: 'Infinite-length sequences',           dotColor: '#8b5cf6' },
  { id: 'ltx-2.3',            name: 'LTX 2.3',       role: 'Resolution Master', tagline: '4K / 50fps high resolution',          dotColor: '#14b8a6' },
  { id: 'ltx-2.3-fast',       name: 'LTX Fast',      role: 'Draft Artist',      tagline: 'Instant pre-vis drafts',              dotColor: '#2dd4bf' },
  { id: 'wan-2.2',            name: 'Wan 2.2',       role: 'Budget Workhorse',  tagline: 'Environments, nature, low cost',      dotColor: '#84cc16' },
  { id: 'cogvideox',          name: 'CogVideoX',     role: 'Open Source',       tagline: 'General-purpose generation',          dotColor: '#a3e635' },
  { id: 'hunyuan-video-1.5',  name: 'HunyuanVideo',  role: 'Crowd Master',      tagline: 'Urban density, volumetric light',     dotColor: '#f472b6' },
  { id: 'hunyuan-hy-motion',  name: 'HY-Motion',     role: '3D Animator',       tagline: 'Character animation, walk cycles',    dotColor: '#fb7185' },
  { id: 'pika-2.5',           name: 'Pika 2.5',      role: 'Commercial Pro',    tagline: 'Product shots, clean style',          dotColor: '#fbbf24' },
  { id: 'grok-imagine-video', name: 'Grok Imagine',  role: 'Audio-Native',      tagline: 'Fast clips with synced audio',        dotColor: '#e879f9' },
]
```

### 1b — Make the Model Council picker render from this map

**Edit** the AI Director Model Council component (search for it):

```bash
grep -rln "MODEL COUNCIL\|Model Council\|Visual Lead\|Motion Expert" src/ --include="*.tsx"
```

In that component, replace the hardcoded model cards with a map over the registry:

```tsx
import { MODEL_COUNCIL_DISPLAY } from '@/lib/routing/engineRegistry'
import { useUserTier } from '@/hooks/useUserTier'
import { TIER_PERMISSIONS } from '@/lib/access/tiers'
import { Check, Lock } from 'lucide-react'

export function ModelCouncil({ selected, onChange }: {
  selected: string[]
  onChange: (models: string[]) => void
}) {
  const { tier, isAdmin } = useUserTier()
  const maxModels = isAdmin ? 999 : (TIER_PERMISSIONS[tier]?.maxDirectorModels ?? 0)

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(m => m !== id))
    } else {
      if (!isAdmin && selected.length >= maxModels) {
        window.dispatchEvent(new CustomEvent('show-upgrade-modal', {
          detail: { requiredTier: selected.length < 5 ? 'studio' : 'ultimate',
                    message: `Your plan allows ${maxModels} models. Upgrade for more.` }
        }))
        return
      }
      onChange([...selected, id])
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
          Model Council
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00e5c8]/10 text-[#00e5c8]">
          {selected.length} selected{isAdmin ? ' (unlimited)' : ` / ${maxModels}`}
        </span>
      </div>

      {/* ALL models from the registry — scrollable */}
      <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
        {MODEL_COUNCIL_DISPLAY.map(model => {
          const isSelected = selected.includes(model.id)
          const atLimit    = !isAdmin && !isSelected && selected.length >= maxModels

          return (
            <button
              key={model.id}
              onClick={() => toggle(model.id)}
              className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition ${
                isSelected
                  ? 'border-[#00e5c8] bg-[#00e5c8]/8'
                  : atLimit
                  ? 'border-white/5 opacity-40'
                  : 'border-white/10 hover:border-white/20'
              }`}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: model.dotColor }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white truncate">{model.name}</span>
                  <span className="text-[10px] text-gray-500 truncate">{model.role}</span>
                </div>
                <p className="text-[10px] text-gray-500 truncate">{model.tagline}</p>
              </div>
              <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                isSelected ? 'bg-[#00e5c8]' : 'border border-white/20'
              }`}>
                {isSelected && <Check className="w-3 h-3 text-black" />}
                {atLimit && !isSelected && <Lock className="w-2.5 h-2.5 text-gray-500" />}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

> Now all 17 video models appear. Adding a model to the registry auto-adds it to the picker.

### 1c — A note on Sora

Sora is NOT currently wired — it requires an OpenAI API integration we haven't built (Sora is
OpenAI, not on FAL, and needs its own `OPENAI_API_KEY` + video endpoint). Everything else you
named (LTX, Wan, Hunyuan, Grok video, PixVerse, SkyReels) IS in the registry and now shows.
If you want Sora added, it's a separate integration like Grok — say the word and I'll wire it.

---

## FIX 2 — `/api/vault/location/list` RETURNING 500

The console shows repeated `500` + `Unexpected end of JSON input`. The route crashes (likely
the `LocationPlate` table doesn't exist yet), returns an empty body, and the frontend chokes
parsing empty JSON. Fix both sides.

### 2a — Make the route crash-proof

**Edit** `src/app/api/vault/location/list/route.ts`:

```typescript
// src/app/api/vault/location/list/route.ts

import { db } from '@/lib/db'

export async function GET(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ plates: [] }, { status: 200 })  // never 401-crash the UI

  try {
    const plates = await db.locationPlate.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    100,
    })
    return Response.json({ plates })
  } catch (err: any) {
    // Table may not exist yet, or transient DB error — return empty, never 500
    console.error('[vault/location/list]', err.message)
    return Response.json({ plates: [] }, { status: 200 })
  }
}
```

> Returning `{ plates: [] }` with 200 means the UI renders an empty vault instead of throwing.

### 2b — Run the migration that creates the table

The 500 is almost certainly because `LocationPlate` was never migrated to production:

```bash
# Confirm the model exists in schema:
grep -n "model LocationPlate" prisma/schema.prisma

# If present but not migrated:
npx prisma migrate deploy        # production
# or for local dev:
npx prisma migrate dev --name add_location_plates
npx prisma generate
```

If `grep` finds nothing, the `LocationPlate` model was never added — add it from
`CINEMA_location_system_cursor_prompt.md` STEP 8, then migrate.

### 2c — Harden the frontend fetch

**Edit** wherever location plates are fetched (LocationPanel or vault hook) so a bad response
never throws "Unexpected end of JSON input":

```typescript
async function fetchLocationPlates(): Promise<{ plates: any[] }> {
  try {
    const res = await fetch('/api/vault/location/list', { credentials: 'include' })
    if (!res.ok) return { plates: [] }
    const text = await res.text()
    if (!text) return { plates: [] }          // guard empty body
    return JSON.parse(text)
  } catch {
    return { plates: [] }                      // never crash the UI
  }
}
```

Apply the same `res.text()` then `JSON.parse` guard to any other vault list calls showing in
the console (`/api/vault/sfx/list`, etc.) — the pattern prevents all "Unexpected end of JSON".

---

## FIX 3 — PANEL WIDTH STILL NARROW ON TALL MENUS

The width fix works on some panels but not the AI Director menu (lots of vertical content).
This panel scrolls vertically but stays ~288px wide, cramping the model cards.

### 3a — The cause

The AI Director panel content sets its OWN width independent of the resizable wrapper, OR the
resizable wrapper's width isn't being inherited by this particular tab's content. The model
cards are inside a fixed-width inner container.

### 3b — Find and fix

```bash
# Find the AI Director panel content container
grep -rln "MODEL COUNCIL\|Model Council\|PARAMETERS\|Target Duration" src/ --include="*.tsx"
```

In that component, ensure the content fills the panel width (not a fixed inner width):

```tsx
// The AI Director content wrapper must be w-full, not a fixed width:
<div className="w-full flex flex-col gap-3 p-3 overflow-y-auto">
  {/* genre buttons, MODEL COUNCIL, PARAMETERS — all w-full */}
</div>

// Any inner grid (genre buttons etc.) should be responsive:
<div className="grid grid-cols-2 gap-2 w-full">   {/* not fixed-width columns */}
```

### 3c — Ensure the resizable panel wraps ALL tab content, not just some

The resizable width must be on the SHARED panel container that holds every tab (Script,
Storyboard, AI Director...), so switching tabs keeps the same width:

```tsx
// The panel structure should be:
<ResizablePanel>            {/* width state lives HERE — shared across all tabs */}
  <TabBar />                {/* Script | Storyboard | AI Director | ... */}
  <div className="flex-1 w-full overflow-y-auto">
    {activeTab === 'script'    && <ScriptPanel />}
    {activeTab === 'director'  && <AIDirectorPanel />}   {/* inherits full width */}
    {/* ... */}
  </div>
</ResizablePanel>
```

If instead each tab renders its OWN width wrapper, the AI Director one is overriding the shared
width. Move the width control up to the single shared `ResizablePanel` and make every tab's
root `w-full`.

### 3d — Verify the width actually applies here

```bash
# After fixing, in the browser, switch to AI Director tab:
# - Panel stays at the dragged/default width (360px+)
# - Model cards use the full width
# - Resize handle still works on this tab
```

---

## FIX 4 — SLIDER-VERTICAL DEPRECATION (still showing)

The console still shows `slider-vertical` warnings. The earlier fix wasn't applied. Find and
replace everywhere:

```bash
grep -rn "slider-vertical\|appearance:.*slider" src/ --include="*.tsx" --include="*.css"
```

```tsx
// Replace every occurrence:
// ❌ style={{ appearance: 'slider-vertical' }}  or  className="[appearance:slider-vertical]"
// ✅
style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
```

This is the Audio Mix fader and any vertical EQ/volume sliders.

---

## VERIFICATION

```bash
npx tsc --noEmit
npx prisma migrate deploy    # ensures LocationPlate table exists

# 1. Model Council — all 17 models present
#    Open AI Director → Model Council → scroll → confirm:
#    Veo 3, Kling Pro, Seedance, Runway, Luma, Minimax, PixVerse C1, PixVerse V6,
#    SkyReels V3, LTX 2.3, LTX Fast, Wan 2.2, CogVideoX, HunyuanVideo, HY-Motion,
#    Pika 2.5, Grok Imagine — ALL visible

# 2. No more 500s
curl http://localhost:3000/api/vault/location/list -H "x-user-id: test-user"
# Expected: { "plates": [] }  (200, valid JSON — never 500)

# 3. Panel width holds on AI Director tab — model cards use full width

# 4. Console clean — no slider-vertical warnings, no JSON parse errors
```

---

## SUMMARY

| Fix | File | Change |
|---|---|---|
| 1 | `engineRegistry.ts` | Add MODEL_COUNCIL_DISPLAY (all 17 video models) |
| 1 | AI Director Model Council component | Render from registry, not hardcoded 6 |
| 2 | `api/vault/location/list/route.ts` | try/catch → return `{plates:[]}`, never 500 |
| 2 | prisma | `migrate deploy` to create LocationPlate table |
| 2 | Location fetch (frontend) | `res.text()` + guard before JSON.parse |
| 3 | AI Director panel content | w-full, inherit shared resizable width |
| 3 | Shared ResizablePanel | width control on shared container, all tabs w-full |
| 4 | Audio Mix faders | slider-vertical → writing-mode: vertical-lr |
```
