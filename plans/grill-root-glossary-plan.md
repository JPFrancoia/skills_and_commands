# Use the root glossary in grill

Status: Completed — 2026-11-05.

## 1. Brief

Use `./GLOSSARY.md` for project terms during plan reviews. Align the installed `grill` skill with the glossary path used by `grill-with-docs`.

## 2. Current state / relevant context

- `skills/grill/SKILL.md` uses `docs/CONTEXT.md` for terms.
- `skills/grill/CONTEXT-FORMAT.md` documents that old path.
- The installed `grill-with-docs` skill delegates glossary work to `domain-modeling`, which uses a root `GLOSSARY.md`.
- The root glossary does not exist in this repository. This change updates instructions, not project data.
- The grouped question workflow remains unchanged.

## 3. Proposed implementation

Use `./GLOSSARY.md` relative to the project root. Update all glossary paths in `grill` and its format guide. Rename the guide to `GLOSSARY-FORMAT.md` and update its link.

Keep the existing glossary structure and examples. Keep lazy file creation and glossary-only content. The root glossary can exist during planning. Implementation decisions remain in plans.

## 4. File-by-file impact

- `skills/grill/SKILL.md`: update the description, file tree, glossary paths, and format guide link.
- `skills/grill/CONTEXT-FORMAT.md`: rename to `skills/grill/GLOSSARY-FORMAT.md` and update its path rules.
- `plans/grill-root-glossary-plan.md`: record this change and its checks.

The skill and format guide document the behavior. No separate documentation page is necessary.

## 5. Risks and edge cases

- Existing project glossaries remain untouched. No automatic file move or content merge occurs.
- Other skills can retain their own glossary rules. This change covers the plan review skill and its guide.
- Old links can break after the guide rename. Check all active references to that guide.

## 6. Validation / testing

Success criteria:

1. All glossary references in `skills/grill/` use the root `./GLOSSARY.md`.
2. The renamed format guide resolves from the skill link.
3. Glossary examples and grouped question behavior remain unchanged.
4. Focused assertions, `git diff --check`, and `pre-commit run --all-files` pass.

## 7. Step-by-step execution checklist

- [x] Inspect both skill workflows and their format guides.
- [x] Record approved scope and success criteria.
- [x] Update the skill and rename the format guide.
- [x] Run focused checks and repository checks.
- [x] Record results and limits.

### Validation results

- Focused assertions passed for root glossary paths, lazy file creation, grouped questions, and the format guide link.
- No old glossary path or guide name remains in `skills/grill/`.
- The format guide examples and rules match their earlier contents exactly.
- The installed skill path points to the changed directory.
- No active file links to the old guide path.
- `git diff --check` and `pre-commit run --all-files` passed.
- No live review session ran. No existing project glossary moved or changed.

## 8. Open questions / assumptions

- The user approved the root glossary path explicitly.
- Keep the existing single-glossary structure. Nested glossaries and glossary maps remain outside scope.
- Keep `grill-adr`, other skills, and external source repositories unchanged.
- Keep completed plans as historical records of earlier decisions.
