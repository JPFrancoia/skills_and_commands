# Dream apply branch cleanup

**Completed: 2026-11-03**

## Brief

Users do not need a review branch after `/dream-apply` accepts its contents. Delete that branch after a successful apply. Keep the accepted commits and job records.

## Current state / relevant context

Apply merges the named branch and records processed sessions. It leaves the review branch in the accepted repository. Discard already uses `git update-ref -d` with an expected commit to prevent accidental deletion of changed branches.

Normal sessions receive a list of accepted memory paths and descriptions before each agent run. The agent can read relevant files through `dream_memory`. Full file contents do not enter the prompt automatically. `docs/CONTEXT.md` does not exist.

## Proposed implementation

After apply succeeds and records acceptance, delete its `dream/<job-id>` reference. A reference is the Git name that points to a commit. Require that the reference still points to the accepted commit. Keep a branch that changes after the merge. Report that cleanup failure as a warning, not as a failed apply.

Leave branches unchanged after rejected approval or a failed merge. Keep manually merged branches unchanged. Do not delete candidate folders, job records, evidence, or accepted commits. Do not change normal-session memory behavior.

## File-by-file impact

- `extensions/pi-dream/index.ts`: clean up the accepted branch and report cleanup errors.
- `extensions/pi-dream/pi-dream.test.ts`: cover deletion after successful apply and branch preservation after refusal or failure. Exercise normal-session memory reads.
- `docs/pi-dream.md`: document cleanup and explain the existing memory flow.
- This plan: record validation results.

## Risks and edge cases

- A user can change a branch during cleanup. The expected-commit check must preserve that newer work.
- A Git error after merge does not undo accepted memory. Record acceptance before cleanup and report any cleanup error accurately.
- Deleting the branch name must not delete accepted commits or job evidence.
- A previous manual merge is not a new successful apply. Do not remove its branch automatically.

## Validation / testing

Add a branch-absence assertion after the existing successful command test. Run it before implementation to reproduce the missing cleanup. Cover corrected, amended, and empty batches. Keep canceled and divergent branches unchanged. Exercise a cleanup error without losing accepted state.

Exercise the existing prompt hook and `dream_memory` read/search tools against temporary accepted memory. Run focused tests, strict TypeScript checks, an isolated real `/dream-apply`, `git diff --check`, and `pre-commit run --all-files`. Do not change live memory or run paid requests.

## Step-by-step execution checklist

1. [x] Inspect code, tests, documentation, and the normal-session memory flow.
2. [x] Reproduce missing cleanup and add focused regressions.
3. [x] Implement safe cleanup and pass tests.
4. [x] Update and review documentation.
5. [x] Verify the isolated command path and record results.

## Results

- The new regression reproduced the missing deletion before implementation.
- Focused Dream tests passed for empty, corrected, and amended batches.
- Canceled confirmation, local edits, and divergent history preserved the branch.
- A simulated Git reference lock prevented cleanup. Apply still recorded acceptance and reported a warning.
- Normal-session checks confirmed that the prompt includes paths and descriptions, not file bodies. The read and search tools returned accepted memory.
- Strict TypeScript checks passed.
- A real isolated Pi session ran `/dream-apply cleanup` after interactive approval. It deleted the branch and preserved accepted files and job data.
- Terminal captures are in `/tmp/pi-dream-cleanup-proof-eoPKuA/`.
- `docs-maintainer` updated `docs/pi-dream.md`. The parent reviewed its details and paragraph structure.
- `git diff --check` and `pre-commit run --all-files` passed.
- Live memory and settings remained unchanged. No paid model requests ran.

## Deviations

None. Cleanup applies only to a new successful `/dream-apply`. Existing manual merges retain their branches.

## Open questions / assumptions

The user approved deletion after successful `/dream-apply`. This approval covers the implementation, not deletion of existing live branches during development. Preserve all earlier source changes. Keep the existing merge safeguards.
