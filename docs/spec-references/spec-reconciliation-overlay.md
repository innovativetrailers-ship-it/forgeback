# SPEC RECONCILIATION OVERLAY — post-audit corrections to all spec docs
## The specs (arch + phases 1-6) define the TARGET and remain valid as targets.
## The audit revealed the CURRENT STATE differs from what the specs/inferred-audit
## assumed. This overlay pins each affected spec section to audit reality so nothing
## is built from a stale assumption. Read this ALONGSIDE the specs; where they
## conflict, THIS wins (it's calibrated to the actual repo).

═══════════════════════════════════════════════════════════════════════
# CORRECTION 1 — INTELLIGENCE IS BUILT (spec-3 was written as if greenfield)
═══════════════════════════════════════════════════════════════════════
spec-3 (cognitive/MoE) said "currently UNBUILT, build interfaces as pass-throughs
then fill." AUDIT: substantially BUILT. Revised status:
- Cognitive Director: EXISTS — src/lib/cognition/director.ts + agents/ideationAgent.ts
  + agents/critiqueAgent.ts + agents/continuityAgent.ts. → spec-3 Part 1 is a
  FINISH/verify task: confirm all 5 stages, wire output into scriptBreakdown.
- MoE gate: PARTIAL — src/lib/cognition/routing/performance.ts scores successRate/
  speed/cost + circuit-break EXISTS but sits BESIDE dispatch, not AS the gate. →
  spec-3 Part 2 = PROMOTE performance.ts to be the router when modelOverride=false.
- Memory: EXISTS — Prisma EpisodicMemory/SemanticMemory/RoutingPolicy/ModelPerformance/
  RewardSignal; code cognition/memory/{episodic,procedural,embeddings}.ts + pgvector.
  → spec-3 Part 3 = CONNECT (procedural→gate, RewardSignal→policy learning). RLHFLog
  is written (telemetry/rlhf.ts) but NO consumer — build the learning loop.
IMPLICATION: Layer 4 is FINISH-AND-CONNECT, not build-from-zero. Reprioritise: it's
closer than spec-3 implied.

═══════════════════════════════════════════════════════════════════════
# CORRECTION 2 — TWO TIMELINE STORES (spec-1/arch assumed ONE)
═══════════════════════════════════════════════════════════════════════
spec-1 §4 and arch A2 state "the timeline store is SINGLE." AUDIT: it is NOT —
- usePlaybackStore (src/store/playbackStore.ts:14, holds `recipe`) — Ultimate/Advanced
- useTimelineStore (src/store/timeline.ts:36) — Simple mode
- reconcileTimeline (reconcileTimeline.ts:201) updates the RECIPE path only.
→ The "single store" is an UNMET target, not current state. Layer 1 (build 1) makes
it true. Until then, every spec that says "the single store" means "the store you
will unify to" — canonical = usePlaybackStore.recipe (reconcile + editor use it).
addClip lives in useTimelineStore (timeline.ts:47); the unify must reconcile these.

═══════════════════════════════════════════════════════════════════════
# CORRECTION 3 — CHOKEPOINTS EXIST BUT AREN'T THE ONLY PATH (spec-6 Part 1)
═══════════════════════════════════════════════════════════════════════
spec-6 Part 1 listed the 6 chokepoints as the target. AUDIT: 3 of them EXIST as
code but are BYPASSED, not enforced:
- providerSubmit: partial — falQueue submitToFal + client.ts gated; BUT
  models/runway.ts, models/grokVideo.ts, MediaRouter, queue.fal.run probes bypass.
- claudeCall: EXISTS (anthropicClient.ts:21) but ~20 sites bypass it (see build-0).
- persistMedia/mirror: EXISTS (persistClipVideoToR2) but pre-mirror/failed-mirror
  clips keep provider url.
→ The chokepoints are REAL; the work (Layer 0) is making them the SOLE path + CI
enforcement. spec-6 Part 1's "build-time grep check" = build-0 Prompt 0.5, now
concrete.

═══════════════════════════════════════════════════════════════════════
# CORRECTION 4 — NO SHARED PACKAGE (arch Part F / spec-1 assumed one spine)
═══════════════════════════════════════════════════════════════════════
arch Part F: "one spine, two shells... spine written once, host injected."
spec-1 §3: HostAdapter interface both implement. AUDIT: G1 — NO shared package.
Web (repo root) and desktop (cinematic-forge-v3) are SEPARATE codebases with
DUPLICATED, NON-MATCHING entities (G2: web StudioClip vs desktop SQLite clips;
web VaultCharacter vs desktop characters table; columns differ).
→ arch Part F is an UNMET target. The @cinema/core extraction (reconciled queue
Layer 6) is the work to make it true. IMPORTANT: this is why every fix this session
had to be written twice. Do the extraction BEFORE building more cross-cutting
features or duplication compounds. Elevate Layer 6 in priority (see resequence).

