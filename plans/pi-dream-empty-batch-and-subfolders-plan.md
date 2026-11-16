# Plan: Stop empty Dream batches, state the purpose of memory, and add `/dream --all`

## Brief

Two Dream batches on 2026-11-11 changed no memory, because the Markdown formatter was not installed. Both batches were applied, so 20 sessions and 12 notes left the queue without use. This change stops a batch before it starts when the formatter is missing. It also shows the changed file count before apply, gives workers the purpose of memory, and adds `/dream --all` for sessions in sub-folders.

## Current state / relevant context

- `dream_memory_edit` formats each write with Prettier. `formatMarkdown` in `format-memory.mjs` loads Prettier at the time of the write.
- `extensions/pi-dream/node_modules` did not exist on this machine. Each write failed with `The Markdown formatter is unavailable. Run npm ci in the pi-dream package directory.`
- The consolidate worker reported the failure in text and stopped normally. `successfulEnd` in `runner.mjs` accepts `stopReason === "stop"`, so the job became `ready` with an empty commit.
- The `/dream-apply` confirmation showed only the job ID. Apply marks sessions as processed and deletes notes, also for an empty batch.
- `extractPrompt` and `consolidatePrompt` exclude temporary details. They do not tell a worker to skip state that a session can look up.
- `/dream` selects sessions with `SessionManager.list(ctx.cwd)`, which returns the exact working directory only. On this machine, sub-folders of `~/projects` had more than 100 sessions that no batch could select.

## Proposed implementation

1. Export `loadFormatter()` from `format-memory.mjs`. Call it at the start of `/dream`, `/dream-check`, and `/dream-resume`, before the confirmation and before a job folder exists.
2. Add `applySummary()` to `index.ts`. It adds one line to the `/dream-apply` confirmation: the number of changed memory files, or a warning that the job changes no file.
3. Add two purpose sentences (`MEMORY_PURPOSE`) to `extractPrompt` and `consolidatePrompt`.
4. Add `parseDreamArgs()` to `index.ts`. With `--all`, `/dream` uses `SessionManager.listAll()` and keeps sessions whose working directory is the batch folder or a folder in it. It also takes notes from sub-folders.

Alternatives that were not selected:

- Fail the job when the consolidate worker makes no write. A batch can correctly have no change, so this rule gives false failures.
- Fail the job when a `dream_memory_edit` call fails. Hash mismatches are normal and the worker repeats those calls.
- Add a rule list for what to record. The Anthropic article "The components of agent memory" reports that fixed rules decreased the benefit of memory for strong models. A purpose statement is the smaller change.
- Make sub-folders the default for `/dream`. This changes which provider receives which sessions without a user decision.

## File-by-file impact

- `extensions/pi-dream/format-memory.mjs`: new export `loadFormatter`. The main-module test now uses `realpathSync`, because Node gives the real path in `import.meta.url`.
- `extensions/pi-dream/index.ts`: `parseDreamArgs`, the formatter check in three commands, the sub-folder selection, `applySummary`, and the command description.
- `extensions/pi-dream/runner.mjs`: `MEMORY_PURPOSE` in two prompts. `extractPrompt` is in `__test__`.
- `extensions/pi-dream/pi-dream.test.ts`: tests for each change.
- `docs/pi-dream.md`: the new option, the formatter check, and the apply confirmation.
- Live state in `~/.pi/agent/dreams` (one-time repair, not in this repository).

## Risks and edge cases

- `--all` sends sessions from more projects to the worker provider. The confirmation names the folder and "its sub-folders" and shows the counts.
- A sibling folder with the same prefix, such as `~/projects-old`, must not match `~/projects`. `scopeMatches` compares complete path segments.
- A scope line must name the batch folder or a parent folder. A `--all` batch from `~/projects` cannot write a file with `scope: ~/projects/cerberus`.
- The count limit (default 10, maximum 100) also applies with `--all`. More than one batch is necessary for a large backlog.
- The formatter check proves that Prettier loads in the host process. Workers load the same package folder, so the result applies to them.
- `applySummary` is read-only and returns no line if Git fails. Apply then continues as before.
- The purpose sentences can decrease the number of findings. No live batch measured this effect.

## Validation / testing

- Formatter check: in a copy of the package without `node_modules`, `/dream`, `/dream --all`, and `/dream-check --all` reject with the `npm ci` message. No confirmation occurs and no Dream folder exists afterward.
- Apply confirmation: an empty job shows `This job changes no memory file.` with the session and note counts. A job with one changed file shows `This job changes 1 memory file(s).`
- Prompts: both prompts contain the two purpose sentences.
- `--all`: with one exact session, one sub-folder session, one sibling session, and one parent session, `/dream` proposes 1 session and `/dream --all` proposes 2. `--all` also adds the sub-folder note. The count limit applies.
- Argument parser: `--all` in each position, the default count, the maximum, and two invalid inputs.

## Step-by-step execution checklist

- [x] Run `npm ci --prefix extensions/pi-dream`. Prettier 3.8.1 loads from the package folder.
- [x] Repair live state under the state lock. A backup is in `~/.pi/agent/dreams/state.json.before-restore-2026-11-16`.
- [x] Add the formatter check to `/dream`, `/dream-check`, and `/dream-resume`.
- [x] Show the changed file count in the `/dream-apply` confirmation.
- [x] Add the purpose sentences to both worker prompts.
- [x] Add `/dream --all`.
- [x] Add tests and run all suites.
- [x] Update `docs/pi-dream.md`.

## Validation results

Completed on 2026-11-16. No source or memory commit ran.

- `pi-dream.test.ts` passed through the host `jiti` loader.
- `review.test.mjs`, `recovery.test.mjs`, and `sources.test.mjs`: 73 of 73 tests passed in most runs.
- Some recovery tests fail intermittently on this machine. They use time limits of 300 ms to 500 ms. In an alternating comparison of 12 runs each, the committed code failed 1 run and the changed code failed 1 run. The machine load was 6 to 9. This change does not touch those tests.
- Before this change, `pi-dream.test.ts` failed on macOS at the missing-formatter test. `$TMPDIR` is a symbolic link, so `format-memory.mjs` did not detect that it was the main module and did nothing. The `realpathSync` change corrects this.
- `git diff --check` passed.
- `pre-commit run --all-files` did not run. The `gitleaks` hook cannot install, because the Go module proxy returns `403 Forbidden`.
- Live repair: `processed` went from 323 to 303 session IDs. All 12 notes are in the inbox again and load as valid.
- Read-only preview on live data for `~/projects`: `/dream` can select 36 sessions, and `/dream --all` can select 154.
- No live batch ran. No paid model call occurred. Open Pi sessions need `/reload` to load the new code.

## Open questions / assumptions

- The user approved the three items and named the option `/dream --all`.
- `--all` keeps the count limit. It does not mean "all sessions in one batch".
- The two empty jobs keep the state `applied`. Their empty commits stay in `master` history. `reconcileJobs` reads only `ready` jobs, so it does not mark the released sessions again.
- The intermittent recovery tests are a separate subject and are not changed here.
