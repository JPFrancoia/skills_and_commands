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

Keep the complete package under `extensions/pi-quotas/`, excluding Git history, installed dependencies, and development-only Pi settings. The package retains its source, tests, docs, license, and contribution files.

Pi loads commands and quota tools as a filtered local package. A small repository-owned loader imports the patched usage footer from its canonical source. Symlink that loader into `~/.pi/agent/extensions/`. Exclude the package's own usage-footer resource so Pi registers it once. Restore the existing `harness-eval` package entry and leave the npm quota install unused.

## 4. File-by-file impact

- `extensions/pi-quotas/`: vendored quota package, tests, and local setup notes.
- `extensions/pi-quotas-usage-status.ts`: loader for the patched footer.
- `.gitignore`: exclude package dependencies and generated files.
- `docs/README.md`: index the package's behavior and setup notes.
- `~/.pi/agent/settings.json`: filter package resources and retain `harness-eval`.
- `~/.pi/agent/extensions/pi-quotas-usage-status.ts`: symlink to the loader.
- This plan: preserve the migration decision and checks.

## 5. Risks and edge cases

- The npm-installed package and old checkout remain on disk but are not loaded.
- Pi will register duplicate footer updates if the package filter includes its usage-status resource.
- The home-directory symlink must remain in place. Repository clones do not create it automatically.
- The loader expects this repository under `~/informatique/ai/skills_and_commands`.
- Update package dependencies from its own `package.json`.
- The full package is larger than copying one file, but it preserves quota commands, account access code, tests, and independent package tooling.

## 6. Validation / testing

- Run all 142 quota package tests, type checks, and lint checks from the vendored package.
- Confirm `pi list` resolves one filtered quota package at the requested path.
- Load the symlinked footer with Pi's extension loader.
- Check that settings retain `harness-eval`.
- Run Pi with normal discovery and inspect one Jev/Codex quota footer.
- Run `pi update` against the local source and verify it remains unchanged.
- Run repository `git diff --check` and stage only quota-related files.

## 7. Step-by-step execution checklist

1. [x] Inspect the package and the existing extension layout.
2. [x] Copy the complete package into `extensions/pi-quotas/`.
3. [x] Filter package resources and ignore generated files.
4. [x] Symlink and test the repository-owned footer loader.
5. [x] Run package and live Pi checks, then commit quota-related files.

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
- The footer loader is symlinked into Pi's discovered singular path: `~/.pi/agent/extensions/pi-quotas-usage-status.ts`.
- `pi list` reports the filtered package, and Pi loads the footer once from the symlink.
- A fresh Pi session shows Jev routing to Codex with `7d:69% left`.