═══════════════════════════════════════════════════════════════════════
# CORRECTION 5 — ENTITIES DON'T MATCH spec-1 CONTRACTS (G2)
═══════════════════════════════════════════════════════════════════════
spec-1 defined canonical Shot/Character/Clip. AUDIT actual:
- Web shot = StudioClip (prisma:249-277): has prompt, duration, assignedModel,
  videoUrl, anchorFrameUrl, modelOverride, rawVideoUrl, lipSyncEnabled. MISSING:
  falRequestId (build-0 0.4 adds it), sourceProviderUrl, qualityScore,
  continuityGroupId, characterIds[], locationId, seed linkage.
- Web character = VaultCharacter (prisma:280): referenceUrls, faceEmbedding. voiceId
  is on CastMember/ClonedVoice, NOT VaultCharacter.
- Desktop: separate SQLite (characters has reference_image_path, voice_id).
→ spec-1 is the TARGET schema. Migrating StudioClip/VaultCharacter toward it is
incremental work, tracked per-layer (character wiring needs characterIds+seed;
Layer 3). Don't big-bang the schema; add columns as each layer needs them.
NAME MAPPING for all specs: spec "Shot" = code "StudioClip"; spec "Character" =
code "VaultCharacter"; spec "Clip" = timeline store clip; spec "videoUrl" ✓ matches.

═══════════════════════════════════════════════════════════════════════
# CORRECTION 6 — REGISTRY ALIASING LIES (spec-2/arch pool assumptions)
═══════════════════════════════════════════════════════════════════════
arch Part C picked a clean 7-model pool. AUDIT B1: registry has 33 entries with
DISHONEST aliases — skyreels-v3 → actually Hailuo endpoint; pixverse-v6 → v4.5/v4;
4 hunyuan-* keys → 1 shared T2V endpoint. resolveModel throws correctly (good) but
routing can select a key whose endpoint isn't what the name claims.
→ The arch "cut to 6-8 truthful models" is now also a CORRECTNESS fix, not just
scope. Layer 2 patch: fix endpoints OR rename keys so no model id lies about what
it runs. veo also lacks generate_audio:false in the adapter (B6) — add it.

═══════════════════════════════════════════════════════════════════════
# CORRECTION 7 — THINGS THAT ARE ALREADY DONE (remove from build queue)
═══════════════════════════════════════════════════════════════════════
Audit confirms these specced items are ALREADY correct — regression-test only:
- resolveModel THROWS, no swap fallback (resolve.ts:48; B3 absent) ✓
- dispatch provider switch (dispatch.ts:49) ✓
- buildPayload clamps from OpenAPI constraints (videoPayloadAdapters.ts:128) ✓
- audio-off for kling + pixverse ✓ (veo still needs it)
- reconcileTimeline maps videoUrl→sourceUrl (reconcileTimeline.ts:156) ✓
- addClip requires sourceUrl + logs rejection (timeline.ts:47) ✓
- R2 mirror on completion (processShotGenerateJob.ts:216) ✓
- canPlaySrc guard (VideoPreview.tsx:75) ✓ (named AbortError/NotSupported branch still missing)
- 16 migrations, auth tables present, no reset ✓
→ These move from "to build" to "verified — add a regression test."

═══════════════════════════════════════════════════════════════════════
# RESEQUENCED PRIORITY (post-audit — supersedes reconciled-work-queue order)
═══════════════════════════════════════════════════════════════════════
0. SAFETY (build-0) — gate all bypasses + kill harness + CI enforce. [in progress]
1. UNIFY STORES (build-1) — the empty-timeline root cause. Biggest UX win.
2. SHARED PACKAGE (@cinema/core) — RAISED in priority. Extract spec-1 contracts +
   HostAdapter now, BEFORE more features, or web/desktop keep duplicating. This is
   the structural debt the audit exposed (G1). Was Layer 6; now do it early.
3. GENERATION PATCHES — veo audio-off; registry alias honesty; named play() guards.
4. CHARACTER/LOCATION LAST HOP — refs exist, wire them into buildFalVideoInput.
5. CONNECT THE MOAT — promote performance.ts to the gate; RewardSignal→policy;
   wire cognition output into scriptBreakdown.
