# Hide Inactive Providers Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Make the combined `/quotas` dashboard show only providers with active quota data or actionable runtime failures.

**Architecture:** Add a pure dashboard visibility selector at the command boundary. Hide missing configuration, non-applicable credentials, and successful responses without windows; retain timeout, network, and HTTP failures because those may represent configured subscriptions that need attention. Provider-specific commands bypass the selector so they remain useful for diagnostics.

**Tech Stack:** TypeScript, Pi extension API, Vitest, Pi TUI component tests, ESLint.

---

### Task 1: Define dashboard visibility rules

**Files:**
- Create: `src/extensions/command-quotas/visibility.test.ts`
- Create: `src/extensions/command-quotas/visibility.ts`

**Step 1: Write the failing tests**

Assert that successful snapshots with windows remain visible; `config`, `not_applicable`, and successful empty snapshots are hidden; HTTP, network, timeout, and cancelled failures remain visible.

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/extensions/command-quotas/visibility.test.ts`

Expected: FAIL because the visibility module does not exist.

**Step 3: Write minimal implementation**

Implement `filterDashboardSnapshots` as a pure filter over the shared snapshot shape.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/extensions/command-quotas/visibility.test.ts`

Expected: PASS.

### Task 2: Apply filtering only to the combined dashboard

**Files:**
- Modify: `src/extensions/command-quotas/command.ts`

**Step 1: Add a failing wiring test**

Extend the visibility tests or add a focused command test proving the combined loader passes results through `filterDashboardSnapshots`, while the provider-specific loader returns its diagnostic result unchanged.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/extensions/command-quotas/visibility.test.ts`

Expected: FAIL until the combined command calls the selector.

**Step 3: Write minimal implementation**

Wrap only `fetchAllProviderQuotas` results with `filterDashboardSnapshots`. Leave `fetchProviderQuotas` calls untouched.

**Step 4: Run focused tests**

Run: `npx vitest run src/extensions/command-quotas/visibility.test.ts`

Expected: PASS.

### Task 3: Explain an empty active-subscription result

**Files:**
- Modify: `src/extensions/command-quotas/components/quotas-display.test.ts`
- Modify: `src/extensions/command-quotas/components/quotas-display.ts`
- Modify: `README.md`

**Step 1: Write the failing component test**

Assert that an empty loaded dashboard renders `No active quota subscriptions detected`.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/extensions/command-quotas/components/quotas-display.test.ts`

Expected: FAIL because the empty dashboard currently renders no body text.

**Step 3: Implement and document**

Render the dim empty-state message and document that `/quotas` suppresses providers without usable subscription quota data while provider commands retain diagnostics.

**Step 4: Run focused tests**

Run: `npx vitest run src/extensions/command-quotas/components/quotas-display.test.ts src/extensions/command-quotas/visibility.test.ts`

Expected: PASS.

### Task 4: Verify and commit

**Files:**
- Verify all modified files

**Step 1: Run full verification**

Run: `npm test && npm run typecheck && npm run lint`

Expected: all tests pass and both static checks exit 0.

**Step 2: Review the diff**

Run: `git diff --check && git diff --stat && git status --short`

Expected: no whitespace errors and only dashboard-visibility files plus this plan are changed.

**Step 3: Commit**

Run: `git add docs/plans/2026-08-27-hide-inactive-providers.md src README.md && git commit -m "feat: hide inactive quota providers"`
