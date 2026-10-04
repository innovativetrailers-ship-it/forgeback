# LAUNCH READINESS — the go/no-go gate for Cinematic Forge
# The single checklist that decides "can we launch (public + paid)?". Build phase complete (Runs 1–26 + L);
# Fix-Wave-1 + 2 deployed. This is the QA gate: every item GREEN before a public/paid launch. Pairs with
# BUG-REGISTER.md (bugs) + BUILD-LAUNCH-CI-GATES-and-e2e.md (the automated half). Owner sign-off: Neo.
# Status keys: ✅ green · ⚠ open/blocking · ◑ partial · ⬜ not yet checked.

═══════════════════════════════════════════════════════════════════════
# 1. INVARIANT GATES — must be GREEN in CI (fail the build on violation)
═══════════════════════════════════════════════════════════════════════
The invariants stop being "rules we remember" and become standing checks. (Build/formalise them per
BUILD-LAUNCH-CI-GATES-and-e2e.md.)
| Gate | Invariant | Check | Status |
|---|---|---|---|
| tsc 0 | — | typecheck | ✅ (green last deploy) |
| check-chokepoints 0 | INV-1 billing | every paid egress via the guarded submit | ✅ |
| check-swallowed-catches 0 | INV-5 | no silently swallowed errors | ✅ |
| check-endpoints 0 | INV-3 | endpoints from the registry only | ✅ |
| one-worker-per-queue | §Q / stalls | exactly ONE BullMQ consumer per queue | ✅ check-one-worker in verify-static (AUDIT 2026-10-04: 0) |
| no-dual-route-segments | INV-2 | no two dynamic param names at one path level | ✅ check-route-segments (AUDIT: 0) |
| one-auth-store | INV-2 | app authenticates against ONE set; lowercase dormant | ✅ checker 0; this database has no lowercase auth tables (AUDIT 2026-10-04) |
| balance == ledger | INV-1 | reconciler asserts every user balance == typed ledger | ◑ external matches; internal excluded by policy (reconcileLedgers skips internal); not a CI assertion yet |
| pause-guard | pause rule | unset GENERATION_PAUSED ⇒ PAUSED; a paused paid submit throws | ✅ check-pause-guard (AUDIT: PASS) |
| timeline-no-delete | §Q | a reconcile/merge NEVER deletes a user clip (only merge/retag/tombstone) | ✅ wave2.ts has no delete; reconcile merges (AUDIT: PASS) |
| deploy web+worker together | §Q process | worker build date == web; check-chokepoints ran green in the worker build | ✅ (5 workers deployed together) |

═══════════════════════════════════════════════════════════════════════
# 2. END-TO-END FLOWS — must pass a GREEN run (integration, all-together)
═══════════════════════════════════════════════════════════════════════
The waves were built incrementally; these prove they work as ONE system. (e2e smoke tests in the build prompt.)
| Flow | Passes when | Status |
|---|---|---|
| Auth | Google sign-in → session persists → refresh token survives access-token expiry | ◑ (refresh stored on next sign-in — verify) |
| Simple generate | prompt → clip renders → lands in library → PERSISTS to R2 (not CDN-only) | ⚠ (storage is done; a new shot is blocked by pause) |
| Director wizard | script → shots → refs → keyframes → multi-shot film end-to-end (the F1–F3 path, now with the wizard gates) | ⬜ verify on the deployed build |
| Import → finish | import mp4 → edit → grade → effects → audio → master → export a playable file | ⬜ verify (Wave B suite) |
| Credit metering | a USER is metered (hold→deduction, 0-credit blocks a paid op); a DEV/internal account is UNMETERED + shows no balance | ⬜ verify (Fix-Wave-1 §9) |
| Licence lock (desktop) | Ultimate / $300yr / 30-day-trial open the app; lapsed → lock screen (pay/web/trial); offline grace; no pirate key | ⬜ verify AFTER the ship pipeline (Run 22) lands |
| Timeline safety | a reconcile after an edit never loses a user clip (§Q) | ✅ (proven; keep the test green) |

═══════════════════════════════════════════════════════════════════════
# 3. "THE MACHINES" — the real-world acceptance test
═══════════════════════════════════════════════════════════════════════
The launch film IS the acceptance test: if "The Machines" generates and cuts clean end-to-end, the
integrated system works. GREEN when:
- The full film generates through the Director wizard (consistent characters/locations via the primary→
  variation model; continuity via the thread anchor).
- It assembles on the timeline, grades/audio/titles apply, and EXPORTS a playable master.
- Its VERTICAL CUT-DOWNS (auto-reframe, Run 11) render for the launch campaign.
- Every clip PERSISTED to R2; cost was metered honestly; nothing stalled.
Status: ⬜ (run when the pause lifts. The media backfill is done). This is the headline go signal.

