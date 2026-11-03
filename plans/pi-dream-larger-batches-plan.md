# Larger Dream batches

**Completed: 2026-11-03**

## Brief

Allow users to process up to 100 sessions in one Dream batch. Run up to 10 workers at once per batch. Keep the default batch count at 10.

## Current state / relevant context

`index.ts` limits a batch to 25 sessions and sets three workers. `runner.mjs` uses three workers when a manifest omits the count. Each worker receives one session. Workers share the batch folder and use the existing edit lock.

## Proposed implementation

Raise the maximum to 100 in `index.ts`. Set the worker count to 10 in both entry points. Limit the runner to 10 workers even when a manifest requests more. Keep smaller recorded counts for existing jobs. Do not change review, apply, storage, or memory discovery.

## File-by-file impact

- `extensions/pi-dream/index.ts`: raise the batch maximum and worker count.
- `extensions/pi-dream/runner.mjs`: raise the fallback count and enforce the worker limit.
- `extensions/pi-dream/pi-dream.test.ts`: cover command selection and child scheduling.
- `docs/pi-dream.md`: describe the new limits and per-batch scope.
- This plan: record validation results.

## Risks and edge cases

Ten workers use more provider capacity and local resources. Shared-file edits can require more retries. Concurrent batches each have their own worker limit. Existing jobs retain their recorded smaller counts. Review and failure behavior remain unchanged.

## Validation / testing

Check that `/dream 100` selects 100 sessions and larger requests stop at 100. Check that the default still selects 10. Run 100 local test workers and measure a peak of 10 active workers. Check both the runner fallback and an excessive manifest count. Run focused tests, strict TypeScript, Node syntax, and repository hygiene checks. Verify the isolated real command without paid model requests or live memory changes.

## Step-by-step execution checklist

1. [x] Inspect affected source, tests, and documentation.
2. [x] Add regression coverage and update both entry points.
3. [x] Update the documentation.
4. [x] Run isolated checks and record results.

## Results

- Command regression coverage checks the default count, smaller batches, 100 sessions, and requests larger than 100.
- Two local test batches each processed 100 sessions with exactly 10 peak active workers.
- Those batches cover a missing worker count and an excessive request. Existing smaller counts remain covered.
- A real isolated Pi run selected 100 sessions from 105 fixtures through `/dream 100`.
- Its confirmation showed 10 workers. The batch reached `ready` with 100 completed sessions and exactly 10 peak workers.
- The test kept accepted `master` and its files unchanged. It published one review branch.
- Proof files are in `/tmp/pi-dream-100-proof-fo7ydhpq/`.
- Focused tests, strict TypeScript, Node syntax, `git diff --check`, and `pre-commit run --all-files` passed.
- Documentation describes the new limits and their per-batch scope.
- Live memory and settings remained unchanged. No paid model requests ran.

## Open questions / assumptions

The user approved both new limits. The limit applies per batch, not across all concurrent batches. Keep the existing default batch count and recorded jobs unchanged. Do not commit, push, install, or change live memory and settings.
