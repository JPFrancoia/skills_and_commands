# Root Repository Layout

Use these responsibilities as the baseline, not as a command to replace existing files.
Preserve equivalent paths and indexes that the workspace already uses.

## Baseline

```text
<workspace>/
  .gitignore
  README.md
  AGENTS.md
  GLOSSARY.md
  docs/
    README.md
    adr-template.md
    reference/
      README.md
    decisions/
      README.md
    decisions-drafts/
      README.md
  plans/
    README.md
  <nested-repositories>/
```

The nested repositories stay independent and outside the root Git index.
An index is a document that links to related documents.
The Git index is Git's staging area, not a documentation index.

| Path | Responsibility |
| --- | --- |
| `README.md` | Human guide, project purpose, member map, setup boundaries, and links to shared context. |
| `AGENTS.md` | Short agent routing rules and selected project policies. |
| `.gitignore` | Root-anchored member paths, local credentials, and local runtime state. |
| `GLOSSARY.md` | Shared terms and relationships. Preserve `docs/CONTEXT.md` or another authoritative glossary when present. |
| `docs/README.md` | Entry point for durable documents, the glossary, decisions, and plans. |
| `docs/reference/README.md` | Index of documents about implemented behavior. |
| `docs/adr-template.md` | ADR format and human acceptance process. |
| `docs/decisions/README.md` | Index of accepted and historical architecture decisions, with their current status. |
| `docs/decisions-drafts/README.md` | Index of proposed decisions that await human review. |
| `plans/README.md` | Index of versioned implementation plans and their status. |

For empty indexes, state that no records exist yet.
Link to the related index or template.
Do not create example decisions or fictional plans to fill the directories.
Keep plans outside current-state reference documents.
Preserve completed plans as history.

## Root README

Explain these facts:

1. The root holds shared context for the named project.
2. Each mapped member owns its code and Git history.
3. The root ignores member source paths.
4. Shared documents describe current behavior, decisions, terminology, or planned work.
5. Root setup does not install or publish the product.

Include each member's observed relative path and purpose.
For a repository that is not present, label its intended path as planned.
Do not invent clone URLs, default branches, setup commands, or architecture facts.
Link to `AGENTS.md` and `docs/README.md`.
Include only local commands whose results the setup process checked.

## Agent instructions

Adapt this outline to the actual member map and glossary path.
Replace angle-bracket placeholders before writing the final file.
Add selected policies only after their meaning is clear.

```markdown
# <Project> Workspace Instructions

This root repository holds shared context.
Nested repositories own their source code and Git history.

## Start Here

1. Identify whether the task targets the workspace root or a nested repository.
2. For nested work, read that repository's `AGENTS.md` before edits.
3. If `AGENTS.md` is absent, read its `CLAUDE.md` when present.
4. For domain or design work, read the shared glossary and relevant reference documents.
5. For architecture work, read relevant accepted architecture decision records (ADRs).
6. For implementation work, read the relevant plan and task-specific project guidance.

An ADR explains a design decision and its reasons.

## Workspace Map

- `docs/README.md`: shared documentation index.
- `<glossary-path>`: shared terminology.
- `docs/reference/`: implemented behavior.
- `docs/decisions/`: accepted and historical architecture decisions.
- `docs/decisions-drafts/`: proposed decisions that await review.
- `plans/`: versioned plans and work records.
- `<member-path>/`: <observed responsibility>.

## Shared Context

- Read each decision's status and replacement links before applying it.
- Treat drafts and plans as proposals or history, not proof of current behavior.
- Update affected reference documents after implementation changes.
- Keep documentation indexes current.
- Keep terms in the glossary and design choices in ADRs.
- Preserve existing plan formats and completed records.
- Before accepting a draft ADR, obtain explicit human approval.

## Boundaries

- During root context work, edit nested repositories only when the task explicitly includes them.
- Keep nested source files outside the root Git index.
- Preserve unrelated files and working changes.
- Keep credentials and local runtime state out of tracked documents.
- Before external or destructive actions, obtain explicit current-session authority.
```

Keep this file focused on routing and project-specific constraints.
Link to detailed procedures instead of copying their full instructions.
Do not copy personal tools, provider names, automatic push rules, or environment details from another project.

## ADR template

Use the existing template when one exists.
For a new template, use this schema:

```markdown
# NNNN. <Decision Title>

Status: Draft
Date recorded: YYYY-MM-DD
Date decided: unknown
Decision owner: <person/team/TBD>
Applies to: <workspace/repository/service/domain>
Confidence: high | medium | low
Supersedes: none | NNNN
Superseded by: none | NNNN

## Context

What problem needs a durable decision, and why now?

## Decision

State the chosen approach and its scope.

## Alternatives Considered

### <Alternative>

Pros:

- <Benefit>

Cons:

- <Cost or risk>

Reason not chosen:

- <Reason>

## Consequences

Positive:

- <Benefit>

Negative:

- <Cost or risk>

Neutral:

- <Effect>

## Evidence

- <Source path or URL> - <What this source establishes>

## Agent Guidance

- <Action or constraint that follows from this decision>

## Reviewer Acceptance Checks

- Is the decision accurate and supported by evidence?
- Is its scope clear?
- Does it replace another decision?
- Who owns the decision?
```

Add these rules outside the fenced template:

1. Use a unique four-digit number across draft and accepted ADRs.
2. Create drafts under `docs/decisions-drafts/` with `Status: Draft` and `Date decided: unknown`.
3. Keep an ADR in one directory at a time.
4. After explicit human acceptance, move the draft into `docs/decisions/`.
5. Set `Status: Accepted` and the actual decision date.
6. Update both indexes and any replacement links.

A superseded decision has a newer replacement.
A deprecated decision no longer applies without a replacement.
Keep historical decisions and mark their status as `Superseded`, `Rejected`, or `Deprecated` when appropriate.
Never infer acceptance from existing code or a completed plan.

## Optional additions

| Addition | Include only when selected |
| --- | --- |
| `CLAUDE.md` | Keep it byte-identical to `AGENTS.md` when the team selects parity. |
| `agent-skills/` | Store reviewed shared skills and their supporting files. Add a short discovery guide. |
| `.pi/skills` | Use a relative link to `../agent-skills` when Pi discovery is selected and the path is available. |
| `diagrams/` | Store diagram sources and an index. Choose a renderer only when the project needs one. |
| Root checks | Use existing tools first. Run selected parity or Markdown-link checks locally. |
| Hosted CI | Use the selected hosting service and existing workflow conventions. Report execution separately from file creation. |

For diagram work, read sources linked by the relevant reference documents or ADRs.
Do not invent an architecture diagram without source evidence.
For shared skills, keep their files tracked even when local discovery paths are ignored.
Avoid new dependencies for checks that existing tools can perform.
Exclude sync commands and cleanup commands unless the user explicitly requests them.
