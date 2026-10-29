---
name: grill-adr
description: Grill ADR drafts one question at a time, capture accepted answers, and validate decisions against project evidence and terminology. Use when the user wants to stress-test, refine, or challenge an ADR.
---

# Grill ADR

Grill an ADR in a structured mode. This is for sharpening architecture decision records, not implementation. Ask one high-value question at a time, recommend an answer, capture accepted answers into the right artifact immediately, validate the ADR manually, then continue.

**IMPORTANT: Grill mode is for sharpening an ADR, not implementing it.** You may read files, search code, inspect docs, update Draft ADRs, and update `docs/CONTEXT.md` when the user accepts terminology. You must never write application code, implement features, or modify implementation files. If the user asks you to implement something, remind them to leave grill mode and implement only after the ADR work is complete.

**Input**: The user's request may include:

- An ADR path, such as `docs/decisions-drafts/0034-example.md`.
- An ADR number, such as `0034`.
- A draft topic or decision title.
- No ADR identifier or topic.

---

## Start

1. **Load ADR context**

   Read these files before asking grill questions:

   - `docs/adr-template.md`
   - `docs/decisions/README.md`
   - `docs/decisions-drafts/README.md`
   - `docs/CONTEXT.md`

2. **If an ADR path or number is provided**

   Resolve and read the ADR before asking questions.

   - Prefer `docs/decisions-drafts/` when the same ADR number appears in multiple places.
   - If the selected ADR is in `docs/decisions/`, treat it as accepted and binding. Do not modify it unless the user explicitly asks for an accepted-ADR correction. Prefer recommending a new Draft ADR that supersedes it.
   - Missing files are useful context; report the missing path briefly and ask one selection or creation question.

3. **If a topic is provided but no ADR exists**

   Search accepted and draft ADRs for overlap. If no matching ADR exists, stay in pre-draft grill mode. Ask one question at a time and offer to create a Draft ADR only when the decision is clear enough to record.

4. **If no ADR or topic is provided**

   List Draft ADRs from `docs/decisions-drafts/`. Then ask exactly one selection question using `ask_user_question` when it is available:

   > "Which ADR should we grill, or do you want pre-draft ADR exploration instead?"

   Include at most three Draft ADRs as options and reserve one option for `Pre-draft ADR exploration`. If more drafts exist, say the user can type another ADR number or path. Do not guess or auto-select an ADR.

5. **Load relevant evidence**

   Read the evidence paths already named in the ADR where they exist. Read relevant docs, source files, and sub-repo instructions only when needed to evaluate the ADR.

6. **Estimate the initial question count**

   Before asking the first grill question, inventory the initial set of high-value unanswered questions discovered from the ADR, template, docs, evidence, and code. Report only the count, not the full list, unless the user asks for it.

   Use this wording:

   > "I found N initial high-value questions. I'll ask them one at a time. This count may change if your answers reveal new ambiguity."

   Treat this as a live estimate, not a fixed queue.

---

## Grill Loop

Repeat until there are no high-value unanswered questions.

1. **Inspect before asking**

   Before asking a question, determine whether the answer can be found by reading the ADR, accepted ADRs, draft ADRs, docs, evidence, or code. If it can, inspect first and use the discovered answer instead of asking. Ask only when the answer requires a decision, confirmation, prioritization, ownership judgment, or domain judgment.

2. **Ask exactly one question**

   When `ask_user_question` is available, you must use it for every grill question. Never write a grill question as plain text while this tool is available. Ask in plain text only when the tool is unavailable.

   Provide two to four concise answer options. Put the recommended answer first and append `(Recommended)` to its label.

   Ask one and only one question per turn. Do not bundle multiple decisions into one prompt.

   Each question must include:

   - `Progress`: the current question number and current estimate, such as `Question 1/6`.
   - `Question`: the single decision needed.
   - `Recommended answer`: the answer you recommend.
   - `Rationale`: why that answer is preferred, grounded in the ADR, template, docs, evidence, code, or concrete scenarios.
   - `Capture target`: the ADR section or `docs/CONTEXT.md` entry that will be updated if accepted.

3. **Make questions concrete**

   Stress-test ADRs with realistic examples, failure modes, edge cases, and counterexamples. Prefer concrete scenarios over abstract prompts.

   Examples of useful grill questions:

   - Does this ADR apply to the Workspace root, one Sub-repo, or multiple Sub-repos?
   - Which accepted ADR does this supersede, if the old guidance conflicts with this decision?
   - What should an agent do when existing implementation contradicts this draft?
   - Which alternative is the real fallback if the chosen approach fails?
   - What evidence proves this is already implemented versus only proposed?

