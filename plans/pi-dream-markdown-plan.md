# Plan: Pi Dream Markdown Memory

**Completed: 2026-11-02**

## Brief

Build a user-level Pi extension that improves a Markdown memory store from completed Pi sessions. The extension will clone the current store, run one isolated worker for each session, and keep the live store unchanged until approval. The harness will own file access, version history, attribution, and content-hash checks.

## Current state / relevant context

- Pi stores sessions as JSONL trees under `~/.pi/agent/sessions/`.
- `SessionManager` can list sessions and rebuild the active branch.
- The local setup has 4,692 session files across 101 working directories.
- Amnesia stores session summaries and observational records in SQLite. It remains a separate search archive.
- The new memory store will use Markdown files instead of the Amnesia database.
- Local extensions use one package directory under `extensions/`, with adjacent tests and an explicit `package.json` entry point.
- Pi can run an explicit worker extension while normal extensions, skills, context files, MCP, and built-in tools remain disabled.
- The researcher diagrams require these properties:
  - A periodic batch reads session transcripts and the current memory state.
  - The process clones the input memory store into a separate output store.
  - One isolated worker processes each session.
  - Each worker can read and reorganize the output store.
  - Every write records its author, source session, time, and history.
  - The harness checks the expected content hash before each write.

## Proposed implementation

### 1. Memory store

Use this global store:

```text
~/.pi/agent/memory/
```

Store durable memory in Markdown files. Each file must start with a short description:

```markdown
---
description: Commands and release rules for the example project.
---
```

Keep global facts under `global/`. Keep project facts under `projects/<cwd-slug>/`. Do not let dreaming edit `AGENTS.md`, skills, extensions, or project source files.

Initialize the memory directory as a Git repository. Git supplies version history, review, and rollback. Each accepted dream becomes one fast-forward update to this repository.

### 2. Commands

Add these commands:

- `/dream [count]` prepares and starts a background batch. The default is 10 sessions. The maximum is 25.
- `/dream-status` shows the latest job state and worker progress.
- `/dream-review` shows the candidate diff, source sessions, and write history.
- `/dream-apply` checks the base state, asks for approval, and applies the full candidate.
- `/dream-discard` removes the candidate and keeps the sessions eligible for a later run.

The first version will not start automatic jobs. The command still runs a periodic-style batch over sessions that the last accepted job did not process.

### 3. Session collection

`/dream` will use `SessionManager.list(ctx.cwd)` and process sessions from the current working directory. It will select the newest unprocessed sessions, then rebuild only each active branch.

The extension will export bounded transcript files into the job directory. Each transcript will include its session ID, working directory, timestamp, and source entry IDs. The exporter will exclude system messages and extension state that does not represent user, assistant, or tool activity.

The extension will treat transcript content as untrusted evidence. It will remove common credential forms before the worker receives the transcript.

### 4. Job and cloned output store

Create each job under:

```text
~/.pi/agent/dreams/jobs/<job-id>/
```

Use this layout:

```text
manifest.json
state.json
transcripts/
candidate/
writes.jsonl
worker.log
```

Clone `~/.pi/agent/memory/` into `candidate/`. Record the live Git commit and SHA-256 hash of every memory file in `manifest.json`.

The extension command will launch a detached Node runner. The runner will continue if the starting Pi session closes.

### 5. One worker per session

The runner will start one Pi worker for each transcript. Workers will run in timestamp order. Sequential work gives every worker the latest candidate state and avoids unnecessary write conflicts.

Use a restricted command similar to:

```bash
pi --mode json --print --no-session --no-extensions --no-skills \
  --no-context-files --no-mcp --no-builtin-tools \
  --extension ./worker-extension.ts \
  --tools dream_memory_list,dream_memory_read,dream_memory_edit
```

The worker receives one transcript and the candidate store. It can add, update, move, delete, and reorganize Markdown memory. It cannot use Bash, read arbitrary files, or write outside the candidate store.

After a worker finishes, the runner commits its candidate changes. The commit will identify the source session and job. A worker that makes no useful change creates no commit.

### 6. Harness-owned memory tools

The worker extension will expose three tools:

- `dream_memory_list` lists Markdown paths, descriptions, and current hashes.
- `dream_memory_read` reads one Markdown file inside the candidate store.
- `dream_memory_edit` performs a write, delete, or move operation.

`dream_memory_edit` will require:

- the relative Markdown path
- the expected SHA-256 hash, or `missing` for a new file
- the new content or destination
- a short reason
- one or more source entry IDs
- one or more exact supporting quotes

The tool will enforce the following rules:

- Reject absolute paths, traversal, hidden control paths, non-Markdown files, and symlink escapes.
- Compare the expected hash before every operation.
- Write through a temporary file and atomic rename.
- Append one successful operation to `writes.jsonl`.
- Add the trusted job ID, session ID, author, and timestamp in the harness.
- Reject evidence that does not refer to the current transcript.

The model will not control author, session, time, root paths, or version numbers.

### 7. Review and apply

`/dream-review` will show the Git diff from the recorded base commit to the candidate head. It will also show each file's source sessions, evidence count, and write reasons.

`/dream-apply` will compare the live Git head and affected file hashes with the recorded base. If any value changed, the command will stop with a conflict. It will not merge or overwrite the live change.

If the base still matches, the command will fetch the candidate head into the live repository and apply it with a fast-forward update. It will then mark the source sessions as processed.

The first version will apply or reject the complete candidate. It will not apply selected files or selected edits.

### 8. Memory use in later sessions

The extension will add a bounded memory index to Pi's system prompt. The index will contain only Markdown paths and front-matter descriptions.

Register one read-only `dream_memory` tool for normal sessions. It will list, search, or read files only under `~/.pi/agent/memory/`. Full memory content will enter model context only when the agent requests it.

