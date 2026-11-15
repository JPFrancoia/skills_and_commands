# Plan: Complete combined Dream reviews

## Brief

Keep all selected memory files in one shared review. A check must account for every selected passage before it becomes ready. A passage is a paragraph or list item from the original memory. Files without errors do not need edits.

## Current state / relevant context

The live all-file job selected and read 15 files but opened only five source entries. Its report said the review was not exhaustive. The runner accepted normal model termination without a coverage check. Status counted extraction sessions, so the check showed `ready (0/0)`.

The existing worker already shares all selected files, source tools, and candidate edits. Publication uses a review branch. Accepted memory changes only after manual apply.

## Proposed implementation

Keep one worker and one shared candidate for the whole selection. Add `review.mjs` to build stable passage IDs from the original files. A review record binds those passages to the original file hashes and source snapshot.

Add `dream_review` to show progress, record passage outcomes, and finish the combined comparison. Outcomes distinguish supported content, corrected content, missing evidence, and nonfactual text. Supported and corrected outcomes require source-backed findings and recorded source reads. Missing-evidence outcomes require completed searches unless the snapshot contains no sessions. The worker must read the matching source passages before it records missing evidence. Nonfactual outcomes require an explanation.

Record source search pages and source reads through the existing tools. A search remains open until the worker reads its pages or completes a narrower search. Narrowing must preserve the original search term and source scope. Require the worker to account for every passage, read every selected file, and complete a shared comparison. Bind the final comparison to the final candidate hashes.

Use `agent_before_settle` to request continuation when coverage remains incomplete. Continue in the same worker context at most three times. Keep the existing overall timeout. After the limit, fail without publishing a branch.

Check the review record again in the runner before publication and when reusing a completed attempt. Include coverage and evidence gaps in the report. Failed checks restart the combined review from the baseline on resume, as failed consolidation already does. Completed publication retries reuse only a valid recorded review.

Show reviewed files and passage counts for check jobs. Older check jobs without coverage records show unknown coverage instead of `0/0`. Do not relabel historical jobs as fully reviewed.

This approach is stronger than a prompt-only change. It keeps cross-file comparisons, unlike separate file reviews. Recorded coverage cannot prove that a model interpreted evidence correctly. Human review remains necessary.

## File-by-file impact

- `extensions/pi-dream/review.mjs` and `review.test.mjs`: passage coverage, source receipts, outcome checks, and completion checks.
- `extensions/pi-dream/worker-extension.ts`: review tool, source receipts, progress, and bounded continuation.
- `extensions/pi-dream/runner.mjs`: combined-review prompt, attempt records, completion checks, reports, and resume validation.
- `extensions/pi-dream/index.ts`: check progress and historical coverage labels.
- `extensions/pi-dream/pi-dream.test.ts` and `recovery.test.mjs`: worker, command, status, failure, and resume regressions.
- `docs/pi-dream.md`: implemented review rules, progress, failure, and limits.

## Risks and edge cases

- A thorough review uses more tokens. Existing timeouts and bounded continuation prevent endless work.
- Search pages can contain repeated or irrelevant text. Permit completed narrower searches instead of requiring broad searches to read every result.
- Missing evidence is not proof that a claim is false. Preserve unsupported accepted facts.
- Paragraphs can contain several claims. The prompt requires every claim within each passage, but code checks passage coverage only.
- Edited, deleted, or moved files still require outcomes for their original passages.
- An edit after the final comparison invalidates completion until the worker repeats that comparison.
- New checks and resumed incomplete checks use the new rules. Historical ready jobs retain their existing status and show unknown coverage.
- This task does not apply, discard, or rerun the reported live job.

## Validation / testing

- Reproduce successful model termination without coverage and require failure without publication.
- Reject missing passages, unread files, invented findings, unread evidence, unresolved search pages, and changed final content.
- Accept complete reviews with unchanged files and explicit missing-evidence outcomes.
- Exercise pagination, narrower searches, and combined cross-file comparison.
- Exercise three same-context continuations and the final completion guard.
- Verify command status, report coverage, candidate isolation, completed-attempt reuse, and changed-record rejection.
- Run adjacent tests, Node syntax checks, `git diff --check`, and `pre-commit run --all-files`.
- Test hooks with the installed SDK when practical. Do not claim live-model quality validation without a real run.

## Step-by-step execution checklist

- [x] Inspect the failure and define the shared completion rules.
- [x] Implement coverage, continuation, runner checks, and status. Pass regression tests.
- [x] Update documentation and run final checks. Record results.

## Validation results

- All 44 Node tests passed across `review.test.mjs`, `sources.test.mjs`, and `recovery.test.mjs`.
- `pi-dream.test.ts` passed through the host `jiti` loader.
- Installed Pi CLI tests used an isolated local provider without network calls. Early termination continued in the same worker process.
- Repeated early termination failed after three continuations without publishing a branch.
- Node syntax checks, `git diff --check`, and `pre-commit run --all-files` passed.
- No installation, reload, live-model quality evaluation, or live job rerun occurred. Accepted memory did not change.

## Open questions / assumptions

- The user approved implementation and requires one combined review for all selected files.
- No new dependency, parallel reviewer, or separate file job is necessary.
- The local SDK supports `agent_before_settle` continuation.
- A review can finish with documented missing evidence. Unchecked passages cannot count as reviewed.
