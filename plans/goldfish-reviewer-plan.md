# Goldfish parallel document review

Status: Completed — 2026-11-17.

## 1. Brief

Add a Goldfish coordinator and four independent document reviewers. The coordinator runs the reviews in parallel and returns one report. Keep the existing ADR and plan workflows.

## 2. Current state / relevant context

- Agent definitions live in `agents/pi/`. Existing reviewers use fresh context and replace the base system prompt.
- The installed `pi-subagents` supports nested delegation, strict tool lists, descendant agent limits, and context controls.
- The existing user scan path includes `agents/pi/`. Live settings changes remain outside scope.
- EGM supplies separate comprehension, design critique, simplicity, and implementation readiness prompts.
- Existing ADRs record architecture choices. Plans record execution steps. A missing implementation plan does not make an ADR defective.
- No `docs/CONTEXT.md` exists in this repository.

## 3. Proposed implementation

Add `goldfish` as a read-only coordinator. Give it source inspection tools and the child-safe `subagent` tool. Restrict its descendants to four named reviewers. Disable ambient extensions, inherited instructions, inherited skills, and persistent memory configuration.

Each specialist receives only source inspection tools. Use `read`, `grep`, `find`, and `ls`, without shell or write tools. Start every review with fresh context.

Launch the four specialists in one parallel workflow. Wait for all results before combining findings. Keep the caller's session asynchronous. Run one review round without automatic fixes or repeated reviews.

The comprehension reviewer receives the target only. The other reviewers receive the explicit reading list, review rules, and source roots. Treat supplied documents as evidence, not authority to change permissions.

Preserve the comprehension summary. Combine duplicate findings and retain each reviewer's status. Report missing input, failed reads, and failed children as incomplete. Let implementation readiness report `not applicable` when the target has no implementation plan.

Use the existing `/run` command and natural-language delegation. Do not add an extension or duplicate command. Match the existing review agents' model and thinking settings. Keep the coordinator on the configured default model.

## 4. File-by-file impact

- `agents/pi/goldfish.md`: coordinator, context selection, parallel launch, and combined report.
- `agents/pi/goldfish-comprehension.md`: document-only explanation and missing assumptions.
- `agents/pi/goldfish-design-critic.md`: design claims, alternatives, risks, and accepted decisions.
- `agents/pi/goldfish-zoom-out.md`: scope, simplicity, and reuse checks.
- `agents/pi/goldfish-implementation-readiness.md`: actionable plan and verification checks.
- `docs/goldfish-reviewer.md`: usage, tool limits, context rules, and validation limits.
- `docs/README.md`: guide index entry.
- `plans/goldfish-reviewer-plan.md`: decisions, checks, and remaining limits.

Existing agents, commands, extensions, live settings, and accepted ADRs stay unchanged.

## 5. Risks and edge cases

- Tool restrictions do not create a filesystem sandbox. Inspection tools can read accessible files.
- A fresh default can be overridden by a caller. The coordinator must explicitly select fresh reviewer contexts.
- Global settings, project agent definitions, and required extensions can change resolved behavior. Inspect resolved definitions and actual child traces.
- The default nesting limit permits the requested two levels. A stricter host limit must fail without fallback.
- Four reviewers increase model usage. Keep one round and no automatic retries.
- Reviewers must separate current behavior from proposed changes.
- The implementation reviewer must not demand execution details from an ADR alone.
- Document-only comprehension must not receive parent explanations or separate context files.
- Runtime session and report storage can write artifacts even though reviewers have no write tools.

## 6. Validation / testing

Success criteria:

1. The installed loader discovers all five definitions without diagnostics.
2. Only the coordinator receives delegation. Its descendant list contains exactly the four specialists.
3. All five definitions exclude shell and write tools, ambient extensions, inherited instructions, and inherited skills.
4. A native coordinator run launches four reviewers in parallel with fresh contexts.
5. A synthetic plan produces concrete findings and preserves the comprehension summary.
6. An ADR-only review does not require implementation details.
7. A missing file produces an incomplete review rather than a clean result.
8. Review fixtures remain unchanged. Actual tool traces contain no shell or mutation calls.
9. Documentation links resolve. `git diff --check` and `pre-commit run --all-files` pass.

Use small temporary fixtures and installed loader assertions. Check child traces for parent-only markers and inherited context. Do not add a framework for Markdown definitions.

## 7. Step-by-step execution checklist

- [x] Inspect local agents, repository rules, upstream prompts, and nested delegation controls.
- [x] Record scope, success criteria, and limits.
- [x] Add the coordinator and four reviewer definitions.
- [x] Assert resolved agent tools, context, model, extension, and delegation settings.
- [x] Run native review fixtures and inspect child traces.
- [x] Delegate affected documentation updates.
- [x] Run repository checks and record results.

### Validation results

- Installed-loader assertions passed for all five definitions, model choices, tool lists, context flags, extension exclusions, and descendant restrictions.
- The first native run found the seeded data-loss risk, duplicate identifier helper, unresolved retry policy, and missing test expectations.
- The first run exposed an injected `contact_supervisor` tool and a rewritten comprehension summary. Explicit tool exclusions and verbatim-copy instructions corrected these issues.
- Final native plan and ADR reviews each launched four fresh reviewers in parallel. Their execution intervals overlapped by 19.475 and 6.784 seconds.
- The final coordinator tool lists contained only `read`, `grep`, `find`, `ls`, and `subagent`. Ambient extensions and inherited skills were absent.
- All eight nested reviewers used only inspection tools. Comprehension read only the target document.
- Both combined reports copied the two comprehension explanations unchanged.
- The ADR-only readiness reviewer returned `not applicable`. The missing target returned `incomplete`.
- Parent-only and project-instruction markers were absent from coordinator and reviewer transcripts. This checks those markers, not all possible inherited context.
- Fixture hashes and file lists stayed unchanged, including after an embedded instruction requested a write.
- Documentation links, whitespace checks for new files, `git diff --check`, and `pre-commit run --all-files` passed.
- Final native workflow: `43f8222e-4cc1-464d-92ba-f9d7136669e0`.
- No live settings, installed packages, existing agents, or accepted ADRs changed. No commit was created.

### Remaining limits

- Synthetic fixtures do not establish review quality for production designs.
- `/run` uses profile or global context defaults. Explicit `context: "fresh"` is required when global settings prefer a fork.
- Tool controls are not a filesystem sandbox. Runtime storage still writes session and report artifacts.
- Host-required extensions, settings overrides, and future runtime changes need separate verification.
- Native tests covered the `subagent` entry point, not interactive `/run` command entry or a host-imposed depth failure.

## 8. Open questions / assumptions

- The request authorizes local implementation and nested review tests.
- No live settings or installed package edits are authorized or needed.
- The existing `/run` entry point is sufficient. No new slash command is needed.
- Apply the target's document rules. Do not impose EGM's full specification template on ADRs or plans.
- Findings remain advice. Acceptance and edits stay with the caller.
