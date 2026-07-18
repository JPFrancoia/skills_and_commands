# Background contextual commit command plan

Status: Completed
Date: 2026-07-18

## 1. Brief

Keep `/m [repo-path]` asynchronous, but make the commit behavior deliberately simple: the child commits whatever is staged when it runs. Remove the captured tree and HEAD guards that repeatedly abort when another background commit advances the branch.

## 2. Current state / relevant context

- The `/m` extension resolves the repository and starts `contextual-committer` asynchronously through `pi-subagents`.
- The original implementation captured HEAD and the staged tree at `/m` invocation time, then committed through a private index.
- A live run captured HEAD `89db810…`; another background commit advanced the branch to `5579f531…`; the child aborted solely because HEAD differed.
- The user explicitly prefers live-index behavior over snapshot isolation: commit what is staged when the child runs.
- A forked subagent still inherits the conversation needed for contextual commit reasoning.

## 3. Proposed implementation

```text
/m enterprise
    │
    ├─ resolve the repository
    ├─ confirm something is staged now
    └─ start contextual-committer asynchronously
             │
             ├─ inspect the staged diff when it runs
             ├─ no-op if the index is empty
             ├─ compose the contextual message
             └─ run normal git commit
```

### Extension

- Keep repository resolution, staged-change preflight, async launch, and notifications.
- Stop capturing `git write-tree` and HEAD.
- Tell the child only to commit whatever is staged when it runs.

### Commit agent

- Inspect only `git diff --cached` and its stat.
- Ignore unstaged and untracked files.
- If nothing remains staged, report a successful no-op.
- Run normal `git commit -F -` with hooks enabled.
- Do not add, reset, amend, push, or edit files.

### Rejected complexity

- Do not preserve invocation-time snapshots.
- Do not compare HEAD values.
- Do not create private indexes or merge captured trees onto newer commits.

The live index is the source of truth. This intentionally means changes staged after `/m` but before the child runs can enter that commit.

## 4. File-by-file impact

- `extensions/pi-background-commit.ts` — remove HEAD/tree capture and simplify the child task.
- `extensions/pi-background-commit.test.ts` — remove snapshot-isolation checks and verify the simplified RPC task.
- `agents/pi/contextual-committer.md` — commit the live staged index with no HEAD guard or private index.
- `commands/m.md` — keep the fallback aligned with the extension.
- `plans/background-contextual-commit-plan.md` — preserve the original design decision and record why it was simplified.

## 5. Risks and edge cases

- **Later staging joins the commit:** accepted by explicit user decision; the child commits the index it sees.
- **Another child commits first:** the later child reports a no-op if nothing remains staged.
- **Concurrent Git operations:** normal Git index/ref locking decides the result; the child reports failures without workarounds.
- **Hooks:** remain enabled and may modify or reject the commit as usual.
- **Unstaged/untracked files:** remain excluded because the agent never runs `git add`.

## 6. Validation / testing

- Run the extension's existing runnable test through Pi's installed `jiti`.
- Type-check/import the extension with Pi's installed runtime and types.
- Run `git diff --check`.
- Review `git diff --name-only` and confirm only the five files above changed.
- Reload Pi before the next live `/m` run so the updated extension is active.

## 7. Step-by-step execution checklist

### Original implementation

- [x] Implement the async `/m` extension and restricted child agent.
- [x] Capture invocation HEAD/tree and isolate commits through a private index.
- [x] Validate extension launch and private-index behavior.

### Simplification

- [x] Diagnose the recurring abort as the exact-HEAD snapshot guard.
- [x] Record the initial descendant-tree-merge option.
- [x] Reject that option after the user chose live-index commits instead.
- [x] Simplify the child agent, extension, test, and fallback command.
- [x] Run focused validation.
- [x] Mark this plan completed with results.

### Simplification validation results

- Extension runnable test: passed through Pi's installed `jiti`.
- Extension import: passed with `PI_OFFLINE=1 pi --no-extensions -e extensions/pi-background-commit.ts --list-models`.
- TypeScript: passed strict `tsc --noEmit` for the extension and test using a temporary config and Pi's installed types.
- Repository hygiene: `git diff --check` passed; exactly the five planned files changed.

## 8. Open questions / assumptions

- User decision: commit whatever is staged when the child runs; invocation-time isolation is not required.
- User decision: simplicity is preferred over preserving staged boundaries between closely queued `/m` calls.
- Assumption: normal Git locking is sufficient for rare truly simultaneous commits.
- Decision: keep the child narrowly permissioned and retain normal hooks.
