# Plan: Pi Dream in-band notes and merge on apply

## Brief

Pi learns only from finished sessions during a batch. A session cannot save a fact for the next session. This change gives normal sessions a `dream_note` tool. The agent calls it on its own when it finds a durable fact. The note goes to an inbox outside the memory repository. Every new session sees the pending notes next to the memory index. The next `/dream` batch merges the notes into the memory files. The user still confirms each apply.

Batches from different folders can run at the same time. Today a batch ends on a branch, and `/dream-apply` fails when `master` moved. This change makes `/dream-apply` merge `master` into the batch. Git does clean merges. A worker resolves text conflicts.

This follows the Anthropic design: in-band writes give a short time to effect, and dreaming removes duplicates and wrong writes. The note tool keeps the in-band cost at one tool call.

## Current state / relevant context

- `index.ts` `startDream()` snapshots `master` into `<job>/candidate` and records `base.baseCommit` in the manifest. `SessionManager.list(ctx.cwd)` gives the sessions. A batch with zero sessions stops.
- `runner.mjs` runs extract workers, then one consolidate worker on a copy of the candidate. `mergeFindings()` gives ids `f1..fN`. `validateFindings()` requires one to three evidence quotes that appear in the transcript. `runJob()` skips consolidate when there are no findings.
- `publishJob()` in `store.mjs` commits the candidate tree with parent `base.baseCommit` on `refs/heads/dream/<job-id>`.
- `applyReviewBranch()` runs `git merge --ff-only` and needs a clean working tree. `reviewJob()` writes `diff.md` for `base.baseCommit..publishedCommit`. `reconcileJobs()` marks a job as applied when `publishedCommit` is an ancestor of `master`.
- `worker-extension.ts` has `dream_finding` with kinds `fact`, `preference`, `correction`, `procedure`, `failure`, `stale`. Subject limit 80, statement limit 1000.
- Normal sessions get no Dream tool. `before_agent_start` injects a scoped memory index. The system prompt says `Do not change memory files unless the user explicitly asks.`
- `ctx.sessionManager.getSessionId()` is available in extensions.
- Git 2.54 is installed. `git merge-tree --write-tree` merges without a checkout. It returns exit code 1 and the conflicted paths on a conflict.

## Proposed implementation

### 1. The `dream_note` tool

`index.ts` registers `dream_note` in normal sessions. Parameters: `kind` (same kinds as `dream_finding`), `subject` (max 80), `statement` (max 1000), optional `memoryPath` (relative `.md` path). The tool writes one JSON file to `<dream home>/inbox/<note-id>.json` with `id`, `kind`, `subject`, `statement`, `memoryPath`, `sessionId`, `cwd`, and `createdAt`. The note id is the ISO time plus eight random characters, like a job id. The tool never touches the memory repository.

The system prompt section changes. New guidance: call `dream_note` when you learn a durable fact, preference, correction, or procedure that will help a future session. Do this after a user correction or at the end of a task. Do not note temporary details, task progress, or secrets. One note per fact. The line `Do not change memory files unless the user explicitly asks.` stays for the memory files.

`worker-extension.ts` exports `KINDS`, `SUBJECT_LIMIT`, and `STATEMENT_LIMIT` so both tools share them.

### 2. Other sessions see the inbox

`before_agent_start` loads the inbox. It keeps notes where `scopeMatches(ctx.cwd, note.cwd)` is true. It adds a section `Pending memory notes (not yet consolidated)` after the index. Each line shows the kind, the subject, and the statement. The section has a limit of 50 notes and 4000 characters, newest first. A note in this section is a proposal from a past session, not accepted memory.

### 3. Batches consume notes

`startDream()` selects available notes: scope matches `ctx.cwd` and no `queued`, `running`, or `ready` job holds the note id. It copies them to `<job>/notes.jsonl` and records `noteIds` in the manifest. A batch may run with zero sessions when notes exist. The confirm text shows both counts. The runner skips extract when there are no sessions.

`mergeFindings()` appends each note as a finding with `source: "note"`, `sessionId` from the note, and `evidence: [{ entryId: note.id, quote: note.statement }]`. `validateFindings()` skips the transcript check for `source: "note"`. The consolidate prompt says a note finding is a direct statement from a past session and has high confidence.

`reconcileJobs()` deletes the inbox files of an `applied` job. A `discarded` job leaves its notes in the inbox. `/dream-status` shows the pending note count.

Alternative rejected: direct edits of the memory files from the session. Each fact costs two or three tool calls in the main session. A background worker per note costs one worker run per fact. Both cost more than one note.

### 4. Merge on apply

After extract, the runner compares `master` with `base.baseCommit`. If `master` moved and no consolidate completion record exists, the runner deletes the candidate, snapshots `master` again, and writes the new `base` to `manifest.json`. Extract workers only read the candidate, so nothing is lost.

`/dream-apply` keeps the confirmation. After the confirmation:

1. Try `git merge --ff-only`. On success, finish as today.
2. Otherwise run `git merge-tree --write-tree -X diff3 master dream/<id>`. On a clean merge, commit the tree with parents `master` and the branch tip, move the branch, fast-forward, and finish.
3. On a conflict, set the job to `running` with `phase: "merge"` and start the runner with `--merge`. The runner snapshots the conflicted tree into `workers/merge/attempt-*/candidate`. Conflicted files keep their `diff3` markers. One worker runs with the consolidate tools and the job findings. The prompt lists the conflicted paths and says `master` holds newer accepted memory and the branch holds this batch. The worker must remove every marker and keep both sets of facts unless they contradict. The runner rejects any file with a line that starts with `<<<<<<< ` or `>>>>>>> `. It commits the resolved tree with the two parents, moves the branch, and sets the job to `ready`. The notification says `Merge resolved. Review with /dream-review and apply with /dream-apply.`

