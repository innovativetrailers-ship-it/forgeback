# Paid call inventory

Every row is a call site and the chokepoint that must sit in front of it. `scripts/check-chokepoints.mjs` fails the build when a provider SDK or a paid host is used outside these modules.

| Call | Chokepoint |
|---|---|
| Desktop submit / poll | `POST /api/desktop/generate/submit` → `submitGenerateRelay` → `runMetered` / `openHold` |
| Web `/api/generate` | `openHold` before the render queue |
| Desktop cognition think / learn / feedback | `meterDesktopRelay` → `runMetered` |
| Provider queue submit | `packages/core/src/fal/guardedSubmit.ts` (`fal.queue.submit`) |
| Web provider queue wrapper | `src/lib/fal/falQueue.ts` `submitToFal` (calls guarded submit) |
| Language router | `packages/core/src/llm/falRouter.ts` and `anthropicTransport.ts` |
| Desktop language | relay endpoint key `claude` (no platform credential on the desktop) |
| Runway | `src/lib/providers/runway.ts` |
| xAI video | `src/lib/providers/grok.ts` |
| ElevenLabs web | `src/lib/elevenlabs/client.ts` |
| ElevenLabs desktop | `cinematic-forge-v3/src/main/ai/elevenlabsClient.ts` (pause + source; hosted billing is still the relay when the call is paid by Forge) |
| Suno | `src/lib/audio/suno.ts` |
| Own-key desktop job | user key in the OS keystore only, ledger amount 0, no platform credential |

A provider call that is not in this table is a defect. The static check is the enforcement.
