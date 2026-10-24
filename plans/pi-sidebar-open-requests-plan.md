# Plan: Show open request counts for REPOS

Completed: 2026-10-23.

## Brief

When REPOS is set, show each configured repository and its open PR or MR count in the Git section. When REPOS is unset, preserve the current local Git display.

## Current state / relevant context

- `pi-open` parses comma-separated GitHub and GitLab URLs and uses authenticated `gh` or `glab` commands.
- `/open` lists up to 100 requests. Sidebar counts must not silently stop at that limit.
- The sidebar already refreshes external data and guards against results arriving after reload.

## Proposed implementation

- Move the existing repository parser into a small module in `pi-open`. Keep `/open` behavior unchanged.
- Add read-only aggregate count queries to that module. Reuse it from the sidebar.
- Select count mode when REPOS exists, including an empty value. Show configuration problems rather than silently switching modes.
- Show repository paths, hostnames, and open PR/MR counts. Distinguish zero, loading, and unavailable states.
- Refresh counts at startup, at most once per minute during existing refresh events, and on `/sidebar refresh`.
- Skip local repository discovery in count mode. Preserve existing Git behavior when REPOS is unset.

## File-by-file impact

- `extensions/pi-open/repos.ts`: existing URL parser and new count commands/results.
- `extensions/pi-open/pi-open.ts`: import the parser without changing `/open` behavior.
- `extensions/pi-open/pi-open.test.ts`: count queries, errors, and existing parser/command compatibility.
- `extensions/pi-sidebar/pi-sidebar.ts`: count state, refresh selection, and Git rendering.
- `extensions/pi-sidebar/pi-sidebar.test.ts`: both modes, loading/errors/zero, and size bounds.
- `docs/pi-sidebar.md`: mode selection, authentication, refresh, and limits.

## Risks and edge cases

- Missing CLIs, authentication failures, GraphQL errors, and inaccessible repositories must not appear as zero.
- Keep API reads bounded by timeouts and refresh throttling.
- The shared helper uses a relative sibling import. Keep the `pi-open` directory beside `pi-sidebar` when copying source packages.
- `glab` is not installed on this host. Use mocked GitLab responses and report the live validation limit.
- Existing fullscreen redraw risks remain.

## Validation / testing

- Run both adjacent test suites before and after changes.
- Check exact aggregate counts above 100, zero, errors, invalid configuration, and unchanged local rendering.
- Test the real Pi path with fake forge CLIs, including reload and manual refresh, without model requests.
- Inspect terminal screenshots and width/height bounds.
- Run diff and repository hygiene checks.

## Step-by-step execution checklist

- [x] Inspect pi-open and sidebar refresh/rendering.
- [x] Implement shared count queries and the conditional sidebar mode.
- [x] Test both modes and inspect terminal output.
- [x] Update documentation and run final checks.

## Open questions / assumptions

- Count all open requests, including drafts, like `/open`.
- Show repositories with zero open requests.
- Replace local Git details in count mode rather than adding a second section.
- Leave the money icon and all other sections unchanged.

## Results

- Added aggregate GitHub and GitLab count queries with shared `pi-open` URL parsing.
- Preserved `/open` listing behavior and the sidebar's local Git mode when REPOS is unset.
- Tests cover counts above 100, zero, malformed output, query failures, missing commands, invalid paths, loading, and terminal bounds.
- Extension lifecycle tests cover unset/empty/invalid/valid REPOS, refresh throttling, manual refresh, and replacing failed counts with errors.
- Real Pi tests used fake `gh` and `glab` commands. Counts, errors, reload, manual refresh, and local Git fallback passed.
- Inspected `/tmp/pi-sidebar-repos-proof/counts.png`. Terminal captures and empty stderr logs are in the same directory.
- Updated sidebar documentation and its index directly because the earlier documentation helper reached its provider quota.
- Both adjacent test suites, diff checks, and all-files/scoped pre-commit checks passed.
- Live forge authentication/API responses were not tested. `glab` is absent on this host.
- Browser ProofShot does not apply to this terminal interface. No live model request, installation, or global settings change occurred.
