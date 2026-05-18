---
name: grill-with-docs
description: Grill implementation plans one question at a time, record answers in plans/<topic>-plan.md, and align terminology with docs/CONTEXT.md. Use when the user wants to discuss, stress-test, or refine a plan.
---

<what-to-do>

Interview me about the plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing.

If a question can be answered by exploring the codebase, explore the codebase instead.

Every accepted answer is a plan decision. Record it in the active plan before asking the next question.

</what-to-do>

<supporting-info>

## Plan-first workflow

Before asking plan questions, establish the active plan file:

1. If the user names a plan file, use that file.
2. Otherwise search `plans/` for the relevant plan.
3. If no suitable plan exists, create `plans/<topic>-plan.md` with the standard plan sections from the user's agent instructions.

The active plan is the durable record for the discussion. Do not leave decisions only in chat.

When the user answers a question:

1. Record the answer immediately in the active plan.
2. Add or update a decision log entry with the question, accepted answer, recommendation if relevant, date, and rationale.
3. Update the affected plan sections, assumptions, risks, checklist items, or file-by-file impact so the plan remains implementation-ready.
4. Then ask the next question.

If the user's answer changes an earlier decision, update the old plan text instead of appending contradictory guidance. Keep enough history to explain the change.

## Documentation awareness

During codebase exploration, also look for existing documentation:

### File structure

Repos use a single glossary at `docs/CONTEXT.md`:

```
/
├── docs/
│   └── CONTEXT.md
├── plans/
│   └── feature-name-plan.md
└── src/
```

No other context file location is supported.

`docs/CONTEXT.md` is the glossary exception to the usual implemented-only docs rule: it may be created during planning because terminology decisions shape the plan.

Create files lazily - only when you have something to write. If no `docs/CONTEXT.md` exists, create it when the first term is resolved.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `docs/CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y - which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' - do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible - which is right?"

### Update docs/CONTEXT.md inline

When a term is resolved, update `docs/CONTEXT.md` right there. Don't batch these up - capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

`docs/CONTEXT.md` should be totally devoid of implementation details. Do not treat `docs/CONTEXT.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Keep decisions in plans

Implementation decisions, trade-offs, rejected alternatives, assumptions, and open questions belong in the active file under `plans/`.

</supporting-info>
