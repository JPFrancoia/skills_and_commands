# Amnesia staged retrieval plan

**Status:** Completed
**Created:** 2026-11-02
**Completed:** 2026-11-02

## Brief

Amnesia always returns the nearest memories, including weak matches. It can load transcripts before the agent selects one memory.

Add a minimum score and a staged flow. This flow reveals only the context that the current task needs.

## Current state / relevant context

- `skills/amnesia/save.py` provides `save`, `query`, and `init` commands.
- `query` returns the nearest `k` vectors without a minimum score.
- `query --full` prints every selected transcript.
- Query output also prints complete Observational Memory records.
- Stored summaries, transcripts, reflections, observations, and embeddings need no schema change.
- The local score uses `exp(-distance) * 100`.
- Local checks gave 35.8 for an exact stored title and less than 29 for an unrelated query.
- The repository has unrelated untracked files. This work will not modify them.

## Proposed implementation

Set a fixed minimum score of 35.0. Filter query results below this score. If no result remains, print `No relevant memories found.`

Make retrieval explicit and ordered:

1. `query "terms"` returns the memory ID, title, score, date, directory, and a short summary preview.
2. `summary MEMORY_ID` returns only the stored summary for that exact ID.
3. `passages MEMORY_ID "terms"` returns a small set of matching transcript passages.

Remove `--full` from the query command and the agent instructions. Split transcripts at saved role markers.

Rank passages by exact phrase and word overlap. Limit each excerpt to 1,200 characters. Return three passages by default.

Keep Observational Memory records in storage and embeddings. Do not print them during staged retrieval. Add no dependencies and make no database changes.

## File-by-file impact

- `skills/amnesia/save.py`: add score filtering, exact summary lookup, bounded passage lookup, and command parsing.
- `skills/amnesia/test_save.py`: cover weak-result filtering, summary lookup, passage ranking, output bounds, and missing records.
- `skills/amnesia/SKILL.md`: document the required staged flow and historical-data safety.
- `skills/amnesia/README.md`: document the new commands, minimum score, and output limits.
- `plans/amnesia-staged-retrieval-plan.md`: record decisions and validation results.

## Risks and edge cases

- A score of 35.0 can hide a useful weak match. The value is a calibrated starting point, not a universal similarity percentage.
- Existing embeddings include Observational Memory text. A match can still come from stored metadata that the preview does not show.
- Passage lookup uses word overlap, not semantic embeddings. The caller must use concrete terms from the missing fact.
- A transcript can contain long messages. Excerpts must stay within the fixed character limit.
- Removing `query --full` changes the command interface. The new exact-ID commands replace that path.
- Empty transcripts and unknown memory IDs must return clear errors without changing stored data.

## Validation / testing

Success requires:

1. Query results below 35.0 do not appear.
2. Queries with no accepted result print `No relevant memories found.`
3. Query output contains only short previews and metadata.
4. Summary lookup returns one exact memory summary by ID.
5. Passage lookup returns only matching, bounded excerpts from one exact memory.
6. Existing save, schema upgrade, session export, and Observational Memory storage tests still pass.
7. A temporary CLI flow succeeds for `query`, `summary`, and `passages`.
8. `git diff --check` and `pre-commit run --all-files` pass.

## Step-by-step execution checklist

- [x] Inspect the current code, callers, tests, docs, and local score ranges.
- [x] Add focused tests for the staged retrieval behavior.
- [x] Implement score filtering and exact-ID retrieval commands.
- [x] Update the skill and README instructions.
- [x] Run focused tests and a temporary CLI flow.
- [x] Run repository hygiene checks and review the final diff.
- [x] Record validation results and mark this plan complete.

## Validation results

- The original Amnesia test passed before the change.
- The updated focused test and Python compile check passed.
- A temporary CLI flow passed for `save`, `query`, `summary`, and `passages`.
- The CLI query accepted the test memory with a score of 54.3.
- `git diff --check` passed.
- `pre-commit run --all-files` passed.
- Ruff passed when it ignored six existing broad-exception warnings in `save.py`.
- The full Ruff run reported only those six existing warnings.

## Open questions / assumptions

- Use 35.0 as the minimum score because an exact local title scored 35.8 and unrelated text scored less than 29.
- Use exact memory IDs after search. Do not repeat semantic search for later stages.
- Use word overlap for passage lookup to avoid a second embedding pass and new storage.
- Return three passages by default. Each excerpt has a maximum length of 1,200 characters.
- The approved request permits removal of `query --full` from the normal interface.
