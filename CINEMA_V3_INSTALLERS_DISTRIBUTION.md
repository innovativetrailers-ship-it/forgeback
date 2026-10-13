## Implementation status

Repo wiring for V3 installers and distribution (as of June 2026):

- **cinematic-forge-v3**: `electron-builder.config.cjs`, mac entitlements, `scripts/generate-icons.mjs`, `LICENSE.txt`, dist/publish scripts in `package.json`, `src/main/updater.ts` (R2 feed), `.github/workflows/release.yml`
- **cinema (web)**: symlink `cinema/cinematic-forge-v3` → sibling repo, `src/lib/desktop/releases.ts`, dynamic `/download` page, `src/app/api/crash/route.ts`, `.github/workflows/desktop-release.yml`, unit tests in `tests/unit/desktop-releases.test.ts`
- **Still manual**: Apple Developer + Windows code signing certs, GitHub Actions secrets, R2 bucket/domain, production app icons (see M1–M5 below), first tagged release to populate R2

---

# CINEMATIC FORGE V3 — INSTALLERS & DISTRIBUTION
## Cursor Agent Prompt + Manual Steps
### macOS DMG (arm64 + Intel) · Windows NSIS installer · Auto-update · CI/CD pipeline

---

## WHAT THIS BUILDS

```
macOS:   CinematicForge-arm64.dmg    (Apple Silicon — M1/M2/M3/M4)
         CinematicForge-x64.dmg      (Intel — older Macs)
Windows: CinematicForge-Setup.exe    (x64 NSIS installer)
         CinematicForge-{version}-win.zip (portable, no install)

Hosted:  Cloudflare R2 → releases.forgecinema.app
Updates: electron-updater polls R2 for new versions automatically
```

---

## MANUAL STEPS FIRST (cannot be done by Cursor)

### M1 — Apple Developer Account

Required for macOS code signing and notarization. Without this, macOS Gatekeeper
blocks the app on every user's machine with "unidentified developer."

```
1. enroll.developer.apple.com → join as Individual or Organisation (~$99/year AUD)
2. Xcode → Preferences → Accounts → add your Apple ID
3. Certificates, IDs & Profiles → create:
   a. "Developer ID Application" certificate (for distribution outside App Store)
   b. Download the .cer → install in Keychain Access
4. In Keychain: export the certificate as a .p12 file with a strong password
5. Keep the .p12 and password — you need them for CI/CD in M3
```

### M2 — Windows Code Signing Certificate

Without this, Windows Defender SmartScreen shows "unknown publisher" on every install.
After enough installs SmartScreen reputation builds, but initial distribution is blocked.

```
Option A (recommended): EV Certificate ($200-400/year USD)
  → digicert.com or sectigo.com → "EV Code Signing"
  → Comes on a USB hardware token (required for EV)
  → Eliminates SmartScreen warning immediately on first install

Option B: Standard OV Certificate ($100-200/year)
  → Same providers → "Code Signing Certificate"
  → SmartScreen warning may appear for ~1000 installs until reputation builds
  → Delivered as a .pfx file

Export .pfx + remember the password for CI/CD (M3)
```

### M3 — GitHub Repository Secrets

Add these secrets to the GitHub repo (Settings → Secrets and variables → Actions):

```
APPLE_ID                  your Apple ID email
APPLE_APP_SPECIFIC_PASSWORD  generated at appleid.apple.com → App-Specific Passwords
APPLE_TEAM_ID             your 10-char Apple Team ID (from developer.apple.com)
CSC_LINK                  base64-encoded .p12 cert: base64 -i cert.p12 | pbcopy
CSC_KEY_PASSWORD          the .p12 export password
WIN_CSC_LINK              base64-encoded Windows .pfx: base64 -i cert.pfx | pbcopy
WIN_CSC_KEY_PASSWORD      the .pfx password
R2_ACCOUNT_ID             Cloudflare R2 account
R2_ACCESS_KEY_ID          R2 API key (read/write)
R2_SECRET_ACCESS_KEY      R2 secret
```

