# Grok Quota Support Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Add Grok subscription quota monitoring through Pi's existing `xai` OAuth credential.

**Architecture:** Treat Grok as the `xai` quota provider. Fetch the required billing payload from `https://cli-chat-proxy.grok.com/v1/billing?format=credits`, translate finite weekly credit, product, and on-demand limits into the shared `QuotaWindow` model, and expose the provider through the combined dashboard, footer, and `/grok:quotas` command. Keep this PR stateless; reset-redemption inference remains outside its scope.

**Tech Stack:** TypeScript, Pi extension API, native `fetch`, Vitest, ESLint.

---

### Task 1: Define Grok quota parsing

**Files:**
- Modify: `src/providers/parse.test.ts`
- Modify: `src/providers/providers.ts`
- Modify: `src/types/quotas.ts`

**Step 1: Write the failing test**

Add a parser test with a weekly `currentPeriod`, `creditUsagePercent`, finite `productUsage`, and on-demand values. Assert labels, percentages, reset time, window duration, and currency metadata.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/providers/parse.test.ts`

Expected: FAIL because `parseXaiUsage` and the `xai` provider type do not exist.

**Step 3: Write minimal implementation**

Add `xai` to `SupportedQuotaProvider` and implement `parseXaiUsage`. Ignore missing/non-finite product percentages, derive the billing period from valid timestamps, and avoid manufacturing quota windows from absent limits.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/providers/parse.test.ts`

Expected: PASS.

### Task 2: Fetch Grok quotas with Pi OAuth

**Files:**
- Modify: `src/providers/fetch.test.ts`
- Modify: `src/providers/fetch.ts`
- Modify: `src/lib/quotas.ts`

**Step 1: Write the failing tests**

Cover a missing token (`config` error), an authenticated billing request with `Authorization: Bearer`, successful parsing, and an HTTP failure.

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/providers/fetch.test.ts`

Expected: FAIL because the xAI fetchers and registry entry do not exist.

**Step 3: Write minimal implementation**

Add `fetchXaiQuotasWithToken` and `fetchXaiQuotas`, read provider `xai` via the existing auth adapter, register the fetcher, label it `Grok`, and use the standard 60-second cache.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/providers/fetch.test.ts`

Expected: PASS.

### Task 3: Add command metadata and documentation

**Files:**
- Modify: `src/extensions/command-quotas/provider-commands.test.ts`
- Modify: `src/extensions/command-quotas/provider-commands.ts`
- Modify: `README.md`

**Step 1: Write the failing command test**

Assert that `xai` maps to `/grok:quotas` with title `Grok Quotas`.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/extensions/command-quotas/provider-commands.test.ts`

Expected: FAIL because the switch has no `xai` case.

**Step 3: Implement and document**

Add the command metadata and document Grok's weekly credits/product split, `xai` OAuth credential, and provider command.

**Step 4: Run focused tests**

Run: `npx vitest run src/extensions/command-quotas/provider-commands.test.ts`

Expected: PASS.

### Task 4: Verify and commit

**Files:**
- Verify all modified files

**Step 1: Run full verification**

Run: `npm test && npm run typecheck && npm run lint`

Expected: all tests pass and both static checks exit 0.

**Step 2: Review the diff**

Run: `git diff --check && git diff --stat && git status --short`

Expected: no whitespace errors and only Grok-related files plus this plan are changed.

**Step 3: Commit**

Run: `git add docs/plans/2026-08-27-grok-quota-support.md src README.md && git commit -m "feat: add Grok quota provider"`
