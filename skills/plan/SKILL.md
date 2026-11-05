---
name: plan
description: Create and maintain durable implementation plans. Use before non-trivial implementation work that spans multiple files, changes architecture or risky behavior, or has unresolved requirements.
---

# Implementation Planning

For these tasks, work directly without a plan:

- One-line fixes, typo fixes, and simple configuration changes.
- Direct answers and read-only analysis.
- Routine command execution.

## 1. Create the plan

Save the plan as `plans/<topic>-plan.md` in the project root.
Use a descriptive topic name.
If `plans/` does not exist, create it.
If facts about the code remain unknown, record them in the initial draft.

Include all eight sections:

| Section | Content |
| --- | --- |
| Brief | Explain what changes and why the work is necessary now. Use two to four sentences in plain English. |
| Current state / relevant context | Describe the existing behavior and relevant code. |
| Proposed implementation | State the chosen approach. Explain its advantages and disadvantages compared with the alternatives. |
| File-by-file impact | Name the likely files and systems. Identify their interfaces, where the systems connect. |
| Risks and edge cases | Describe what can fail, including unusual inputs and conditions. |
| Validation / testing | State how to check each change and what results count as success. |
| Step-by-step execution checklist | List the implementation steps in order. |
| Open questions / assumptions | Separate unanswered questions from assumptions, which are details accepted without evidence. |

## 2. Review the plan

Offer the `grill` skill to challenge the plan against project documentation, terms, and existing decisions.
If the user accepts, update the plan with the results.

Before implementation, check that all these conditions hold:

- All eight sections contain the relevant details.
- Every proposed change identifies the likely files or systems it affects.
- Every checklist step states an action and the result that marks it complete.
- Every changed behavior has a check with an expected result.
- Every unresolved question has a safe assumption or an explicit reason to block implementation.

## 3. Present the plan for approval

Present the plan path and a concise summary:

- The Brief.
- Major decisions and affected files or systems.
- Key risks and reasons for the chosen approach.
- The validation approach.
- Open questions and assumptions.

Follow the approval rules in the global `AGENTS.md`.
After approval, pause only for a security risk, possible data loss, or a decision that needs the user.

## 4. Maintain the plan

When implementation changes an important decision or detail, update the affected plan sections.
Record each change and its reason.
When a checklist step finishes, mark it complete.
When all steps finish and checks pass, add the completion date.
Keep every plan as a decision record, including completed plans.