This design keeps the prompt small and makes accepted memories available in the next session.

### 9. Model selection and privacy

Read the worker model from `dream.model` in `~/.pi/agent/settings.json`. If that value is absent, use a concrete active model. If the active model is virtual, stop and request a concrete `provider/model` value.

Before `/dream` starts, show the model, session count, and working directory. Require confirmation because the batch sends information from several sessions in one job.

Do not include secrets, raw authentication files, or sessions from other working directories.

## File-by-file impact

- `extensions/pi-dream/package.json` — declare the extension entry point.
- `extensions/pi-dream/index.ts` — commands, session selection, transcript export, job launch, review, apply, memory index, and normal read-only tool.
- `extensions/pi-dream/runner.mjs` — detached orchestration, worker process control, candidate commits, and job state.
- `extensions/pi-dream/worker-extension.ts` — restricted candidate-store tools and content-hash checks.
- `extensions/pi-dream/pi-dream.test.ts` — focused tests for collection, safety, versioning, conflicts, state, and prompt indexing.
- `docs/pi-dream.md` — behavior, storage, commands, privacy, recovery, installation, and validation.
- `docs/README.md` — add the Pi Dream document to the index.
- `plans/pi-dream-markdown-plan.md` — decisions, progress, deviations, and validation results.

No live `~/.pi/agent/settings.json` or `~/.pi/agent/memory/` change is part of implementation. Installation and initialization require a separate explicit request.

## Risks and edge cases

- A transcript can contain prompt injection. Workers receive no general tools, and the worker prompt defines transcripts as evidence only.
- A model can propose false memory. Human review remains mandatory.
- Redaction cannot find every secret. The confirmation screen must state that cross-session content goes to the selected provider.
- A large memory store can exceed model context. Workers receive the file index first and read only relevant files.
- A stale worker can overwrite a newer candidate change. The content-hash precondition blocks the write.
- The live store can change during a job. The apply command stops when the base commit or file hashes differ.
- A failed worker can leave a partial candidate. The job keeps the candidate for inspection, but apply remains disabled.
- A worker can make repeated low-value edits. The runner skips empty commits and the review shows each session commit.
- Git can be unavailable or the memory repository can be damaged. Commands must stop without changing memory and report the recovery path.
- Session branches can contain abandoned work. Collection must use only the active branch.
- A Markdown file can lack valid front matter. The worker tool must reject the write.

## Validation / testing

Success requires these checks:

1. The extension selects only active branches from the current working directory.
2. The live memory store stays unchanged while workers modify the clone.
3. The runner starts exactly one restricted worker for each selected session.
4. Each successful write has a valid precondition, source session, source entry, quote, time, and resulting hash.
5. Hash mismatches, path traversal, symlink escapes, and malformed Markdown fail before a write.
6. Each session produces at most one candidate commit. Empty sessions produce no commit.
7. Review uses the recorded base and candidate heads.
8. Apply succeeds only when the live base still matches.
9. Accepted jobs mark sessions as processed. Failed and discarded jobs do not.
10. The normal memory index includes paths and descriptions, but not full file content.
11. The read-only normal-session tool cannot leave the live memory root.
12. A fake `pi` executable can complete a multi-session runner test without model cost.
13. A disposable real Pi run can inspect two synthetic transcripts and a temporary memory store.

Run the adjacent test with Pi's installed `jiti` loader. Run a strict TypeScript check for the extension files. Run `git diff --check` and `pre-commit run --all-files`.

## Step-by-step execution checklist

- [x] Add failing tests for path safety, hashes, active branches, and stale apply behavior.
- [x] Add the package manifest and extension entry point.
- [x] Add memory initialization, indexing, and the normal read-only tool.
- [x] Add session selection, transcript export, redaction, and job creation.
- [x] Add the restricted worker extension and write log.
- [x] Add the detached runner and per-session Git commits.
- [x] Add status, review, apply, and discard commands.
- [x] Run focused tests and the fake-worker end-to-end test.
- [x] Run a disposable real Pi job with synthetic data.
- [x] Update the documentation and its index.
- [x] Run repository checks and review the final diff.
- [x] Record deviations and validation results.
- [x] Mark the plan complete with the completion date.

## Validation results

- The focused `jiti` test passed.
- Direct assertions cover redaction, memory indexing, path safety, hashes, evidence, Git conflicts, command registration, and prompt indexing.
- The fake runner processed two sessions and created two candidate commits.
- The strict TypeScript check passed for `index.ts` and `worker-extension.ts`.
- `node --check` passed for `runner.mjs`.
- Pi loaded the extension with no startup error in offline mode.
- A real disposable batch used `openai-codex/gpt-6-luna` with two synthetic sessions.
- The real batch created two attributed commits and two evidence records in the candidate store.
- The real batch did not change the temporary live store before approval.
- `git diff --check` passed.
- `pre-commit run --all-files` passed.
- The documentation update passed its focused check and review.

## Deviations

- The extension does not select `global/` or `projects/<cwd-slug>/` automatically. Workers can organize files under those paths.
- The review command writes `diff.md` and reports its path. It does not open a custom review screen.
- Installation, live settings changes, and live memory initialization remain separate actions.

## Open questions / assumptions

- The live memory root is `~/.pi/agent/memory/`.
- The first version processes sessions from the current working directory only.
- The default batch contains 10 sessions and never exceeds 25.
- Workers run sequentially in the first version.
- Human approval applies the complete candidate.
- The extension does not modify Amnesia, `AGENTS.md`, or skills.
- Automatic schedules, semantic search, selective apply, and cross-project batches remain out of scope.
- A concrete worker model will be available through `dream.model` or the active Pi model.
