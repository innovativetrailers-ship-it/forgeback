# WF-02 — PLAYBOOKS. CURSOR PROMPT. Obey INV-1..8 + WF-00.
# Reference: SPEC-A3-playbooks. Standing directives the orchestrator applies as overridable
# defaults. ⚠ WIRE to: the orchestrator (OR-01 premise/interpret, OR-03 delegate), presets
# (SPEC-08 style_key), the taste profile (OR-05), the canonical store. NOT a standalone.

## TASK 1 — Playbook entity (additive, INV-7)
```typescript
interface Playbook {
  id; userId; projectId?   // projectId set = project-scoped; null = user-global default
  name
  style?: { aspectRatio?; grade?; genrePreset?; grain?; lut? }
  generation?: { defaultQualityTier?; modelPreferences?: Record<ShotPurpose,string>;
                 maxShotDuration?; defaultDuration? }
  language?: { narrationLanguage?; voiceDefaults? }
  rules?: string[]   // do/don't directives
}
```
Per user (privacy). A user-global Playbook = the default for new projects; a project
Playbook overrides it for that project.

## TASK 2 — The orchestrator READS the active Playbook (wire into OR-01/03/06)
- At the START of every orchestrator run (OR-06) AND every delegation (OR-03), load the
  active Playbook (project > user-global).
- APPLY:
  - style → the genre preset / grade / aspect defaults (into composePrompt + the grade).
  - generation → the quality tier + modelPreferences BIAS the delegation (OR-03 scoring).
  - language/voice → the audio layer defaults.
  - rules → constraints on the shot plan (Task 3).
- This must be WIRED into the orchestrator run, not a separate pass — the Playbook is a
  default INPUT to interpret + delegate.

## TASK 3 — Rules: hard (filter) vs soft (prompt-inject)
```typescript
// Classify each rule: hard (a structural constraint) vs soft (a stylistic preference).
// HARD ("keep shots under 8s", "no on-screen text") → filter/constrain the shot plan +
//   buildPayload (clamp duration; strip text overlays).
// SOFT ("prefer wide establishing shots", "moody lighting") → prompt-injected into composePrompt.
// A gated claudeCall (mechanical) can classify a free-text rule into hard/soft + a machine action.
```

## TASK 4 — PRECEDENCE (⚠ Playbook is a DEFAULT, not a lock — INV-5)
Order (highest wins): explicit user/shot action > shot-specific need > Playbook default >
system default. A Playbook biases; the user + the shot always override. Manual model
selection, a shot's explicit camera, etc. beat the Playbook.

## TASK 5 — Taste profile suggests Playbook additions (wire to OR-05)
- The taste profile (OR-05) detects patterns ("you keep rating warm grades up") → SUGGEST
  adding to the Playbook (user confirms). Playbook = explicit rules; taste = learned; the
  suggestion bridges them. Optional, non-intrusive.

## TASK 6 — ⚠ BEHAVIOURAL GUARDRAIL (a Playbook cannot disable safety)
- A Playbook sets STYLE/GENERATION/LANGUAGE/creative-rule defaults ONLY. It must NOT be
  able to: disable the billing gate, disable content moderation, force the system to skip
  a quality gate, or suppress honest error/problem flagging. Reject/ignore any rule that
  would (per the behavioural-guardrails discipline). Rules are creative, not safety overrides.

## ACCEPTANCE
[ ] Playbook entity (project + user-global) stores style/generation/language/rules.
[ ] the orchestrator loads + applies the active Playbook on every run + delegation (WIRED
    into OR-01/03/06, not a separate pass).
[ ] hard rules filter the shot plan/payload; soft rules are prompt-injected.
[ ] precedence: explicit action > shot need > Playbook > system default (Playbook overridable).
[ ] the taste profile can suggest Playbook additions (user-confirmed).
[ ] a Playbook cannot disable any safety/billing invariant.
[ ] tsc + check:chokepoints green.

## NEXT: WF-03 (real-time collaboration).