6. PRO TOOLS — evaluate each shell, build/keep/cut.

CHANGE FROM PRE-AUDIT PLAN: shared-package extraction jumps from last to 2nd,
because the audit proved duplication is already causing double-work. Everything
else holds.

## THE SPEC DOCS remain the TARGET. This overlay is the DELTA to reality. When a
## layer completes, its correction here resolves (the target becomes true).

═══════════════════════════════════════════════════════════════════════
# CORRECTION — PROVIDERS (addendum, Sept 2026)
═══════════════════════════════════════════════════════════════════════
Sora 2 is deprecated. It is not in the pool and live callers throw.
Grok Imagine is FAL (`xai/grok-imagine-video/text-to-video` and `image-to-video`).
The direct xAI client is retired.
Runway Gen-4.5 stays on `@runwayml/sdk`. No verified FAL Gen-4.5 endpoint.
Installed SDK 3.21.1 Gen-4.5 inputs are promptText, duration, ratio, seed, contentModeration,
and promptImage for image-to-video. No camera-control or motion-brush field. Camera intent
from the breakdown is a prompt sentence. Motion brush is not sent.
Text Claude calls use FAL `openrouter/router` inside `claudeCall` / desktop
`claudeMessages`. Image prompts stay on Anthropic. OpenRouter is not a video
provider and is not a new vendor key.

═══════════════════════════════════════════════════════════════════════
# CORRECTION — CONTROL SURFACES (addendum, Sept 2026)
═══════════════════════════════════════════════════════════════════════
Live FAL schemas, not the roster table. Every v1 model is cameraControl prompt_only
and motionBrush false, including Runway Gen-4.5.
- Seedance: reference-to-video image_urls max 9. First+last only on image-to-video.
  Those endpoints are mutually exclusive.
- Veo 3.1: image-to-video is fal-ai/veo3.1/image-to-video. reference-to-video takes
  image_urls (capped at 3) and duration is fixed at 8s. No last frame.
- Grok: reference-to-video takes reference_image_urls, max 7. No last frame. Native
  audio stays on. Every other video model stays silent.
- Kling v3 image-to-video requires start_image_url and accepts end_image_url.
  Elements are optional and only sent with a start frame. No reference-to-video path.
- LTX image-to-video accepts end_image_url. PixVerse v5.5 is start-frame only.
  Hunyuan text-to-video has no image field.

═══════════════════════════════════════════════════════════════════════
# CORRECTION — POOL (expert decision, Sept 2026)
═══════════════════════════════════════════════════════════════════════
The pool is seven models. PixVerse C1 and Hunyuan are removed. Their names throw.
Wan 2.7 is the budget model: fal-ai/wan/v2.7 text, image (image_url + end_image_url),
and reference (reference_image_urls). The reference schema publishes no maxItems, so
dispatch sends at most 4. Output is 720p. No generate_audio field, so it stays silent.
HappyHorse 1.1 is live at alibaba/happy-horse/v1.1/text-to-video and is not in the
pool. It joins only after one clean generation. None was run.
Grok stays on FAL. Veo stays silent. Runway stays direct, and its camera control
remains a prompt sentence. Crowd, VFX, long-form, HDR, and a separate locomotion
model stay unwired.

═══════════════════════════════════════════════════════════════════════
# CORRECTION — PROVIDER CHECKLIST (Sept 2026)
═══════════════════════════════════════════════════════════════════════
Bulk video stays FAL-only. OpenRouter is not a video provider.
Grok Imagine is on FAL: xai/grok-imagine-video returns an OpenAPI schema.
The direct xAI client stays retired. Runway stays direct, with no motion-brush field.
HappyHorse 1.0 (alibaba/happy-horse/text-to-video) and 1.1 both return schemas.
The old client sent image_url to the text endpoint, which has no image field, and
could send a duration below the enum minimum of 3. That client now throws before
any network call. HappyHorse is still not assigned. Hailuo stays cut.

The direction card opens panels from the live control surface. No v1 model opens a
motion brush, a camera path, or a preset menu. Camera is the prompt sentence.
Reference slots preload for true-reference models. A character on a first-frame-only
model offers Seedance. The existing shot status is the stage: awaiting direction is
controls, completed is review.

Dialogue uses the character's ElevenLabs voice. After a line is synthesised, forced
alignment stores word start and end times on the dialogue track. A picture that
already has sound skips lip-sync. Voice design, text-to-dialogue, video-to-music,
and dubbing are not called. Music stays on Suno. Sound effects stay on the existing
gated ElevenLabs call.
