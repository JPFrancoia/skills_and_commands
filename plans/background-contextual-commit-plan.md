# Background contextual commit command plan

Status: Completed
Date: 2026-07-18

## 1. Brief

Make `/m [repo-path]` launch a contextual commit in a Pi subagent and return control immediately, so the current conversation can continue while the commit message is produced and committed. A small Pi extension will own the `/m` command, while a narrowly permissioned commit agent will inspect and commit only the staged snapshot in the selected repository.

## 2. Current state / relevant context

- `commands/m.md` currently performs the commit in the parent conversation and has uncommitted edits that add `/m enterprise` support and remove confirmation.
- Pi extension commands run before prompt templates, so an extension can register the exact `/m` command and shadow the prompt template without changing the invocation.
- `pi-subagents` exposes a stable in-process RPC event (`subagents:rpc:v1:request`) whose `spawn` method always launches asynchronously.
- A forked subagent inherits the parent conversation, which is needed to write contextual action lines from session intent and decisions.
- `~/.pi/agent/agents` already symlinks to `agents/pi`, and existing extensions are stored in this repo then symlinked into `~/.pi/agent/extensions/`.
- Existing unrelated work must remain untouched: `extensions/pi-sqz-auto.ts` is currently deleted, and that deletion is not part of this feature.

## 3. Proposed implementation

### Direct `/m` flow

```text
/m enterprise
    │
    ├─ extension resolves enterprise to its Git root
    ├─ extension verifies staged changes exist
    ├─ extension records HEAD + staged tree IDs
    └─ extension requests async forked contextual-committer
             │
             ├─ verifies HEAD still matches
             ├─ loads the invocation tree into a private temporary index
             ├─ reads only that snapshot and relevant commit history
             ├─ writes a contextual commit message from snapshot + forked conversation
             ├─ verifies HEAD again
             └─ commits through the private index and reports through Pi's async notice
```

### Extension behavior

Create a single-file extension registering `/m`.

- Treat the complete command argument as an optional repository path; default to `.`.
- Resolve relative paths from `ctx.cwd`, then use `git -C` to find the actual repository root.
- Stop immediately with a notification when the path is not a Git repository or has no staged changes.
- Capture:
  - the staged tree with `git write-tree`;
  - the current HEAD, or an explicit unborn-branch marker.
- Emit a version-1 `spawn` request on the documented `pi-subagents` RPC event bus with:
  - `agent: contextual-committer`;
  - `cwd` set to the resolved repository root;
  - `context: fork`;
  - `async: true`;
  - the expected tree and HEAD in the task.
- Return from the command handler after launch is requested. Listen for the launch reply only to show success/failure; normal `pi-subagents` notifications report final completion.

### Commit agent behavior

Create a custom agent with only the `bash` tool and the `contextual-commit` skill.

- Never ask for confirmation.
- Never run `git add`, edit project files, push, amend, or include unstaged/untracked changes.
- Verify the invocation's expected HEAD before analysis and immediately before committing.
- Load the expected tree into a private temporary index and analyze/commit only through `GIT_INDEX_FILE`; later changes in the real index remain staged for the next commit.
- Analyze the private snapshot diff, recent contextual scopes, and inherited conversation context.
- Commit with `git commit -F -` through the private index so subject/body formatting and normal hooks are preserved.
- Clean the private index and lock on every exit path, then report the commit message, hash, repository, and any failure clearly.

### Prompt-template fallback

Update `commands/m.md` to describe the same background launch through the `subagent` tool. It is normally shadowed by the extension, but remains a usable slower fallback if the extension is not loaded: the parent performs the quick Git snapshot and launches the same agent asynchronously.

## 4. File-by-file impact

- `extensions/pi-background-commit.ts` — new `/m` extension, Git preflight, snapshot capture, and async RPC launch.
- `extensions/pi-background-commit.test.ts` — runnable extension preflight/RPC-launch and private-index isolation check using Pi's installed `jiti`.
- `agents/pi/contextual-committer.md` — new restricted commit subagent.
- `commands/m.md` — change from synchronous commit instructions to async-subagent fallback instructions while retaining `[repo-path]` syntax.
- `plans/background-contextual-commit-plan.md` — decision record, updated during implementation and marked completed afterward.
- `~/.pi/agent/extensions/pi-background-commit.ts` — untracked symlink to the repo extension for activation.

No changes will be made to the unrelated deletion of `extensions/pi-sqz-auto.ts`.

## 5. Risks and edge cases

