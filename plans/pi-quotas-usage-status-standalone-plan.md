# Make pi-quotas-usage-status standalone

Status: Completed
Date: 2026-11-03

## 1. Brief

Move the quota footer and its required provider code into `extensions/pi-quotas-usage-status/`. Then remove the full `extensions/pi-quotas/` package.

The standalone package will keep the current footer behavior. It will not keep the quota dashboard, commands, warnings, token totals, or settings screen.

## 2. Current state / relevant context

- `extensions/pi-quotas-usage-status/pi-quotas-usage-status.ts` only loads code from `extensions/pi-quotas/`.
- The footer supports ten providers and virtual model routing.
- The footer also handles stale contexts, timed refreshes, provider changes, and Synthetic footer deferral.
- The full package contains many features that the user no longer needs.
- `docs/README.md` links to the full package README.
- `.gitignore` contains three rules for the full package.
- Unrelated `pi-dream` changes already exist in the worktree. This work must not change them.

Success criteria:

- `pi-quotas-usage-status` has no import or path dependency on `pi-quotas`.
- The footer keeps all current provider, routing, refresh, format, and error behavior.
- The standalone package does not expose the old commands or settings.
- `extensions/pi-quotas/` no longer exists.
- The package keeps the upstream MIT license and attribution.
- Focused tests and repository checks pass.

## 3. Proposed implementation

1. Move the footer entry code into the standalone package.
2. Move the provider fetchers, response parsers, quota types, auth adapter, and severity helpers that the footer uses.
3. Keep support for all ten current providers. Removing providers creates an unrelated behavior change.
4. Remove the old configuration loader. The standalone footer is active when Pi loads the package.
5. Keep the default Synthetic deferral behavior. This prevents duplicate Synthetic footer text.
6. Update imports to `@earendil-works/pi-coding-agent`.
7. Add one adjacent assertion-based test file for routing, stale results, formatting, and provider parsing.
8. Add a short README for installation, behavior, credentials, and limits.
9. Copy the MIT license into the standalone package.
10. Remove the full package and its ignore rules.

## 4. File-by-file impact

- `extensions/pi-quotas-usage-status/pi-quotas-usage-status.ts` — own the footer lifecycle and status format.
- `extensions/pi-quotas-usage-status/lib/` — hold auth access and quota fetch caching.
- `extensions/pi-quotas-usage-status/providers/` — hold provider requests and response parsers.
- `extensions/pi-quotas-usage-status/types/quotas.ts` — define provider and quota result types.
- `extensions/pi-quotas-usage-status/utils/quotas-severity.ts` — calculate status colors and reset text.
- `extensions/pi-quotas-usage-status/pi-quotas-usage-status.test.ts` — cover the moved behavior.
- `extensions/pi-quotas-usage-status/README.md` — document the standalone footer.
- `extensions/pi-quotas-usage-status/LICENSE` — preserve the source license.
- `extensions/pi-quotas-usage-status/package.json` — keep the local Pi package entry.
- `extensions/pi-quotas/` — delete the obsolete full package.
- `.gitignore` — remove obsolete package rules.
- `docs/README.md` — link to the standalone package README.
- This plan — record the final result and checks.

## 5. Risks and edge cases

- Provider endpoints are private or undocumented. The port must keep strict response parsing and harmless failures.
- OAuth tokens are sensitive. The code must not log or store new credential data.
- Old requests can finish after a provider switch. Generation checks must reject these results.
- Pi can replace session contexts during reload. The footer must ignore stale contexts.
- The package loses all non-footer features by design.
- Existing live Pi settings can still reference `extensions/pi-quotas/`. This task changes only the repository.

## 6. Validation / testing

Run these checks:

1. Run the adjacent test with Pi's installed `jiti` loader and package aliases.
2. Run a TypeScript no-emit check against the moved source.
3. Search for active code or documentation that still depends on `extensions/pi-quotas/`.
4. Run `git diff --check`.
5. Run `pre-commit run --all-files`.
6. Inspect the final diff and worktree status.

## 7. Step-by-step execution checklist

- [x] Inspect both quota extensions and their import closure.
- [x] Define the standalone scope and success criteria.
- [x] Move the required footer code and tests.
- [x] Add standalone documentation and license data.
- [x] Delete `extensions/pi-quotas/` and obsolete ignore rules.
- [x] Run focused checks and repository checks.
- [x] Review the final diff for unrelated changes.
- [x] Mark this plan complete with the check results.

## 8. Open questions / assumptions

- Assumption: keep all providers that the current footer supports.
- Assumption: keep Synthetic deferral enabled without a settings toggle.
- Assumption: do not change the user's live Pi settings or installed symlinks.
- No open question blocks implementation.

## Completion record

- The standalone package now owns the footer, provider requests, response parsers, auth adapter, quota types, and status format.
- The port keeps all ten providers, virtual routing, stale-context protection, timed refreshes, and Synthetic deferral.
- The old dashboard, commands, warnings, token totals, settings, package lock, and package assets are deleted.
- The standalone package keeps the upstream MIT license and attribution.
- Unrelated `pi-dream` files remain unchanged by this task.

Checks passed:

- `node "$host/node_modules/jiti/lib/jiti-cli.mjs" extensions/pi-quotas-usage-status/pi-quotas-usage-status.test.ts`
- Strict TypeScript no-emit check with the installed Pi type declarations
- Active repository dependency search for `extensions/pi-quotas/`
- `git diff --check`, including new files
- `pre-commit run --all-files`

`pi list` still shows a live settings entry for `extensions/pi-quotas`. This task did not change `~/.pi/agent/settings.json`.