4. **Challenge vague terms**

   If the ADR uses vague or overloaded terms, check `docs/CONTEXT.md` first. If the term is already defined, use that definition and ask whether the ADR should adopt it. If the term is missing or ambiguous, recommend a precise definition and capture accepted terminology in `docs/CONTEXT.md`.

5. **Wait for acceptance**

   Do not update artifacts until the user accepts the recommended answer or provides an alternative answer. Treat explicit approval such as "yes", "accept", "use that", or a direct alternative as an accepted answer. If the user rejects the recommendation without a replacement, ask one follow-up question.

---

## Capture Rules

When the user accepts an answer, capture it immediately in the correct place:

| Accepted Answer Type | Capture Target |
| --- | --- |
| Decision scope, status, owner, confidence, or supersession | ADR metadata block |
| Problem framing or why-now rationale | `## Context` |
| Chosen architecture decision | `## Decision` |
| Tradeoff, rejected option, or fallback | `## Alternatives Considered` |
| Positive, negative, or neutral impact | `## Consequences` |
| Source path, implementation proof, or uncertainty | `## Evidence` |
| Future agent constraint | `## Agent Guidance` |
| Human review question | `## Reviewer Acceptance Checks` |
| Pure terminology | `docs/CONTEXT.md` |

Guidelines:

- Preserve the existing ADR structure and wording as much as possible.
- Add the smallest text that accurately records the accepted answer.
- Keep implementation tasks out of ADRs unless they are necessary reviewer checks or agent guidance.
- For accepted ADRs, do not edit `docs/decisions/` by default. Recommend a new Draft ADR that supersedes the accepted ADR unless the user explicitly asks for a correction.
- For terminology, keep `docs/CONTEXT.md` terminology-only; do not add implementation choices there.
- If a title or file path changes, update `docs/decisions-drafts/README.md` or `docs/decisions/README.md` consistently.

After each ADR or terminology update, run the manual validation checklist below. Do not proceed to the next grill question until validation passes or the blocker is clearly reported.

---

## Manual Validation Checklist

There is no ADR CLI validator. Check these items after every capture:

- The ADR follows `docs/adr-template.md`.
- The filename and title use the same ADR number.
- The ADR has exactly one status and the status matches its directory.
- Draft ADRs stay in `docs/decisions-drafts/` with `Status: Draft` and `Date decided: unknown`.
- Accepted ADRs stay in `docs/decisions/` with `Status: Accepted` and a decided date.
- Required sections are present: `Context`, `Decision`, `Alternatives Considered`, `Consequences`, `Evidence`, `Agent Guidance`, and `Reviewer Acceptance Checks`.
- Evidence entries are specific and say what each source proves or suggests.
- Supersession metadata is explicit: `none` or a four-digit ADR number.
- The relevant ADR index links to the ADR title and file.
- There are no duplicate draft and accepted copies of the same ADR.

If validation fails, report the failure, fix only the ADR wording, structure, metadata, or index needed to satisfy the checklist, and validate again.

---

## Question Selection

Prioritize questions that reduce future implementation risk, agent ambiguity, or review ambiguity.

High-value question categories:

- The decision statement contains multiple separable decisions.
- The ADR conflicts with an accepted ADR.
- Scope, owner, confidence, or supersession metadata is missing or questionable.
- Alternatives are weak, unrealistic, or missing the real fallback.
- Consequences omit security, privacy, migration, data retention, compatibility, operations, or user-facing risks that matter for the decision.
- Evidence is missing, stale, contradictory, or only proves implementation rather than intent.
- Agent guidance is vague, unenforceable, or too implementation-specific.
- Reviewer acceptance checks do not help a human decide whether to accept the ADR.
- Terms conflict with `docs/CONTEXT.md` or project language.

Avoid low-value questions:

- Questions answered directly by the ADR, docs, evidence, or code.
- Formatting-only questions with no review consequence.
- Preference-only questions with no architecture consequence.
- Broad prompts like "Anything else?".
- Multi-part questions.

---

## Ending

When there are no high-value unanswered questions left:

1. Summarize the accepted answers captured this session.
2. Report the final manual validation status.
3. Summarize remaining risks, assumptions, or low-value questions intentionally left open.
4. If the ADR is ready, say it is ready for human review. Do not say it is accepted unless it already lives in `docs/decisions/` with accepted status.

---

## Guardrails

- Ask exactly one question at a time.
- Estimate the initial number of high-value unanswered questions before asking the first question.
- Always provide a recommended answer and rationale with each question.
- Inspect artifacts, docs, evidence, or code before asking if the answer might already exist.
- Capture accepted answers immediately in the correct ADR section or `docs/CONTEXT.md`.
- Validate manually after each ADR or terminology update.
- Never implement code or modify implementation files.
- Never mark an ADR accepted without explicit human approval.
