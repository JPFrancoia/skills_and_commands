# Pi Dream review branches

**Completed: 2026-11-03**

## Brief

Users need to review proposed memory with normal Git tools from one fixed folder. Plain job folders isolate concurrent batches. Review branches keep proposals separate from accepted memory until the user merges them.

## Current state / relevant context

- Accepted memory uses `main`. The approved branch name is `master`.
- The runner creates a candidate clone and separate worker worktrees.
- Workers validate paths, file hashes, Markdown, and transcript evidence.
- The compact status label already shows counts without queued, running, or ready text.
- Existing ready jobs must remain reviewable and must not lose their candidate files.
- `docs/CONTEXT.md` does not exist.

## Proposed implementation

Use one accepted Git repository on `master`. Each new batch uses an ordinary `candidate/` folder under its job directory. Copy a recorded `master` snapshot into that folder. Do not create job repositories or worktrees.

Run up to three agents against each batch folder. Protect each hash check, edit, and evidence append with one batch lock. A stale edit fails and asks the agent to read the current file again.

Publish one completed batch commit through a private Git index. A private index is a separate file that records prepared file versions. Parent the commit to the recorded batch base. Create `dream/<job-id>` without changing `HEAD`, accepted files, or the normal index. Preserve tracked files outside the memory snapshot.

Users review and merge branches from the accepted memory folder. Detect ordinary manual merges by commit ancestry. Ancestry means that the accepted history includes the published batch commit. Mark those sessions as processed. Keep `/dream-apply` as a confirmed fast-forward shortcut. If branches diverge, require a manual merge rather than create conflicts through the command.

Use a short shared lock for session selection and processed-state updates. Reserve sessions through queued, running, and ready job manifests. Different batches can run concurrently without selecting the same sessions. Add optional job IDs to status, review, apply, and discard commands. Keep the latest job as the default.

Safely rename an existing local `main` branch to `master` when Dream next initializes that store. Refuse other checked-out branches or an existing conflicting `master`. Do not modify live memory during development. Existing jobs retain their original files. Publish legacy candidate commits when a ready legacy job is reviewed or applied.

## File-by-file impact

- `extensions/pi-dream/store.mjs`: shared locks, snapshot publication, branch validation, and job state helpers.
- `extensions/pi-dream/index.ts`: plain snapshots, job selection, reservations, manual merge reconciliation, and review commands.
- `extensions/pi-dream/worker-extension.ts`: batch locks for reads and edits, with existing validation unchanged.
- `extensions/pi-dream/runner.mjs`: parallel shared-folder workers and final branch publication.
- `extensions/pi-dream/pi-dream.test.ts`: focused regressions and complete isolated Git workflows.
- `docs/pi-dream.md`: implemented storage, branch review, manual merges, concurrency, and recovery.

## Risks and edge cases

- Concurrent agents can propose conflicting facts. Hash checks prevent lost file edits, not incorrect conclusions.
- Batches can diverge after another branch merges. Users resolve ordinary Git conflicts manually.
- Publication must preserve unrelated staged edits and must not include transcripts, logs, or symlinks.
- A process crash can leave a lock. Fail with a bounded timeout and require inspection before lock removal.
- Keep ready sessions reserved until acceptance or discard. Squash merges cannot prove acceptance through ancestry.
- A failed batch publishes no branch. Its files and logs remain available.
- A completed batch with no changes still gets a distinct commit for manual acceptance tracking.

## Validation / testing

Define success before edits:

1. New batch folders contain no `.git` and create no worktrees.
2. Parallel agents share a folder and reject stale edits without losing accepted writes.
3. Publication keeps `master`, accepted files, and the normal index unchanged, including existing staged edits.
4. Multiple branches preserve the correct base and merge independently.
5. Manual merges mark the correct sessions as processed without `/dream-apply`.
6. Concurrent selection excludes processed and reserved sessions.
7. Review, apply, discard, failure, legacy jobs, path safety, and evidence checks pass.
8. Large worker prompts and output retain the existing streaming behavior.

Run the adjacent Dream tests, Node syntax checks, a real isolated runner and Git merge workflow, `git diff --check`, and `pre-commit run --all-files`. Delegate affected documentation after implementation. Review its final diff.

## Step-by-step execution checklist

1. [x] Inspect existing code and confirm the approved scope.
2. [x] Add shared storage helpers and regression tests.
3. [x] Replace worktrees with locked shared batch folders.
4. [x] Add review branches, concurrent reservations, and merge tracking.
5. [x] Verify the isolated workflow and hygiene checks.
6. [x] Update documentation and record results.

## Results

- Dream tests passed, including concurrent batches, stale edits, branch publication, manual merges, legacy jobs, and commands.
- Two Node processes reserved distinct sessions under the same lock. Their processed-state updates preserved both results.
- Publication preserved accepted files, `master`, unrelated staged edits, and tracked non-memory files.
- Strict TypeScript checks passed for both extensions and the test file. Node syntax checks passed for both `.mjs` files.
- An isolated Pi terminal ran `/dream 2` twice against four temporary sessions. Both jobs published distinct review branches.
- `/dream-review <job-id>` reported the accepted repository and review branch. The report file contained the batch diff.
- Both branches merged manually while `master` remained checked out. UI polling detected acceptance and processed all four sessions.
- Terminal captures and temporary job files are in `/tmp/pi-dream-branches-proof-dCbfQY/`.
- `docs-maintainer` updated `docs/pi-dream.md`. The parent reviewed and corrected details against the source and runtime results.
- `git diff --check` and `pre-commit run --all-files` passed.
- No paid model requests ran. The test used a fake worker executable. Live memory, settings, and pending jobs remained unchanged.

## Deviations

No scope changes were necessary. New batches create one commit rather than one commit per session. Evidence records retain session attribution. Legacy batches retain their existing commits. `/dream-apply` deliberately refuses diverged branches instead of starting an interactive conflict resolution.


## Open questions / assumptions

The user approved implementation. No further confirmation is necessary for this scope. Keep the fixed worker limit of three. Do not run paid model requests, apply live memory, discard live jobs, commit source changes, or push remote changes during verification.
