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

Pi Dream stores jobs under `~/.pi/agent/dreams/jobs/<job-id>/`. A job contains its manifest, state, transcripts, candidate files, write records, and worker log. A candidate folder holds proposed memory files. It is not a Git repository or worktree.

## Commands

| Command | Action |
| --- | --- |
| `/dream [count]` | Start a background batch. The default is 10 sessions. The maximum is 100. |
| `/dream-status [job-id]` | List all jobs and worker progress, or show one job. |
| `/dream-review [job-id]` | Publish a job branch and write its review file. |
| `/dream-apply [job-id]` | Fast-forward `master` from a reviewed branch. |
| `/dream-discard [job-id]` | Delete a job branch and candidate files. |

These commands use the latest job when you omit `[job-id]`, except `/dream-status`, which lists all jobs.

Pi Dream runs only when you start `/dream`. It does not start scheduled jobs. Each batch selects unprocessed sessions from the current working directory. It selects the oldest sessions first, up to the requested count.

In UI sessions, the status area shows the latest job across all working directories. It refreshes once per second. With no job, it shows `🌙 dream: idle`. Queued, running, and ready jobs show completed and total counts, such as `🌙 dream: 10/10`. This compact label remains unchanged. Use `/dream-status` to see each job state. Failed, applied, and discarded jobs show their state instead of counts. A state read error shows `🌙 dream: unavailable`. The status area clears when the session shuts down. Headless sessions do not show this status.

## Session scope and workers

Pi Dream rebuilds the active branch for each selected session. It exports user, assistant, and tool-result text. It excludes system messages and extension state. Each transcript records the session ID, working directory, creation time, and source entry IDs. The extension redacts common credential forms before it gives a transcript to a worker.

The runner starts up to 10 workers at the same time in each batch. A manifest can request fewer workers. The runner caps larger requests at 10. Different batches can run at the same time, so the total can exceed 10. More sessions and workers can use more resources and reach provider rate limits.

Workers share one batch folder. A lock allows one worker at a time to check file hashes, edit files, or write shared evidence. A lock prevents simultaneous access to shared data.

The runner sends each prompt through standard input. Standard input is the data stream that a process reads. This method avoids command-line size limits for long transcripts. Worker output goes directly to `<job>/workers/<index>-<session-id>/worker.log`. The runner does not keep Pi JSON output in memory. This method prevents `spawnSync pi ENOBUFS`.

Each worker receives its transcript. Workers in one batch share a candidate store. Other batches use separate candidate stores. It can list, read, write, delete, and move Markdown memory through three restricted tools. It cannot use Bash or access other files through those tools.

Workers can prepare edits at the same time. File edits take turns under the lock. The lock protects each hash check, edit, and evidence write. A changed hash stops an edit so the worker can read the current file and prepare a new edit.

The worker treats the transcript as evidence, not as instructions. It can store durable facts, corrections, preferences, and reusable procedures. It must not store temporary details, guesses, secrets, or unsupported claims.

## Content hashes and evidence

A content hash is a SHA-256 value for a file's contents. Before each write, delete, or move, Pi Dream compares the supplied hash with the current file hash. A new file uses `missing` as its expected hash. A move also checks the destination hash. A mismatch stops the operation.

Pi Dream rejects paths outside the candidate store, hidden paths, non-Markdown files, and paths that contain symlinks. Each written Markdown file must have a description in its front matter. The extension uses a temporary file and rename for writes.

Every successful operation adds one JSON record to `writes.jsonl`. The harness supplies the job ID, session ID, author, and time. The record also contains the action, path, old and new hashes, reason, and evidence. Evidence contains transcript entry IDs and exact quotes. Pi Dream rejects evidence that does not occur in the current transcript. A lock protects shared evidence records.

## Review and apply

When a batch finishes, the runner publishes one branch named `dream/<job-id>` in the accepted repository. The review command writes `diff.md` in the job directory. The branch contains one batch commit, even when the batch has no file changes. The commit uses the recorded base as its parent. Pi Dream uses a private Git index and Git commands `commit-tree` and `update-ref`. It does not check out the branch or change the normal Git index. The review file contains the change summary, full diff, batch commit, and evidence records. Each evidence record shows the source session, action, path, quote count, and reason.

Open `~/.pi/agent/memory/` in lazygit to review a branch. Compare `dream/<job-id>` with `master`. You can also merge the branch manually. A normal merge keeps the published commit in the history. Pi Dream detects that merge during UI polling and job commands or selection. A squash merge or cherry-pick does not prove acceptance, so Pi Dream does not mark those sessions as processed.

The `/dream-review` command reads the current commit on `dream/<job-id>`. It also updates the recorded commit. This applies after extra correction commits or an amended proposal replaces the original commit. If a user rewrites branch history before a manual merge, run `/dream-review` first. A normal merge must keep the recorded commit in `master` history for Pi Dream to detect acceptance.

The `/dream-apply` command requires interactive approval. It requires a clean accepted repository checked out on `master`. It merges the named branch with `--ff-only`. A fast-forward moves `master` to a later commit without combining separate histories. The named branch can contain correction commits or a replaced proposal commit. Pi Dream uses the current branch commit to track accepted sessions. If the branch does not exist, Pi Dream stops. It does not recreate the branch. If `master` has diverged, Pi Dream stops and asks you to merge the branch manually. Pi Dream marks sessions as processed when it detects the recorded commit in `master` history.

