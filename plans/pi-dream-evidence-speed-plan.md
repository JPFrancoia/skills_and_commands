# Plan: Speed up combined review evidence work

## Brief

Reuse a validated source snapshot inside each worker. Add bounded tools for several evidence operations per model response. Keep one combined review and preserve saved work on resume.

## Current state / relevant context

The latest attempt, `attempt-ht7dkB`, reached its one-hour limit. It retained 160 passage outcomes, 174 findings, and five proposed edits. Its worker made 725 searches, 200 source reads, and 74 finding calls. It produced 388 tool-use responses.

`workerSources` reloads, hashes, parses, and validates the 135,306,595-byte source snapshot for each source operation. Finding and outcome tools also call it. Single-source tools return one search page or one entry page. The review tool already accepts up to twenty outcomes per call.

## Proposed implementation

Add a worker-local source loader. It validates the full hash and structure once. It returns the same frozen data for later calls. Before reuse, it checks the file identity, size, modification time, and change time. Reject changed files, missing files, symlinks, and nonregular files. Check the file before and after its first load. Keep full source-hash checks in runner validation and publication. Do not share cached data between workers or mutate it for extraction scope.

Add `dream_source_batch` for up to eight independent searches or reads. Keep the single-operation tools. Limit combined source text and excerpts to 16,000 characters. Return ordered results with an input index. Report individual errors. Mark requests that exceed the text budget as deferred. Do not record receipts for deferred or failed requests. Save successful receipts together using the existing review lock.

Add `dream_finding_batch` for up to eight findings. Use the existing finding validation and append logic. Return a compact result for each input, including its finding ID or error. Preserve successful records when another input fails. Keep finding tools sequential so IDs cannot conflict. Allow up to 64 KiB of arguments for this tool while retaining inactivity and whitespace limits.

Update worker prompts to prefer batches for independent work. Keep source context checks, exact quotes, review outcomes, final cross-file comparison, and manual apply. Do not add evidence workers yet. Reuse and batching avoid extra model cost and coordination.

## File-by-file impact

- `extensions/pi-dream/sources.mjs`: source reuse, file-change detection, and bounded batch reads/searches.
- `extensions/pi-dream/worker-extension.ts`: worker-local loader, batch tools, receipts, and finding results.
- `extensions/pi-dream/runner.mjs`: tool lists, batch instructions, and finding-batch argument limit.
- Adjacent source, recovery, and extension tests: cache safety, scope, receipts, batches, and installed-Pi execution.
- `docs/pi-dream.md`: implemented tools, source reuse, limits, and validation commands.

## Risks and edge cases

- Cached data must not hide source changes. Keep metadata checks on every reuse and full hashes at runner boundaries.
- File replacement, same-size edits, restored modification times, and symlinks must stop reuse.
- Extraction must not see another session or alter shared cached data.
- Batch output must remain bounded. Deferred requests need another call and must not count as reviewed evidence.
- A failed input must not hide successful findings or receipts. Return explicit results for every input.
- Existing saved review records must remain valid. Do not change record formats or input hashes.
- Faster tools do not guarantee faster model decisions or completion within one hour.

## Validation / testing

- Measure repeated source operations before editing. Use the retained snapshot read-only.
- Confirm reuse returns the same frozen source object without another parse.
- Reject source changes, replacement, symlinks, and invalid hashes after a warm load.
- Compare batched searches and reads with single-operation results and pagination.
- Check output budgets, partial errors, deferred receipts, and extraction isolation.
- Check finding IDs, exact-entry evidence, partial failures, and bounded arguments.
- Run an installed Pi workflow with a local fixed-response provider using the new tools.
- Validate the latest failed attempt read-only. Preserve all 160 outcomes and five edits.
- Run adjacent tests, syntax checks, `git diff --check`, and `pre-commit run --all-files`.

## Step-by-step execution checklist

- [x] Inspect the failed attempt and record the approved scope.
- [x] Implement source reuse and batch tools with focused tests.
- [x] Measure local speed, check resume compatibility, and run full validation.
- [x] Update documentation and report results and limits.

## Results

Eight searches against the retained source snapshot returned identical results before and after the change:

| Method | Elapsed time |
| --- | --- |
| Reload the snapshot for each search | 9,545 ms |
| Reuse the snapshot, including its first load | 1,899 ms |
| Reuse an already loaded snapshot | 647 ms |
| One batch against the loaded snapshot | 593 ms |

These measurements cover local source operations, not model response time. They do not guarantee completion within one hour.

Read-only recovery validation passed for `attempt-ht7dkB` in 44.426 seconds. It retained 160 outcomes, 174 findings, five edits, 396 source reads, and 1,016 searches. The saved records stayed unchanged.

All 66 Node tests passed. The extension suite passed with the installed Pi CLI and a local provider that returns fixed responses. The batch workflow completed searches, reads, findings, outcomes, and the final comparison. Source and runner syntax checks passed. `git diff --check` and `pre-commit run --all-files` passed after documentation review.

No live job resumed. No installation, reload, paid model call, or accepted-memory change occurred. Parallel evidence workers remain outside this change.

## Open questions / assumptions

- The user approved source reuse and batching. Parallel evidence workers remain conditional and are not part of this change.
- The user will resume the job. Do not start a paid model call, reload Pi, or change accepted memory.
- File metadata detects normal local changes. Full hashes remain the final authority before publication.
- The one-hour limit remains per attempt. Existing explicit resume retains valid completed work.
