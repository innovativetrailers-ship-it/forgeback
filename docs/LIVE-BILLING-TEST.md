# Live billing test

Do this once, as one ordinary test account, after the web and the four workers are on the same release. Generation stays paused until step (c), and goes back to paused in step (h).

Do not grant credits to `innovative.trailers@gmail.com` or to an account with own keys. The grant script refuses both. Do not paste connection strings or keys into the transcript.

## (a) Register the test account

Create a new email account in the production app. It must not be marked internal and must not have own keys. Confirm the account can sign in.

## (b) Grant a small balance

From the web repo, with production `DATABASE_URL` already in the environment and not printed:

```bash
node scripts/grant-test-credits.mjs
```

The default grant is 50. `--credits` accepts 1 through 200 and refuses anything higher. The script asks for the email, requires exactly one matching user, and writes the credits only after you type `yes`. The row is a `CreditTransaction` with type `admin-grant`, written by `grantCredits()`, the same function a Stripe pack purchase uses.

## (c) Unpause generation and restart

Set `GENERATION_PAUSED` to `false` on Vercel production and on `worker-render`, `worker-training`, `worker-export`, and `worker-das`. Only `false`, `0`, or `off` unpauses. Restart the web deployment and the four workers so the running processes load that value. One consumer per queue.

## (d) One cheap image

Sign in as the test user and run one inexpensive image generation. Do not start a second one.

## (e) Read the ledger

```bash
node scripts/verify-billing-run.mjs test-user@example.com
```

Use the real test email. Expect every printed check to say PASS: balances are non-negative, the completed job has one hold that settled once, and `creditBalance + heldCredits + consumed` equals grants minus refunds.

## (f) One failed or cancelled generation

Start a second generation as the same user and cancel it, or force that one job to fail. Then run the same verify command again. The failed or cancelled job must show PASS for a hold released exactly once. The completed job from step (d) must still show PASS.

## (g) Unfunded call

Set that user's balance to 0 only through a path that writes a ledger row, or spend the grant down until `creditBalance` is 0 and `heldCredits` is 0. Try one more generation. It must be refused, and the new job must have no provider request id. Run the verify command again and confirm the refusal did not add a provider request id.

## (h) Pause again

Set `GENERATION_PAUSED` back to `true` on Vercel production and the four workers, and restart them, unless you have decided to leave generation on. Unset is also paused. `false`, `0`, and `off` are the only values that leave it on.