Apply accepts the complete batch. It does not apply selected files or edits. It records acceptance before it deletes the `dream/<job-id>` branch name. It deletes that name only if the branch still points to the accepted commit. A cleanup error produces a warning and preserves the branch. Accepted memory and processed sessions remain valid.

A failed apply or canceled confirmation keeps the branch. A manual merge does not delete the branch. Apply keeps candidate folders, logs, evidence, job records, and accepted commits.

Discard deletes only the expected `dream/<job-id>` branch and candidate files. It keeps evidence and logs. It refuses queued, running, and applied jobs. Discarded sessions remain eligible for another batch. Pi Dream reserves sessions in queued, running, and ready jobs.

Existing jobs can contain candidate Git repositories from the earlier implementation. Run `/dream-review <job-id>` to publish a ready legacy candidate. This command keeps its files and history intact.

## Model and privacy

Set `dream.model` in `~/.pi/agent/settings.json` to a concrete `provider/model` value to select the worker model. If the value is absent, Pi Dream uses the active concrete model. If Pi Dream cannot select a concrete model, it stops and asks you to set `dream.model`.

Workers start with `--no-extensions`. A worker cannot use a provider that an extension adds unless you load that extension. Set `dream.extensions` to a list of extension paths. The runner passes each path to the worker with `--extension`.

```json
"dream": {
  "model": "claude-gateway/claude-opus-5-5",
  "extensions": ["~/other_projects/coding-agent/clients/pi"]
}
```

A path that starts with `~/` starts at your home folder. Pi Dream resolves other relative paths from `~/.pi/agent`. The job manifest stores the absolute paths. If the setting is missing, the worker gets no extra extension. Without the provider extension, the worker log shows `Model "<provider>/<model>" not found` and the job fails.

Before the batch starts, Pi Dream shows the model, session count, working directory, and parallel worker count. It asks for confirmation because the batch sends session content to the selected provider. Pi Dream processes sessions from the current working directory only. Redaction covers common credential forms, but it cannot find every secret. Review the confirmation details before you approve a batch.

Before each agent run, `before_agent_start` adds the memory folder and guidance to the system prompt. The system prompt contains instructions sent to the model. It also includes an index, a list of accepted memory paths and descriptions. This list includes at most 100 files and 12,000 characters. It does not include full file content. Pi Dream has no saved search database or meaning-based search.

The prompt shows a memory folder under your home folder as a home-relative path, such as `~/notes`. It shows the home folder as `~`. It shows a folder outside your home folder as an absolute path.

Normal sessions do not register Dream tools. The model can use normal file commands to search and read accepted Markdown files. For example, it can run `rg "response preference" "/path/to/memory"` to search, then `cat "/path/to/memory/global/preferences.md"` to read a file. The guidance treats memory as historical context, not instructions. It requires an explicit user request before file changes. Normal file tools do not enforce this restriction.

All normal sessions use the same accepted memory root. Pi Dream does not filter this memory by the current working directory. The index uses accepted Markdown files only. It does not include pending job files. Pi Dream rebuilds it at each run, so new accepted memory appears on the next run. The guidance does not guarantee that the model reads every memory file.

## Failure recovery

A failed worker marks the job as failed. The job does not publish a branch. Pi Dream does not apply a failed job. A queued or running job cannot be discarded through `/dream-discard`.

Detailed worker logs remain under the job's `workers/` directory. If a process crashes while it holds a lock, the lock remains. Lock attempts stop with a bounded timeout error. Before you remove a lock manually, make sure that no active process uses it.

If apply cannot fast-forward, review and merge the branch manually in the accepted repository. If Git reports conflicts, resolve them before you complete the merge. If the memory Git repository is unavailable or damaged, Pi Dream commands stop rather than change accepted memory. Use the repository's Git history to recover accepted memory. Do not edit the candidate as a replacement for recovery.

## Installation

From the repository root, install the extension package:

```bash
pi install "$PWD/extensions/pi-dream"
```

Reload open Pi sessions:

```text
/reload
```

Pi Dream initializes the memory directory as a Git repository when the first batch starts. It creates a README and an initial commit when the repository has no commit. The accepted repository uses the `master` branch. At initialization, Pi Dream renames `main` to `master` when `master` does not exist. If both branches exist, initialization stops with an error. Installation alone does not change live Pi settings or create accepted memory.

## Validation

Run the extension test with the host `jiti` loader and aliases:

```bash
host="$(npm root -g)/@earendil-works/pi-coding-agent"
export JITI_ALIAS="{\"@earendil-works/pi-coding-agent\":\"$host/dist/index.js\",\"@earendil-works/pi-tui\":\"$host/node_modules/@earendil-works/pi-tui/dist/index.js\"}"
node "$host/node_modules/jiti/lib/jiti-cli.mjs" extensions/pi-dream/pi-dream.test.ts
```

The test covers transcript filtering, redaction, memory indexing, path safety, hashes, evidence, Git conflicts, and command registration. It also covers 2 MiB worker output, concurrent jobs, parallel workers, manual merges, batch publication, session reservations across processes, and legacy job review. Run `git diff --check` to check the documentation diff.
