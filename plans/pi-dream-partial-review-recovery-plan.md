# Plan: Resume saved combined reviews

## Brief

Keep valid review work after a timeout or an incomplete stop. Resume the same job from its saved outcomes, findings, source records, and candidate edits. Keep all selected files in one combined review.

## Current state / relevant context

Job `2026-11-15T17-35-47-985Z-7e0326cf` reached the one-hour limit after 834 tool calls. It saved 102 of 263 passage outcomes, 100 findings, and three proposed edits. It also saved 377 search pages and 196 source reads. Compact tool responses worked. The runner currently ignores incomplete attempt records on resume and starts review again.

The worker saves review records after successful tools. Findings and edit records remain in the attempt folder. The runner starts workers without saved Pi sessions. Thus, the model conversation cannot resume exactly, but recorded review work can survive.

## Proposed implementation

On explicit resume, select the latest incomplete combined attempt. Validate its original selection and source hash against the job. Validate recorded outcomes without requiring completion. Recheck search receipts against the source snapshot and source-read ranges against source entries. Validate findings and the chain of audited candidate edits. Reject changed or inconsistent records before a model call. Do not silently restart or use an older attempt when validation fails.

Copy valid candidate Markdown files and records into a new attempt. Preserve earlier attempts and logs. Bind new attempts to an input hash before worker startup. After a worker exits, save checkpoint hashes for its review, findings, edits, and candidate files. Older attempts without that record remain recoverable through source, original-passage, and edit validation. Never refresh the original base of an incomplete combined check on resume. New accepted memory still enters through the existing apply merge.

Give the new worker the retained findings and compact review counts. Tell it to continue pending passages and reuse recorded work. Keep the full file selection and require a new final cross-file comparison. Add bounded access to saved outcomes so the new worker can inspect earlier decisions without repeating evidence searches.

Keep the one-hour limit per attempt and the no-progress limit. Do not add automatic paid retries, extra workers, longer timeouts, new dependencies, or source caches. Recovery prevents repeated work, but it cannot promise completion within one hour.

## File-by-file impact

- `extensions/pi-dream/review.mjs`: validate partial records and expose bounded saved outcomes.
- `extensions/pi-dream/runner.mjs`: validate, copy, and resume incomplete attempts. Preserve the original base. Save failure reports.
- `extensions/pi-dream/worker-extension.ts`: expose saved outcomes through the existing review tool.
- `extensions/pi-dream/index.ts`: disclose saved-work reuse and the per-attempt limit in the resume confirmation.
- Adjacent review, recovery, and extension tests: cover partial work, corruption, timeout, and installed Pi resume.
- `docs/pi-dream.md`: document retained work, limits, and explicit resume.

## Risks and edge cases

- A process can stop between a file edit and its audit record. Reject inconsistent records instead of accepting an unaudited edit.
- A corrupt record must not trigger a silent restart or an older attempt.
- A newer accepted base must not erase saved work. Keep the original base and use the existing merge workflow on apply.
- A new worker does not retain the old conversation. Saved outcomes, findings, edits, and source records provide its durable context.
- Missing files, symlinks, changed evidence, invalid source ranges, and altered original passages stop resume.
- Existing completed jobs keep their current publication-retry behavior.
- Keep the reported live job unchanged. Test recovery on isolated copies without a live model.

## Validation / testing

- Reproduce the loss of partial outcomes before editing.
- Resume a timed-out check with a saved finding, source reads, outcomes, and a candidate edit. Preserve all four.
- Reject changed input hashes, original passages, source receipts, findings, candidate files, and edit records before worker startup.
- Keep the original base when accepted memory changes between attempts.
- Run the installed Pi CLI with a local fixed-response provider. Finish only pending work after resume.
- Validate the real failed attempt read-only. Confirm all 102 outcomes and three edits pass recovery checks.
- Run adjacent tests, syntax checks, `git diff --check`, and `pre-commit run --all-files`.

## Step-by-step execution checklist

- [x] Inspect the failed job and record the recovery plan.
- [x] Implement validated partial recovery and pass focused tests.
- [x] Update documentation, run final checks, and report saved work and limits.

## Results

- All 59 Node tests passed: 20 review, eight source, and 31 recovery tests.
- Extension tests passed with the installed Pi CLI and a local provider. Resume retained saved outcomes and completed pending work.
- Syntax checks passed for `runner.mjs` and `review.mjs`.
- `git diff --check` and `pre-commit run --all-files` passed.
- Read-only validation accepted all 102 outcomes, 100 findings, 196 source reads, and 361 searches from the failed live attempt.
- An isolated copy of that job resumed with 102 outcomes, 100 findings, and three edits. A local fake worker made no provider calls.
- The incomplete copy still failed its completion check. It did not publish a branch.
- The original job records and accepted memory stayed unchanged. No live model rerun, installation, or reload ran.
- Each attempt retains its one-hour limit. Explicit resume reuses valid saved work but does not restore the earlier model conversation.

## Open questions / assumptions

- The user requested a fix. This approves repository implementation, not a paid rerun or memory acceptance.
- Explicit `/dream-resume` remains the retry boundary. Each new attempt has its own one-hour limit.
- Record validity does not establish semantic truth. Human review remains necessary.