═══════════════════════════════════════════════════════════════════════
# 4. OPERATIONAL READINESS
═══════════════════════════════════════════════════════════════════════
| Item | Ready when | Status |
|---|---|---|
| Media persistence | ALL completed clips have an R2 key; no CDN-only media | ✅ 12/12 have storageKey; 0 CDN-only (AUDIT 2026-10-04) |
| Repo == prod | Fix-Wave-1 + 2 committed; prod runs committed code | ⚠ (tree uncommitted — commit now) |
| Error net covers stalls | worker heartbeat + web-side stall detection surfaces a failure, not a silent hang (ERFIX-04) | ◑ verify live |
| Monitoring / ops visibility | failures visible (ShotError net / dashboard); packaged desktop crashes report | ◑ (dashboard deferred; net works) |
| Desktop signing + updates | app signed + notarized + auto-update (Run 22) BEFORE desktop distribution | ⬜ (Run 22 pending) |
| Secrets + backups | R2/DB/FAL/OAuth/signing secrets in env (not repo); DB backup + the open-weight base backup (§O) | ⬜ verify |
| Rollback | a bad deploy can roll back (Vercel + Railway) + the additive migrations are reversible | ⬜ confirm |
| Pause discipline | GENERATION_PAUSED controls all paid egress; lifting it is a deliberate launch step | ✅ (rule holds) |

═══════════════════════════════════════════════════════════════════════
# 5. BUSINESS / LEGAL READINESS
═══════════════════════════════════════════════════════════════════════
| Item | Ready when | Status |
|---|---|---|
| Entitlement + pricing live | plans (free/pro/ultimate/desktop) + the $300yr desktop sub + 30-day trial wired to real billing (Stripe or chosen provider); dev accounts internal/unmetered | ⬜ (Run L Part A; wire billing) |
| Credit economics | credit pricing per op set + the meter enforces; the 20M dev seed wiped from user balances | ◑ (seed wiped: 0 users at 20,000,000. Live price list not re-checked.) |
| Consent + rights | generation consent checkbox; real-person import rights gate; training-content ownership (§O); performer likeness/voice for the private tier | ⬜ verify the gates are live |
| Content safety | the safety prompts / usage-policy guards on generation are active | ⬜ verify |
| Privacy / ToS | privacy policy + ToS published; memory/data toggles (Run 17) work; data-deletion path | ⬜ verify |
| C2PA / provenance | export provenance if claimed | ◑ (export C2PA exists) |

═══════════════════════════════════════════════════════════════════════
# 6. GO / NO-GO
═══════════════════════════════════════════════════════════════════════
LAUNCH (public + paid) is GO only when: §1 all ✅ · §2 all ✅ · §3 The Machines ✅ · §4 media/commit/error-
net/secrets/rollback ✅ · §5 entitlement+pricing+consent+privacy ✅. Desktop distribution additionally needs
Run 22 (signing/updates) + the licence lock (Run L Part B) ✅.
A STAGED launch is valid: (a) WEB soft-launch (free + metered paid) once §1–§4(web) + §5(entitlement/
consent/privacy) are green, holding desktop until Run 22 + L-B; (b) then DESKTOP once signing + lock land.
Owner sign-off: Neo (the private funder sets the risk bar). Record the go/no-go decision + date here.

═══════════════════════════════════════════════════════════════════════
# 7. OUTSTANDING BLOCKERS (updated 2026-10-04 evening)
═══════════════════════════════════════════════════════════════════════
DONE since 2026-10-01: ✅ media backfill (0 CDN-only); ✅ CI gates formalised + passing (verify-static:0);
✅ Fix-Wave-1/2/3 data cleanups. The remaining blockers:
1. ⚠ COMMIT the tree — Runs 27–32 + Fix-Wave-3 built + DEPLOYED but UNCOMMITTED (63 dirty paths; main ahead
   of origin by 1). Repo ≠ prod. THE top item.
2. ⬜ Wire real BILLING for entitlement/pricing (Run L Part A) — 0 Subscription rows — before paid launch.
3. ⬜ Run 22 (desktop signing/notarize/updates) + L-B (licence lock) before DESKTOP distribution.
4. ⬜ The Machines acceptance run (after the pause lifts).
5. ◑ Refresh tokens: code present; 0 stored until the next Google sign-in (verifies then — not a code fix).
Everything else verified ✅ by AUDIT-COMPLETE 2026-10-04. Walk §1–§5 for the remaining ⬜/◑.

═══════════════════════════════════════════════════════════════════════
# HOW TO USE
═══════════════════════════════════════════════════════════════════════
- This is the launch gate. Walk it top to bottom; each ⬜/◑ becomes ✅ (verified) or a BUG-REGISTER row.
- Re-run after each fix wave. The Machines (§3) is the headline go signal; §6 is the decision.
- Keep it current — it + BUG-REGISTER + FORENSIC-AUDIT are the QA source of truth.
