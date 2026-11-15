# Plan: Check all accepted Dream memory

## Brief

Add `/dream-check --all` so the user does not need to list each memory file. Keep the existing confirmation, review, and manual apply steps.

## Current state / relevant context

`startCheck` accepts explicit paths only. `createSnapshot` already selects regular Markdown files from accepted `master`, including subfolders. It excludes hidden paths, symbolic links, and other file types.

## Proposed implementation

Share the existing Git file selection between `createSnapshot` and `startCheck`. Expand `--all` into explicit `reviewPaths` before confirmation. Reuse the existing job workflow without a new worker mode.

This avoids selecting untracked files or using the prompt index, which can omit files. Reject `--all` with extra arguments. If no accepted Markdown files exist, show a message without starting a job.

## File-by-file impact

- `extensions/pi-dream/store.mjs`: share the existing selection of Git entries.
- `extensions/pi-dream/index.ts`: accept `--all`, expand paths, and show the selected file count.
- `extensions/pi-dream/pi-dream.test.ts`: exercise all-file selection through the registered command.
- `docs/pi-dream.md`: document the option and its boundaries.

## Risks and edge cases

- All-file checks can use more model tokens and include evidence from several projects. Keep provider confirmation.
- Include `README.md`, subfolders, names with spaces, and files outside the current project scope.
- Exclude untracked files, hidden paths, non-Markdown files, and symbolic links.
- Keep explicit-path behavior and reject mixed option arguments.
- Freeze the confirmed file list. Do not add files that appear after confirmation.
- Accepted memory must remain unchanged until apply.

## Validation / testing

- Confirm that `--all` selects the same paths as the accepted snapshot.
- Exercise cancellation, mixed arguments, and a repository without accepted Markdown files.
- Run a command-level job with a deterministic worker and inspect its manifest and review branch.
- Confirm that new sessions and pending notes remain untouched.
- Run extension and recovery tests, Node syntax checks, `git diff --check`, and `pre-commit run --all-files`.
- Do not claim live-model validation or activation.

## Step-by-step execution checklist

- [x] Inspect existing selection, commands, tests, and documentation. Define expected behavior.
- [x] Implement shared selection and `--all`. Pass command-level tests.
- [x] Update documentation and run final checks. Record results.

## Validation results

- Extension tests passed through the installed host `jiti` loader.
- All 23 recovery tests passed.
- `node --check extensions/pi-dream/store.mjs` passed.
- `git diff --check` and `pre-commit run --all-files` passed.
- Command tests used a deterministic worker, not a live model.
- No installation, reload, or accepted-memory changes ran.

## Open questions / assumptions

- The direct implementation request approves this change.
- `--all` means all regular, visible Markdown files accepted in `master`, not every local file.
- This change does not install the extension or start a real memory check.
