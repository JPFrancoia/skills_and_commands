# Background pull request command plan

Status: Completed
Date: 2026-07-23

## 1. Brief

Add `/pr [repo-path]` as the end-to-end counterpart to `/m`: it will hand the selected repository to a dedicated async agent, then return control immediately. The child will create a sensible feature branch when starting from `main` or `master`, commit only the staged changes with a contextual message, push the branch, open or reuse a GitHub PR or GitLab MR, wait for CI, and report the final URL and result.

## 2. Current state / relevant context

- `/m [repo-path]` already provides the proven Pi pattern: resolve the repository in an extension, preflight the staged index, launch a forked/fresh async subagent over the `pi-subagents` RPC event, and let Pi deliver completion later.
- `extensions/pi-background-commit.ts`, `extensions/pi-background-commit.test.ts`, `commands/m.md`, and `agents/pi/contextual-committer.md` are the direct references.
- Forked child sessions can restore the parent session CWD. Every Git command must therefore use `git -C "$TARGET_REPOSITORY"`, and every `gh`/`glab` command must either run after an explicit `cd "$TARGET_REPOSITORY"` or receive an explicit repository argument.
- `/m` deliberately commits the live staged index when the child runs. `/pr` will preserve that behavior rather than snapshotting the index.
- `gh` is installed locally. `glab` is not currently installed; GitLab repositories will fail early with a clear prerequisite message until it is installed and authenticated.
- The repository has no `docs/` directory. The durable implementation record currently lives under `plans/`.

## 3. Proposed implementation

```text
/pr infra
    │
    ├─ resolve infra to an absolute Git root
    ├─ confirm that changes are staged
    └─ launch pull-request-creator asynchronously
             │
             ├─ inspect staged diff and origin remote
             ├─ identify GitHub or GitLab and preflight its CLI/auth
             ├─ compose contextual commit message
             ├─ if on main/master, create <type>/<meaningful-slug>
             ├─ commit only the live staged index
             ├─ push HEAD to origin with upstream tracking
             ├─ create or reuse the PR/MR
             ├─ watch provider CI to completion
             └─ report branch, commit, URL, and CI success/failure
```

### Extension command

Create a separate `pi-background-pr` extension rather than broadening the narrowly scoped `/m` extension.

- Register `/pr` with argument hint behavior matching `/m`.
- Resolve quoted or unquoted paths relative to the parent conversation CWD.
- Reject non-repositories and repositories with no staged changes before launching a child.
- Select `context: fork` when a persisted session and leaf exist; otherwise use `fresh`.
- Emit an async RPC spawn for `pull-request-creator`, carrying the exact resolved Git root in both `cwd` and task text.
- Notify only about launch success/failure. The child completion notification carries the final PR/MR and CI result.

### Pull request agent

Add a dedicated `bash`-only agent using the existing contextual-commit skill and the same model/fallback pattern as `contextual-committer`.

#### Preflight before mutation

- Verify staged changes still exist; otherwise report a successful no-op.
- Reject detached HEAD.
- Read the `origin` push URL and identify GitHub or GitLab.
- Verify the matching CLI exists and is authenticated before creating a branch or commit.
- Stop on unsupported or ambiguous remotes rather than guessing.

#### Branch and commit

- Compose the contextual commit from `git diff --cached`, recent scopes, and only the inherited context relevant to the staged diff.
- If the current branch is exactly `main` or `master`, create a short semantic branch name from the commit type and subject, such as `feat/add-pr-command` or `fix/ci-watch-exit`.
- Normalize the slug, validate it with `git check-ref-format --branch`, and append a numeric suffix only when the name already exists.
- If already on another branch, keep it.
- Commit only the live staged index with normal hooks enabled. Never run `git add`, amend, or bypass hooks.

#### Push and PR/MR creation

- Push explicitly with `git -C "$TARGET_REPOSITORY" push -u origin HEAD`.
- Run provider commands non-interactively and against the explicit target repository.
- GitHub: create with commit-derived title/body (`gh pr create --fill`) or return the existing open PR for the branch.
- GitLab: create with commit-derived title/body (`glab mr create --fill --fill-commit-body --yes`) or return the existing open MR for the branch.
- Let the provider infer the repository default target branch; do not add base/draft/reviewer/label syntax until requested.

#### CI and final result

- GitHub: `gh pr checks <PR> --watch --fail-fast`.
- GitLab: `glab ci status --branch <branch> --live`.
- If the provider reports no checks or pipeline, report success with “no CI found” rather than spinning forever.
- If CI fails, report the PR/MR as successfully opened but the overall `/pr` result as failed, including the URL and failed check/pipeline output.
- On any partial failure, report exactly which stages completed. Do not roll back commits, branches, pushes, or open PRs/MRs automatically.

### Fallback prompt and activation

- Add `commands/pr.md` mirroring the extension contract for sessions where the extension is not loaded.
- Add symlinks matching the current `/m` installation pattern:
  - `~/.pi/agent/extensions/pi-background-pr.ts`
  - `~/.pi/agent/prompts/pr.md`
- The existing `~/.pi/agent/agents` symlink already exposes the new agent.
- Run `/reload` after installation.

### Deliberate simplifications

- Do not refactor `/m` into a generic Git workflow framework.
- Do not add dependencies or wrap `gh`/`glab` APIs.
- Do not support forks, alternate remotes, stacked PRs, draft flags, reviewers, labels, or custom base arguments in v1.
- Use `origin` as the push remote and the provider’s default branch as the PR/MR target.

## 4. File-by-file impact