A merge commit with two parents lets `--ff-only` succeed on the next apply. `/dream-review` shows `git diff master dream/<id>`. `publishJob()` gains optional `parents` and a tree-ish base.

Alternative rejected: run consolidation again from the new `master`. It costs a full worker run and loses manual commits on the branch.

## File-by-file impact

- `extensions/pi-dream/store.mjs`: `createSnapshot()` accepts a tree-ish. `publishJob()` accepts `parents`. New `isAncestor()`, `mergeMaster()`, `loadNotes()`, `availableNotes()`. `reconcileJobs()` deletes consumed notes.
- `extensions/pi-dream/worker-extension.ts`: export `KINDS`, `SUBJECT_LIMIT`, `STATEMENT_LIMIT`. Accept a `source` field on findings.
- `extensions/pi-dream/runner.mjs`: candidate refresh, notes in `mergeFindings()`, validation bypass for notes, consolidate prompt line, `mergePrompt()`, marker check, `--merge` flag, `phase: "merge"`, zero-session batches.
- `extensions/pi-dream/index.ts`: `dream_note`, guidance, inbox section in `before_agent_start`, notes in `startDream()`, apply flow, review range, status counts.
- `extensions/pi-dream/pi-dream.test.ts`: new cases below.
- `docs/pi-dream.md`: note tool, guidance, inbox section, note consumption, merge on apply, review range.

## Risks and edge cases

- A session writes a wrong note. Other sessions see it as a proposal. Dreaming keeps it only when the evidence supports it. The user can delete the inbox file.
- Dreaming fixes only what the evidence shows. A wrong note with no contradiction becomes memory. Review at apply time catches it.
- The agent writes too many notes. The guidance limits notes to corrections and task ends. Tighten the guidance if this occurs.
- The merge worker resolves a conflict in a wrong way. The user reviews the diff before apply.
- A `=======` line is a valid Markdown heading underline. The marker check does not test that line.
- Two jobs from different folders can select the same global note. The reservation check under `.state-lock` stops the second one.
- The inbox grows when no batch runs. `/dream-status` shows the count.
- A merge crash after the worker and before the commit repeats the worker on `/dream-resume`.

## Validation / testing

Unit tests with the existing fake `pi` pattern:

- `dream_note` writes one inbox file with the session id and `cwd`. A statement over 1000 characters fails. An absolute `memoryPath` fails.
- `before_agent_start` shows a note for the same folder and hides a note for another folder. A note with `cwd: "~"` shows everywhere.
- A batch with zero sessions and one note runs, and the consolidate findings include the note with `source: "note"`.
- Two batches cannot hold the same note.
- An applied job removes its inbox files. A discarded job keeps them.
- `master` moves during extraction. The consolidate candidate has the new file and `manifest.json` has the new base.
- Two jobs touch different files. The second `/dream-apply` creates a two-parent commit and `master` moves to it.
- Two jobs change the same line. `/dream-apply` starts the merge worker. The fake worker writes a clean file. The job returns to `ready`. `/dream-review` shows the resolved diff. The next `/dream-apply` fast-forwards.
- A merge worker leaves `<<<<<<< ` in a file. The job fails with a clear error.

Manual check: one session calls `dream_note`. A new session shows the pending note. Two `/dream 3` batches from two folders run at the same time. Both apply after review.

Commands: the adjacent test file with the `jiti` loader, `node --test extensions/pi-dream/recovery.test.mjs`, `git diff --check`, `pre-commit run --all-files`.

## Step-by-step execution checklist

- [x] Add `dream_note`, the shared limits, and the guidance. Result: the note tests pass.
- [x] Add the inbox section in `before_agent_start`. Result: the scope tests pass.
- [x] Add note selection, `notes.jsonl`, zero-session batches, note findings, and inbox cleanup. Result: the batch tests pass.
- [x] Refresh the candidate before consolidation. Result: the moved-`master` test passes.
- [x] Add `mergeMaster()`, the apply flow, the merge worker, and the marker check. Result: the apply and merge tests pass.
- [x] Update `docs/pi-dream.md`. Result: the docs match the new tool and flows.
- [x] Run all checks and record results here.

Results on 2026-11-06:

- `pi-dream.test.ts` with the `jiti` loader: `pi-dream tests passed`.
- `node --test extensions/pi-dream/recovery.test.mjs`: 15 pass, 0 fail.
- `git diff --check`: clean.
- `SKIP=gitleaks pre-commit run --all-files`: no other hooks exist. `gitleaks` cannot install because the Go proxy returns `403 Forbidden`.
- The manual two-folder `/dream 3` check did not run in this session.

## Open questions / assumptions

Decisions recorded:

- The agent calls `dream_note` on its own when it finds a durable fact. No user request is necessary. (User, this session.)
- Notes go to an inbox. The memory files change only through a batch. (User, this session.)
- Other sessions see pending notes next to the memory index. (User, this session.)
- Apply stays manual with a confirmation. (User, this session.)

Assumptions:

- The merge worker uses the job model and the consolidate timeout.
- The inbox is `<dream home>/inbox` and follows `PI_DREAM_HOME`.
- A batch takes at most 100 notes.
- The inbox section in the prompt shows at most 50 notes and 4000 characters.
