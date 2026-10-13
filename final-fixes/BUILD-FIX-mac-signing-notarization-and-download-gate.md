# BUILD — RUN 22 COMPLETION: SIGN + NOTARISE THE MAC APP, FAIL LOUD, GATE THE DOWNLOAD — one consolidated Cursor prompt (run straight through)
## SYMPTOM (Neo 2026-10-09): downloading the desktop app and opening it on macOS shows “Cinematic Forge is damaged and can’t be opened. You should move it to the Bin.”
## DIAGNOSIS (from the Mac repo check, cinematic-forge-v3): electron-builder.config.cjs says “Signing/notarization are no-ops without credentials”; scripts/notarize.cjs
## silently SKIPS when APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID are unset; no APPLE_*/CSC_* variables exist in the env files; so the published DMG/ZIPs
## (CinematicForge-3.0.x-arm64/x64) are UNSIGNED and UN-NOTARISED. A browser-downloaded unsigned app carries the quarantine flag and Gatekeeper reports it as “damaged”.
## This is exactly what BUILD-desktop-ship-pipeline.md SP-T2 forbids (“do not ship unsigned/un-notarised builds”). The download page (src/app/download/page.tsx →
## /api/desktop/releases) currently offers these builds to users → INV-4 violation. Invariants: INV-4 honest UI · INV-5 no silent skip/swallow · INV-8 · §Q · pause guard untouched.
## NOTHING here touches generation, billing, the pause guard or user data.

═══════════════════════════════════════════════════════════════════════
# PART 0 — WHAT NEO MUST DO ONCE (cannot be automated; everything after this is automated). Put this checklist in docs/DESKTOP-SIGNING.md and in the PR.
═══════════════════════════════════════════════════════════════════════
1. ✅ DONE — Neo is already enrolled in the Apple Developer Program. Just note the TEAM ID (developer.apple.com → Membership details).
2. In the Apple developer portal create a “Developer ID Application” certificate; export it from Keychain Access as a .p12 with a password.
3. In App Store Connect → Users and Access → Integrations create an API key (role: Developer) — note KEY ID, ISSUER ID, and download the .p8 once.
4. Base64 the .p12 and the .p8 and add these GitHub Actions secrets to the repo that runs desktop-release.yml:
   CSC_LINK (base64 p12) · CSC_KEY_PASSWORD · APPLE_API_KEY (base64 or file contents of .p8) · APPLE_API_KEY_ID · APPLE_API_ISSUER · APPLE_TEAM_ID.
   (If Neo prefers Apple ID auth instead: APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID — support BOTH, API key preferred.)
5. Tell Cursor “secrets are added”. Do not paste secrets in chat or commit them.
Cursor: until the secrets exist, implement everything below so it works the moment they are present, and make the release job FAIL with a clear message if they are not.

═══════════════════════════════════════════════════════════════════════
# PART 1 — BUILD CONFIG (cinematic-forge-v3/electron-builder.config.cjs + scripts/notarize.cjs)
═══════════════════════════════════════════════════════════════════════
- Two modes: DEV (unsigned allowed; set explicit `FORGE_ALLOW_UNSIGNED=1`, label the artifact `-unsigned`, never publishable) and RELEASE (`FORGE_RELEASE=1`; the default for the
  release workflow). In RELEASE a missing CSC_LINK/CSC_KEY_PASSWORD or missing notarisation credentials MUST THROW (no “skipping notarization” log-and-continue — INV-5). Rewrite
  scripts/notarize.cjs accordingly; support API-key auth (preferred) and Apple-ID auth; use `notarytool`, wait for completion, print the submission id/log on failure, then STAPLE.
  Use whatever the INSTALLED electron-builder version supports (built-in `mac.notarize` or the @electron/notarize afterSign hook) — read its docs; do not have both notarise twice.
- Hardened runtime stays ON. Keep entitlements (JIT, unsigned-executable-memory, disable-library-validation, network, camera/audio-input, file access). Review that nothing extra is requested.
- Sign every nested binary: better-sqlite3 native module, ffmpeg-static + ffprobe-static (asarUnpack paths), Electron helpers, C2PA native module, any .dylib/.node. Fix `signIgnore`/
  `binaries` so none is skipped; notarisation rejects unsigned or non-hardened nested code. Verify architectures: arm64 and x64 builds contain the matching native binaries (no
  cross-arch ffmpeg/better-sqlite3 left from the build host).
