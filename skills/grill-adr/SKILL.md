---
name: grill-adr
description: Review ADR drafts with grouped questions, record accepted answers, and check decisions against project evidence and ./GLOSSARY.md. Use when the user wants to review an ADR.
---

# Grill ADR

Review an architecture decision record (ADR). Finish when every high-value question has an accepted answer or an explicit reason to remain open.

A batch is a group of questions in one tool call. Ask up to four independent questions per batch. If a question depends on an earlier answer, wait for that answer before asking it.

Keep work within ADR review. Read files, search code, inspect docs, and update Draft ADRs and accepted glossary terms. Do not write application code or modify implementation files. If the user requests implementation, ask them to leave grill mode after the ADR work is complete.

**Input**: The user's request can include:

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
   - `./GLOSSARY.md`, if it exists at the project root

2. **If an ADR path or number is provided**

   Resolve and read the ADR before asking questions.

   - Prefer `docs/decisions-drafts/` when the same ADR number appears in multiple places.
   - If the selected ADR is in `docs/decisions/`, treat it as accepted and binding. Do not modify it unless the user explicitly asks for an accepted-ADR correction. Prefer recommending a new Draft ADR that supersedes it.
   - If the selected ADR is missing, report its path and ask one selection or creation question.

3. **If a topic is provided but no ADR exists**

   Search accepted and draft ADRs for overlap. If none matches, explore the decision before creating a draft. Use the batch rules in the Grill Loop. Once the decision is clear enough to record, offer to create a Draft ADR.

4. **If no ADR or topic is provided**

   List Draft ADRs from `docs/decisions-drafts/`. Then ask exactly one selection question using `ask_user_question` when it is available:

   > "Which ADR should we grill, or do you want pre-draft ADR exploration instead?"

   Include at most three Draft ADRs as options and reserve one option for `Pre-draft ADR exploration`. If more drafts exist, say the user can type another ADR number or path. Do not guess or auto-select an ADR.

5. **Load relevant evidence**

   Read the evidence paths already named in the ADR where they exist. Read relevant docs, source files, and sub-repo instructions only when needed to evaluate the ADR.

6. **Estimate the initial question count**

   Before the first batch, list the high-value unanswered questions from the ADR, template, docs, glossary, evidence, and code.
   Report only the count.
   If the user requests the list, show it.

   Use this wording:

   > I found N initial high-value questions. I will group independent questions, up to four per round. The count can change with your answers.

   Treat this as a live estimate, not a fixed queue.

---

## Grill Loop

Repeat until every high-value question has an accepted answer or an explicit reason to remain open.

1. **Inspect before asking**

   Before the first batch, inspect the ADR, relevant accepted ADRs, drafts, docs, glossary, evidence, and code together.
   If these sources answer a question, use that answer instead of asking the user.
   For later batches, reuse earlier evidence for unchanged parts.
   Ask only questions that still need the user's decision.

2. **Group independent questions**

   Ask all ready questions together, up to four per call.
   Each question must address one decision and remain answerable without another answer from that batch.
   If more than four questions are ready, continue in later batches.

   When `ask_user_question` is available, put each batch in one call through its `questions` array.
   Ask in plain text only when the tool is unavailable.

   Provide two to four concise answer options per question.
   Put the recommended answer first and append `(Recommended)` to its label.

   Each question must include:

   - `Progress`: the current question number and current estimate, such as `Question 1/6`.
   - `Question`: the single decision needed.
   - `Recommended answer`: the answer you recommend.
   - `Rationale`: why that answer is preferred, based on the ADR, template, docs, evidence, code, or concrete scenarios.
   - `Capture target`: the ADR section or `./GLOSSARY.md` entry to update after acceptance.

   Place these details in the question text and option descriptions.
   Use the header for a short topic label.

3. **Make questions concrete**

   Stress-test ADRs with realistic examples, failure modes, edge cases, and counterexamples. Prefer concrete scenarios over abstract prompts.

   Examples of useful grill questions:

   - Does this ADR apply to the Workspace root, one Sub-repo, or multiple Sub-repos?
   - Which accepted ADR does this supersede, if the old guidance conflicts with this decision?
   - If existing implementation contradicts this draft, what must an agent do?
   - Which alternative is the real fallback if the chosen approach fails?
   - What evidence proves this is already implemented versus only proposed?

4. **Challenge vague terms**

   If the ADR uses vague terms, check `./GLOSSARY.md` first.
   If a term conflicts with its definition, ask which meaning applies.
   If the term is missing or ambiguous, recommend a precise definition.
   Record accepted terms under the glossary rules in Capture Rules.

5. **Record accepted answers**

   Treat explicit approval such as "yes", "accept", "use that", or a direct alternative as an accepted answer.
   After each batch, record all accepted answers before asking the next batch.
   Keep unanswered questions open.
   If answers conflict or a rejected answer has no replacement, ask a focused follow-up.
   Update earlier decisions instead of appending contradictory guidance.
   Keep enough history to explain the change.

---

## Capture Rules

After each batch, record each accepted answer in the correct place:

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
| Pure terminology | `./GLOSSARY.md` |

Guidelines:

- Preserve the existing ADR structure and wording as much as possible.
- Add the smallest text that accurately records the accepted answer.
- Keep implementation tasks out of ADRs unless they are necessary reviewer checks or agent guidance.
- Use one glossary at `./GLOSSARY.md`, relative to the project root.
- If the glossary is missing, create it when the first term is resolved.
- Keep only project terms, definitions, and relationships in the glossary. Record architecture decisions in the ADR.
- If a title or file path changes, update `docs/decisions-drafts/README.md` or `docs/decisions/README.md` consistently.

After each batch, check changed assumptions against affected code and docs together.
Reuse earlier evidence for unchanged parts.
Run the manual validation checklist once for all ADR and glossary updates in the batch.
Continue only after validation passes or you report the blocker.

---

## Manual Validation Checklist

Check these items manually after each batch:

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

If a check fails, report the failure.
Fix only the ADR wording, structure, metadata, or index needed to satisfy the checklist.
Run the checklist again.

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
- Terms conflict with `./GLOSSARY.md` or project language.

Avoid low-value questions:

- Questions answered directly by the ADR, docs, evidence, or code.
- Formatting-only questions with no review consequence.
- Preference-only questions with no architecture consequence.
- Broad prompts like "Anything else?".
- Multi-part questions.

---

## Ending

When every high-value question has an accepted answer or an explicit reason to remain open:

1. Summarize the accepted answers captured this session.
2. Report the final manual validation status.
3. Summarize remaining risks, assumptions, and open questions with their reasons.
4. If the ADR is ready, say it is ready for human review. Do not say it is accepted unless it already lives in `docs/decisions/` with accepted status.

---

## Guardrails

- Never implement code or modify implementation files.
- Never mark an ADR accepted without explicit human approval.
