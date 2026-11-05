---
name: grill
description: Review implementation plans with grouped questions, record answers in plans/<topic>-plan.md, and align terms with ./GLOSSARY.md. Use when the user wants to discuss, stress-test, or refine a plan.
---

<what-to-do>

Review each part of the plan. Finish when every high-value question has an accepted answer or an explicit reason to remain open.

A batch is a group of questions in one tool call. Ask up to four independent questions per batch. If a question depends on an earlier answer, wait for that answer before asking it.

If code or documentation can answer a question, inspect them instead. For each user question, provide your recommended answer.

After each batch, record all accepted answers in the active plan. Check the affected code and documentation together before asking the next batch.

</what-to-do>

<supporting-info>

## Plan-first workflow

Before asking plan questions, establish the active plan file:

1. If the user names a plan file, use that file.
2. Otherwise search `plans/` for the relevant plan.
3. If no suitable plan exists, create `plans/<topic>-plan.md` with the standard plan sections from the user's agent instructions.
4. Inventory the initial set of high-value unanswered questions discovered from the plan, docs, glossary, and code. Report only the count, not the full list, unless the user asks for it.

Use this wording:

> I found N initial high-value questions. I will group independent questions, up to four per round. The count can change with your answers.

Treat this as a live estimate, not a fixed queue.

The active plan is the durable record for the discussion. Do not leave decisions only in chat.

When the user answers a batch:

1. Record each accepted answer in the active plan, with its question, recommendation, date, and reason.
2. Update the affected plan sections, assumptions, risks, checklist items, and file-by-file impact together.
3. Check changed assumptions against the affected code and documentation once for the batch. Reuse earlier evidence for unchanged parts.
4. Keep unanswered questions open. If answers conflict, ask a focused follow-up instead of choosing silently.
5. Select the next independent questions from the remaining open decisions.

If the user's answer changes an earlier decision, update the old plan text instead of appending contradictory guidance. Keep enough history to explain the change.

## Documentation awareness

During codebase exploration, also look for existing documentation:

### File structure

Use one glossary at `./GLOSSARY.md`, relative to the project root:

```
/
├── GLOSSARY.md
├── plans/
│   └── feature-name-plan.md
└── src/
```

`./GLOSSARY.md` can exist during planning because agreed terms shape the plan.

If `./GLOSSARY.md` does not exist, create it when the first term is resolved.

## During the session

### Use the question tool

When `ask_user_question` is available, put each batch in one call through its `questions` array. Ask in plain text only when the tool is unavailable.

Use two to four concise answer options per question. Put the recommended answer first and append `(Recommended)` to its label.

### Group independent questions

Ask all ready questions together, up to four per call. Each question must address one decision and remain answerable without another answer from that batch. If more than four questions are ready, continue in later batches.

Before the first batch, inspect the relevant code, documentation, and glossary together. For later batches, reuse the checks from the previous batch. Ask only questions that still need the user's decision.

Each question must include:

- `Progress`: the current question number and current estimate, such as `Question 1/6`.
- `Question`: the single decision needed.
- `Recommended answer`: the answer you recommend.
- `Rationale`: why that answer is preferred, based on the plan, docs, glossary, code, or concrete scenarios.
- `Capture target`: the plan section or `./GLOSSARY.md` entry that will be updated if accepted.

Place these details in the question text and option descriptions. Use the header for a short topic label.

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `./GLOSSARY.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y - which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' - do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible - which is right?"

### Update ./GLOSSARY.md inline

After each batch, update all resolved terms in `./GLOSSARY.md` together. Use the format in [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).

Keep only project terms, definitions, and relationships in `./GLOSSARY.md`. Record implementation decisions in the active plan.

### Keep decisions in plans

Implementation decisions, trade-offs, rejected alternatives, assumptions, and open questions belong in the active file under `plans/`.

## Guardrails

- Group ready questions before asking. Separate questions that depend on earlier answers.
- Estimate the initial number of high-value unanswered questions before asking the first batch.
- Include `Progress` with every grill question.
- Always provide a recommended answer and rationale with each question.

</supporting-info>
