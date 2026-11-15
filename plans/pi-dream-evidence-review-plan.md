# Plan: Pi Dream evidence and targeted review

## Brief

Pi Dream must check proposed notes against source messages before it uses them as evidence. Workers need read-only source access to inspect missing context. A separate command will check selected memory files without processing new sessions.

The user approved implementation of recommendations 1, 2, and 3 on 2026-11-15. Quality evaluations remain outside this change.

## Current state / relevant context

- `index.ts` exports shortened transcripts and records notes without a source entry.
- `runner.mjs` treats notes as high confidence and uses their statements as evidence.
- Both evidence validators check entry IDs and quotes separately. An isolated reproduction accepted an assistant quote under a user entry.
- Consolidation cannot read transcripts or record additional source-backed findings.
- Normal batches skip consolidation when no findings exist.
- Review branches and explicit apply approval already protect accepted memory.

## Proposed implementation

1. Record the current source entry with each new note. Treat all notes as unverified leads. Reject note IDs as support for memory edits.
2. Store structured, redacted source messages beside each new job. Keep complete available text and tool arguments, but exclude thinking, system messages, and extension state.
3. Share exact-entry quote validation between workers and the runner. Preserve source roles and timestamps in findings.
4. Add bounded source search and entry reading tools. Workers receive only job snapshots, not arbitrary file access. Consolidation can record findings after checking sources.
5. Add `/dream-check <file.md> [file.md ...]`. Reuse accepted job evidence for the selected files. Always run consolidation, even without new findings. Restrict edits to selected files.
6. Report missing sources and missing local Markdown link targets. Ask the worker to check contradictions and duplicates. Save its report with the review diff.

This approach reuses the existing worker, candidate, branch, resume, and apply paths. It avoids another database, automatic scheduling, unrestricted tools, and parallel memory writers.

## File-by-file impact

- `extensions/pi-dream/sources.mjs`: structured source snapshots, legacy transcript parsing, exact-entry validation, bounded search and reads.
- `extensions/pi-dream/index.ts`: source capture, note anchors, targeted check command, source collection, review report display.
- `extensions/pi-dream/worker-extension.ts`: source tools, additional findings during consolidation, note rejection, selected-file edit limits.
- `extensions/pi-dream/runner.mjs`: shared validation, revised prompts, source integrity, isolated findings, review execution and reports.
- `extensions/pi-dream/store.mjs`: retain optional note anchors and preserve older notes.
- Adjacent tests: evidence attribution, source boundaries, note handling, targeted checks, resume, and approval.
- `docs/pi-dream.md`: implemented tools, command, source limits, and review workflow.

## Risks and edge cases

- Old jobs contain shortened Markdown transcripts. Label these sources as limited. Do not claim that missing text was recovered.
- A missing or abandoned note entry supplies no proof. Keep uncertainty explicit.
- A quote proves what a message says, not whether its claim is true. Prompts must distinguish user statements, tool observations, and assistant conclusions.
- Source messages remain untrusted data. Keep redaction and tool restrictions.
- Source snapshots can be large. Bound each tool response and provide paging.
- A targeted check must not reserve or mark historical sessions as newly processed.
- Missing evidence does not prove that accepted memory is wrong. Preserve unsupported facts and report the gap.
- Only selected files can change. Reading other memory files remains necessary for duplicate and link checks.
- Historical evidence can come from several projects. Confirmation must disclose source counts and the worker provider.

## Validation / testing

- Reject quotes from another entry and entry IDs that only match a prefix.
- Preserve redaction before clipping. Retrieve text from the middle of a long tool result.
- Reject unknown sessions, entries, invalid offsets, malformed sources, and source file changes.
- Retain source roles and timestamps. Exclude private reasoning and system data.
- Reject note-only evidence. Accept a new finding only with exact source quotes.
- Check selected files with no new sessions. Preserve unselected files and accepted `master` until apply.
- Report missing source coverage and missing local `.md` targets.
- Resume completed work without losing additional findings or accepting changed sources.
- Run extension tests, recovery tests, new source tests, syntax checks, `git diff --check`, and `pre-commit run --all-files`.
- Exercise registered commands and real worker tools with isolated repositories and a deterministic worker. Report any live-model validation limit.

## Step-by-step execution checklist

- [x] Inspect implementation, examples, Pi APIs, and existing tests. Record the approved scope.
- [x] Implement note anchors, structured sources, and shared evidence validation. Pass focused checks.
- [x] Add bounded source tools and source-backed consolidation findings. Pass worker and recovery checks.
- [x] Add targeted checks and reports. Verify selected-file limits and existing approval behavior.
- [x] Update documentation. Run all relevant checks and inspect the final diff.

## Validation results

- The extension tests passed through Pi's installed jiti loader.
- All 8 source tests and all 23 recovery tests passed.
- Registered-command tests used real worker tools with a deterministic worker and isolated Git repositories.
- The tests covered selected-file limits, manual apply, retained findings, and publication retry.
- Node syntax checks, `git diff --check`, and `pre-commit run --all-files` passed.
- No live model evaluation, installation, or reload ran. Human review still checks whether evidence supports each claim.

## Open questions / assumptions

- No blocking product question remains. The direct implementation request approves this scope.
- `/dream-review` keeps its existing meaning. `/dream-check` starts a new targeted job.
- Command arguments are explicit relative Markdown paths separated by whitespace. No directory-wide or automatic review is added.
- Targeted checks use retained evidence from accepted jobs, not a fresh scan of every session.
- Missing local Markdown file targets are checked. External URLs and heading anchors are outside this change.
- Human review remains the final check for semantic truth and cleanup edits.
