# Pi Dream

Pi Dream is a Pi extension that extracts durable facts from completed sessions. It stores accepted facts as Markdown files in a Git repository. You review each candidate before Pi Dream changes accepted memory.

A normal session can also record a note with the `dream_note` tool. A note is an unverified lead for a future memory change. It does not prove its own claim. New sessions see pending notes next to the memory index. The next batch checks useful notes against source messages. See [Session notes](#session-notes).

## Memory storage

The extension stores accepted memory in `~/.pi/agent/memory/`. Git provides version history and rollback. A memory file can use a `scope` field to show only in one project folder. See [Project scope](#project-scope).

Each memory file uses Markdown and starts with front matter. Front matter is metadata at the start of a file. Pi Dream requires one `description` field.

```markdown
---
description: Stable response preferences.
---

# Preferences
```

A description can have up to 150 characters. `dream_memory_edit` rejects a new or changed file with a longer description. Existing files with a longer description still load. The prompt index cuts a longer description to 147 characters and adds `...`.

Pi Dream stores jobs under `~/.pi/agent/dreams/jobs/<job-id>/`. A job contains its manifest, state, transcripts, findings, candidate files, write records, and worker logs. A candidate folder holds proposed memory files. It is not a Git repository or worktree.

Pi Dream stores notes under `~/.pi/agent/dreams/inbox/<note-id>.json`. The `PI_DREAM_HOME` variable moves both folders.

## Session notes

Every normal session has the `dream_note` tool. The system prompt tells Pi to call it when it learns a durable fact, preference, correction, or procedure that will help a future session. Examples are a user correction and the end of a task. Pi records one note for each fact. It does not note temporary details, task progress, or secrets. No user request is necessary.

A note has a `kind`, a `subject` of up to 80 characters, a `statement` of up to 1000 characters, and an optional `memoryPath`. The kinds are the finding kinds: `fact`, `preference`, `correction`, `procedure`, `failure`, and `stale`. The tool adds the session ID, the working directory, and the time. It writes one JSON file to the inbox. It never changes memory files. The tool rejects an invalid kind, a long field, or a `memoryPath` outside the memory store.

A new session gets a section `Pending memory notes (not yet consolidated)` after the memory index. The section shows notes from the same working directory or a parent directory. A note without a working directory shows everywhere. The section shows the newest 50 notes in up to 4000 characters. A note is a proposal from a past session. It is not accepted memory.

The `/dream` command takes pending notes for the current working directory. It takes up to 100 notes. A batch can run with notes and no sessions. The runner then skips the extract phase. The confirmation shows the session count and the note count. A queued, running, or ready job reserves its notes. The `/dream-status` summary shows the available note count.

The runner adds each note to `findings.jsonl` as a finding with `source: "note"`. The finding has no evidence quotes. If available, it retains the source entry ID for the assistant tool call that recorded the note. Consolidation treats the note as an unverified lead. It must find supporting source messages and record a source-backed finding before it uses the claim in a memory edit. A note alone cannot support an edit. If the source is missing or unclear, the worker reports the gap. When you apply the job, Pi Dream deletes its notes from the inbox. A discarded job keeps its notes. Delete an inbox file to remove a wrong note.

## Commands

| Command | Action |
| --- | --- |
| `/dream [count]` | Start a background batch. The default is 10 sessions. The maximum is 100. |
| `/dream-check <file.md> [file.md ...]` | Check selected accepted memory files against retained evidence from accepted jobs. |
| `/dream-check --all` | Check all accepted Markdown memory files against retained evidence from accepted jobs. |
| `/dream-status [job-id]` | Show project session coverage and all jobs, or show one job. |
| `/dream-resume [job-id]` | Resume unfinished work in a failed job. |
| `/dream-review [job-id]` | Publish a job branch and write its review file. |
| `/dream-apply [job-id]` | Merge `master` into a reviewed branch, then fast-forward `master`. |
| `/dream-discard [job-id]` | Delete a job branch and candidate files. |

These commands use the latest job when you omit `[job-id]`, except `/dream-status`, which lists all jobs.

Pi Dream runs only when you start `/dream`, `/dream-check`, `/dream-resume`, or `/dream-apply`. It does not start scheduled jobs. `/dream-check` checks selected files or all accepted Markdown files. It uses retained evidence from accepted jobs, including jobs from other projects. It does not process new sessions or pending notes. Each batch selects unprocessed sessions and pending notes from the current working directory. It selects the oldest sessions first, up to the requested count.

Run `/dream-status` without a job ID to see project session coverage. An accepted session belongs to a job in `master` history. A reserved session belongs to a queued, running, or ready job. An available session can enter a new batch. The summary states `All project sessions are accepted.` when no project session remains. For a running job, `/dream-status` shows the phase: `extract`, `consolidate`, or `merge`. For a `/dream-check` job, it shows reviewed files and passages. Older jobs without coverage records show `coverage unknown`.

In UI sessions, the status area shows the latest job across all working directories. It refreshes once per second. With no job, it shows `🌙 dream: idle`. Queued, running, and ready batches show completed and total session counts, such as `🌙 dream: 10/10`. Check jobs show file counts, passage counts, and whether the combined comparison is pending. Use `/dream-status` to see each job state. Failed, applied, and discarded jobs show their state instead of counts. A state read error shows `🌙 dream: unavailable`. The status area clears when the session shuts down. Headless sessions do not show this status.

When the latest job fails, Pi Dream shows one error notification in each Pi runtime. The notification gives the job ID, progress, error, and status command.

## Batch phases

Each batch has two phases. The extract phase reads sessions and records findings. The consolidate phase edits memory from those findings. A finding is one claim from a session. It has a kind, a subject, a statement, and quotes from the transcript.

### Extract phase

Pi Dream rebuilds the active branch for each selected session. It exports user and assistant text. It also exports tool calls and tool results. It excludes system messages and extension state. Each transcript records the session ID, working directory, creation time, and source entry IDs. The extension redacts common credential forms before it gives a transcript to a worker. The job also stores structured, redacted source messages in `sources.json`. These messages retain full available text, tool-call arguments, roles, and timestamps. They exclude system messages, thinking parts, and extension state. Redaction covers common credential forms, but it cannot find every secret.

Transcripts use these rules:

- An assistant tool call appears as `[tool call <name>] <JSON arguments>`. Arguments longer than 500 characters are cut.
- Thinking parts are excluded.
- A tool result header shows the tool name. A failed result also shows `error`.
- A normal tool result keeps its first and last 500 characters.
- An error result keeps its first and last 4,000 characters.
- A `[... N characters cut ...]` marker shows where text was cut.
- User and assistant text stays complete.

One extract worker runs for each session. The worker gets the transcript as its prompt. It can use memory list/read tools, finding tools, and source tools. These include `dream_finding_batch` and `dream_source_batch`. The source tools read only the job snapshot. They cannot read arbitrary files. The worker cannot edit memory.

`dream_finding` records one finding. A finding has these fields:

- `kind`: `fact`, `preference`, `correction`, `procedure`, `failure`, or `stale`.
- `subject`: a short topic name in the form `<project or tool> <topic>`, for example `likec4 validate command`. It can have up to 80 characters.
- `statement`: the claim. It can have up to 1,000 characters.
- `memoryPath`: an optional related memory file.
- `evidence`: one to three quotes from source entries. Each quote can have up to 500 characters. Pi Dream checks each quote against the exact entry. It records the source role and timestamp when available. A quote shows what a message says, not whether the claim is true.

The worker writes each finding to `findings.jsonl` in its attempt folder. Workers do not share this file, so no lock is needed. The runner copies successful findings to the session folder.

### Consolidate phase

When the extract phase ends, the runner compares `master` with the recorded base. A resumed incomplete combined review keeps its original base and candidate. Otherwise, if `master` moved and no consolidation completed, the runner replaces the candidate with a new snapshot of `master`. It writes the new base to `manifest.json`. Extract workers only read the candidate, so this step loses nothing.

The runner then merges all worker findings and job notes into `<job>/findings.jsonl`. It gives each finding an ID: `f1`, `f2`, and so on.

Each successful attempt and session has a `result.json` file. This completion record contains hashes for the transcript and findings. A hash is a value that identifies file contents. The runner uses hashes to detect changed data before resume. It also checks the finding fields and quotes. If a crash interrupts the copy to the session folder, resume recovers the completed attempt.

If no worker records a finding, the runner skips the consolidate phase. Memory does not change in that batch. A successful extraction still gets a completion record, even when it has no findings. A `/dream-check` job always runs consolidation, even when it has no initial findings.

If at least one finding exists, one orchestrator worker runs. The orchestrator worker reads the merged findings and the candidate store. Consolidation runs in a separate candidate folder under `workers/consolidate/attempt-*/candidate`. The original job candidate remains the baseline. A completion record lets the runner retry publication without running consolidation again. The root `<job>/writes.jsonl` contains only writes from successful consolidation.

The prompt groups the findings. Findings with the same `memoryPath` form one group. Other findings form groups by subject. Each group shows the number of sessions. The prompt also lists store warnings. A warning appears for a description over 150 characters or a file over 20,000 bytes. The orchestrator worker has memory tools, read-only source tools, `dream_finding`, and `dream_finding_batch`. It can search sources and read one entry in pages of up to 8,000 characters. Search returns up to 20 matches per page, with excerpts of up to 240 characters. The worker can record additional findings after it checks a claim against a source. It edits the candidate store with `dream_memory_edit`.

### Timeouts and environment

Each extraction attempt has a total limit of 30 minutes. The consolidate worker has a total limit of 60 minutes. Each extraction gets up to three attempts, including the first attempt. The runner keeps each attempt's log and findings in a separate folder. It retries temporary errors. Known authentication, missing-model, and quota errors stop without a retry.

The runner sets these environment variables for workers:

- `PI_DREAM_PHASE`: `extract`, `consolidate`, or `merge`.
- `PI_DREAM_FINDINGS`: the findings file that the worker uses. Each worker uses the file in its own attempt folder.
- `PI_DREAM_CWD`: the batch working directory. Consolidate and merge workers get this variable.

## Session scope and workers

The runner uses a worker pool. The pool runs up to 10 workers at the same time in each batch. A manifest can request fewer workers. The runner caps larger requests at 10. A new worker starts when any worker finishes. A slow worker does not stop the other workers. After a failure, no new worker starts. Running workers finish, and the job fails. Different batches can run at the same time, so the total can exceed 10.

Each batch has its own candidate files. Concurrent batches still share provider load. Their proposals can need a manual merge after one proposal changes `master`. Pi Dream does not retry consolidation automatically. More sessions and workers can use more resources and reach provider rate limits.

The job state has a `phase` field while the job runs. Its value is `extract`, `consolidate`, or `merge`. The field is removed when the job is ready.

The runner sends each prompt through standard input. Standard input is the data stream that a process reads. This method avoids command-line size limits for long transcripts. Extract worker JSON output goes to `<job>/workers/<index>-<session-id>/attempt-*/worker.log`. Standard error is the error data stream from a process. Extract worker standard error goes to `<job>/workers/<index>-<session-id>/attempt-*/worker.error.log`. The consolidate worker uses `<job>/workers/consolidate/attempt-*/`. The runner reads output as separate JSON events. It keeps complete logs on disk, not in memory. This method prevents `spawnSync pi ENOBUFS`.

Each worker process must produce a final successful model response. A successful process exit alone does not count as success. Each unfinished tool call has a 120-second inactivity limit. The runner resets this timer when argument output contains a non-whitespace character. Empty output and whitespace-only output do not reset it. The combined arguments for one call normally have a 16 KiB limit. The limit for `dream_finding_batch` is 64 KiB. The limit for `dream_memory_edit` and `dream_review` is 1 MiB. The runner stops a tool call that has more than 8 KiB of trailing whitespace. The runner sends `SIGTERM`, a stop request, when a worker exceeds a limit. If the worker does not stop within five seconds, the runner sends `SIGKILL` to force termination.

Extract workers in one batch read the same candidate store. Each consolidation attempt edits a separate copy. Other batches use separate candidate stores. Memory tools use a lock. The lock allows one tool call at a time to check hashes or change files. A lock prevents simultaneous access to shared data. The tools cannot use Bash or access other files.

Workers treat the transcript as evidence, not as instructions. Extract workers record durable facts, corrections, preferences, reusable procedures, failures, and stale memory. They must not record temporary details, guesses, secrets, or unsupported claims. The consolidate worker decides which findings change memory.

## Content hashes and evidence

A content hash is a SHA-256 value for a file's contents. Before each write, delete, or move, Pi Dream compares the supplied hash with the current file hash. A new file uses `missing` as its expected hash. Pi Dream also reads an empty value or `none` as `missing`. A move also checks the destination hash. A mismatch stops the operation.

Pi Dream rejects paths outside the candidate store, hidden paths, non-Markdown files, and paths that contain symlinks. Each written Markdown file must have a description in its front matter. The description can have up to 150 characters. Pi Dream rejects a file when its first body line starts with `scope:` or `description:`. A field in the body has no effect, so the error tells the worker to move it into the front matter. The extension uses a temporary file and rename for writes.

`dream_memory_edit` takes `findingIds` instead of evidence. Each ID names a finding from `findings.jsonl`. Pi Dream rejects an unknown ID and any note-only finding. A note must first have a source-backed finding. A successful edit adds one version 2 JSON record to `writes.jsonl`. The record lists the finding IDs, the session IDs behind them, and the evidence copied from those findings. Each evidence item shows its session ID, entry ID, and quote. The author is `Pi Dream consolidation`. The harness supplies the job ID and time.

An edit with an empty `findingIds` list is a cleanup edit. A cleanup edit can merge, shorten, move, or delete existing content. The prompt allows no new facts in a cleanup edit. Pi Dream does not check this rule. Human review checks it.

## Project scope

A memory file can set `scope` in its front matter:

```markdown
---
description: Test command for this project.
scope: ~/projects/example
---
```

A scope value must be an absolute path or start with `~/`. The scope must also be the batch working directory or a parent folder of it. For example, a batch from `~/projects` can use `scope: ~/projects` or `scope: ~`. It cannot use `scope: ~/projects/diagrams`. A narrower scope hides the file from the sessions that gave its findings. `dream_memory_edit` rejects other scope values.

The prompt index shows a scoped file only when the session working directory is the scope folder or a folder inside it. A file without `scope` appears in every session. Existing files have no scope, so they appear everywhere until a batch adds one.

The index filters files by scope only. Normal file commands can still find any accepted file.

## Targeted memory checks

Run `/dream-check target.md another.md` to check selected accepted files. Use relative Markdown paths in the memory store. The command rejects missing files and paths outside the store. It asks for confirmation before it starts a job.

Run `/dream-check --all` to check every regular Markdown file in accepted `master`, the branch that stores accepted memory. This includes subfolders, `README.md`, names with spaces, uppercase `.MD` extensions, and all project scopes. It excludes hidden paths, symbolic links, non-Markdown files, and untracked files. Do not combine `--all` with file arguments. If no accepted Markdown file exists, the command notifies you and starts no job.

The confirmation lists the selected files. It warns that an all-file check includes all projects and can use more model tokens. Pi Dream fixes the selected file list before confirmation. It keeps the existing review and manual apply steps.

The command reuses source evidence from jobs already accepted in `master`. It does not scan current sessions or consume pending notes. The confirmation shows the retained source-session count and warns about missing evidence. Sources can come from several projects. Old jobs can have only limited transcript exports. Pi Dream labels those sources as limited because clipped text cannot be recovered.

One worker reviews all selected files together. This keeps related claims in the same review. With `--all`, Pi Dream selects all accepted Markdown files. The worker reads each selected file and reviews every original passage. A passage is a paragraph or list item. Headings and code also count as passages. The worker uses `dream_review` to inspect progress, record passage outcomes, and finish the combined comparison. Each passage has one outcome: `supported`, `corrected`, `unsupported`, or `nonfactual`. A `nonfactual` outcome needs an explanation.

The worker uses `dream_source_search` and `dream_source_read` for single source operations. It can use `dream_source_batch` for up to eight independent searches or reads. Each request keeps the single-operation pagination rules. The batch returns results in input order. Each result has its input index and a result, an error, or `deferred: true`. The result text and excerpts total at most 16,000 characters per call. If a request exceeds the remaining limit, the batch defers the whole request. Other requests can still succeed. Errors and deferred requests do not create evidence records. Successful records save together under the review lock. Retry only failed or deferred requests.

For `supported` and `corrected` outcomes, the worker records source-backed findings and reads their source entries. For `unsupported` outcomes, it uses completed searches and reads matching source passages. It does not need searches when the job has no source sessions. A search used as evidence must include every result page or have a completed narrower search. A narrower search must keep the original query and source scope. Unused exploratory searches still block completion until the worker finishes, narrows, or explicitly closes them with a reason. Closing a search does not review a passage or resolve a contradiction.

The worker can record up to eight findings in one `dream_finding_batch` call. Each finding keeps the `dream_finding` fields and evidence checks. Results show the input index and either `recorded: true` with an ID, or an error. One failed finding does not discard other findings. The worker retries only failed inputs. Calls run in order to prevent ID conflicts. The worker then records one comparison across all selected files. This comparison includes final file content hashes. Any later edit makes the comparison incomplete.

Worker prompts prefer batching for independent work. Single-operation tools remain available.

The `dream_review` action `record` accepts up to twenty outcomes per call. The `close_searches` action accepts one to twenty search closures per call. Each closure has an `id` and a nonblank `reason` of 1 to 4,000 characters. The action checks the full request before it changes any search. It rejects unknown or repeated IDs, searches cited by outcomes, and completed or narrowed searches. Repeating the same closure does not change the review. A closed search keeps its query, scope, pages, and matches, but it cannot support an outcome or complete a narrower-search requirement. A new search with the same query and scope reopens that search and invalidates the final comparison. A new closure or changed reason also invalidates the final comparison.

The actions `record`, `close_searches`, and `finish` return counts only. These responses include `closedSearchCount`. The `history` action returns saved outcomes as JSON text. Join all text parts for one record before you parse its JSON. Status and history responses include the closure count. Status search pages exclude closed searches. The review report lists each closed search ID, query, scope, and reason.

The `status` action returns up to ten pending passages and up to 8,000 passage-text characters per page. A cursor identifies the next position to read. A long passage can span pages. Its cursor stores its original passage index and text offset. Outcomes do not change original passage indices.

Pass `nextCursor` as `cursor` to read the next page. The `history` action uses the same page and cursor limits.

The `status` action also returns up to ten open-search summaries without match records. The response lists up to ten unread file names and gives their total count.

Pass `nextSearchOffset` as `searchOffset` to read the next search page.

The worker can read other memory files for context. It can edit only the selected files, and it cannot create new files. A passage does not need an edit to count as reviewed. Missing evidence alone does not justify deleting a fact. The worker can correct links to missing local Markdown files when the intended target is clear. Review the branch with `/dream-review` before you apply it. The normal apply approval still applies.

Each attempt stores its coverage record in `workers/consolidate/attempt-*/review.json`. The job folder contains `review-progress.json` during review. After successful review, it also contains `review.json`. The report lists passage outcomes and the combined comparison. These records show recorded coverage, not whether the evidence supports the conclusions. Human review remains necessary.

## Review and apply

When a batch finishes, the runner publishes one branch named `dream/<job-id>` in the accepted repository. The review command writes `diff.md` in the job directory. The branch contains one batch commit, even when the batch has no file changes. The commit uses the recorded base as its parent. Pi Dream uses a private Git index and Git commands `commit-tree` and `update-ref`. It does not check out the branch or change the normal Git index. The review file contains the change summary, full diff, batch commit, and evidence records. For `/dream-check`, it also contains the selected files and the worker report. The report lists source or link warnings. Pi Dream warns about missing local Markdown targets in selected files. It does not check external URLs or heading anchors.

The evidence records table has these columns: Sessions, Findings, Action, Path, Quotes, and Reason. Sessions shows how many sessions support each edit. Findings lists the finding IDs. Each finding ID refers to one line in `findings.jsonl` in the job folder. Version 1 records from older jobs still display. They show one session and no finding IDs.

Open `~/.pi/agent/memory/` in lazygit to review a branch. Compare `dream/<job-id>` with `master`. You can also merge the branch manually. A normal merge keeps the published commit in the history. Pi Dream detects that merge during UI polling and job commands or selection. A squash merge or cherry-pick does not prove acceptance, so Pi Dream does not mark those sessions as processed.

The `/dream-review` command reads the current commit on `dream/<job-id>`. It also updates the recorded commit. This applies after extra correction commits or an amended proposal replaces the original commit. If a user rewrites branch history before a manual merge, run `/dream-review` first. A normal merge must keep the recorded commit in `master` history for Pi Dream to detect acceptance.

The `/dream-apply` command requires interactive approval. It requires a clean accepted repository checked out on `master`. The named branch can contain correction commits or a replaced proposal commit. Pi Dream uses the current branch commit to track accepted sessions. If the branch does not exist, Pi Dream stops. It does not recreate the branch. Pi Dream marks sessions as processed when it detects the recorded commit in `master` history.

Apply has three cases:

1. `master` did not move. Apply merges the branch with `--ff-only`. A fast-forward moves `master` to a later commit without combining separate histories.
2. `master` moved, and the files do not conflict. Apply runs `git merge-tree` without a checkout. It writes one merge commit with two parents, `master` and the branch tip. It moves the branch to that commit and fast-forwards `master`.
3. `master` moved, and a file conflicts. Apply starts the runner in the `merge` phase and stops. The runner snapshots the conflicted tree with `diff3` markers into `workers/merge/attempt-*/candidate`. One worker with the consolidate tools removes the markers. The prompt lists the conflicted files and the batch findings. The runner rejects a file with a line that starts with `<<<<<<< `, `||||||| `, or `>>>>>>> `. A `=======` line is a valid Markdown heading underline, so the runner does not test it. The runner commits the resolved tree with two parents and sets the job to `ready`. Review the result with `/dream-review`, then run `/dream-apply` again.

The merge worker uses the job model and the consolidate timeout. The merge step makes up to three attempts when `master` keeps moving. The review diff compares the branch with its merge base, so a merged `master` adds no noise. The batch commits list shows commits that are not in `master`, including `Merge master into dream/<job-id>`.

Apply accepts the complete batch. It does not apply selected files or edits. It records acceptance before it deletes the `dream/<job-id>` branch name. It deletes that name only if the branch still points to the accepted commit. A cleanup error produces a warning and preserves the branch. Accepted memory and processed sessions remain valid.

A failed apply or canceled confirmation keeps the branch. A manual merge does not delete the branch. Apply keeps candidate folders, logs, findings, evidence, job records, and accepted commits.

Discard deletes only the expected `dream/<job-id>` branch and the original candidate folder. It keeps attempt folders, findings, evidence, and logs. It refuses queued, running, and applied jobs. Discarded sessions remain eligible for another batch. Pi Dream reserves sessions in queued, running, and ready jobs.

Existing jobs can contain candidate Git repositories from the earlier implementation. Run `/dream-review <job-id>` to publish a ready legacy candidate. This command keeps its files and history intact.

## Model and privacy

Set `dream.workerModel` and `dream.orchestratorModel` in `~/.pi/agent/settings.json` to select separate models. Each setting falls back to `dream.model`, then to the active concrete model. If Pi Dream cannot select a concrete model for either role, it stops and asks you to set a model.

The worker model reads sessions and extracts findings. The orchestrator model reads findings and edits candidate memory. A new job manifest stores the worker model in `model` and the orchestrator model in the optional `orchestratorModel` field. Older jobs use `model` for both roles. A resumed job keeps its recorded models, even if you change the settings.

```json
"dream": {
  "model": "my-provider/my-model",
  "workerModel": "worker-provider/worker-model",
  "orchestratorModel": "memory-provider/memory-model"
}
```

Workers start with `--no-extensions`. A worker cannot use a provider that an extension adds unless you load that extension. Set `dream.extensions` to a list of extension paths. The runner passes each path to the worker with `--extension`.

```json
"dream": {
  "model": "my-provider/my-model",
  "extensions": ["~/path/to/provider-extension"]
}
```

A path that starts with `~/` starts at your home folder. Pi Dream resolves other relative paths from `~/.pi/agent`. The job manifest stores the absolute paths. If the setting is missing, the worker gets no extra extension. Without the provider extension, the worker log shows `Model "<provider>/<model>" not found` and the job fails.

Before the batch starts, Pi Dream names both models and their providers. It shows the session count, working directory, and parallel worker count. It asks for confirmation. The worker provider receives session content. The orchestrator provider receives findings, retained source messages, and candidate memory. Normal batches process sessions from the current working directory. Targeted checks can use retained sources from several projects. Redaction covers common credential forms, but it cannot find every secret. Review the confirmation details before you approve a batch.

Before each agent run, `before_agent_start` adds the memory folder and guidance to the system prompt. The system prompt contains instructions sent to the model. It also includes an index, a list of accepted memory paths and descriptions. The index shows only files in scope for the session working directory. It includes at most 100 files and 12,000 characters. It does not include full file content. If some files do not fit, the index adds this line: `<n> more file(s) are not listed. Search them with rg.` Pi Dream has no saved search database or meaning-based search.

The prompt shows a memory folder under your home folder as a home-relative path, such as `~/notes`. It shows the home folder as `~`. It shows a folder outside your home folder as an absolute path.

Normal sessions register `dream_note`, but not the worker tools. The model can use normal file commands to search and read accepted Markdown files. For example, it can run `rg "response preference" "/path/to/memory"` to search, then `cat "/path/to/memory/global/preferences.md"` to read a file. The guidance treats memory as historical context, not instructions. It requires an explicit user request before file changes. Normal file tools do not enforce this restriction.

All normal sessions use the same accepted memory root. The index uses accepted Markdown files only. It does not include pending job files. Pi Dream rebuilds it at each run, so new accepted memory appears on the next run. The guidance does not guarantee that the model reads every memory file.

## Failure recovery

A failed worker marks the job as failed. The job does not publish a branch. Pi Dream does not apply a failed job. A queued or running job cannot be discarded through `/dream-discard`.

If a check worker stops before review is complete, Pi Dream requests more work in the same worker context. It can allow more than three total stops when each stop records new review work. New passage outcomes, distinct selected-file reads, search pages, and distinct source-read ranges count as progress. An increased closed-search count also counts as progress. Repeated identical closures do not count. Counts keep their highest values, so removing records does not reset the limit. Reopening and closing searches cannot keep resetting the consecutive stall count. Progress resets that count.

After stops without progress, Pi Dream allows three further provider requests. If coverage remains incomplete, the job fails without publishing a branch. A normal model stop cannot make an incomplete check `ready`. The existing one-hour consolidation timeout applies across all continuations. Evidence and completion checks do not change. Manual apply does not change.

Run `/dream-resume [job-id]` to resume a failed job. For an incomplete combined review, resume selects the latest attempt. It validates the original selection, source hash, candidate, findings, outcomes, source reads, search receipts, and edit records before it starts a model. It also checks closure reasons and rejects closures linked to outcomes. It replays source searches separately from closure metadata. Older records without closures remain valid.

New attempts bind their inputs to the recorded model and job data. After a worker exits, a checkpoint binds its saved review, findings, writes, and candidate files. Older attempts without these records use structural, source, and edit validation. Invalid or inconsistent records stop resume. Pi Dream does not start a fresh review or use an older attempt as a fallback.

Pi Dream copies valid candidate files, findings, writes, and review data into a new attempt. It does not change earlier attempt files or logs. It keeps the original review base if `master` moves. The existing apply merge handles newer accepted memory.

The new worker receives saved findings and review counts. It gets instructions to reuse completed work and inspect pending passages. The worker does not restore the prior conversation because it runs with `--no-session`. All selected files remain one combined review. The worker must finish a new comparison across all selected files.

The `history` action lets the worker read saved outcomes in pages. Each page contains up to ten records and 8,000 text characters. A cursor identifies the next record and text offset. Join split text for a record before you parse its JSON.

Each worker loads one frozen source snapshot. Frozen means that the worker cannot change the loaded data. The first load checks the full file hash and structure. Each later use checks that the snapshot remains a regular file, not a symbolic link. It compares the file identity, size, and modification and change times. Time comparisons use nanosecond precision. A changed file stops reuse, including a same-size edit with a restored modification time or a replacement file. The first read uses `O_NOFOLLOW` and checks file metadata before and after the read. The runner still checks full hashes at validation and publication boundaries. Source extraction uses a filtered view and does not change the cached snapshot.

Resume confirmation states that Pi Dream will reuse valid saved work and that each attempt has a one-hour limit. The limit applies to each attempt. Pi Dream does not retry paid work automatically, start extra workers, or guarantee completion within one hour. An incomplete attempt cannot publish or apply. A timeout or worker failure report includes saved coverage when its records remain readable.

A completed review can retry publication without another model run. An incomplete normal batch still restarts consolidation from the original candidate. Pi Dream keeps valid completed sessions and skips them. Completion records bind the transcript and findings to their hashes. The runner also accepts an older successful session when its job summary says it completed and its log has a final successful model response.

If an active runner, accepted session, or conflicting reservation exists, resume stops. It can resume an interrupted queued or running job after its process stops and its lock clears. Resume also stops for older jobs that edited the original candidate during consolidation. Review those candidates and logs manually. A stale lock blocks resume. Inspect its owner before you remove it. Resume does not change accepted memory automatically.

After a worker exhausts its retries or reports a permanent error, no new session starts. Active workers finish first. Pi Dream stores the worker error in the job state. The error includes the path to `worker.error.log`. The UI notification shows this error when the latest job fails.

Detailed worker logs remain under the job's `workers/` directory. If a process crashes while it holds a lock, the lock remains. Lock attempts stop with a bounded timeout error. Before you remove a lock manually, make sure that no active process uses it.

If the merge worker fails, the job is failed and the branch keeps its last commit. Run `/dream-resume` to run the merge again. You can also merge the branch manually in the accepted repository. If the memory Git repository is unavailable or damaged, Pi Dream commands stop rather than change accepted memory. Use the repository's Git history to recover accepted memory. Do not edit the candidate as a replacement for recovery.

## Installation

From the repository root, install the formatter dependency first:

```bash
npm ci --prefix extensions/pi-dream
```

Then install the extension package:

```bash
pi install "$PWD/extensions/pi-dream"
```

After installation or a formatter dependency update, reload open Pi sessions:

```text
/reload
```

Pi Dream initializes the memory directory as a Git repository when the first batch starts. It creates a README and an initial commit when the repository has no commit. The accepted repository uses the `master` branch. At initialization, Pi Dream renames `main` to `master` when `master` does not exist. If both branches exist, initialization stops with an error. Installation alone does not change live Pi settings or create accepted memory.

### Format existing memory

The extension uses Prettier 3.8.1 to format each `dream_memory_edit` write before it saves the file. It calculates the file hash and audit record from the formatted content. The formatter uses the Markdown parser, a print width of 79, prose wrapping, and LF line endings. It does not read project or editor settings. Prettier rules allow some lines to exceed the print width.

The formatter preserves parsed `description` and `scope` metadata. It does not format code inside fenced blocks or YAML front matter. It does not check the full YAML syntax. Delete and move actions remain unchanged.

To format existing memory files, run this command from the repository root. Give it the memory directory as its argument:

```bash
node extensions/pi-dream/format-memory.mjs /path/to/memory
```

The command formats visible Markdown files in all subdirectories. It skips hidden paths and non-Markdown files. It rejects symbolic links inside the memory directory. It formats and checks all files before it writes any file. The command uses the same file lock as `dream_memory_edit`. Atomic writes replace each file with one rename operation. The command reports the changed and total file counts. It does not commit changes.

Review and commit changes to accepted memory before you use Dream apply. Uncommitted changes in accepted memory block Dream apply.

## Validation

Run the review and recovery tests with Node.js:

```bash
node --test extensions/pi-dream/review.test.mjs extensions/pi-dream/recovery.test.mjs
```

Run the source tests with Node.js:

```bash
node --test extensions/pi-dream/sources.test.mjs
```

Run the extension test with the host `jiti` loader and aliases. Set `NODE_PATH` before `node`. The test needs packages from the host install, such as `typebox`:

```bash
host="$(npm root -g)/@earendil-works/pi-coding-agent"
export JITI_ALIAS="{\"@earendil-works/pi-coding-agent\":\"$host/dist/index.js\",\"@earendil-works/pi-tui\":\"$host/node_modules/@earendil-works/pi-tui/dist/index.js\"}"
NODE_PATH="$host/node_modules" node "$host/node_modules/jiti/lib/jiti-cli.mjs" extensions/pi-dream/pi-dream.test.ts
```

The `review.test.mjs` suite tests review passages, source search records, source reads, outcomes, paging, continuation limits, closures, and completion checks. The `recovery.test.mjs` suite tests partial-review recovery, timeout records, legacy validation, corrupt-record rejection, baseline preservation, and publication retries. The `sources.test.mjs` suite tests source capture, redaction, evidence, search, reads, source reuse, and batch limits. Together, these suites contain 73 tests: 26 review, 13 source, and 34 recovery tests.

The `pi-dream.test.ts` suite uses the installed Pi CLI and a local provider that returns fixed responses. Its combined-review workflow covers batch search, explicit closure of an unused search, reads, findings, outcomes, and finish. Together, the Node and extension tests cover source mutation, replacement, symbolic links, frozen reuse, output limits, pagination, and per-item errors. They also cover valid receipts, session isolation, finding IDs, and argument-size limits. They also cover closure validation, evidence rejection, reopening, comparison invalidation, paging, stall bounds, resume retention, and rejection of corrupt closures before worker startup. These tests do not measure live-model speed or quality. They make no paid model calls and do not change live memory. They do not install or reload the extension, run a live model, or rerun a live job.

The extension test also covers transcript filtering, redaction, memory indexing, scope, file safety, hashes, findings, edits, Git conflicts, and commands. It covers batch work, notes, targeted checks, evidence, reports, worker failures, concurrency, publication, apply, merge, and `/dream-check --all` selection. Formatter tests cover formatting, metadata, repeatable output, safe directory formatting, and missing dependencies. These tests do not guarantee faster live-model completion. Run `git diff --check` to check the documentation diff.
