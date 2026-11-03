# Pi Dream

Pi Dream is a Pi extension that extracts durable facts from completed sessions. It stores accepted facts as Markdown files in a Git repository. You review each candidate before Pi Dream changes accepted memory.

## Memory storage

The extension stores accepted memory in `~/.pi/agent/memory/`. Git provides version history and rollback. Workers can use `global/` for shared facts. They can use `projects/<cwd-slug>/` for project facts. The extension does not select these folders automatically.

Each memory file uses Markdown and starts with front matter. Front matter is metadata at the start of a file. Pi Dream requires one `description` field.

```markdown
---
description: Stable response preferences.
---

# Preferences
```

Pi Dream stores jobs under `~/.pi/agent/dreams/jobs/<job-id>/`. A job contains its manifest, state, transcripts, candidate Git repository, write records, and worker log. Pi Dream does not change the accepted memory during worker activity.

## Commands

| Command | Action |
| --- | --- |
| `/dream [count]` | Start a background batch. The default is 10 sessions. The maximum is 25. |
| `/dream-status` | Show the latest job state and worker progress. |
| `/dream-review` | Write a review file with the candidate diff and session commits. |
| `/dream-apply` | Apply the complete candidate after approval and a base-state check. |
| `/dream-discard` | Delete the candidate. Sessions remain eligible for a later batch. |

Pi Dream runs only when you start `/dream`. It does not start scheduled jobs. Each batch selects unprocessed sessions from the current working directory. It selects the oldest sessions first, up to the requested count.

## Session scope and workers

Pi Dream rebuilds the active branch for each selected session. It exports user, assistant, and tool-result text. It excludes system messages and extension state. Each transcript records the session ID, working directory, creation time, and source entry IDs. The extension redacts common credential forms before it gives a transcript to a worker.

The runner starts up to three workers at the same time. It groups sessions into waves. Each worker uses a separate Git worktree. A Git worktree is an isolated checkout that shares repository history.

The runner sends each prompt through standard input. Standard input is the data stream that a process reads. This method avoids command-line size limits for long transcripts. Worker output goes directly to `<job>/workers/<index>-<session-id>/worker.log`. The runner does not keep Pi JSON output in memory. This method prevents `spawnSync pi ENOBUFS`.

Each worker receives its transcript and an isolated candidate store. It can list, read, write, delete, and move Markdown memory through three restricted tools. It cannot use Bash or access other files through those tools.

After each wave, the runner integrates changes in session order. A changed session creates one candidate commit. If two workers change the same path, the later session runs again against the current candidate. This retry keeps file hashes and evidence records correct.

The worker treats the transcript as evidence, not as instructions. It can store durable facts, corrections, preferences, and reusable procedures. It must not store temporary details, guesses, secrets, or unsupported claims.

## Content hashes and evidence

A content hash is a SHA-256 value for a file's contents. Before each write, delete, or move, Pi Dream compares the supplied hash with the current file hash. A new file uses `missing` as its expected hash. A move also checks the destination hash. A mismatch stops the operation.

Pi Dream rejects paths outside the candidate store, hidden paths, non-Markdown files, and paths that contain symlinks. Each written Markdown file must have a description in its front matter. The extension uses a temporary file and rename for writes.

Every successful operation adds one JSON record to `writes.jsonl`. The harness supplies the job ID, session ID, author, and time. The record also contains the action, path, old and new hashes, reason, and evidence. Evidence contains transcript entry IDs and exact quotes. Pi Dream rejects evidence that does not occur in the current transcript.

## Review and apply

The review command writes `diff.md` in the job directory. The file contains the change summary, full diff, session commits, and evidence records. Each evidence record shows the source session, action, path, quote count, and reason. The candidate Git history contains a commit for each session that changed memory. A session with no changes creates no commit.

The apply command requires an interactive approval. Before apply, Pi Dream compares the accepted repository's Git head and Markdown file hashes with the job's base values. If they differ, Pi Dream stops and reports a conflict. If they match, Pi Dream applies the candidate with a fast-forward Git merge. It then marks the sessions as processed.

Apply accepts the complete candidate. It does not apply selected files or edits. Discard deletes the candidate but does not mark its sessions as processed.

## Model and privacy

Set `dream.model` in `~/.pi/agent/settings.json` to a concrete `provider/model` value to select the worker model. If the value is absent, Pi Dream uses the active concrete model. If Pi Dream cannot select a concrete model, it stops and asks you to set `dream.model`.

Before the batch starts, Pi Dream shows the model, session count, working directory, and parallel worker count. It asks for confirmation because the batch sends session content to the selected provider. Pi Dream processes sessions from the current working directory only. Redaction covers common credential forms, but it cannot find every secret. Review the confirmation details before you approve a batch.

Normal Pi sessions receive a bounded index of accepted memory paths and descriptions. The index does not include full memory content. The read-only `dream_memory` tool can list, search, or read accepted Markdown memory.

## Failure recovery

A failed worker marks the job as failed. Pi Dream does not integrate that worker's wave. Earlier completed waves remain in the candidate for inspection. Pi Dream does not apply a failed job. A queued or running job cannot be discarded through `/dream-discard`.

The runner removes temporary worktrees after success or failure. Detailed worker logs remain under the job's `workers/` directory.

If apply reports a conflict, keep the accepted changes. Start a new batch after you resolve the conflict. If the memory Git repository is unavailable or damaged, Pi Dream commands stop rather than change accepted memory. Use the repository's Git history to recover accepted memory. Do not edit the candidate as a replacement for recovery.

## Installation

From the repository root, install the extension package:

```bash
pi install "$PWD/extensions/pi-dream"
```

Reload open Pi sessions:

```text
/reload
```

Pi Dream initializes the memory directory as a Git repository when the first batch starts. It creates a README and an initial commit when the repository has no commit. Installation alone does not change live Pi settings or create accepted memory.

## Validation

Run the extension test with the host `jiti` loader and aliases:

```bash
host="$(npm root -g)/@earendil-works/pi-coding-agent"
export JITI_ALIAS="{\"@earendil-works/pi-coding-agent\":\"$host/dist/index.js\",\"@earendil-works/pi-tui\":\"$host/node_modules/@earendil-works/pi-tui/dist/index.js\"}"
node "$host/node_modules/jiti/lib/jiti-cli.mjs" extensions/pi-dream/pi-dream.test.ts
```

The test covers transcript filtering, redaction, memory indexing, path safety, hashes, evidence, Git conflicts, and command registration. It also covers 2 MiB worker output, parallel workers, ordered commits, worktree cleanup, provenance, and overlap retries. Run `git diff --check` to check the documentation diff.