### M4 — Cloudflare R2 Bucket

```
1. cloudflare.com → R2 → Create bucket → name: "forge-releases"
2. Settings → Custom Domains → connect: releases.forgecinema.app
3. Bucket policy → allow public read on /latest/* and all versioned paths
```

### M5 — App Icons

Cursor cannot generate icons — create them manually or hire a designer:

```
Required files:
  build/icon.icns      macOS (1024×1024 source → .icns via iconutil or electron-icon-builder)
  build/icon.ico       Windows (256×256 source → .ico)
  build/icon.png       512×512 PNG (Linux + fallback)

Quick generation:
  npm install -g electron-icon-builder
  electron-icon-builder --input=./build/icon-source.png --output=./build/
```

---

## STEP 1 — INSTALL ELECTRON-BUILDER

```bash
cd cinematic-forge-v3
npm install electron-builder --save-dev
npm install electron-updater --save
```

---

## STEP 2 — electron-builder CONFIGURATION

**Create** `electron-builder.yml` in the project root:

```yaml
# electron-builder.yml

appId: app.forgecinema.v3
productName: Cinematic Forge
copyright: Copyright © 2026 Innovative Trailers

# Output directory
directories:
  output: dist/installers
  buildResources: build

# What to include in the app bundle
files:
  - dist/main/**/*
  - dist/preload/**/*
  - dist/renderer/**/*
  - resources/**/*
  - package.json
  - "!node_modules/**/*"
  - "!src/**/*"
  - "!.git/**/*"

# Extra native resources (FFmpeg binary, ACES config, etc.)
extraResources:
  - from: resources/ffmpeg
    to: ffmpeg
    filter: "**/*"
  - from: resources/ocio
    to: ocio
    filter: "**/*"
  - from: resources/sfx
    to: sfx
    filter: "**/*"

# Auto-update feed URL
publish:
  - provider: generic
    url: https://releases.forgecinema.app
    channel: latest

# ── macOS ──────────────────────────────────────────────────────────────
mac:
  category: public.app-category.video
  target:
    - target: dmg
      arch:
        - arm64      # Apple Silicon
        - x64        # Intel
    - target: zip    # for auto-updater delta patches
      arch:
        - arm64
        - x64
  icon: build/icon.icns
  # Code signing
  identity: "Developer ID Application: Innovative Trailers (XXXXXXXXXX)"
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist

dmg:
  title: "Cinematic Forge ${version}"
  icon: build/icon.icns
  background: build/dmg-background.png   # 540×380 PNG (optional but professional)
  window:
    width: 540
    height: 380
  contents:
    - x: 130
      y: 220
      type: file
    - x: 410
      y: 220
      type: link
      path: /Applications
  # macOS notarization
  sign: true

afterSign: scripts/notarize.js   # runs after signing

# ── Windows ────────────────────────────────────────────────────────────
win:
  target:
    - target: nsis
      arch:
        - x64
    - target: zip
      arch:
        - x64
  icon: build/icon.ico
  signingHashAlgorithms:
    - sha256
  rfc3161TimeStampServer: http://timestamp.digicert.com   # or sectigo

nsis:
  oneClick: false                    # show install wizard
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Cinematic Forge
  installerIcon: build/icon.ico
  uninstallerIcon: build/icon.ico
  installerSidebar: build/installer-sidebar.bmp   # 164×314 BMP (optional)
  license: LICENSE.txt
  displayLanguageSelector: true
  multiLanguageInstaller: true

# ── Linux (optional) ───────────────────────────────────────────────────
linux:
  target:
    - target: AppImage
      arch:
        - x64
  icon: build/icon.png
  category: Video
```

---

## STEP 3 — macOS NOTARIZATION SCRIPT

