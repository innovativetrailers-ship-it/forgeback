# Ideas backlog

The T2I asset studio is mounted on the training tabs. It saves a `character`, `style`, or `asset` row through `/api/studio/assets/t2i`.

Monthly competitor-gap debates append a ranked gap report here as a `ModelReport` row with `generatedBy = monthly-gap`. Those rows are captured for triage. A gap report does not build anything.

Routing proposals live on `ModelReport` rows with `generatedBy = biweekly-debate`. They stay pending until `approveRoutingProposal`. Open-weight ids are backlog notes, not swaps.

Cursor prompts live on `generatedBy = cursor-pusher`. A prompt that would weaken a billing chokepoint, the pause, a safety check, or the open-weight pin is marked `signoff` and is not a routine push.
