# Plan: Amnesia observational memory

**Completed: 2026-10-17**

## Brief

Amnesia currently saves the conversation transcript but ignores Observational Memory records. Save those records in separate database columns so compaction does not hide them from later memory retrieval. Prioritize reliable saving, then expose the saved records in search results.

## Current state / relevant context

- `skills/amnesia/save.py` handles session export, SQLite storage, embeddings, and query output.
- `skills/amnesia/test_save.py` uses direct assertions and temporary session files.
- The installed skill scripts resolve to this repository. No installation change is needed.
- Existing databases have no observations or reflections columns.
- OM V3 records observations and reflections as custom entries on the session branch.
- OM records preserve identifiers and source links. Dropping an observation does not delete its original record.
- The repository contains an unrelated untracked plan. Leave it untouched.

## Proposed implementation

Add `reflections` and `observations` as SQLite TEXT columns containing JSON arrays. Preserve each record's fields, including identifiers and source links. Save all recorded items on the active branch, not abandoned branches. Mark archived observations with their dropped status rather than discarding them.

Read the session once during saving. Derive the transcript and OM records from the same branch snapshot. Keep the existing transcript export interface for its current callers.

Add missing columns automatically when an existing database opens. Preserve existing rows and do not backfill or rewrite the live database during implementation.

Include the saved records in ordinary and full query output. Include their text in embeddings for newly saved memories. Existing embeddings remain unchanged until those memories are saved again.

Use only existing dependencies. Do not generate new observations or reflections, invoke OM workers, or save the current conversation without a separate request.

## File-by-file impact

- `skills/amnesia/save.py`: additive schema updates, OM extraction, saving, embeddings, and retrieval output.
- `skills/amnesia/test_save.py`: extraction, branch isolation, schema upgrades, save/update, missing-memory, and query assertions.
- `skills/amnesia/SKILL.md`: automatic saving and retrieval behavior, including historical-data safety.
- `skills/amnesia/README.md`: schema, archived metadata, compatibility, and validation commands.
- `docs/README.md`: link to the existing Amnesia documentation.
- `plans/amnesia-observational-memory-plan.md`: decisions and validation results.

## Risks and edge cases

- Old databases need an additive upgrade. Reopening them must not duplicate columns or lose rows.
- Sessions without OM records must still save successfully with empty arrays.
- Abandoned branches and duplicate memory identifiers must not pollute the saved snapshot.
- Dropped observations remain historical evidence, not active instructions. Preserve their dropped status.
- Invalid OM payloads must fail saving clearly rather than silently lose requested records.
- Existing summary-only embeddings cannot discover newly added fields until the memory is saved again.
- Model workers can append records after the script reads the session. This save captures only records already persisted in its snapshot.

## Validation / testing

Success requires:

1. Both JSON columns preserve recorded OM data and provenance during initial saving and updates.
2. Old databases upgrade automatically without changing their existing memory content.
3. Normal and full queries return the saved records, and new embeddings include their text.
4. Sessions without OM records and the existing `/sum` transcript filter keep working.
5. Branch isolation, duplicate handling, dropped status, and malformed input have focused tests.
6. A real CLI save/query round trip succeeds against a temporary database and synthetic session.
7. `git diff --check` and `pre-commit run --all-files` pass.

## Step-by-step execution checklist

- [x] Inspect storage, callers, tests, documentation, and OM ledger types.
- [x] Run the existing test before editing.
- [x] Add save-first tests for extraction, additive upgrades, and persistence.
- [x] Implement saving and then retrieval.
- [x] Run focused tests and a temporary CLI round trip.
- [x] Delegate affected documentation updates after implementation.
- [x] Run repository hygiene checks and review the final diff.

## Validation results

- The original session-export test passed before editing.
- The new save-first tests failed before implementation, then passed after implementation.
- Direct assertions cover branch isolation, duplicate records, dropped observations, malformed payloads, database upgrades, save updates, and query output.
- A real CLI save/query round trip passed with sqlite-vec and the cached embedding model against a temporary database.
- Focused Ruff checks passed. Six pre-existing broad-exception warnings remain outside this change.
- `git diff --check` and `pre-commit run --all-files` passed.
- Documentation changes were delegated and reviewed. The existing documentation index links to the skill README.
- The installed Amnesia script resolves to the edited repository file. No reinstall is needed.
- The live database retained its original schema throughout validation. No real conversation was saved or backfilled.

## Open questions / assumptions

- Use the standard column spelling `reflections`, matching OM terminology.
- Archive all recorded items from the active branch, including observations later dropped from active memory.
- Store JSON instead of flattened prose to retain source links and unknown record fields.
- Existing saved conversations are not backfilled automatically.
- The direct request to modify Amnesia approves this bounded implementation.
