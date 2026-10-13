# SPEC — A3: PLAYBOOKS (standing rules the orchestrator always applies)
# Parity gap vs InVideo Agent Two ("Playbooks — standing rules Agent follows on every
# project: the process, the language, the options per generation"). Extends presets +
# the taste profile. Obey INV-1..8.

═══════════════════════════════════════════════════════════════════════
# WHAT IT IS
═══════════════════════════════════════════════════════════════════════
A Playbook = a set of STANDING DIRECTIVES the orchestrator applies to EVERY generation in
a project (or globally for a user), so the user doesn't re-specify their preferences each
time. "Always shoot 2.39:1, warm grade, no on-screen text, prefer Seedance for characters,
British English narration, keep shots under 8s."

═══════════════════════════════════════════════════════════════════════
# WHAT A PLAYBOOK CONTAINS
═══════════════════════════════════════════════════════════════════════
```typescript
interface Playbook {
  id; userId; projectId?   // project-scoped OR user-global (global = default for new projects)
  name
  // STYLE defaults:
  aspectRatio?; grade?: 'warm'|'cool'|...; genrePreset?; grain?; lut?
  // GENERATION defaults:
  defaultQualityTier?: 'draft'|'studio'|'blockbuster'
  modelPreferences?: { [purpose: string]: string }   // "characters→seedance, hero→veo"
  maxShotDuration?; defaultDuration?
  // LANGUAGE / VOICE:
  narrationLanguage?; voiceDefaults?
  // RULES (do/don't):
  rules?: string[]   // "no on-screen text", "no dialogue in establishing shots",
                     // "always end scenes on a wide", "keep continuity chains under 6 shots"
  // enforced by the orchestrator as constraints (some hard, some prompt-injected)
}
```

═══════════════════════════════════════════════════════════════════════
# HOW THE ORCHESTRATOR APPLIES IT
═══════════════════════════════════════════════════════════════════════
- The orchestrator (OR-01/03) reads the active Playbook at the START of every run + every
  generation. It applies:
  - STYLE defaults → the genre preset / grade / aspect (unless the shot overrides).
  - GENERATION defaults → the quality tier + model preferences (bias delegation; manual
    + shot-specific needs still win — INV-5).
  - RULES → constraints on the shot plan (hard rules filtered; soft rules prompt-injected).
- PRECEDENCE: explicit shot/user action > shot-specific need > Playbook default > system default.
  (A Playbook is a DEFAULT, not a lock — the user/shot can always override.)
- The taste profile (OR-05) INFORMS Playbook suggestions ("you keep rating warm grades up
  — add to your Playbook?") — Playbook = explicit standing rules; taste profile = learned.

## ⚠ BEHAVIOURAL GUARDRAIL (do not let a Playbook suppress honesty/safety)
- A Playbook sets STYLE/PROCESS/LANGUAGE defaults — it must NOT be able to disable safety
  (billing gate, content moderation) or force the system to ignore a real problem. Rules
  are creative/stylistic directives, not overrides of the invariants.

## ACCEPTANCE
[ ] a Playbook (project or user-global) stores style/generation/language defaults + rules.
[ ] the orchestrator applies it to every run + generation as DEFAULTS (overridable).
[ ] precedence: explicit action > shot need > Playbook > system default.
[ ] hard rules filter the shot plan; soft rules are prompt-injected.
[ ] the taste profile can SUGGEST Playbook additions.
[ ] a Playbook cannot disable safety/billing invariants.
[ ] tsc + check:chokepoints green.

## NET
Playbooks = standing per-project/user directives (style, generation, language, rules) the
orchestrator applies as overridable defaults on every generation. Closes the Playbooks gap
vs Agent Two. Extends presets + taste profile. Defaults not locks; never overrides safety.
