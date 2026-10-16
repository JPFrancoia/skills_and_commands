# Keep the quota fix in the extensions repository

Status: Completed — 2026-10-16

## 1. Brief

Keep the patched quota package in the existing `skills_and_commands` repository. Pi can then load and preserve the fix with the rest of the user's extensions. The package reports quotas for the provider that handles virtual-model requests.

## 2. Current state / relevant context

- The previous durable attempt kept the full package in `~/informatique/ai/pi-quotas`.
- The user asked to place the fix in `~/informatique/ai/skills_and_commands/extensions` instead.
- Pi supports a local package folder with its own `package.json` and `pi.extensions` list.
- The source matches upstream `@latentminds/pi-quotas` v0.5.0, with the user's routed-provider fix and tests.
- Keep the separate checkout as an unused backup. Do not delete it without approval.

## 3. Proposed implementation

Copy the complete package into `extensions/pi-quotas/`, excluding Git history, installed dependencies, and development-only Pi settings. Keep its package manifest, lockfile, source, tests, documentation, license, and contribution files.

Change the single global package entry to `../../informatique/ai/skills_and_commands/extensions/pi-quotas`. Keep the npm-installed copy unused. Ignore local `node_modules`, generated `dist`, and per-project quota config.

## 4. File-by-file impact

- `extensions/pi-quotas/`: vendored quota package, its tests, and local setup notes.
- `.gitignore`: exclude package dependencies and generated files.
- `docs/README.md`: index the package's durable behavior and setup notes.
- `~/.pi/agent/settings.json`: point from the separate checkout to this repository.
- This plan: preserve the migration decision and checks.

## 5. Risks and edge cases

- The npm-installed package and old checkout remain on disk but are not loaded.
- Pi will load duplicate quota handlers if either old package entry is added again.
- Source changes remain in a nested package. Update its dependencies from its own `package.json`.
- Keep `extensions/pi-quotas` at this path because Pi settings use a relative path.
- The full package is larger than copying one file, but it preserves quota commands, account access code, tests, and independent package tooling.

## 6. Validation / testing

- Run all 142 quota package tests, type checks, and lint checks from the vendored package.
- Confirm `pi list` resolves one quota package at the requested path.
- Compare settings to confirm only the quota source changed.
- Run Pi with normal extension discovery and inspect the Jev/Codex footer.
- Run `pi update` against the local source and verify its content remains unchanged.
- Run repository `git diff --check` and stage only quota-related files.

## 7. Step-by-step execution checklist

1. [x] Inspect the package and the existing extension layout.
2. [x] Copy the complete package into `extensions/pi-quotas/`.
3. [x] Update the one Pi package entry and ignore generated files.
4. [x] Run package and live Pi checks.
5. [x] Commit only the quota-related migration changes.

## 8. Open questions / assumptions

The user explicitly requested this repository path. A full local Pi package under `extensions/pi-quotas` avoids duplicating quota request logic or replacing the footer. Keep the old checkout as a backup. Do not push to any remote.

## Verification results

- `npm test`: 142 tests pass.
- `npm run typecheck`: passes.
- `npm run lint`: passes.
- Focused footer tests against installed Pi 1.3.0 exports: 25 pass.
- `pi list` displays one quota package at `~/informatique/ai/skills_and_commands/extensions/pi-quotas`.
- Package updates skip local sources. `pi update --extension <local-path>` completes without changing them.
- Normal Pi extension discovery shows the Jev selector, Codex model, and `7d:69% left` quota status.
- No unrelated existing `skills_and_commands` changes were staged.
- No remote changes were made.