**Create** `scripts/notarize.js`:

```javascript
// scripts/notarize.js
// Runs after the app is signed — submits to Apple for notarization (required for macOS 10.15+)

const { notarize } = require('@electron/notarize')

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return   // macOS only

  const appName = context.packager.appInfo.productFilename
  const appPath = `${appOutDir}/${appName}.app`

  console.log(`Notarizing ${appPath}...`)

  return notarize({
    tool:     'notarytool',
    appPath,
    appleId:          process.env.APPLE_ID,
    appleIdPassword:  process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId:           process.env.APPLE_TEAM_ID,
  })
}
```

```bash
npm install @electron/notarize --save-dev
```

---

## STEP 4 — macOS ENTITLEMENTS

**Create** `build/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <!-- Required for Electron -->
    <key>com.apple.security.cs.allow-jit</key>             <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key> <true/>
    <key>com.apple.security.cs.disable-library-validation</key> <true/>

    <!-- Required for V3 features -->
    <key>com.apple.security.files.user-selected.read-write</key> <true/>  <!-- project files -->
    <key>com.apple.security.files.downloads.read-write</key>     <true/>  <!-- media import -->
    <key>com.apple.security.network.client</key>                 <true/>  <!-- FAL/Anthropic APIs -->
    <key>com.apple.security.network.server</key>                 <true/>  <!-- local preview server -->
    <key>com.apple.security.device.audio-input</key>             <true/>  <!-- ADR recording -->
    <key>com.apple.security.device.camera</key>                  <true/>  <!-- webcam for avatar -->
  </dict>
</plist>
```

---

## STEP 5 — AUTO-UPDATE INTEGRATION

**Create** `src/main/updater.ts`:

```typescript
// src/main/updater.ts
import { autoUpdater }      from 'electron-updater'
import { app, dialog, BrowserWindow } from 'electron'
import log                  from 'electron-log'
import semver               from 'semver'

autoUpdater.logger = log
autoUpdater.autoDownload      = false   // ask user first
autoUpdater.autoInstallOnAppQuit = true

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  // Check for updates 3 seconds after launch (let UI settle first)
  setTimeout(() => autoUpdater.checkForUpdates(), 3000)

  autoUpdater.on('update-available', (info) => {
    const isBreaking = semver.major(info.version) > semver.major(app.getVersion())
    dialog.showMessageBox(mainWindow, {
      type:    'info',
      title:   'Update Available',
      message: `Cinematic Forge ${info.version} is available.`,
      detail:  isBreaking
        ? 'This is a major update with new features. Recommended to install.'
        : `Released ${info.releaseDate}. Installing in the background.`,
      buttons: ['Download Now', 'Later'],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate()
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('update-progress', {
      percent:    progress.percent,
      bytesPerSec: progress.bytesPerSec,
    })
  })

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type:    'info',
      title:   'Update Ready',
      message: 'Update downloaded. Restart to apply.',
      buttons: ['Restart Now', 'Later'],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    log.error('Auto-update error:', err)
  })
}
```

**Edit** `src/main/index.ts` — initialise after window creation:

```typescript
import { initAutoUpdater } from './updater'

app.whenReady().then(() => {
  const mainWindow = createWindow()
  if (app.isPackaged) {
    initAutoUpdater(mainWindow)    // only in packaged builds, not dev
  }
})
```

---

## STEP 6 — BUILD SCRIPTS (package.json)

**Edit** `package.json` — add build commands:

```json
{
  "scripts": {
    "build":              "npm run build:main && npm run build:renderer",
    "build:main":         "tsc -p tsconfig.main.json",
    "build:renderer":     "vite build",
    "dist":               "npm run build && electron-builder",
    "dist:mac":           "npm run build && electron-builder --mac",
    "dist:mac:arm":       "npm run build && electron-builder --mac --arm64",
    "dist:mac:intel":     "npm run build && electron-builder --mac --x64",
    "dist:win":           "npm run build && electron-builder --win",
    "dist:all":           "npm run build && electron-builder --mac --win",
    "publish":            "npm run build && electron-builder --publish always"
  }
}
```

