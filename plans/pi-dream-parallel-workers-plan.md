# Plan: Pi Dream Parallel Workers

**Completed: 2026-11-03**

## Brief

Fix the `spawnSync pi ENOBUFS` failure by streaming worker output to files. Run up to three workers at the same time. Preserve one reviewed Git commit and one provenance sequence for each session.

## Current state / relevant context

- `runner.mjs` uses `spawnSync()` with `encoding: "utf8"`.
- Node buffers the complete Pi JSON output. The default buffer limit caused `spawnSync pi ENOBUFS` after three sessions.
- Workers currently edit one candidate repository in sequence.
- Each changed session creates one candidate Git commit.
- Each memory operation records hashes, evidence, author, session, and time in `writes.jsonl`.
- The live memory store stays unchanged until `/dream-apply`.
- `docs/CONTEXT.md` does not exist.

## Proposed implementation

### 1. Stream worker output

Replace `spawnSync()` with asynchronous `spawn()`.

Send the prompt through standard input. Send standard output and standard error directly to a session log file. Do not keep worker output in process memory.

Each worker will have this directory:

```text
<job>/workers/<index>-<session-id>/
  candidate/
  worker.log
  writes.jsonl
```

The root `worker.log` will contain only session results and paths to detailed logs.

### 2. Use bounded parallel work

Run workers in waves of three. Three is the fixed first-version limit. This limit saves time without starting ten large model requests at once.

Before each wave, create one detached Git worktree for each session. A Git worktree is an isolated checkout that shares the candidate repository history.

Each worker edits only its worktree. Workers never write to the same directory at the same time.

### 3. Preserve ordered versions

After a wave finishes, integrate results in the original session order.

For each changed session:

1. Commit its worktree changes.
2. Find the changed Markdown paths.
3. Cherry-pick the commit into the main candidate when its paths do not overlap earlier wave changes.
4. Append that worker's provenance records to the root `writes.jsonl`.

A cherry-pick copies one Git commit onto another branch.

### 4. Handle overlapping changes

If two workers change the same path, do not use the stale parallel result for the later session.

Run the later session again against the current main candidate. Commit that result directly. Use only the retry provenance records.

If a cherry-pick still conflicts, abort it and use the same retry path.

This rule keeps file hashes and provenance correct in the final linear history.

### 5. Track progress

Add `concurrency` to the job manifest. New jobs will use `3` or the session count, whichever is smaller.

Add `runningSessionIds` to the job state. `/dream-status` will show the active worker count and session IDs.

A failed wave will stop integration. Completed earlier waves remain available for inspection. Apply remains disabled.

## File-by-file impact

- `extensions/pi-dream/runner.mjs` — asynchronous worker pool, output streaming, worktree isolation, ordered integration, retries, and cleanup.
- `extensions/pi-dream/index.ts` — manifest concurrency, parallel confirmation text, state types, and status output.
- `extensions/pi-dream/pi-dream.test.ts` — large-output regression, parallel execution, commit order, provenance merge, and overlap retry tests.
- `docs/pi-dream.md` — parallel worker behavior, worktree isolation, logs, conflict retries, and recovery.
- `plans/pi-dream-parallel-workers-plan.md` — decisions, progress, deviations, and validation results.

## Risks and edge cases

- Parallel workers can propose duplicate facts in different files. Human review remains required.
- Two workers can edit the same file. The later session will run again after ordered integration.
- One worker can fail while other workers finish. The wave will not integrate any result until all workers succeed.
- A process can stop before worktree cleanup. The next job uses a new directory, and failed job files remain available.
- Parallel model calls use more provider capacity. The runner limits concurrency to three.
- Git worktree commands share one repository. The runner creates, commits, integrates, and removes worktrees in serial steps.

## Validation / testing

Success requires these checks:

1. Worker output larger than the old buffer limit does not cause `ENOBUFS`.
2. At least two fake workers run at the same time.
3. Each worker receives the full prompt through standard input.
4. Each worker edits an isolated worktree.
5. Candidate commits remain in source session order.
6. Disjoint changes integrate without a retry.
7. Overlapping paths cause a sequential retry.
8. Root provenance contains only integrated writes.
9. Failed workers prevent the job from becoming ready.
10. Worker worktrees are removed after success and failure.
11. `/dream-status` reports parallel activity.
12. Existing path, hash, evidence, review, and apply tests still pass.

Run the focused `jiti` test, strict TypeScript checks, `node --check`, `git diff --check`, and `pre-commit run --all-files`.

## Step-by-step execution checklist

- [x] Replace buffered worker execution with streamed asynchronous execution.
- [x] Add worktree creation and cleanup.
- [x] Add the three-worker wave scheduler.
- [x] Add ordered commit integration.
- [x] Add overlap detection and sequential retry.
- [x] Merge provenance only after successful integration.
- [x] Add parallel progress fields and status output.
- [x] Add large-output and parallel regression tests.
- [x] Add overlap retry and provenance tests.
- [x] Update the documentation.
- [x] Run focused and repository checks.
- [x] Record validation results and deviations.
- [x] Commit only Pi Dream changes with a contextual commit.
- [x] Push the current branch to its configured remote.

## Validation results

- The focused `jiti` test passed.
- Three fake sessions ran with a concurrency limit of two.
- The first two workers proved that their executions overlapped.
- Each worker wrote 2 MiB of output without `ENOBUFS`.
- Candidate commits remained in session order.
- Root provenance remained in session order.
- An overlapping path caused the later session to run again.
- The retry result appeared once in final memory and provenance.
- Temporary worker worktrees were removed.
- Strict TypeScript checks passed.
- `node --check` passed for `runner.mjs`.
- Pi loaded the extension in offline mode.
- `git diff --check` passed.
- `pre-commit run --all-files` passed.

## Deviations

- The runner uses fixed concurrency of three. It does not add a user setting.
- The runner processes parallel work in waves. It does not keep a continuous worker queue.
- Detailed Pi JSON output stays in per-worker log files. The root log contains summaries and paths.

## Open questions / assumptions

- The first parallel limit is three workers.
- Sessions still integrate in the existing oldest-first order.
- A later session can run twice when its paths overlap an earlier result.
- Parallel workers start from the same candidate version within one wave.
- The existing complete-candidate review and apply flow remains unchanged.
- The failed job does not need an in-place resume command.
