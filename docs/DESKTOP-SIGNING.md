# Desktop signing

Team ID: `VCHPT84DUP`.

Developer ID Application certificate: Antonio Peixoto (`VCHPT84DUP`).
Expires: 17 September 2031. Renew it in the Apple Developer portal before that date and replace `CSC_LINK` / `CSC_KEY_PASSWORD`.

## Once per machine

1. Enrolment in the Apple Developer Program is done.
2. Export the Developer ID Application certificate from Keychain Access as a `.p12`.
3. Create an App Store Connect API key (Developer role). Download the `.p8` once. Note the key id and issuer id.
4. Store these GitHub Actions secrets on `innovativetrailers-ship-it/forgecinema-desktop`: `CSC_LINK` (base64 `.p12`), `CSC_KEY_PASSWORD`, `APPLE_API_KEY` (`.p8` contents), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID`.
5. Do not paste secrets into chat or commit them.

Apple ID notarisation (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) still works if the API key is absent. The API key is preferred. The release job fails when neither set is present.

## Release

`FORGE_RELEASE=1` is the publish path. A missing certificate or notarisation secret throws. `FORGE_ALLOW_UNSIGNED=1` is the only skip. Those artifacts are named `-unsigned` and are not uploaded.

Notarisation runs once, in `scripts/notarize.cjs`. `scripts/verify-mac-release.sh` must pass before `desktop-release-manifest.json` or `mac-notarized.txt` is written and before the R2 upload.

Windows public releases stay unpublished until `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` exist. The download page hides that button.

## Developer workaround (not for customers)

An unsigned local build can be opened on this Mac after the quarantine flag is cleared:

`xattr -cr "/Applications/Cinematic Forge.app"`

Customers must receive a notarised build. A browser-downloaded unsigned app is reported as damaged.