---

## STEP 7 — CI/CD PIPELINE (GitHub Actions)

**Create** `.github/workflows/release.yml`:

```yaml
name: Build & Release

on:
  push:
    tags:
      - 'v*'          # triggers on: git tag v3.1.0 && git push --tags

jobs:
  build-mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Build & sign macOS
        env:
          APPLE_ID:                   ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD:${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID:              ${{ secrets.APPLE_TEAM_ID }}
          CSC_LINK:                   ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD:           ${{ secrets.CSC_KEY_PASSWORD }}
        run: npm run dist:mac

      - name: Upload to R2
        env:
          AWS_ACCESS_KEY_ID:     ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
        run: |
          aws s3 sync dist/installers/ s3://forge-releases/ \
            --endpoint-url https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com \
            --exclude "*.blockmap"
          # Copy versioned files to /latest/ for auto-updater
          aws s3 cp dist/installers/latest-mac.yml \
            s3://forge-releases/latest-mac.yml \
            --endpoint-url https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com

  build-win:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Build & sign Windows
        env:
          WIN_CSC_LINK:         ${{ secrets.WIN_CSC_LINK }}
          WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
        run: npm run dist:win

      - name: Upload to R2
        env:
          AWS_ACCESS_KEY_ID:     ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
        run: |
          aws s3 sync dist/installers/ s3://forge-releases/ `
            --endpoint-url https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com
          aws s3 cp dist/installers/latest.yml `
            s3://forge-releases/latest.yml `
            --endpoint-url https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com
```

---

## STEP 8 — UPDATE V2 DOWNLOAD PAGE

Once the first build is published, **update** `src/app/download/page.tsx`:

```typescript
// Replace placeholders with real URLs:
const DOWNLOAD_URLS = {
  mac_arm:   'https://releases.forgecinema.app/CinematicForge-3.x.x-arm64.dmg',
  mac_intel: 'https://releases.forgecinema.app/CinematicForge-3.x.x.dmg',
  windows:   'https://releases.forgecinema.app/CinematicForge-Setup-3.x.x.exe',
}

// Or fetch the latest version dynamically from the update feed:
async function getLatestDownloadUrls() {
  const feed = await fetch('https://releases.forgecinema.app/latest-mac.yml').then(r => r.text())
  // Parse YAML feed → extract filename → construct URL
  const version = feed.match(/version: (.+)/)?.[1]?.trim()
  return {
    mac_arm:   `https://releases.forgecinema.app/CinematicForge-${version}-arm64.dmg`,
    mac_intel: `https://releases.forgecinema.app/CinematicForge-${version}.dmg`,
    windows:   `https://releases.forgecinema.app/CinematicForge-Setup-${version}.exe`,
  }
}
```

---

## STEP 9 — CRASH REPORTING

**Create** `src/main/crash.ts`:

```typescript
import { crashReporter, app, dialog } from 'electron'
import log from 'electron-log'
import path from 'path'

export function initCrashReporting(): void {
  // Write crash dumps locally
  crashReporter.start({
    productName:    'Cinematic Forge',
    companyName:    'Innovative Trailers',
    submitURL:      'https://forgecinema.vercel.app/api/crash',
    uploadToServer: app.isPackaged,
    extra: {
      version: app.getVersion(),
      platform: process.platform,
    },
  })

  // Catch unhandled errors before they crash silently
  process.on('uncaughtException', (err) => {
    log.error('Uncaught exception:', err)
    dialog.showMessageBoxSync({
      type:    'error',
      title:   'Unexpected Error',
      message: 'Cinematic Forge encountered an error.',
      detail:  `${err.message}\n\nA crash report has been saved. Please restart the app.`,
      buttons: ['OK'],
    })
  })

  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection:', reason)
  })
}
```

**Create** `src/app/api/crash/route.ts` in the V2 web app (receives crash reports):

```typescript
export async function POST(req: Request) {
  const body = await req.text()
  console.error('[V3 crash]', body)
  // TODO: forward to Sentry or similar if needed
  return Response.json({ received: true })
}
```

---

## STEP 10 — LOCAL BUILD TEST (before CI)

```bash
# Test the full build locally first (no code signing for local test)

