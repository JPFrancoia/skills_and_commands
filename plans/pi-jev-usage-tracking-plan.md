# Pi Jev usage tracking

Status: Completed — review follow-up published 2026-10-16

## 1. Brief

Record Jev classifier usage in standard Pi session entries and include those entries in TokScale totals. Keep the TokScale contribution generic so every Pi user can benefit. Install the modified CLI and collect real usage evidence before opening the pull request.

## 2. Current state / relevant context

- The personal router calls native `typesafe/jev-latest` and discards its optional `result.usage`.
- Pi documents `type: usage` entries for model usage outside assistant messages, including cache warming.
- Pi's actual extension session manager has `appendUsage()`. The public extension type exposes read-only methods only.
- The user approved using that existing method through a narrow compatibility boundary without modifying installed Pi.
- TokScale currently counts only assistant messages in Pi-compatible session files.
- The shared parser also serves OMP, Senpi, Kimchi, and Prime Agent. Prime accounting observes the same emitted sequence.
- No prior TokScale checkout or installed CLI was found in the inspected home directories.
- Restored the existing GitHub fork into a local workspace checkout.
- TokScale branch: `fix/pi-standalone-usage`, based on current `upstream/main`.
- The earlier Pi subagent attribution contribution is already merged upstream.
- Jev's installed catalog price is zero. Do not invent prices or claim that zero displayed cost means free calls.

## 3. Proposed implementation

### Router

Read classifier-reported usage immediately after classification and before cancellation or result selection. Record each returned usage object once with kind `classifier`, provider `typesafe`, and the returned physical classifier model.

Use a narrow type based on `SessionManager.appendUsage`. Check method availability at runtime and call it on the actual session manager. Do not reopen session files, append raw JSONL, or inject fake assistant messages. If the compatibility method is unavailable, report that accounting is unavailable rather than silently pretending usage was recorded. Keep cancellation and existing routing fallbacks unchanged. Never synthesize token counts when the provider omits usage.

### TokScale

Accept standard top-level `usage` records with arbitrary `kind` values. Read model, provider, timestamp, and the existing camelCase token breakdown. Preserve normal session, workspace, title, and agent attribution. Keep the existing assistant-message path unchanged where possible.

Use distinct usage-record dedup identities so assistant IDs cannot collide with usage IDs. Preserve copied-record dedup across forked sessions. Keep Prime's parser and accounting emission decisions consistent.

Bump the shared Pi-format parser version so cached files are reparsed. Follow existing cost handling and provenance rules. Do not add Jev-specific pricing, parsing, provider names, configuration, or fixtures.

### Installation and publication

Build the native CLI using the available compatible Rust toolchain. Install it into the existing user executable pattern, without replacing package caches. Verify the actual installed binary against real Pi data.

Exercise the installed router with bounded harmless prompts. Capture separate Jev and Codex usage in the session and TokScale output. Prepare a screenshot with no secrets or unrelated private session text. Open a focused upstream PR after validation. Cite Pi's official session-format documentation and `SessionManager.appendUsage` source to establish that standalone usage entries are standard Pi features.

## 4. File-by-file impact

### `skills_and_commands`

- `extensions/pi-jev-router.ts`: record native classifier usage through the narrow compatibility boundary.
- `extensions/pi-jev-router.test.ts`: test one record per call, reported errors, missing usage, unavailable method, continuation behavior, and cancellation.
- `docs/pi-jev-router.md`: describe implemented usage recording, the internal API boundary, activation, and pricing limitations.
- `plans/pi-jev-usage-tracking-plan.md`: retain decisions and validation evidence.

### `tokscale`

- `crates/tokscale-core/src/sessions/pi.rs`: generic standalone usage parsing and focused regression tests.
- `crates/tokscale-core/src/message_cache.rs` or the shared version constant in `pi.rs`: invalidate Pi-format parser caches.
- `crates/tokscale-core/src/sessions/prime_agent.rs`: change only if the shared emission contract requires it.
- `README.md`, Pi section: document standard non-assistant usage support after implementation.
- User CLI destination: install and verify the built `tokscale` executable.

## 5. Risks and edge cases