- `extensions/pi-background-pr.ts` — new `/pr` command, repository/staging preflight, async RPC launch, and notifications.
- `extensions/pi-background-pr.test.ts` — dependency-free assertions for path parsing, preflight failures, RPC payload, exact target path, and fork/fresh context selection.
- `agents/pi/pull-request-creator.md` — narrow end-to-end Git/provider/CI child contract.
- `commands/pr.md` — prompt-template fallback that launches the same child asynchronously.
- `plans/background-pull-request-plan.md` — implementation decisions, progress, deviations, and final validation results.
- Optional, only if requested: `docs/README.md` plus a concise `/pr` usage document created after implementation.
- User configuration symlinks under `~/.pi/agent/` — activate the extension and fallback prompt.

## 5. Risks and edge cases

- **Wrong repository:** child CWD is not trustworthy after a fork. Require explicit target paths for all Git and provider commands.
- **Missing provider tooling/auth:** preflight `gh` or `glab` before branch/commit mutation and return the exact setup failure.
- **Branch collision:** validate and suffix generated names; never overwrite or reset an existing branch.
- **Live-index race:** like `/m`, `/pr` commits whatever is staged when the child reaches the commit step. Later staging can join the commit; another commit agent may empty the index first.
- **Partial remote state:** commit can succeed while push, PR creation, or CI fails. Preserve state and report the completed stages instead of attempting risky rollback.
- **Duplicate invocation:** reuse an existing open PR/MR for the current branch when detectable, then watch its CI rather than opening a duplicate.
- **CI startup delay or no CI:** use the provider watcher; treat an explicit no-check/no-pipeline result separately from a failed check.
- **Long-running CI:** expected because the work is async. No artificial timeout is added in v1.
- **Existing feature branch:** keep its name and include the newly staged commit; provider default branch remains the target.
- **Unstaged/untracked files:** never stage or commit them.

## 6. Validation / testing

- Run `~/.pi/agent/npm/node_modules/.bin/jiti extensions/pi-background-pr.test.ts`.
- Import-check with `PI_OFFLINE=1 pi --no-extensions -e extensions/pi-background-pr.ts --list-models`.
- Run a strict temporary `tsc --noEmit` check using Pi’s installed types, following the `/m` plan precedent.
- Run `git diff --check` and verify only planned files changed.
- Verify symlink targets and run `/reload`; confirm `/pr` appears and `pull-request-creator` is discovered.
- Exercise preflight safely against a temporary repository: invalid path, no staged changes, detached HEAD, unsupported remote, and missing provider CLI.
- Perform one manual disposable GitHub smoke test when an actual remote branch/PR side effect is acceptable: stage a harmless change, invoke `/pr`, verify branch name, contextual commit, push, PR URL, and CI result.
- GitLab flow receives prompt/contract review and CLI-document validation now; a live smoke test requires installing/authenticating `glab` and a disposable GitLab repository.

## 7. Step-by-step execution checklist

- [x] Trace `/m`, its agent, tests, deployment symlinks, and prior failure history.
- [x] Verify official `gh` and `glab` create/watch commands.
- [x] Record v1 behavior, simplifications, risks, and validation plan.
- [x] Get plan approval (user chose implementation without a grill pass).
- [x] Add `pull-request-creator` agent.
- [x] Add `/pr` extension and focused test.
- [x] Add fallback `/pr` prompt.
- [x] Run focused automated validation.
- [x] Install activation symlinks and verify `/pr` dispatch in a fresh Pi process; the already-running session still needs `/reload`.
- [x] Run safe unsupported-remote and missing-`glab` preflight scenarios without Git mutation.
- [x] Defer a live GitHub PR smoke test to avoid creating an unrequested remote branch/PR during implementation.
- [x] Keep documentation in this plan, as requested; do not create `docs/`.
- [x] Mark this plan Completed with date and validation results.

### Implementation and validation results

- Added the dedicated `pull-request-creator`, `/pr` extension, runnable extension test, and prompt fallback.
- Focused `jiti` test passed, including exact `git -C` calls, fork/fresh selection, RPC rejection, and preservation of whitespace in resolved Git roots.
- Extension import passed with `PI_OFFLINE=1 pi --no-extensions -e extensions/pi-background-pr.ts --list-models`.
- Strict temporary `tsc --noEmit` check passed against Pi's installed types.
- `git diff --check` passed; only the five planned repository files are new.
- A fresh reviewer found three actionable issues: missing activation, path trimming, and ambiguous no-CI handling. Activation was installed, root parsing now strips line endings without stripping path spaces, and provider-specific CI discovery/exit rules were added.
- Disposable agent preflight passed for an unsupported remote and for a GitLab remote with missing `glab`; both left the staged index, default branch, and zero-commit history unchanged.
- Created and verified `~/.pi/agent/extensions/pi-background-pr.ts` and `~/.pi/agent/prompts/pr.md` symlinks. A fresh offline Pi print process dispatched `/pr` without invoking a model.
- Live GitHub creation/CI watching was not run because it would create real remote state. Live GitLab validation remains unavailable until `glab` is installed and authenticated.

## 8. Open questions / assumptions

- Assumption: `/pr` mirrors `/m` and therefore requires staged changes; it does not open a PR for already-committed work when the index is empty.
- Assumption: invoking `/pr` is authorization to create/switch a branch, commit, push, create or reuse a PR/MR, and wait for CI without another confirmation.
- Assumption: `origin` is the intended push remote.
- Assumption: only literal `main` and `master` trigger automatic branch creation.
- Assumption: provider default branch is the target; no optional base argument is added in v1.
- Assumption: “no CI configured/found” is a successful PR/MR result with an explicit warning, while a failed check/pipeline is an overall failure.
- User decision: do not create a new `docs/` directory; keep the durable usage/architecture record in this plan.
