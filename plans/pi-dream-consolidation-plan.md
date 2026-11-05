# Plan: Pi Dream Consolidation

**Completed: 2026-11-05** (documentation update delegated to `docs-maintainer`)

## Brief

Pi Dream workers read one session each and edit shared memory directly. No step looks across sessions, so Pi Dream cannot find patterns that repeat, and memory only grows. This change adds a consolidation step that sees all findings from a batch. It also makes transcripts smaller, keeps tool calls as evidence, and makes the prompt index smaller and scoped to the project.

In-band memory writes are out of scope. They come in a later change.

## Current state / relevant context

- `runner.mjs` runs one worker per session in waves of up to 10. The slowest worker in a wave blocks the next wave.
- Each worker edits the shared candidate store with `dream_memory_edit`. Evidence is transcript quotes.
- `buildTranscript()` keeps only `text` parts. It drops tool calls but keeps full tool results. In the last batch, tool results were 13.2 MB of 14.2 MB.
- The last batch changed 44 files: 1,237 insertions and 56 deletions. The store has 75 files and 752 KB.
- The full index needs 40,729 characters. The 12,000-character limit fits 21 of 75 files. Long descriptions cause this.
- Every session sees all memory, whatever its working directory.
- `docs/CONTEXT.md` does not exist.

## Proposed implementation

### 1. Two phases in each batch

**Extract phase.** One worker runs for each session. It has read-only memory tools and a new `dream_finding` tool. It records findings and does not edit memory. A finding is one claim with a kind, a short subject, a statement, an optional related memory path, and transcript evidence. The harness checks each quote against the transcript. Each worker writes its own `findings.jsonl` file, so it needs no lock.

Finding kinds: `fact`, `preference`, `correction`, `procedure`, `failure`, `stale`.

**Consolidate phase.** The runner merges worker findings into `<job>/findings.jsonl` and gives each finding a short ID (`f1`, `f2`, ...). One orchestrator worker then reads all findings and the current store. The prompt groups findings by subject and shows the number of sessions for each group. The orchestrator merges, adds, replaces, prunes, and shortens memory with `dream_memory_edit`.

Each edit lists the `findingIds` that support it. The harness rejects unknown IDs. It copies session IDs and quotes from the findings into `writes.jsonl`, so the review shows how many sessions support each change. An edit with no findings is a cleanup edit. The prompt allows cleanup edits only to merge, shorten, move, or delete existing content. Human review checks this.

If no worker records a finding, the runner skips the consolidate phase.

The hash check, lock, review branch, and apply flow stay the same.

### 2. Worker pool

Replace waves with a pool of up to 10 workers. A new worker starts when any worker finishes. After a failure, the pool starts no new worker, waits for running workers, and fails the job.

The job state gets a `phase` field: `extract` or `consolidate`. `/dream-status` shows it. The compact status label stays the same.

### 3. Smaller transcripts with tool calls

- Assistant tool calls appear as `[tool call <name>] <JSON arguments>`. Arguments over 500 characters are cut.
- Tool result headers show the tool name and `error` when the result failed.
- A normal tool result keeps its first and last 500 characters.
- Deviation: the first version used 1,000 characters for both limits. On the 82 sessions of the last real batch, that cut transcripts only from 14.2 MB to 9.4 MB. The 500-character limits cut them to 6.9 MB. A 300-character argument limit saved only 0.4 MB more.
- An error result keeps its first and last 4,000 characters. Deviation: the review suggested full errors. A limit prevents very large error output.
- User and assistant text stays complete.

### 4. Short descriptions

`dream_memory_edit` rejects a written file whose description is longer than 150 characters. Reads, the index, and publication still accept existing long descriptions, so accepted memory does not disappear. The consolidate prompt lists files with long descriptions and asks the orchestrator to shorten them.

The index cuts any description over 150 characters. When files do not fit the limit, the index adds one line with the number of hidden files and a search command.

### 5. Project scope

A memory file can declare `scope: ~/path/to/project` in its front matter. The index shows a scoped file only when the session working directory is that folder or inside it. Files without `scope` appear everywhere. Existing files have no scope, so they stay visible until a dream adds one. `dream_memory_edit` accepts only a scope that starts with `~/` or `/`.

