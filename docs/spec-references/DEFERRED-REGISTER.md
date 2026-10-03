# Deferred register

Wave 1 closed Section A (honesty), Section B subtitle translation, clip delete, and MultiCam, Section N D4 (alignment into lip-sync and per-shot SFX), and Section L (Simple interpreted message). Those rows are gone.

Wave 2 closed register H (MP-13 chained continuity).

Wave 3 closed register F (RLAIF), I (RewardSignal and the static MoE router), and N (C1 live capability). Director routing is `delegate`. `performance.ts` and `routeShot` in the cognition gate are gone. The long-form swarm still has its own picker and is not the director router. Biweekly and monthly debates and the cursor pusher run on the intelligence worker. They propose. They do not auto-apply, and they do not swap open-weight ids.

Section O: hosted continuity stays `CONTINUITY_MODEL_ID` (`wan-2.7`). Wan 2.2 is the pinned open-weight training base (`OPEN_WEIGHT_BASES`), not an auto-council swap. The backup key is `bases/wan-2.2/Wan2.2-T2V-A14B`.

Wave 4 closed the training lane: the Asset contract, pinned Wan 2.2, the open trainer map, LoRA inference that fails loud, training through `startTraining`, the completion handoff, backup serve, and the T2I asset studio. MiniMax H3 trainers stay in the registry and are not the open-base cast path.

Wave 5 closed INV-8. Web and desktop share `guardedFalSubmit`, the FAL router for language calls, and `mergeTimelineClips`. Desktop crashes are written to ShotError. The desktop mixer already runs EQ, dynamics, reverb, de-esser, sends, and aux buses, and it now measures integrated loudness. Web stays on the six-band EQ, faders, and loudness normalise. The desktop model viewer accepts GLB, GLTF, OBJ (with its MTL when both are selected), FBX, and USDZ. Web stays on GLB and GLTF.

Wave 6 shipped deterministic overlays, planar insert tracking, and post-camera keyframes on the shared sample (`sampleControl` / `controlExportFilters`). Preview and export both use it. The gateway has no live point tracker, so a pin holds the marked region. The node compositor and the depth-node series are `WAVE-6.4-COMPOSITOR-SERIES.md`, not this wave.

Wave B mounts import, trim/split/reorder/delete, the four film LUTs, scopes, the six real effects, parametric EQ, and LUFS on the shared timeline. An imported clip uses `/api/media/{id}` and is not a shot, so reconcile leaves it in place.

Wave 7 is the production-workflow capstone: ingest a plan, screenplay, or idea through `orchestrate`, optionally resolve entities on the pre-production board, then direct. References are progressive. A zero-reference run still plans the film. Context ingestion for this workflow is that ingest mode.

Still open:

- Stem separation — writes stems and has no screen. Leave it. Audio depth, not this wave.
- MultiCam — gated off (`MULTICAM_ENABLED = false`). Re-add only on a real multicam demand.
- Media library: nothing auto-places. Simple, import, and director completion land in folders. The strip changes only when a take is dragged. A dialogue drop asks for voice and lip-sync with a credit price, and cancel places the video silent.
- Per-shot voice panel is in. It tunes one line. Audio Mix still owns the timeline mix. Flash is not a live speech id; speed uses turbo and logs that.

Tier-2 residuals:

- Memory switches are at `/settings`. Creative memory and project search context default on. Off stops that store. Clear removes stored creative memory.
- Director bypass is the wizard Hybrid gates (script, references, keyframes, shots). No second bypass control.
- Per-stage model picker stays unbuilt. Environment routes are enough until someone asks.
- Timeline delete removes the placement and tombstones the id so reconcile does not put it back. Library delete removes the file after a confirm that says so.
- Trainers in the registry are in the training picker except Stable Audio, which stays registry-only because scores use Suno.
- Subtitle translation already goes through `claudeCall` with source `translate` and writes an SRT.
- The in-app error dashboard stays deferred. ShotError remains the error net. Unused Sentry and PostHog DSNs stay unwired.

Run 24 future depth, not launch: Cryptomatte, deep-EXR compositing, and vector-warp face replace stay recorded here until a pro VFX pass adds them as compositor nodes.

Desktop ship: electron-builder is the packager (dmg, zip, NSIS, portable, AppImage, deb). Signing and notarization run only when the CI secrets are present. The entitlement token is stored with the OS keychain helper, not as plaintext. A second launch focuses the running app. Updates download and wait for a restart. Crash uploads carry version, OS, and channel, with home directories and project ids redacted.
