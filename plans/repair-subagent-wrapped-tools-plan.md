# Repair Subagent Wrapped Tools Plan

**Status:** Proposed
**Created:** 2026-09-10

## Brief

Repair the installed `pi-subagents` runtime so that wrapped Pi core tools remain available to child agents. This fix will restore lazy skill loading for `contextual-committer` without removing `pi-tool-display` or weakening child tool checks.

Pin the official upstream repository at commit `d9864f8288152e83270f62090d7d66eb5ff729bb`. This commit contains the merged regression fix and its tests.

## Current state / relevant context

- `pi-subagents` 0.67.0 is installed from npm at `~/.pi/agent/npm/node_modules/pi-subagents`.
- `pi-tool-display` wraps Pi core tools and changes their source metadata from `builtin` to `npm:pi-tool-display`.
- The installed `getHostBuiltinToolNames()` accepts a core tool only when its source is `builtin` or `auto`.
- The host provides active `read` and `bash` tools, but `pi-subagents` incorrectly reports that `read` is unavailable.
- Workflow `a10bd155-8d3d-496d-9875-d4017fff345e` failed before the child launched or created a commit.
- The upstream fix is commit `d9864f8288152e83270f62090d7d66eb5ff729bb`, named `fix: preserve extension-provided child tools (#2143)`.
- Upstream added a test for wrapped core slots and lazy `read` access.
- The npm registry still lists 0.67.0 as the latest release. The published package does not contain the fix.
- The approved OpenCode cleanup remains staged. The failed workflow did not change the repository.
- `agents/pi/contextual-committer.md` has an unstaged `read` tool addition and a pre-existing fallback-model edit.

## Proposed implementation

1. Run the upstream unit test at commit `d9864f8` before installation.
2. Replace the global npm package entry with this pinned Git source:

   ```text
   git:github.com/nicobailon/pi-subagents@d9864f8288152e83270f62090d7d66eb5ff729bb
   ```

3. Verify that `pi list` reports the pinned Git source.
4. Start a fresh Pi process so that it loads the repaired extension code.
5. Re-run the background contextual commit workflow through the same `pi-subagents` protocol.
6. Verify the new workflow status, commit, branch, index state, and remaining unstaged files.
7. Keep `read` in the contextual committer tool list because its declared skill requires lazy file access.
8. Preserve the pre-existing fallback-model edit without staging it in the cleanup commit.

The pinned Git source is preferable to a direct edit under `node_modules`. The pin survives package reconciliation and records the exact reviewed upstream code.

## File-by-file impact

| Path | Change |
|---|---|
| `~/.pi/agent/settings.json` | Replace `npm:pi-subagents` with the pinned upstream Git source. |
| `~/.pi/agent/git/github.com/nicobailon/pi-subagents/` | Install the pinned package and its dependencies through Pi. |
| `agents/pi/contextual-committer.md` | Keep `read` in the declared tool list. Preserve the unrelated fallback-model edit. |
| `plans/repair-subagent-wrapped-tools-plan.md` | Record the cause, repair, checks, and final result. |
| Staged OpenCode cleanup | No content change during runtime installation. |

## Risks and edge cases

- The fix commit follows release 0.67.0 and includes one earlier post-release checkpoint change.
- A Git package pin will not move during `pi update --extensions`.
- The current Pi process already loaded the defective extension. A fresh process is required for validation.
- A direct retry in the current process can repeat the same preflight failure.
- The Git installation can fail because of network or dependency errors. If it fails, restore the npm package entry.
- The live package change affects all user Pi sessions.
- The contextual committer uses the live staged index. New staged changes can enter its commit.

## Validation / testing

Run these checks:

```bash
cd /tmp/pi-subagents-upstream
npm run test:unit -- --test-name-pattern='wrapped core slots'

pi list

git -C /home/djipey/informatique/ai/skills_and_commands status --short
git -C /home/djipey/informatique/ai/skills_and_commands diff --cached --check
```

Then use a fresh Pi process to run the same background workflow. Verify these results:

- The child launch passes lazy skill tool validation.
- `contextual-committer` creates one commit from the staged cleanup.
- The committed paths match the staged cleanup.
- The repository keeps the unrelated agent edits unstaged.
- The final workflow status is `completed`.

If validation fails, restore `npm:pi-subagents` and report the exact installation or workflow failure.

## Step-by-step execution checklist

- [x] Confirm that the failed workflow created no commit.
- [x] Reproduce the missing `read` report after the agent tool change.
- [x] Trace the failure to `getHostBuiltinToolNames()`.
- [x] Confirm that `pi-tool-display` wraps active Pi core tools.
- [x] Locate the official upstream fix and regression test.
- [ ] Run the focused upstream test.
- [ ] Install the pinned upstream Git package.
- [ ] Verify the installed package source and commit.
- [ ] Reload Pi through a fresh process.
- [ ] Re-run the background contextual commit workflow.
- [ ] Verify the commit and repository state.
- [ ] Record validation results.
- [ ] Mark this plan completed with the completion date.

## Open questions / assumptions

- The user approved a runtime repair instead of a self-contained committer workaround.
- The official upstream commit is an acceptable temporary pin until a later npm release contains the fix.
- The current staged cleanup remains the only content for the first contextual commit retry.
- A fresh Pi process can validate the same governed background workflow after installation.
- No repository documentation change is necessary because this repair changes the local Pi package source only.
