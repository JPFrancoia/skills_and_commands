# Plan: Show draft and CI counts in the sidebar

Completed: 2026-10-24.

## Brief

The repository list spends a row on hostnames but shows only total request counts. Show each total beside the repository name. Use the next row for drafts and CI counts, and hide repositories with no open requests.

## Current state / relevant context

- The sidebar shares read-only forge queries with `pi-open/repos.ts`.
- Current queries fetch aggregate totals without draft or CI details.
- Zero-count filtering already exists in the working tree and has regression coverage.
- Global settings load the sidebar from this repository. Existing sessions need `/reload`.

## Proposed implementation

- Keep the existing helper name, forge CLIs, and five-minute refresh behavior.
- Fetch open requests in pages of 100. Compute totals and three exclusive groups from every page.
- Read GitHub's latest commit status rollup and GitLab's head pipeline status.
- Count drafts separately, regardless of CI. Only `SUCCESS` counts as passing for non-drafts.
- Count failed, pending, running, skipped, canceled, and missing CI as not passing for non-drafts.
- Keep a 15-second budget for each repository refresh. Reject malformed pages and repeated cursors without publishing partial totals.
- Show totals as bold, muted `(N)` badges directly after repository names. Do not right-align the totals.
- Replace hostnames with `N draft · N CI ✓ · N CI !`.
- Hide breakdown groups with zero requests. Put separators only between visible groups.
- Preserve loading, errors, empty configuration, local Git mode, and zero-count refresh eligibility.

## File-by-file impact

- `extensions/pi-open/repos.ts`: paginated request data and draft/CI summaries.
- `extensions/pi-open/pi-open.test.ts`: pagination, classification, malformed data, and failure coverage.
- `extensions/pi-sidebar/pi-sidebar.ts`: compact total and breakdown rows.
- `extensions/pi-sidebar/pi-sidebar.test.ts`: layout, zero filtering, refresh transitions, and size bounds.
- `docs/pi-sidebar.md`: summary labels, CI meaning, pagination, and request budget.

`/open` listing behavior and global settings remain unchanged.

## Risks and edge cases

- More than 100 open requests need multiple API reads. Failed pages must not produce partial counts.
- CI data follows each forge's combined status, not review approval or mergeability.
- Missing CI is not passing. Drafts never also enter either CI group.
- Repository changes during pagination can affect a refresh snapshot.
- Long paths and narrow terminals must retain bounded rows.
- `glab` is absent locally. Use mocked GitLab responses and report the live validation limit.

## Validation / testing

- Run both adjacent suites with host jiti aliases.
- Cover both forges, counts above 100, zero, every CI bucket, drafts with green CI, null CI, pagination errors, and cursor errors.
- Check totals equal the sum of the three groups.
- Use mocked forge CLIs in real fullscreen Pi. Inspect initial display, reload, manual refresh, zero-to-positive changes, and all-zero output.
- Inspect terminal captures rather than browser ProofShot because this interface is terminal-only.
- Run `git diff --check` and `pre-commit run --all-files`.

## Step-by-step execution checklist

- [x] Inspect existing queries and agree on missing/pending CI semantics.
- [x] Implement paginated summary queries and coverage.
- [x] Update repository rows and layout coverage.
- [x] Check real terminal behavior and update documentation.
- [x] Run final checks and record validation limits.

## Open questions / assumptions

- The user selected “Not green”: pending and missing CI belong in the not-passing group.
- Use the same summary for GitHub PRs and GitLab MRs.
- Remove hostnames from repository rows. Retain hosts in queries and error details when present.
- Do not change the money icon, other sidebar sections, or `/open` listings.

## Results

- Added paginated summaries for both forges with exclusive draft, CI passing, and CI not-passing groups.
- Applied the user's later requests: hide empty groups and place `(N)` badges directly after repository names.
- Both adjacent suites passed, including 213-request pagination, CI classification, deadline failures, cursor errors, and layout bounds.
- A live GitHub query returned a valid total and matching breakdown. Live GitLab remains untested because `glab` is unavailable.
- Real Pi checks with mocked forge CLIs covered reload, manual refresh, zero-to-positive changes, all-zero output, inline badges, and width 20.
- Inspected terminal screenshots under `/tmp/pi-sidebar-breakdown-HUmTUq/`. Browser ProofShot does not apply to this terminal-only interface.
- Diff checks and all-files/scoped pre-commit checks passed.
- No global settings changed. Live streaming, mouse selection, inline images, and external editors were not retested.