- Make sure the DMG itself is signed (dmg.sign true) and ZIP contains the stapled app. Artifact names unchanged (CinematicForge-${version}-${arch}.${ext}).
- Add a postbuild verification script `scripts/verify-mac-release.sh` run in CI on the built artifacts: `codesign --verify --deep --strict --verbose=2`, `spctl -a -t exec -vv`,
  `xcrun stapler validate`, `spctl -a -t open --context context:primary-signature -vv` on the DMG, check `codesign -dv` shows Authority=Developer ID Application + the right TeamIdentifier and
  flags=runtime. Any failure fails the release.
- Auto-update (electron-updater, generic provider https://releases.forgecinema.app): macOS updates require a SIGNED app + the ZIP + latest-mac.yml; publish `latest-mac.yml`,
  both ZIPs, DMGs and blockmaps; verify the updater accepts the signed update (SP-T3). A tampered/unsigned update must be rejected.

═══════════════════════════════════════════════════════════════════════
# PART 2 — CI (cinema/.github/workflows/desktop-release.yml and/or cinematic-forge-v3/.github/workflows)
═══════════════════════════════════════════════════════════════════════
- Build mac on a `macos-latest` runner (arm64) for BOTH archs (x64 via cross-build or a macos-13 runner) — import the cert into a temporary keychain from CSC_LINK, run the release build with
  FORGE_RELEASE=1, run scripts/verify-mac-release.sh, then upload to R2 (the releases feed) ONLY if verification passed. Never upload an unsigned artifact to the public feed.
- Windows: same RELEASE rule. If no Authenticode certificate/Trusted Signing account is configured yet, FAIL the public release for Windows too and keep the Windows download hidden/honest
  (below) — do not ship an unsigned installer silently. (Neo decides later between an OV/EV cert and a cloud signing service.)
- Secrets only in CI secrets; never log them; record the certificate expiry date in docs/DESKTOP-SIGNING.md with a renewal reminder.

═══════════════════════════════════════════════════════════════════════
# PART 3 — THE DOWNLOAD GATE (INV-4: don’t offer what would show “damaged”)
═══════════════════════════════════════════════════════════════════════
- /api/desktop/releases returns per-platform `signed` and `notarized` (and `verifiedAt`) taken from the release manifest written by the CI verify step. src/app/download/page.tsx shows the
  Mac button ONLY when notarized=true; otherwise an honest state: “The Mac app is being prepared — signed builds are coming. Use the web app meanwhile.” (same pattern for Windows).
  Keep the tier gate (Ultimate / desktop subscription / trial / dev account) exactly as is.
- WITHDRAW the existing unsigned 3.0.0 / 3.0.1 installers from the public feed (remove from the manifest/latest-*.yml so no user and no auto-update can fetch them; keep the files in
  storage under an `unsigned/` prefix for internal testing — do not delete data).
- Add a Playwright/unit test: a feed with notarized=false never renders a download link.

═══════════════════════════════════════════════════════════════════════
# PART 4 — INTERIM FOR NEO’S OWN TESTING (document in docs/DESKTOP-SIGNING.md; NOT for end users)
═══════════════════════════════════════════════════════════════════════
On Neo’s own Mac, an unsigned build can be opened for testing by removing the quarantine flag after copying to /Applications:
`xattr -cr "/Applications/Cinematic Forge.app"` (or right-click → Open on newer builds where the dialog offers it). Say plainly in the doc: this is a developer workaround only; customers must receive
a notarised build.

═══════════════════════════════════════════════════════════════════════
# VERIFY · DO NOT · EXIT
═══════════════════════════════════════════════════════════════════════
VERIFY: with secrets present the release workflow produces arm64 + x64 DMG/ZIP that pass codesign/spctl/stapler checks and open with NO Gatekeeper warning when downloaded through a browser
(quarantined) on a clean Mac; without secrets the release job FAILS loudly (not silently); the download page shows no Mac link for a non-notarised release and the old unsigned builds are no
longer reachable from the feed; the updater accepts a signed update and rejects a tampered one; verify-static 0; tsc 0; tests green.
DO NOT: log or commit secrets; keep the silent “skipping notarization” path in RELEASE; publish an unsigned build; delete stored artifacts; touch generation/billing/pause code; claim
“signed” in the UI without the CI verification record.
EXIT: a Mac user downloads Cinematic Forge, opens it, and it just opens; Windows is either signed or honestly withheld; the licence lock (Run L Part B) is unblocked.