- Pi can remove or hide the runtime method in a future release. Detect that boundary and document it.
- Reopening a session file would create stale in-memory state. Do not use that workaround.
- Classification can consume tokens even when routing falls back or cancellation follows the result. Record any returned usage before those decisions.
- Provider timeouts can omit usage. Do not claim exact billing coverage for calls without returned token counts.
- Copied sessions can double-count records without stable deduplication.
- Shared parser changes can shift Prime accounting positions. Verify all shared callers.
- Jev catalog prices are zero. This implementation tracks reported tokens; exact billing needs separately verified pricing.
- Existing Pi sessions need `/reload` before they use the changed router.
- Keep personal router code, session data, and machine paths out of the TokScale contribution.

## 6. Validation / testing

Success criteria:

- A standard standalone usage fixture fails before the parser change and passes afterward.
- Arbitrary kinds, cache token fields, invalid entries, attribution, timestamps, copied records, and mixed assistant/usage sessions work.
- Existing Pi-compatible parser and Prime accounting tests remain green.
- Router tests preserve all existing routing behavior and record returned classifier usage exactly once.
- Missing usage creates no invented record. Canceled completed classification retains returned accounting.
- Formatting, relevant type checking, repository hygiene, Rust lint, and Rust tests pass.
- A real new Pi session writes a native classifier usage entry without a fake message or raw file append.
- The installed TokScale executable shows `jev-latest` separately from the answering Codex model.
- The PR contains only generic TokScale changes and links to the standard Pi schema.

Run focused tests first. Run the full Rust workspace checks before publication where feasible. Keep build logs in `/tmp`. Limit live verification to a few harmless prompts and no more than $0.25 in classifier spend.

## 7. Step-by-step execution checklist

- [x] Search for the previous checkout and inspect installed tools.
- [x] Restore the fork and create a branch from current upstream.
- [x] Inspect repository instructions, native Pi schema, and the existing router tests.
- [x] Implement generic parsing, cache invalidation, and regression tests. Seven new regressions pass. The core unit suite passes with 2,581 tests and two ignored tests.
- [x] Implement router usage recording and focused tests. Focused assertions, strict TypeScript checking, diff checking, and repository secret checks pass.
- [x] Update documentation after implementation and review the complete diffs. The documentation maintainer updated both existing guides. Parent review clarified the internal API boundary and kept TokScale examples generic.
- [x] Run validation, build, and install TokScale. Formatting, warning-free Clippy, and full workspace tests pass. The suite has 4,515 top-level passing tests and five ignored tests. Installed the verified release binary at `~/.cargo/bin/tokscale`.
- [x] Verify live usage and collect screenshot evidence. The installed JSON report matches all three verification calls exactly. The real TUI also shows additional ongoing session usage. Captured the Models tab and Jev daily trend.
- [x] Commit and publish the generic TokScale PR with standard-schema references. Commit `47f46c26` is pushed and PR https://github.com/junhoyeo/tokscale/pull/1484 is open. Verified the remote commit, four-file scope, and official schema references.

### Progress and evidence

- Live verification used the installed extension symlink and normal `jev/auto` defaults.
- Three real user prompts produced three native classifier usage entries totaling 1,425 tokens: 1,302 input and 123 output.
- One prompt used the write tool. Four assistant responses produced only three classifier calls, confirming sticky tool continuation.
- The harmless verification file contains exactly `TRACKING_OK`.
- Verification artifacts: `/tmp/pi-jev-usage-live.71jK4V/` and `/tmp/pi-jev-usage-live-summary.json`.
- The first reviewer found no source defects but lacked command execution. Validation was reassigned explicitly to a command-capable worker.
- Installed the repository's pinned Rust 1.98.0 toolchain. The pre-existing stable and beta toolchains were too old.
- The shared parser retains existing cost handling. Embedded Pi costs remain unused because they are catalog estimates, not necessarily provider-billed amounts.
- Installed CLI: `tokscale 4.19.1`, SHA-256 `8a919d6cca0b6d04800d8e821a668cf990f865799cf340721f8d1e1901300260`.
- The installed report matches the verification session exactly: three calls, 1,302 input tokens, and 123 output tokens.
- Today's report later shows six real classifier calls and 2,856 tokens, including ongoing sessions.
- TokScale's existing price resolver already estimates Jev input at $0.042 per million tokens. No price configuration was changed.
- Screenshots: local desktop captures for the Pi usage and Jev details views.
- Screenshots capture only the dedicated TokScale terminal window. No prompts, credentials, or unrelated windows are included.
- A first terminal-window lookup timed out because TokScale changed the title. Capturing by the dedicated Xterm process ID resolved this without changing application code.
- The daily-total smoke assertion initially saw more calls than the isolated test. Verification now compares the exact test session, preserving additional real usage.
- HTTPS publication was rejected because the existing OAuth token lacks workflow scope and the fork is behind upstream. The verified existing SSH connection published the branch. No token permissions changed.
- PR #1484 contains only generic TokScale source, tests, cache handling, and README changes. No router files, session data, or screenshots were committed upstream.
- CI is pending. Local checks passed. The PR remains unmerged.
- The user confirmed screenshot attachment to PR #1484.
- Personal router changes were left uncommitted until the user's later commit request. Concurrent changes to `skills/clarifying-questions/SKILL.md` and `skills/plan/SKILL.md` were not touched.

