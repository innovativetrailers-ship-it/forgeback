# Mac App Store readiness (analysis only)

This note records blockers for a later Mac App Store build. No App Store target is produced here.

- Hardened runtime currently allows unsigned libraries. Every native binary must be signed with the same team id before a store build.
- Projects live in `~/Documents/CinematicForge`. A store build needs a sandbox container or a user-chosen folder with security-scoped bookmarks.
- Auto-update from a public feed cannot ship in the store build. Compile that path out.
- Bundled ffmpeg and ffprobe must be signed and spawned with inherited entitlements.
- Plugins loaded from user data need a review rule before they can ship.

Allowed as-is for a later pass: JIT, outbound network, camera and microphone usage strings.
