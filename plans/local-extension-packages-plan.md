# Load local extensions as packages

## Brief

Keep one folder per extension under `extensions/`. Load active local extensions through Pi settings instead of extension symlinks. Preserve the current enabled extensions and their behavior.

## Current state / relevant context

- Twelve extension entry files are directly under `extensions/`, beside their tests.
- `pi-btw`, `pi-quotas`, and `pi-session-auto-rename` already have package folders.
- Twelve links under `~/.pi/agent/extensions` load eleven files and the auto-rename folder.
- Pi settings already load the quota package with selected entry points.
- BTW settings still use its old, symlinked checkout path.
- `vertex-429-retry` exists but is not currently enabled.
- The repository has unrelated documentation changes and an untracked nested BTW checkout. Preserve both.

## Proposed implementation

Move each loose extension and its adjacent tests into a folder named after the extension. Follow the auto-rename package pattern: a small `package.json` with one explicit `pi.extensions` entry. Keep filenames and relative test imports unchanged.

Add the active packages to user settings with direct local folder paths. Change BTW to its real package path. Keep the quota resource filter unchanged. Remove only the extension symlinks after discovery confirms their replacement paths. Leave extension configuration files and regular directories intact.

Answer the agent and command question without changing those symlinks. Pi supports `prompts` paths. The installed subagent package supports `subagents.agentScanDirs`. Loading the whole commands directory would also enable fallback `/m` and `/pr` templates, so examples must preserve the current command selection.

## File-by-file impact

- `extensions/<name>/<name>.ts` and adjacent tests: move existing files without behavior changes.
- `extensions/<name>/package.json`: declare the single entry point and exclude tests from loading.
- Extension header comments: replace obsolete symlink installation instructions.
- `AGENTS.md`: describe the package-folder layout and updated test command.
- `~/.pi/agent/settings.json`: replace indirect BTW path and append the active local packages.
- `~/.pi/agent/extensions`: remove its twelve symlinks, not their targets.
- `docs/`: update affected paths, installation steps, and test commands. Add a short local-resource guide.

## Risks and edge cases

- A directory scan must not load test files as extensions. Explicit manifests prevent this.
- `vertex-429-retry` must stay disabled.
- The quota usage-status wrapper must still load after the quota package.
- Settings are symlinked to a separate repository. Preserve that settings symlink and unrelated values.
- Keep the old BTW checkout link outside the extension directory. It is not part of the requested link removal.
- Preserve agent and prompt links because their migration was only a question.

## Validation / testing

Success means the enabled local entry points match the baseline after path remapping, with no duplicates or test modules. Every extension has its own folder. No links remain under `~/.pi/agent/extensions`.

Run adjacent tests before and after the moves. Resolve package resources with the installed Pi SDK. Load the resulting local packages without starting an agent turn. Verify commands and the `jev/auto` virtual model remain registered. Run `git diff --check` and `pre-commit run --all-files`. Record any unrelated baseline failures instead of fixing them.

## Step-by-step execution checklist

1. [x] Inspect the layout, package rules, resource settings, and affected paths.
2. [x] Capture baseline discovery, files, links, and adjacent test results.
3. [x] Move files and declare package entry points.
4. [x] Update settings and remove replaced extension links.
5. [x] Verify discovery, loading, adjacent tests, and repository hygiene.
6. [x] Update affected documentation and answer the resource-path question.

## Completion record

Completed on 2026-10-19.

- All fifteen local extensions have package folders. Twelve folders replace loose files.
- All twelve adjacent test scripts passed before and after the moves.
- File hashes confirm unchanged tests and unchanged implementation apart from installation comments.
- SDK discovery matches all fourteen enabled local entry points after remapping. No tests or duplicate entries load.
- The installed SDK loaded those entry points without errors or warnings. Expected commands and one `jev/auto` registration remain available.
- Removed twelve extension symlinks. Configuration files and the regular subagent directory remain intact.
- Preserved the settings symlink, unrelated settings, quota filtering, disabled Vertex package, and live agent and prompt links.
- Temporary configurations verified both `prompts` and `subagents.agentScanDirs` without relying on resource symlinks.
- Updated the affected installation guides and documented optional agent and prompt path settings.
- `git diff --check`, `pre-commit run --all-files`, documentation links, and the documented host test command passed.
- No interactive overlay check, model request, commit, push, or release was needed.

The documented direct jiti path was absent on this installation. Host package aliases resolved its import-only ESM packages without adding dependencies.

## Open questions / assumptions

- The user explicitly approves reorganizing extensions, editing live package settings, and removing extension symlinks.
- Agent and prompt links remain unchanged unless the user separately requests their migration.
- No dependencies, feature changes, commit, push, or release are needed.