### PR review follow-up

The user approved fixing all four reviewed comments. Keep the change on the existing PR branch.

Implementation:

- Make only the three new optional standalone fields tolerate values used as unrelated metadata. Follow the repository's field-deserializer pattern. Keep malformed standalone usage/model values excluded.
- Treat whitespace-only provider names as missing in the shared fallback guard. Keep valid explicit provider names unchanged.
- Extend the existing Prime accounting fixture with a standalone entry after an assistant entry using the same ID. Verify both fresh and cached accounting still target the assistant.
- Mirror the implemented standard usage example and behavior into the Chinese, Korean, and Japanese Pi README sections. Do not rewrite unrelated documentation.
- Keep the existing shared parser-version bump for this unreleased PR. No further persistent schema change is needed.

Success criteria:

- New tests reproduce record loss and whitespace-provider errors before the fix and pass afterward.
- All Pi-compatible parsers retain unrelated metadata and assistant usage when new top-level fields have another shape.
- Missing or invalid standalone usage/model values still produce no invented token counts.
- A same-ID standalone record cannot replace a Prime assistant attribution target in either parsing path.
- Formatting, warning-free Clippy, and full workspace tests pass. Rebuild and reinstall the changed binary.
- The installed CLI retains the exact live verification-session totals.
- Publish the fixes, reply to each review thread with its concrete change, and resolve addressed threads. Verify the remote head and thread states.

Checklist:

- [x] Add regression tests and confirm failures. Separate tests reproduced lost records and whitespace-only provider labels before the fix.
- [x] Apply the two parser fixes and extend Prime collision coverage. Nine focused regressions now pass. A field deserializer preserves unrelated metadata, blank providers use normal inference, and both Prime accounting paths retain the assistant target.
- [x] Synchronize the three maintained README translations after implementation. Parent review and JSON checks confirm identical native examples and matching coverage in Chinese, Korean, and Japanese.
- [x] Validate, rebuild, reinstall, and inspect the real CLI report. All 4,517 top-level tests pass, with five existing tests ignored. Formatting, Clippy, and the release build pass. The installed CLI preserves the real three-call, 1,425-token Jev session and passes the malformed-metadata/blank-provider fixture.
- [x] Commit, push, reply to the four comments, and verify remote state. Published `a0444be8` to PR #1484. Replied to all four comments and verified every addressed thread is resolved. The remote head matches local HEAD. No unresolved threads remain at verification time.

Follow-up evidence:

- Release binary SHA-256: `eba51aba3eac8593d9b430f6c9b1c6e8929b7998a7ff4687a5a20c6425ecabbc`.
- Replaced the installed binary atomically so existing running terminals can continue until restarted.
- Installed-path fixture: all three records survive, provider inference yields `openai`, and exactly 60 input tokens are counted. Malformed usage contributes no counts.
- Validation report: `/tmp/tokscale-1484-followup-validation.md`.
- Translation report: `/tmp/tokscale-1484-translation-update.md`.
- Reply receipts: `/tmp/tokscale-1484-review-reply-receipts.json`.
- Remote verification: `/tmp/tokscale-1484-followup-verified.json`.
- CI has no failures at verification time. Fourteen checks are still running. The PR remains open and unmerged.

The optional `grill` review was not requested. The user's direct approval permitted implementation without another confirmation.

## 8. Open questions / assumptions

- The user's explicit `implement` instruction approves this scope without another confirmation.
- Preserve existing cost behavior unless standard usage parsing requires a narrowly scoped correction.
- Do not modify installed Pi code, authentication, routing choices, or unrelated configuration.
- Do not merge the PR, deploy, submit usage remotely, or publish a release.
- Offer the `grill` skill as an optional plan challenge without blocking the approved implementation.
- Expected elapsed work: 45–60 minutes, primarily Rust build time and live verification.
