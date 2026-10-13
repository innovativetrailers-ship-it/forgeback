# SPEC-09 — PRODUCTION & DELIVERY (27 controls)
# Inherits SPEC-00. Audit: 21 WIRED / 0 UI-ONLY / 1 STUB / 5 ABSENT (strongest section).
# ForgeFlow (ShotGrid) + ForgeReview (Frame.io) + export + location — mostly REAL.
# Host: desktop-flagship for ForgeFlow/Review; export + location shared. Entities:
# ff_shots / fr_review_items (desktop SQLite), export presets, LocationPlate.

═══════════════════════════════════════════════════════════════════════
# GROUP A — FORGEFLOW (ShotGrid replacement — wired)
═══════════════════════════════════════════════════════════════════════

### Shot status   [WIRED — 6 not 8 → TIER 3 naming]
- UI: menu writes the shot; statuses concept/previs/in-progress/review/approved/
  final (ShotsView.tsx:158 / ipc.ts:1227). That's SIX, spec claimed EIGHT.
- FIX (honesty): either add two stages (e.g. layout, comp) or scope the claim to 6.
  The workflow WORKS; it's a count mismatch, not a gap. TIER 3 (naming/scope).

### Gantt   [WIRED]  (drag bar → dueDate/bidDays; Level Schedule reflows, GanttView.tsx:22). TIER: —.
### Asset tracking   [WIRED]  (create + list named assets, AssetsView.tsx:32). TIER: —.
### Reports   [WIRED]  (report tab + Export PDF, ReportView.tsx:30). TIER: —.
### Clip ↔ shot link   [WIRED]  (ffShotId on clip; shot finds clip, Timeline.tsx:1648 /
  ShotsView.tsx:30 — bidirectional). TIER: —.

═══════════════════════════════════════════════════════════════════════
# GROUP B — FORGEREVIEW (Frame.io replacement — annotations wired, collab absent)
═══════════════════════════════════════════════════════════════════════

### Pen / Arrow / Text note   [WIRED]  (draw tools stored as annotation JSON on the
  comment, ReviewStage.tsx:72/5/67). TIER: —.
### Timecode comments   [WIRED]  (comment stores timecode + version, forgereview.ts:161). TIER: —.
### Version stack   [WIRED]  (add version → next number in group, ForgeReviewPanel.tsx:
  106 / forgereview.ts:66). TIER: —.

### Approval chain   [ABSENT → TIER 3]
- One Approve button sets approved (ForgeReviewPanel.tsx:289); no multi-reviewer
  sequence. UI: (build) an ordered reviewer chain (Director→Producer→Client). DATA:
  review.approvalChain[] with per-step status. BACKEND: advance on each approval;
  audit log. TIER 3 (build when you have teams; solo = one Approve is fine).

### Client portal PIN   [ABSENT → TIER 2 — the valuable one]
- PURPOSE: share a review link, no account, PIN-gated (the Frame.io-parity seller).
- UI: (build) "share" → generate link + optional 6-digit PIN + expiry + watermark +
  download toggle + view tracking.
- DATA: a ShareLink { itemId, pin?, expiresAt?, watermark?, allowDownload, views[] }.
- BACKEND: a public review route that checks PIN/expiry, renders the proxy player +
  comments (comments sync back to the desktop app). Watermark overlaid at render.
- STRATEGIC NOTE: this is the ONE genuinely valuable absent production feature — "send
  a client a review link" is a real agency/team seller. But it's a real build (guest
  auth, share links, watermarking). Build WHEN selling to teams/agencies, not for solo.
- TIER: 2 (valuable, build on team-audience demand).

### Portal watermark   [ABSENT → TIER 2]  (part of the client portal build. Overlay
  client name on all frames at the review render. Build with the portal.) TIER 2.
### Portal expiry   [ABSENT → TIER 2]  (link expiry 7/30/never; part of the portal build.) TIER 2.

### Review C2PA   [ABSENT → TIER 3]  (sign review items. Export C2PA exists (Group C);
  extend to review versions. Low priority.) TIER 3.

