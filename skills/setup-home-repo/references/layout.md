# Home Repository Layout

Preserve equivalent paths and indexes that the project already uses.
Use this layout for shared context, not as a reason to move existing source folders.

## Baseline

```text
<project>/
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
  <project-code>/
```

Project code stays in this repository alongside shared documents.
`<project-code>/` represents observed or approved source paths, not a literal directory to create.
The project can use one source folder or several component folders.
An index is a document that links to related documents.

| Path | Responsibility |
| --- | --- |
| `README.md` | Human guide, project purpose, component map, and shared context links. |
| `AGENTS.md` | Short routing rules for folders within this repository. |
| `.gitignore` | Credentials, local runtime state, and relevant generated output, not component source. |
| `GLOSSARY.md` | Shared terms. Preserve `docs/CONTEXT.md` or another authoritative glossary when present. |
| `docs/README.md` | Entry point for durable documents, terminology, decisions, and plans. |
| `docs/reference/README.md` | Index of documents about implemented behavior. |
| `docs/adr-template.md` | Architecture decision record (ADR) format and human acceptance process. |
| `docs/decisions/README.md` | Index of accepted and historical ADRs, with their current status. |
| `docs/decisions-drafts/README.md` | Index of proposed ADRs that await human review. |
| `plans/README.md` | Index of implementation plans and their status. |

An ADR explains a design choice and its reasons.
For empty indexes, state that no records exist yet.
Link to the related index or template.
Create no fictional decisions or plans to fill directories.
Preserve completed plans as history, separate from current-state reference documents.

## Root README

Explain these facts:

1. The named project stores source code and shared context in one Git repository.
2. Component folders share Git history and project delivery rules.
3. Source folders remain visible to Git.
4. Reference documents, plans, terminology, and ADRs have distinct roles.
5. Context setup does not build, install, or publish the product.

Include each observed component path and purpose.
Label intended components as planned when their source does not exist.
Do not invent clone URLs, setup commands, source folders, or architecture facts.
Link to `AGENTS.md` and `docs/README.md`.
Include local commands only after their actual results pass inspection.

## Agent instructions

Adapt this outline to observed component paths and the authoritative glossary.
Replace angle-bracket placeholders before writing the final file.
Link real files from the final map.

```markdown
# <Project> Instructions

This repository owns project code and shared context.
Component folders share one Git history and project delivery rules.

## Start Here

1. Identify the folders that the task affects.
2. Read applicable folder instructions before edits.
3. For domain or design work, read the shared glossary and relevant reference documents.
4. For architecture work, read relevant accepted architecture decision records (ADRs).
5. For implementation work, read the relevant plan and task guidance.

An ADR explains a design decision and its reasons.
Folder instructions refine local work without creating independent Git repositories.

## Project Map

- `docs/README.md`: shared documentation index.
- `<glossary-path>`: shared terminology.
- `docs/reference/`: implemented behavior.
- `docs/decisions/`: accepted and historical architecture decisions.
- `docs/decisions-drafts/`: proposed decisions that await review.
- `plans/`: implementation plans and work records.
- `<component-path>/`: <observed responsibility>.

## Shared Context

- Read each decision's status and replacement links before applying it.
- Treat drafts and plans as proposals or history, not proof of current behavior.
- Update affected reference documents after implementation changes.
- Keep documentation indexes current.
- Keep terms in the glossary and design choices in ADRs.
- Preserve existing plan formats and completed records.
- Before accepting a draft ADR, obtain explicit human approval.

## Boundaries

- Keep component source visible to Git in this repository.
- Preserve unrelated files and working changes.
- Keep credentials and local runtime state outside tracked context.
- Before external or destructive actions, obtain explicit current-session authority.
```

Add selected project policies only after their meaning is clear.
Keep detailed procedures in linked documents rather than copying their full instructions.
Keep personal tools, provider names, and automatic publication policies out of new defaults.

## ADR template

Use an existing template when present.
For a new template, use this schema:

```markdown
# NNNN. <Decision Title>

Status: Draft
Date recorded: YYYY-MM-DD
Date decided: unknown
Decision owner: <person/team/TBD>
Applies to: <project/component/service/domain>
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
| Local checks | Use existing tools first. Run selected parity or Markdown-link checks locally. |
| Hosted checks | Use the selected hosting service and existing conventions. Report execution separately from file creation. |

For shared skills, keep their files visible to Git even when local discovery paths are ignored.
For diagram work, read sources linked by relevant reference documents or ADRs.
Create no architecture diagram without source evidence.
Keep source folder creation, build tools, package managers, and dependency installation outside this shared layout.
