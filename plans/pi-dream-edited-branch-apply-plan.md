# Apply edited Dream branches

**Completed: 2026-11-03**

## Brief

Users can correct proposed memory before acceptance. `/dream-apply` must accept the current job branch, not require the original generated commit. Review reports and session tracking must use the selected branch version.

## Current state / relevant context

`publishJob` and `applyReviewBranch` reject changed branch commits. A user correction creates a different commit, so the command fails before Git can merge it. The failure occurs with a normal correction commit. An amended commit also fails. An amended commit replaces the previous commit.

`docs/CONTEXT.md` does not exist. The source tree contains uncommitted changes from the approved Dream redesign. Preserve those changes. Do not change live memory or settings.

## Proposed implementation

For an existing review branch, read its current commit. Update the recorded commit when that branch changes. This record lets review reports and acceptance tracking use the current version.

Remove the exact-commit check from `applyReviewBranch`. Merge the named job branch. Keep interactive approval, a clean accepted repository on `master`, and the existing fast-forward requirement. A fast-forward moves `master` to a later commit without combining separate histories.

Do not require the original commit in the branch history. Corrections can include additional commits or amended commits. Do not change discard safeguards or automatic merge conflict handling.

## File-by-file impact

- `extensions/pi-dream/store.mjs`: refresh the recorded commit from an existing review branch.
- `extensions/pi-dream/index.ts`: remove the exact-commit check and its unused parameter. Update the caller.
- `extensions/pi-dream/pi-dream.test.ts`: cover corrected and amended branches, review output, acceptance tracking, and retained safeguards.
- `docs/pi-dream.md`: explain correction and acceptance behavior.
- This plan: record execution and results.

## Risks and edge cases

- A rewritten branch can omit the original proposal. The user explicitly approves the current branch contents.
- Missing branches still fail. Do not recreate them from outdated candidate files.
- Dirty accepted files, another checked-out branch, and divergent history still stop apply.
- Refresh the recorded commit before acceptance tracking runs after apply. Otherwise an amended branch remains incorrectly pending.

## Validation / testing

Before implementation, add a regression that appends a correction commit and calls `/dream-apply`. Run it to reproduce the failure. Add a second case that amends the proposal and removes the original commit from its history.

Success requires corrected contents on `master`, an applied job, processed sessions, and a review report with current branch contents. Rejected confirmation and missing branches must not change accepted memory. Existing dirty-tree and divergent-history tests must still pass.

Run the focused Dream tests, strict TypeScript checks, Node syntax checks, an isolated real Pi command workflow, `git diff --check`, and `pre-commit run --all-files`. Use temporary files and no paid model requests.

## Step-by-step execution checklist

1. [x] Inspect affected code, callers, tests, and documentation.
2. [x] Reproduce the failure with a regression test.
3. [x] Implement branch-based acceptance and pass focused checks.
4. [x] Update and review documentation.
5. [x] Verify the real command path and record results.

## Results

- The regression reproduced `The review branch changed.` before implementation.
- Focused Dream tests passed for added corrections, amended proposals, current review reports, and processed sessions.
- Existing dirty-tree and divergent-history checks passed. New checks covered rejected approval and missing branches.
- Strict TypeScript checks and Node syntax checks passed.
- A real isolated Pi session ran `/dream-apply corrected` against an amended branch after interactive approval.
- The command accepted the correction, kept `master` checked out, marked the job applied, and processed its session.
- The test used `/tmp/pi-dream-edited-apply-proof-V1egK1/`. Terminal captures record approval and the applied status.
- `docs-maintainer` updated `docs/pi-dream.md`. The parent reviewed the result against the implementation.
- `git diff --check` and `pre-commit run --all-files` passed.
- Live memory and settings remained unchanged. No paid model requests ran.

## Deviations

None. The fix uses the current named branch without an original-commit requirement. The existing merge safeguards remain unchanged.

## Open questions / assumptions

The user explicitly approved this change. No further confirmation is necessary. Apply means acceptance of the named branch's current contents. Keep the existing `master` and fast-forward requirements.