═══════════════════════════════════════════════════════════════════════
# GROUP C — EXPORT & DELIVERY (wired)
═══════════════════════════════════════════════════════════════════════

### Delivery presets   [WIRED]  (YouTube 4K/1080, Netflix HD, TikTok 9:16, IG 1:1,
  ProRes 422HQ/4444, DNxHR, 2×HEVC — presets.ts:28; panel starts one, ExportPanel.
  tsx:158). TIER: —.
### Auto-reframe pack   [WIRED]  (social pack renders several aspect cuts,
  ExportPanel.tsx:196). TIER: —.
### Loudness   [WIRED]  (job stores LUFS target; row shows integrated LUFS + true
  peak, ExportPanel.tsx:177). Cross-ref SPEC-07 LUFS. TIER: —.
### Subtitle burn-in   [WIRED]  (exportSubs burns timeline titles, ExportPanel.tsx:463). TIER: —.

### Subtitle translation   [STUB → TIER 2]
- A web route asks Claude to translate captions (translate/video/route.ts:61); the
  export panel does NOT call it. FIX: wire the export panel's "translate subtitles"
  to the route (via claudeCall, rule 1). Built, unmounted; useful for multi-language
  distribution. TIER 2.

### C2PA   [WIRED — conditional]  (manifest checkbox; cryptographic signature only
  when C2PA_CERT_PATH + C2PA_KEY_PATH set, else metadata, c2paSign.ts:25). STATUS:
  correct graceful degradation. HONESTY: only claim "cryptographically signed" when
  certs configured. TIER: — (works; label honestly).
### Background export   [WIRED]  (queues a job; editing stays live, exporter.ts:3591). TIER: —.

═══════════════════════════════════════════════════════════════════════
# GROUP D — LOCATION (fully wired)
═══════════════════════════════════════════════════════════════════════

### Location search   [WIRED]  (LocationPanel.tsx:31 → /api/location/search). TIER: —.
### Street view (Mapillary)   [WIRED]  (search route calls Mapillary, search/route.ts:3). TIER: —.
### Satellite   [WIRED]  (close/district/regional URLs, LocationPanel.tsx:9). TIER: —.
### Cesium 3D   [WIRED]  (Open Aerial stores camera → /location/aerial, :61). TIER: —.
### Location vault   [WIRED]  (save → /api/vault/location/save; card attaches a plate
  to a shot, :47). Cross-ref SPEC-04 (plate → generation reference). TIER: —.
NOTE: the location plate → generation reference wiring is in SPEC-04/SPEC-FIX
(location works on ALL reference-capable models). The MAP overlay (SPEC-06) reuses
this location data.

═══════════════════════════════════════════════════════════════════════
# SECTION SUMMARY & CONSOLIDATION
═══════════════════════════════════════════════════════════════════════
This is the strongest section — ForgeFlow, ForgeReview, export, and location are
REAL and mostly wired. The ShotGrid and Frame.io replacements are BUILT (not shells).
TIER 2 (do on demand):
- Client portal (PIN/watermark/expiry) — the ONE valuable absent feature; a real
  build; do when selling to teams/agencies. The three portal controls are ONE build.
- Subtitle translation — mount the stub (via claudeCall).
TIER 3 (minor/depth): approval chain, review C2PA, 8-vs-6 status naming.
CONSOLIDATION: the client portal = one build covering PIN + watermark + expiry +
tracking + guest route. Subtitle translation is one wiring. Everything else is
wired. Location data serves generation refs (SPEC-04), map overlays (SPEC-06), and
scouting — one system, three consumers.

## CROSS-REFS
- Location plate → generation reference → SPEC-04 + SPEC-FIX (all ref-capable models).
- Location data → map overlay → SPEC-06 (OverlayEngine map renderer).
- Subtitle translation → claudeCall (rule 1).
- LUFS → SPEC-07. C2PA → honest labeling.
- Client portal → the one team-audience seller; build on demand.

## NEXT
Say "next" for SPEC-10 (LLM / intelligence, 18 controls — the moat) — the FINAL
chunk. After it I'll write the wrap-up tying all 10 chunks + the master build view.