This replaces the earlier `global/` and `projects/<cwd-slug>/` folder suggestion. A front matter path matches subfolders without ambiguous slugs.

## File-by-file impact

- `extensions/pi-dream/store.mjs`: parse `scope` in front matter.
- `extensions/pi-dream/worker-extension.ts`: `dream_finding` tool, finding-based edits, description and scope checks, `scope` and `bytes` in the list output.
- `extensions/pi-dream/runner.mjs`: two phases, worker pool, finding merge, consolidate prompt, phase state.
- `extensions/pi-dream/index.ts`: smaller transcripts with tool calls, scoped index with overflow line, review table for finding-based records, phase in status.
- `extensions/pi-dream/pi-dream.test.ts`: cover the new behavior and update edit tests.
- `docs/pi-dream.md`: describe the implemented behavior.

## Risks and edge cases

- The orchestrator gets one context for the whole batch. Findings are compact, but 100 sessions can produce a large prompt. Statements and quotes have length limits.
- The orchestrator can add facts in a cleanup edit. Human review is the guard.
- Cut tool results can lose a fact. Evidence quotes must come from the kept text.
- A wrong `scope` hides a file in other projects. Review shows the front matter diff.
- Old jobs have edit records with one `sessionId`. The review table must still read them.

## Validation / testing

- Unit tests: tool calls and cuts in transcripts, finding validation, finding-based edits, description and scope checks, scoped index and overflow line.
- Runner tests with fake `pi` binaries: pool concurrency, finding merge with IDs, consolidate prompt with session counts, skip when no findings.
- Measure a real transcript before and after the change.
- Measure the real index size for this repository and for `~/projects`.
- Run the adjacent test file, `git diff --check`, and `pre-commit run --all-files`.

## Step-by-step execution checklist

- [x] Shrink transcripts and keep tool calls.
- [x] Add findings, finding-based edits, and description and scope checks.
- [x] Add the two-phase runner and worker pool.
- [x] Scope and limit the index.
- [x] Update tests and run checks. `pre-commit` could not install `gitleaks`: the Go module proxy returned `403 Forbidden`.
- [x] Update `docs/pi-dream.md` (delegated to `docs-maintainer`, reviewed).

## Results

- Transcripts of the last real batch: 14.2 MB before, 6.9 MB after. Tool calls are now in the transcript.
- Prompt index for the current store: 21 of 75 files listed before, 63 of 75 after. One line names the hidden file count.
- A real `pi` run on two synthetic sessions with the same failure gave 3 findings under one subject. The consolidation step wrote one scoped file that cites both sessions.

## Follow-up fixes after the first real batch

The first real batch ran on 10 sessions from `~/projects`. It gave 59 findings and 11 files. Two problems occurred:

1. The orchestrator gave 4 files a subfolder scope, for example `scope: ~/projects/diagrams`. The index for `~/projects` did not show these files.
2. All 59 findings had different subjects. Each group showed `(1 session(s))`, so the session counts had no value.

Fixes:

- `dream_memory_edit` rejects a scope that does not contain the batch working directory. The runner gives this folder to the consolidate worker in `PI_DREAM_CWD`. The prompt names the folder.
- `scopeMatches` moved to `store.mjs`. The index and the edit check use the same function.
- Findings with the same `memoryPath` form one group. Other findings form groups by subject.
- The extract prompt asks for subjects in the form `<project or tool> <topic>`. The consolidate prompt asks for one file for each project or tool.

The second real batch showed two more problems:

1. The orchestrator wrote `scope: ~/projects/diagrams` in the file body. Pi Dream reads scope only from the front matter, so the scope check did not run.
2. The orchestrator sent `""` and `none` as the expected hash for new files. Each call failed.

Fixes:

- `dream_memory_edit` rejects a file when its first body line starts with `scope:` or `description:`.
- `dream_memory_edit` reads `""` and `none` as `missing`. An existing file still needs its real hash.
- The `expectedHash` parameter description and the consolidate prompt name `missing` for new files.

## Open questions / assumptions

- Assumption: the orchestrator uses the same model and the `high` thinking level as the extract workers.
- Assumption: the consolidate phase gets a 60-minute timeout. The extract workers keep 30 minutes.
- Assumption: 150 characters is enough for a useful description.