- **Staging changes while the child works:** the child commits from a private snapshot index, so later-staged changes stay in the real index for the next commit.
- **Two `/m` runs for one repository:** the first successful commit changes HEAD; the second detects the mismatch and aborts.
- **Unborn repositories:** represent the missing HEAD explicitly and allow the first snapshot commit.
- **Git hooks:** hooks remain enabled and operate on the private index. A hook can intentionally change the committed tree; the agent reports a post-commit mismatch rather than bypassing hooks.
- **Ephemeral parent session:** forked execution requires a persisted session. The RPC launch failure will be surfaced instead of falling back silently to fresh context.
- **Extension unavailable:** the prompt template remains a slower async fallback, but requires one parent-agent turn to perform preflight and launch.
- **Concurrent parent Git operations:** unstaged edits and later staging are safe. Another commit, reset, or checkout changes HEAD and causes the background commit to abort or fail through Git's normal ref locking.

## 6. Validation / testing

- Run `git diff --check`.
- Type-check/import the extension with Pi's installed TypeScript runtime/types using a temporary config; do not add project dependencies.
- Confirm `contextual-committer` appears in `subagent({ action: "list" })` after discovery/reload.
- Verify the private-index behavior in a temporary repository:
  - snapshot A is committed from the private index;
  - later-staged B is absent from that commit;
  - B remains staged in the real index afterward;
  - moving HEAD produces a mismatch and must abort.
- Run an end-to-end smoke test in a temporary root containing a nested Git repository:
  - stage one file in the nested repository;
  - invoke `/m nested` through a separate Pi test process/session;
  - verify the command returns after launch, the nested repository receives one commit, and the outer directory is untouched.
- Verify no-staged and invalid-path invocations produce notifications without spawning a model.
- Run `/reload` in the active Pi session after installing the extension symlink.

## 7. Step-by-step execution checklist

- [x] Implement the restricted contextual committer agent.
- [x] Implement `/m` extension preflight and async RPC launch.
- [x] Convert `commands/m.md` into the async fallback launcher.
- [x] Create the global extension symlink.
- [x] Run static checks and agent discovery validation.
- [x] Run private-index isolation and HEAD-race checks in temporary repositories.
- [x] Attempt the nested-repository end-to-end smoke test; record the non-interactive CLI limitation below.
- [x] Review the final diff without touching unrelated work.
- [x] Skip `docs/` as explicitly requested by the user.
- [x] Mark this plan completed with validation results.

### Actual validation results

- Extension import: passed with `PI_OFFLINE=1 pi --no-extensions -e extensions/pi-background-commit.ts --list-models`.
- TypeScript: passed strict `tsc --noEmit` for the extension and test using a temporary config and Pi's installed packages.
- Runnable test: passed `extensions/pi-background-commit.test.ts` through Pi's installed `jiti`; covered invalid repository, no staged changes, quoted paths, async forked RPC payload, and private-index isolation of later-staged changes.
- Agent discovery: `/subagents-models contextual-committer` resolved the custom agent and its inherited model.
- Private-index guard: the runnable temporary-repository test proves snapshot A is committed, later-staged B is excluded, and B remains staged afterward; earlier shell checks also proved HEAD mismatches abort.
- Nested end-to-end: attempted twice in isolated temporary repositories. A bare print-mode slash invocation has no persisted session, while resumed `pi -p` returned the prior answer without invoking extension commands; therefore a true forked background commit could not be exercised safely from a separate non-interactive process. The first attempt also exposed and fixed a stale-context timeout callback; notifications now tolerate session shutdown and the timer is unreferenced. The remaining live check is to run `/reload`, stage a disposable change, and invoke `/m <repo>` in an interactive persisted Pi session.
- Repository hygiene: `git diff --check` passed; nothing was staged; the pre-existing deletion of `extensions/pi-sqz-auto.ts` was not touched.

## 8. Open questions / assumptions

- Assumption: the command argument is one repository path, including spaces if entered as the full remainder of `/m`; commit type/scope hints are no longer accepted.
- User decision: preserve normal Git hooks. The private index isolates concurrent staging, while trusted hooks may intentionally change the committed snapshot and trigger a reported tree mismatch.
- Assumption: Pi's existing async completion widget/notification is sufficient; no second custom progress UI is needed.
- Decision: use the documented `pi-subagents` RPC instead of spawning another Pi process or implementing background process management ourselves.
- Decision: use a custom agent rather than the generic delegate so tools and commit boundaries stay narrow.

## Grill option

The plan can be challenged with the `grill` skill before implementation. Recommendation: skip grill because the workflow is narrow and follows Pi and `pi-subagents` documented integration points, but use it if you want to stress-test concurrency and failure behavior first.
