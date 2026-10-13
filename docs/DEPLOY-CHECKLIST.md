# Deploy checklist

Do this in order. Do not skip the snapshot. Do not apply migrations to production until the throwaway checks in this document have been repeated against a copy of the production snapshot.

## 1. Snapshot the database

Take a Neon snapshot of the production branch before any migration. Keep the snapshot id. The rollback is to restore that snapshot, not to run a down migration.

Snapshot taken for this release: name `forge-pre-run38-39-2026-10-13`, id `snap-noisy-fog-a7ic38x0`, created `2026-10-13T02:50:59Z`. These migrations do not drop columns. `20261013073000_retire_user_work` replaces foreign keys so a scene, project, character, user, or playbook parent can no longer cascade-delete child work. Restoring the snapshot is the way back.

## 2. Confirm the migration order

Apply only these new files, after every migration already on `run-39-relay`. Timestamps do not collide.

1. `20261013051000_subscription_provider_sub_id` — unique index on `(provider, providerSubId)`.
2. `20261013054600_orphan_and_hot_indexes` — `orphanedAt` columns and lookup indexes.
3. `20261013061000_consent_record` — date of birth, deletion request, `ConsentRecord`.
4. `20261013070000_stored_object` — `StoredObject` plus a backfill of existing storage keys. Objects are not renamed or deleted.
5. `20261013073000_retire_user_work` — `retiredAt` columns and `ON DELETE RESTRICT` on user-work foreign keys.

Each statement is `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, or a foreign-key replace. None drop a column or a table.

## 3. Environment names

Set these by name. Do not paste values into the checklist, the shell history, or a ticket.

Vercel production, required before the web process will boot:

- `AUTH_SECRET`
- `DATABASE_URL`
- `REDIS_URL`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`
- `FAL_KEY`
- `FAL_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `CRON_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Vercel, used when those features are on:

- `NEXT_PUBLIC_STRIPE_PUBLIC_KEY`
- `ELEVENLABS_API_KEY`
- `MAPILLARY_ACCESS_TOKEN`
- `CESIUM_ION_ACCESS_TOKEN`
- `PEXELS_API_KEY`

Railway, on `worker-render`, `worker-training`, `worker-export`, and `worker-das`. `FAL_WEBHOOK_SECRET` must be the same name and the same value as Vercel. `GENERATION_PAUSED` stays unset or any value other than `false`, `0`, or `off` until a gate says otherwise.

- `DATABASE_URL`
- `REDIS_URL`
- `FAL_KEY`
- `FAL_WEBHOOK_SECRET`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`
- `GENERATION_PAUSED`

## 4. Apply migrations, then deploy web and workers together

1. `npx prisma migrate deploy` against the production `DATABASE_URL` after the snapshot.
2. Deploy the web app and the four workers in the same window. A new column the web writes and a worker does not know about, or the reverse, is a broken release.
3. Do not start a second consumer on `render`, `training`, `export`, or `das`.

## 5. Live checks after deploy

| Check | Expected |
|---|---|
| `GET /api/health` with no session | `401`, body `{ "error": "Unauthorized" }`, no `Access-Control-Allow-Origin` |
| Stripe webhook with no `stripe-signature` | `400`, `Missing stripe-signature` |
| Stripe webhook with a forged signature | `400`, `Invalid signature` |
| Generate with a balance below the hold | `402` or an insufficient-credits error, and no new provider request id |
| `innovative.trailers@gmail.com` with `isInternal` true | hold amount `0` |
| Any other email, even with `isInternal` true | a real hold |
| Own-key `POST` when `canUseOwnKeys` is false | `403` |
| Own-key `POST` when `canUseOwnKeys` is true | `200`, ledger row `amount` `0`, type `own-key` |
| `SELECT MIN("creditBalance"), MIN("heldCredits") FROM "User"` | both `>= 0` |
| Delete a `StudioScene` that still has a `StudioClip` | the database refuses the delete |

## 6. Rollback

1. Stop the new web deploy and the new workers. Put the previous deployment back on Vercel and Railway together.
2. If a migration in this list already ran, restore the Neon snapshot from step 1. Do not write a down migration that drops the new columns while the old app is running.
3. Leave `GENERATION_PAUSED` as it was. Do not unset it to force a retry.
