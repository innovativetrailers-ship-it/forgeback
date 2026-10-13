# Auth canonical set — 2026-09-30

Read-only trace. No tables were dropped.

The running app signs in through NextAuth in `src/lib/auth.ts`.

- Adapter: `PrismaAdapter(db)` from `@auth/prisma-adapter`.
- `db` is the Prisma client in `src/lib/db.ts`, whose models are `User`, `Account`, and `Session` (no `@@map`, so the tables are the uppercase names).
- Session strategy is `jwt`. The `Session` table stays empty on purpose. The session lives in the JWT, which is why the forensic count of `Session` rows was 0.
- Google and credentials both resolve the Prisma `User`. Credentials reads `db.user.findUnique`.
- Entitlement models `Subscription` and `DesktopActivation` relation to `User`.

No application code reads the lowercase `user` / `account` / `session` / `organization` tables. They are not Prisma models. They were not dropped in this wave because the instruction was to name the canonical set first and only drop the other after a zero-row confirmation in the same change window. The canonical set is the Prisma NextAuth set. A later migration may rename the empty lowercase tables to `_retired_*` once their row count is confirmed 0 in production.

Google sign-in now requests `access_type=offline` and `prompt=consent` so a new sign-in can store a refresh token on `Account`. Existing tokens are not rewritten until the person signs in again. The app session still survives access-token expiry because it is a JWT, not a database session.
