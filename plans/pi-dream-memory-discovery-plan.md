# Dream memory discovery

**Status: Deferred by user decision on 2026-11-03.**

## Brief

Keep the memory file list in the prompt while the store is small. When the store reaches hundreds of files, show the files read most often. Add an `INDEX.md` directive to help the assistant discover the remaining files. The user chose to defer this work until needed.

## Current state / relevant context

`before_agent_start` adds the memory folder, file paths, and descriptions to the prompt. The list includes at most 100 files and 12,000 characters. It does not include file contents. The assistant uses normal file commands to search and read memory.

Pi Dream does not track how often the assistant reads each file. The current list does not rank files by use. Files outside the list remain available through normal file commands.

## Proposed implementation

Keep the current behavior unchanged now. Do not add read tracking or create `INDEX.md` yet.

When the store grows to hundreds of files:

1. Select the files read most often for the prompt list.
2. Add a directive to consult `INDEX.md` for other memories.
3. Keep normal file commands for searches and reads.
4. Keep memory changes within the existing review process.

Decide how to measure reads before implementation. Normal file commands do not provide a reliable count of memory reads.

## File-by-file impact

- `extensions/pi-dream/index.ts`: later select frequent files and add the index directive.
- `extensions/pi-dream/pi-dream.test.ts`: later cover small stores, selection, and index discovery.
- `docs/pi-dream.md`: later document the implemented behavior.
- This plan: record the deferred decision without changing runtime behavior.

## Risks and edge cases

- The current limits can omit useful files from the prompt list.
- A new file has no read history but can still contain useful facts.
- An outdated index can omit accepted memories.
- A directive cannot guarantee that the assistant reads the index.
- Reading the entire index every turn can remove the expected reduction in prompt size.

## Validation / testing

For this decision record, run `git diff --check` and `pre-commit run --all-files`. Do not change source files, live memory, or settings.

Before future implementation, define the selection rules and expected behavior. Test that small stores keep their file list. Test that large stores show frequent files and the index directive. Verify discovery through normal file commands in an isolated Pi run.

## Step-by-step execution checklist

1. [x] Confirm that the user wants to defer the larger-folder behavior.
2. [x] Record the decision without changing runtime behavior.
3. [ ] Select a file-count threshold and a read measurement method when needed.
4. [ ] Implement and verify frequent-file selection and index discovery.
5. [ ] Document the implemented behavior.

## Open questions / assumptions

The exact file-count threshold, prompt list size, and read measurement method remain open. Decide how to create and update `INDEX.md` when implementation starts. Do not add a database, a dedicated memory tool, or new tracking now.