cd cinematic-forge-v3

# macOS — unsigned local build (for testing only)
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac:arm

# Windows — build on macOS via wine (limited) or use a Windows VM
# Best to test Windows builds in GitHub Actions on windows-latest runner

# Expected output:
ls dist/installers/
# CinematicForge-3.x.x-arm64.dmg
# CinematicForge-3.x.x-arm64-mac.zip
# latest-mac.yml
```

---

## HOW TO RELEASE A NEW VERSION

```bash
# 1. Bump version in package.json
npm version patch   # 3.0.0 → 3.0.1
# or: npm version minor / major

# 2. Tag and push (this triggers the CI/CD pipeline)
git add package.json
git commit -m "chore: bump version to 3.0.1"
git tag v3.0.1
git push origin main --tags

# 3. GitHub Actions builds mac + win, signs, notarizes, uploads to R2
# Monitor: github.com/[org]/cinematic-forge-v3/actions

# 4. Auto-updater in running V3 instances picks up new version within ~1 hour
# (or on next app launch)

# 5. Update the download URLs on the V2 web app download page
```

---

## SUMMARY — WHAT NEEDS TO HAPPEN

### Manual (you must do):
| Step | Action | Time |
|------|---------|------|
| M1 | Join Apple Developer Program ($99/yr) | 1-2 days (approval) |
| M2 | Buy Windows code signing cert ($100-400/yr) | 1-3 days |
| M3 | Add GitHub secrets | 30 min |
| M4 | Create R2 bucket + custom domain | 30 min |
| M5 | Create app icons (.icns + .ico) | 1-2 hours |

### Cursor does:
| File | Action |
|------|--------|
| `electron-builder.yml` | CREATE — full build config |
| `scripts/notarize.js` | CREATE — macOS notarization |
| `build/entitlements.mac.plist` | CREATE — macOS sandbox entitlements |
| `src/main/updater.ts` | CREATE — auto-update with dialog |
| `src/main/crash.ts` | CREATE — crash reporting |
| `src/main/index.ts` | EDIT — init updater + crash reporter |
| `.github/workflows/release.yml` | CREATE — CI/CD pipeline |
| `package.json` | EDIT — add dist scripts |
| `src/app/download/page.tsx` (V2) | EDIT — real download URLs after first build |

### Verification:
```bash
npm run build:main     # main process compiles
npx electron-builder --help   # electron-builder installed correctly
# Then on first tag push → monitor GitHub Actions for green builds
```

---

## IMPORTANT NOTES

**Code signing is not optional for production.** Without it:
- macOS: "This app is damaged and can't be opened" on Ventura/Sonoma
- Windows: SmartScreen blocks install with red warning

**Notarization is not optional for macOS distribution.** Without it:
- macOS 10.15+ Gatekeeper quarantines the app regardless of signing

**The CI/CD pipeline runs on the cloud** — macOS builds must run on `macos-latest`
runners (Apple Silicon native), Windows builds on `windows-latest`. You cannot
cross-compile a signed macOS DMG from Windows or vice versa.

**Budget estimate for distribution:**
```
Apple Developer Program:  $99 AUD/year
Windows EV cert:          ~$300-400 USD/year (recommended) or ~$100 OV
GitHub Actions minutes:   free tier (2000 min/month) should cover most builds
Cloudflare R2:            free tier (10GB storage, 1M requests) should cover initial
```
