# BUILD — RUN 38: AUDIT 2026-10-11 FIXES (security · billing · data safety · metering · honest UI · desktop release) — Cursor prompt
## ONE PASS, NO STOPS. Source: AUDIT-2026-10-11.md (read-only deep audit, evidence file:line). Every item below was found by
## reading code in the tree; items marked [CONFIRMED] were re-read by the auditor directly. Fix in the ORDER given (P0 first).
## Invariants: INV-1 billing chokepoint · INV-2 one location model · INV-3 registry endpoints · INV-4 honest UI · INV-5 no
## silent substitution/swallowed catches · INV-7 additive migrations only · INV-8 web/desktop parity · §Q user data never
## deleted (tombstone/retag) · pause guard (unset GENERATION_PAUSED ⇒ paused) untouched · never print secrets.
## Paths: web = cinema/ ; desktop = cinematic-forge-v3/ (own repo innovativetrailers-ship-it/forgecinema-desktop) ;
## core = cinema/packages/core. Deploy web + worker together. Add tests for every P0.

═══════════════════════════════════════════════════════════════════════
# A — AUTH (P0, do first)
═══════════════════════════════════════════════════════════════════════
A1 [CONFIRMED] src/proxy.ts:39-47 sets x-user-id/x-user-role only when a session exists; with no session it calls
   NextResponse.next() and the CLIENT-SUPPLIED headers pass through. 283 of 285 API routes read req.headers.get('x-user-id')
   as their only authentication; admin routes trust x-user-role (admin/promote/route.ts:7-9 lets anyone send
   `x-user-role: ADMIN` and grant ADMIN + 9,999,999 credits [CONFIRMED]; health/cognition:6, health/services:4, jobs/create:45).
   FIX: (1) in proxy.ts ALWAYS delete inbound x-user-id and x-user-role (and x-forge-desktop) from every request, then set
   them only from the verified session. (2) Add ONE shared helper `requireUser(req)` / `requireAdmin(req)` that derives the
   user from auth() (or a verified desktop/mobile bearer) and reads role FROM THE DATABASE, never from a header; migrate all
   routes to it (mechanical sweep: grep `headers.get('x-user-id')` and `headers.get('x-user-role')` → 0 hits outside the
   helper). (3) Add a CI check `check-no-header-auth` that fails on those patterns. (4) Proxy: for /api/* (except the explicit
   public list) return 401 JSON when there is no session/bearer instead of falling through. (5) Test: unauthenticated request
   with spoofed x-user-id/x-user-role gets 401/403 on a representative route from every area; admin/promote with spoofed role = 403.
   (6) Treat as an incident: after deploy, review admin users (`SELECT id,email,role,creditBalance FROM User WHERE role='ADMIN'
   OR creditBalance>100000`) and report; rotate nothing without telling Neo.
A2 webhooks/fal/route.ts:17-40 has no signature or secret; anyone with a falRequestId can forge training/render completion
   with an attacker-chosen outputUrl. FIX: put an HMAC token (per-job, server-held secret) on the webhook URL when submitting
   and verify it (constant-time) before any DB write; reject stale; ALSO verify FAL's signature headers if available. Only
   accept output URLs on FAL's media hosts.
A3 desktop/cognition/* and lib/desktop/cloudAuth.ts:4-19: bearer optional, x-forge-desktop spoofable. FIX: require the
   signed entitlement/bearer token always, meter these LLM relay calls (INV-1).
A4 camera/ingest/[sessionId]/route.ts:11-17 has no ownership check (stop route has one). Add session.userId === userId.
A5 Rate limiting: none exists. Add a shared limiter (Upstash/Redis already in stack or in-memory fallback) on /api/auth/*,
   register, mobile login, uploads, and every route that triggers paid work; per-user and per-IP.
A6 Unauthenticated routes that do work: audio/test (falls back to server ELEVENLABS key), import/detect, health/fal. Require
   auth or remove. DIAGNOSTICS_DEV must never skip role checks in production (fail if set when NODE_ENV=production).
A7 vercel.json: remove `; true` after `prisma migrate deploy` (a failed migration must fail the deploy); drop wildcard CORS
   `Access-Control-Allow-Origin: *` on /api and remove x-user-* from allowed headers; add CSP (report-only first) and HSTS;
   fix Permissions-Policy so camera/microphone work where the product needs them.
A8 Dependencies: `npm audit --omit=dev` shows 7 critical / 30 high (next proxy-bypass advisory, next-auth/@auth/core,
   shell-quote, proxy-addr, sharp, axios, ws, form-data, hono, nanoid, adm-zip, extract-zip, mysql2). Upgrade next, next-auth,
   @auth/*, sharp, axios, ws and the rest to patched versions, run tsc + jest + build, add dependabot.yml and an `npm audit
   --omit=dev --audit-level=high` CI step. Report anything that cannot be fixed.

═══════════════════════════════════════════════════════════════════════
# B — BILLING / LEDGER (P0)
═══════════════════════════════════════════════════════════════════════
B1 Stripe webhook (webhooks/stripe/route.ts): add idempotency — table ProcessedStripeEvent(eventId unique, type, processedAt)
   written in the SAME transaction as the effect (additive migration); handle duplicate delivery as 200 no-op. Missing
   stripe-signature header must be 400, not a 500 from `!`.
B2 Credit-pack purchases (checkout.session.completed ~:251) increment creditBalance with NO CreditTransaction row, and the
   nightly reconcileLedgers (reconcile/wave2.ts:68-95) overwrites User.creditBalance from the ledger sum — so purchased credits
   are WIPED. FIX: write the ledger row in the same transaction (set CreditTransaction.stripeId, unique per (provider,
   externalId)); change reconcile to REPORT drift (alert) and never overwrite.
B3 invoice.paid (~:143) SETs creditBalance=credits (destroys top-ups/holds). Make it an increment + ledger row; handle
   expiry separately. charge.refunded (~:103): add ledger row, never drive balance negative without a flag.
B4 openHold (credits/escrow.ts:30-41) reads balance outside the transaction → concurrent jobs overspend. Use a conditional
   updateMany WHERE creditBalance >= amount inside the transaction; settleHold/releaseHold compare-and-set on status;
   deductUserCredits (access/guard.ts:216-251) and deductCredits (credits.ts:169) must check balance, and honour isInternal
   (currently only role==='ADMIN'); refundCredits must be idempotent (key per job) and set balanceAfter correctly.
B5 studio/watchdog.ts:9 marks stuck clips FAILED with no refund/releaseHold → holds stay ACTIVE forever. Release hold +
   refund (idempotent) when sweeping. Render worker lockDuration 3h + maxStalledCount 1 (render.worker.ts:920) can re-run a
   paid call after a Railway kill: add a job-level idempotency key checked before any re-submit; lower lockDuration.
B6 Three inconsistent credit-pack catalogs (payments/credit-pack 200/600/1500/4000; credits/purchase 100/500/2000/10000 USD;
   stripePrices.ts). Collapse to ONE catalog in @cinema/core, priced in AUD, used by checkout and UI. credits.ts:208 mirrors
   every deduction into Stripe customer balance (createBalanceTransaction) — verify semantics against Stripe docs; if a
   positive amount debits the customer, REMOVE it.
B7 Two sources of truth for tier: webhook writes User.subscriptionTier/Status AND Subscription rows; resolveEntitlement reads
   only Subscription, access/guard.ts reads only User. Make Subscription the single source; derive/denormalise one-way.
B8 Server-side entitlement gaps: tier permissions canCollaborate, canPublishSocial, canUseVoiceClone, exportFormats,
   maxClipDuration, maxProjectClips, qualityTiers, uiModes, creditTopUp and UPGRADE_REQUIRED keys (quality_*, mode_*,
   export_4k, export_prores, collaborate, download) are defined but enforced NOWHERE. Enforce on the server for each
   corresponding route, or remove the claim from the UI copy (INV-4). Report which.
B9 App Store seam (prep only, no StoreKit yet — Run 22c does that): introduce `grantCredits(userId, provider, externalId,
   amount, source)` as the ONLY way credits are added (unique (provider, externalId)); Subscription unique key becomes
   (provider, providerSubId). Stripe paths use it. No behaviour change otherwise.

═══════════════════════════════════════════════════════════════════════
# C — METERING GAPS (INV-1) (P0/P1)
═══════════════════════════════════════════════════════════════════════
C1 The "chokepoint" (core fal/guardedSubmit.ts:15-43, anthropicClient.ts) is pause + attribution only; metering is per-route.
   Routes that run paid model work with NO credit check/charge (verified zero openHold/deduct/checkAndDeduct references):
   studio/looks, studio/avatar, studio/scene/generate (enqueues scene-generate), studio/shot/anchor/generate,
   studio/compositor/render, assets/t2i, location/scout-plate, location/aerial, studio/library/compose, studio/voice/take,
   studio/production/direct, audio/track/[id]/generate, desktop/cognition/{think,learn,feedback}. They return `metered:true`
   and an estimate but never charge. FIX: pattern = openHold(estimate) → run → settleHold(actual) | releaseHold on failure
   (see studio/colour/route.ts:50). Best: move metering INTO the guarded submit so a route cannot forget (INV-1 intent);
   then routes only declare cost class.
C2 fal/client.ts:81 calls `falSdk.queue.submit` — the check-chokepoints regex `fal\.queue\.submit` does not match it. Route
   through guardedFalSubmit and widen the regex to `\bfal\w*\.queue\.submit`. embeddings.ts:10 returns a zero vector on
   pause/error — return an explicit unavailable state instead (INV-5). hailuoEndpoints.ts:10,16 silently maps skyreels-v3 to
   Hailuo; render.worker.ts:329 silently falls back to Wan on unknown model: refuse and tell the user (INV-5).
C3 Desktop: falClient.ts:33-34 `billableClass:'interactive'` bypasses the early pause check for any caller; replace with a
   source allowlist like web's INTERACTIVE_SOURCES. providers.ts:164 (Replicate direct fetch) and elevenlabsClient.ts bypass
   the chokepoint — route them through it or record the exemption in the registry. Desktop hosted metering does not exist
   (BYO-key = unbilled); state this plainly in code comments and the entitlement doc.
C4 Scanners to harden (each must be able to go red): check-endpoints.mjs:18 matches only `fal-ai/…` → match all provider
   prefixes and move the ~20 literals (hailuoEndpoints.ts:7-16, falQueue.ts:383-384, accountStatus.ts:27, seedance.ts:5,
   studio/avatar:48, studio/shot/performance:69, studio/timeline/edit:39, studio/audio/gap:43,53, engineRegistry.ts:76-78,
   continuity.ts:61, videoPayloadAdapters.ts:870) into the registry (INV-3); check-swallowed-catches.mjs accepts any
   console.* log — a log-only catch that then returns null/[]/{}/false/0 must FAIL (31+ sites; triage the 709 auto-inserted
   `[caught]` warnings, fix the default-returning ones); check-pause-guard.mjs verifies only two files → cover every entry
   point; check-third-party-marks.mjs:9-22 lacks Runway/TikTok/Sora and :35 skips every `api` folder and src/lib → widen,
   and its self-test must actually run the scanner on a planted file; check-location-viewer.mjs only greps strings → add a
   real mount/e2e; check-no-stub-panels must also fail on a rail/PANEL_MAP entry with no opener (see F1); add
   check-no-header-auth (A1). Extend check:swallowed to the desktop repo.
C5 SELF-TEST HYGIENE: scripts/check-chokepoints.mjs:341,371 plants src/lib/__chokepoint_bypass_probe.ts (and a worker
   probe) in the real tree and a failure/kill leaves it behind — it is leaving it behind NOW (931 bytes, untracked), which
   makes verify-static report ~27 false chokepoint violations and a stray `git add .` would commit a deliberate bypass.
   FIX: run self-tests against a temp directory (or try/finally cleanup) — never in src/. Delete the leftover file. Add
   the probe names to .gitignore as a belt-and-braces measure.

═══════════════════════════════════════════════════════════════════════
# D — USER DATA SAFETY §Q (P0/P1)
═══════════════════════════════════════════════════════════════════════
D1 studio/sceneSync.ts:28-29 (`studioClip.deleteMany` + `studioScene.delete`) and :155 delete user clips/scenes when a
   re-plan no longer contains them (called from shotPlan.ts:285, directedRun.ts:75, orchestration/index.ts:237). This is the
   reconcile-that-cleans-up-by-deleting the rules forbid. FIX: tombstone (deletedAt) or retag as "orphaned from plan" so the
   user keeps the take and can restore; nothing auto-removed (additive migration for deletedAt/orphaned flag).
D2 studio/shot/[id]/remove/route.ts:21-27 returns `tombstone:true` but hard-deletes the row (and R2 object): make it a real
   tombstone. studio/library/items/route.ts:48-52 and library/delete hard-delete + remove R2 object: user-initiated is
   allowed, but must be a soft delete with a restore window and R2 removal only by an explicit purge the user confirms.
   Also vault/character.ts:293, audio/track/[id], playbooks/[id], BinManager.ts:76-77,124. 25 `onDelete: Cascade` relations
   (StudioScene→StudioClip schema:294,357; Asset :1513; AudioTrack): review each; change user-content cascades to Restrict
   (additive migration).
D3 Location model (INV-2): VaultLocation (schema:411; 7 code sites: vault/location.ts:17, ingest/link.ts:167,
   ingest/context.ts:32, adapters/webHost.ts:55, studio/director/route.ts:40, plugin/route.ts:42, mappers.ts:148) and
   FilmLocation (schema.prisma:810, has vaultLocationId) are still live beside Asset kind:location. Migrate readers/writers
   to Asset+LocationPlate, backfill additively, add a CI grep that fails on new VaultLocation/FilmLocation use.
D4 INV-7: add the missing hot-path indexes StudioClip(status, generatingAt), CreditHold(status), and a functional index
   for RenderJob.inputPayload->>'falRequestId' (FAL webhook lookup).
D5 Privacy/consent: consent is an unrecorded client boolean and only some routes check it. Enforce SERVER-SIDE with a stored
   ConsentRecord (user, subject, scope, text version, timestamp) on every likeness/voice route: avatar/create,
   avatar/generate, vault/character/[id]/voice, vault/character/[id]/ingest, audio/overdub, casting/recast, makeup/apply,
   studio/shot/[id]/lipsync, studio/voice/lipsync (clone-voice and studio/avatar already check). Minors blocked. Add a
   Privacy Policy page (src/app/(legal)/ has only terms), age/date-of-birth capture at registration, and a user-initiated
   account/data export and deletion path (APP/GDPR) that respects §Q (export first; deletion is the user's explicit act).
   C2PA: lib/export/C2PAInject.ts writes ffmpeg -metadata, which is NOT a signed C2PA manifest — either implement real
   signing (c2pa-node) or remove every "C2PA" claim from UI/marketing (INV-4).

═══════════════════════════════════════════════════════════════════════
# E — INPUT HANDLING (P1)
═══════════════════════════════════════════════════════════════════════
E1 Shell injection: highlights/extract/route.ts:63 and upscale/clip.ts:34 run execSync with the request's videoUrl inside a
   template string (command execution). Also FilmDirector.ts:154, AudioSwarm.ts:178, translate/video:129 (interpolated
   paths). Replace every execSync/exec template with execFile/spawn + argument array; validate URLs (E2).
E2 SSRF: add ONE shared fetcher (lib/safeFetch): resolve DNS, reject private/loopback/link-local/metadata IPs, exact-host
   allowlists (stock/import:22 uses host.endsWith('pexels.com') so evilpexels.com passes), cap redirects and bytes, timeouts.
   Apply to stock/import, vault/location/save:50, character/ingestion.ts:45 (ensureFalImageUrl), ingest/parse.ts:198, and
   the musicUrl/ambienceUrl in generate.
E3 Uploads (upload/image:15-20, video:17-22, audio:18-23) trust client MIME and file.name extension: allowlist types, derive
   the extension from the sniffed type, check magic bytes, refuse svg/html, serve with nosniff + Content-Disposition, size
   caps per tier (500 MB per request today).
E4 R2 keys embed userId (uploads/${userId}/…, stock/${userId}/…) on a public bucket URL — use opaque key prefixes for new
   objects (keep old keys readable); never expose userId in URLs.
E5 Mobile JWT: auth/mobile/login issues a 30-day HS256 token the proxy never validates — either implement bearer validation
   in requireUser (A1) or remove the route.

═══════════════════════════════════════════════════════════════════════
# F — HONEST UI / SPEC-vs-REALITY (INV-4) (P1)
═══════════════════════════════════════════════════════════════════════
F1 Unreachable panels: PANEL_MAP (LeftPanel.tsx:17-42) has avatar, highlight, translate, transitions, cgi, audio, vfx but
   IconRail.tsx:12-18 TOP_ITEMS has only Generate, Library, Stock, Brand, Training; no caller opens the others. Decide per
   Run 37b navigation (top tab row = workspaces; left column = per-workspace tools): mount each panel in the right workspace
   or remove it. Delete dead components FilmToolbar, EditToolbar, LeftIconBar, TokenBar and dead IconRail maps (:33-39).
   Remove the legacy left tab column in ultimate/page.tsx:81-89,625-721 that duplicates the top row (TopBar.tsx:70-86).
   Settings user-menu item (TopBar.tsx:353) has no onClick — wire it or remove it.
F2 Claims the product does not keep: RailTools.tsx:70 "Preview and export read this transition" and :123 "Volume is heard in
   preview" — preview (InteractivePlayer/playback) implements neither; export does. Implement in preview or reword now.
F3 Brand Kit (RailTools.tsx:253-282): sets brandKitId/brandColor/brandFont on clips but NOTHING reads them; "update linked
   titles" edits metadata only; no fonts, no extraction, watermark not burned. Make title/caption rendering AND export read
   them (spec PS-T2) or say plainly what it does today.
F4 Green Screen (GreenScreenPanel.tsx): video keyed on ONE frame only (:287); addToTimeline uses a fresh upload not the selected
   clip and hardcodes durationSec: 5 (:480); metadata.greenScreen is written (place.ts:84-98, saveOnClip) but NO playback,
   Remotion, export or timeline renderer reads it — web preview/export ignore the key. Implement a real consumer per Run 34
   GS-T4 (CompositorGraph node group) or label "stills only" and stop offering Apply on video.
F5 SFX Makeup: viewport is a tinted sphere (MakeupViewport.tsx:26-30) — label honestly or build Run 33 T2; every look shows
   "bake live · video needs a model" (SFXMakeupPanel.tsx:86) regardless of real status — read status from look.methods;
   api/makeup/apply has no caller; lookConflict only runs in tests; no Looks section in CharacterCastPanel.tsx.
F6 Location Scout: Cesium viewer is terrain only (aerial/page.tsx:58) — add OSM buildings / the tile set the licence allows;
   Mapillary attribution dropped in scout-plate/route.ts:109 — store credit in the plate; capture stores camera numbers in
   localStorage only (aerial/page.tsx:106-116) — capture a composition image; search/route.ts:63-66 hardcodes "KartaView…
   HTTP 400"/"Wikimedia… no photos" strings — compute at runtime; geocoder is public Nominatim queried as you type
   (engines/geocode.ts, LocationPanel.tsx:66-84): move behind a registry geocoder with a draggable pin.
F7 Avatar: no TTS/voice pick, script capped at 400 chars and errors instead of segmenting (studio/avatar/route.ts:35), result
   held in window.__avatarUrl (RailTools.tsx:353). Highlight Reel: scores keyword hits in prompts only (propose.ts); no
   in-point trim on created clips (RailTools.tsx:419-427). Stock: Pexels only, no filters, attribution not read into export
   credits. Training references: surface `capped` from assets/t2i (AssetPrompt.tsx), reject non-http refs explicitly.
F8 Timeline: saved "fit" height never restored (Timeline.tsx:84-89); dock layout saved under ONE key for all workspaces
   (EditorDock.tsx:756-767) → key by workspace. Three stacked bars still live (TopBar.tsx:410, EditorDock.tsx:901,
   Timeline.tsx:277).
F9 Trademark leftovers (user-facing): layout.tsx:26-29,40 (keywords/OG: Runway, Kling, Veo 3, Luma Dream Machine);
   opengraph-image.tsx:88; landing/FeaturesSection.tsx:10,45 (Veo 3, Kling, Seedance, Runway, "TikTok"); panels/MoGRTPanel.tsx:29
   ("TikTok Like Animation"); importers/DaVinciImporter.ts:26, PremiereProjImporter.ts:31, CapCutImporter.ts:11,55 (default
   project names/errors); production/frameio/route.ts:26,85, shotgrid/route.ts:104,107; providers/replicate.ts:5 (Sora);
   ImportProjectPanel.tsx:24-27 (apple/P emoji as app icons) and :205 (`.split(' ')[0]` makes every tile read "Import").
   Model/provider identifiers inside the model picker, file-format names and the TikTok publish target label stay allowed.
   Neutral names: "Imported project", "Colour project", "Mobile editor project", "Timeline interchange".

═══════════════════════════════════════════════════════════════════════
# G — DESKTOP (cinematic-forge-v3) (P0/P1)
═══════════════════════════════════════════════════════════════════════
G1 package.json electron ^34 (installed 34.5.8) is past end of support: upgrade to the current supported major, fix breaks,
   rebuild natives (better-sqlite3, c2pa-node), re-run tests. Report the version chosen.
G2 .github/workflows/release.yml:59 `npm ci --ignore-scripts` skips ffmpeg-static/c2pa-node installs → the CI app likely has
   no ffmpeg or the wrong architecture (local node_modules/ffmpeg-static/ffmpeg is x86_64, so an arm64 build may ship the
   wrong binary). Install the correct per-arch ffmpeg/ffprobe binaries explicitly, rebuild natives per arch, and add a SMOKE
   TEST of the packaged .app (launch headless, probe a sample file with the bundled ffmpeg, open the DB) before signing/uploading.
G3 upload-releases.mjs:96 uploads only .dmg/.exe/.zip/.yml/.blockmap; release.yml:102 writes the manifest and
   mac-notarized.txt but they are never uploaded, so the web gate (cinema/src/lib/desktop/releases.ts:168,192) would stay
   closed forever. Upload both after verify; BIND the marker to version + artifact sha256 so a stale marker cannot authorise a newer build.
G4 cinema/.github/workflows/desktop-release.yml (stale: triggers on v* tags, cd's into a folder that no longer holds the
   desktop, Apple-ID notarisation, no verification, releases.forgecinema.app): delete it.
G5 Add a pre-sign gate job: tsc (main+renderer+preload), vitest, audit:security, core chokepoint checks. release.yml:20,37,52:
   pin @cinema/core by tarball or lockfile (core has none; bare `npm install` floats @fal-ai/client), and export falEndpoint
   from the core ROOT (today only via hand-written shims packages/core/endpoints.js/.d.ts with moduleResolution Node);
   remove the committed packages/core/dist (210 of 284 tracked files) or generate it in CI only; one consumption path
   for web jest and desktop. The Windows job has gate but no build/upload steps — either finish or remove; keep "unsigned
   Windows refused" and the Windows download hidden until an Authenticode certificate exists.
G6 Electron hardening: index.ts:55-57 setWindowOpenHandler → shell.openExternal(any URL): allow https:/mailto: only, add
   will-navigate/will-redirect guards and a permission-request handler, also for plugin windows (pluginHost.ts:307-322, no
   CSP); renderer index.html:9 ships ws://localhost:5173 in production CSP — dev only; forge-media/forge-clip schemes set
   bypassCSP and ACAO:* (media/protocol.ts:39,43) — drop; media/paths.ts:47 uses abs.startsWith(root) without trailing
   separator (sibling dir `media-evil` passes) — use path.relative; mediaProbe/mediaThumbnail/exportReveal
   (handlers.ts:407,412,1777) must validate renderer-supplied paths against allowed roots; add sender-frame/URL checks on
   privileged IPC handlers.
G7 Deep links: osHooks.ts:54-58 stores `?token=` from ANY forge:// link as the entitlement — validate signature before storing;
   `shipOpen` has no renderer consumer so forge:// links, .forgeproject opens and the Blade/Mark In/Mark Out/Play menu
   items (osHooks.ts:84-87) DO NOTHING — wire the consumer or remove the items (INV-4). keystore.ts:53,64 falls back to
   plaintext apikeys.bin — refuse like keychain.ts does. license.ts:89 reads grace period from plaintext unsigned
   entitlement.json — sign it. updater.ts:54 enforce https:, move the feed from the public r2.dev URL to a custom domain
   when Neo provides one (single config value). desktopHost.ts:105 returns the FAL key for an `anthropic` secret request —
   confirm intent or fix.
G8 Parity (INV-8): desktop redefines Character/TimelineClip (shared/ipc.ts:1142,1211) and ShotStatus (shared/shot.ts:3
   differs from core entities.ts:41) and keeps its own MODEL_REGISTRY (ai/models.ts) — consume core types/registry; replace
   hardcoded endpoint literals (models.ts:43,71, providers.ts:61,67, payloadAdapters.ts:210,216, avatarLipsync.ts:24).
   206 log-only `[caught]` handlers: triage like C4. SECURITY_AUDIT.md says "18 tests… gates CI" — update to reality.
   Delete stale resources/entitlements.mac.plist (only build/ is used); drop network.server and files.downloads.

═══════════════════════════════════════════════════════════════════════
# H — MAC APP STORE PREP (analysis only here; Run 22c builds it)
═══════════════════════════════════════════════════════════════════════
Record in docs/MAS-READINESS.md (no build): blockers = disable-library-validation (sign every native .node/binary with the
same team ID), arbitrary file access (security-scoped bookmarks; project folder ~/Documents/CinematicForge at
db/project.ts:113 must become sandbox-container or user-chosen), electron-updater (compile out in MAS), bundled ffmpeg/ffprobe
spawn (sign + inherit), plugins from userData (review rules). Fine: allow-jit, network.client, camera/mic keys. Not in this run.

═══════════════════════════════════════════════════════════════════════
# GATES · DO NOT · EXIT
═══════════════════════════════════════════════════════════════════════
GATES: delete the leftover probe, then `node scripts/verify-static.mjs` = 0; `npx tsc --noEmit -p .` = 0 (web, core,
desktop main+renderer+preload); jest + vitest green incl. new tests for A1 (spoofed headers), A2 (forged webhook), B1
(duplicate Stripe event), B2 (pack purchase survives reconcile), B4 (concurrent holds), C1 (every paid route charges and
refunds on failure), D1 (re-plan keeps user clips), E1/E2/E3; `npm audit --omit=dev --audit-level=high` = 0 or each remainder listed.
DO NOT: print/log secrets; lift GENERATION_PAUSED; delete user data; ship a destructive migration (INV-7); hardcode endpoints;
add a second store/worker/chokepoint; claim a fix without a test or a command output.
EXIT: report per item A1…H with PASS/PARTIAL/NOT-DONE + evidence (test names, command output, file:line); list every deploy
step; web + worker deployed together; admin-user review output from A1(6). Anything not done is stated, not omitted.
