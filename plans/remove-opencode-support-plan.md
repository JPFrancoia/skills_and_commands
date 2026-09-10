# Remove OpenCode Support Plan

**Status:** Completed
**Created:** 2026-09-10
**Completed:** 2026-09-10

## Brief

Remove the unused OpenCode code, files, and instructions from this repository. Keep Amnesia and all host-specific configuration functional for Pi.

The cleanup removes two session backends from Amnesia and leaves its Pi backend as the only runtime path. It also removes standalone OpenCode agents and the OpenCode plan plugin.

## Current state / relevant context

- `skills/amnesia/save.py` supports Pi JSONL sessions and OpenCode exports.
- `skills/amnesia/SKILL.md`, `skills/amnesia/README.md`, and `commands/sum.md` use the obsolete OpenCode installation path.
- `skills/simple-english/SKILL.md` lists OpenCode compatibility but does not list Pi compatibility.
- `agents/opencode/` contains two OpenCode-only agent definitions.
- `plugins/plan-mode-docs-plans.js` is an OpenCode-only plugin.
- `skills/amnesia/.opencode/` contains ignored OpenCode package files and dependencies.
- `AGENTS.md` describes OpenCode agents, plugins, and the live OpenCode configuration path.
- The three tracked Amnesia files share hard links with `~/.pi/agent/skills/amnesia/`. File edits can affect the active Pi copies.
- Four `agents/pi/*.md` files contain pre-existing user changes. This work will not modify those changes.
- The memory search found a prior Pi smoke test for Amnesia. It also confirmed that the tracked and live Pi files use hard links.

## Proposed implementation

1. Make Amnesia Pi-only.
   - Remove OpenCode session discovery and export functions.
   - Remove the unused `subprocess` and `tempfile` imports.
   - Remove OpenCode-only message helpers.
   - Call `get_current_pi_session()` and `export_pi_session()` directly.
   - Keep the existing Pi session resolution, branch selection, title extraction, and summary-marker filtering.
2. Replace every Amnesia command path with `~/.pi/agent/skills/amnesia/save.py`.
3. Rewrite Amnesia descriptions and diagrams for Pi JSONL sessions only.
4. Replace OpenCode with Pi in the Simple English compatibility value.
5. Delete the OpenCode-only agents, plugin, and ignored Amnesia package directory.
6. Update `AGENTS.md` so that it describes the remaining Pi-only host configuration.
7. Add one small standard-library test for Pi session detection and export filtering.

This approach removes code instead of adding a compatibility layer. Git history remains the restoration path if OpenCode support becomes necessary again.

## File-by-file impact

| Path | Change |
|---|---|
| `skills/amnesia/save.py` | Delete the OpenCode backend and simplify the call path to Pi functions. |
| `skills/amnesia/test_save.py` | Add one runnable test for the Pi backend. |
| `skills/amnesia/SKILL.md` | Use Pi paths and Pi-only session instructions. |
| `skills/amnesia/README.md` | Use Pi installation, commands, architecture, and dependencies. |
| `skills/amnesia/.opencode/` | Delete ignored OpenCode package files and dependencies. |
| `skills/simple-english/SKILL.md` | Remove OpenCode compatibility and add Pi compatibility. |
| `commands/sum.md` | Invoke the Amnesia script from the Pi skill path. |
| `agents/opencode/go-reviewer.md` | Delete the OpenCode-only agent. |
| `agents/opencode/python-reviewer.md` | Delete the OpenCode-only agent. |
| `plugins/plan-mode-docs-plans.js` | Delete the OpenCode-only plan plugin. |
| `AGENTS.md` | Remove OpenCode and plugin guidance. Describe the Pi agent layout. |
| `docs/` | No change. The existing documents already cover only Pi features. |

## Risks and edge cases

- A hard-linked edit can change the active Pi Amnesia files before repository validation completes.
- OpenCode session IDs will stop working. This result is intentional.
- Existing memories remain in `~/amnesia/memories.db`. The database format will not change.
- Imported CodeCompanion memories remain readable. The migration script does not depend on OpenCode.
- The active Pi session resolver selects the newest matching JSONL file. The test will preserve this behavior.
- Repository-wide checks include the user's pre-existing Pi agent edits. A failure in those files will be reported separately.

## Validation / testing

Run these checks after the edits:

```bash
python3 skills/amnesia/test_save.py
python3 -m py_compile skills/amnesia/save.py skills/amnesia/test_save.py
git grep -n -i opencode -- . ':(exclude)plans/remove-opencode-support-plan.md'
git diff --check
pre-commit run --all-files
```

The `git grep` command must return no OpenCode references outside this decision record. The Amnesia test must verify Pi session discovery and transcript export without model or database access.

## Step-by-step execution checklist

- [x] Audit tracked and ignored OpenCode artifacts.
- [x] Confirm the repository-wide cleanup scope with the user.
- [x] Remove the OpenCode backend from Amnesia.
- [x] Add the focused Pi backend test.
- [x] Update Amnesia and Simple English instructions.
- [x] Update the sum command and repository instructions.
- [x] Delete OpenCode-only agents, plugin, and ignored package files.
- [x] Run the focused Pi checks.
- [x] Run repository hygiene checks.
- [x] Review the final diff and protect the pre-existing user changes.
- [x] Mark this plan as completed with the completion date.

## Open questions / assumptions

- The approved scope covers all OpenCode artifacts in this repository.
- The cleanup does not remove external files under `~/.config/opencode/`.
- The cleanup does not change the Amnesia database or existing memory records.
- The cleanup does not alter other declared Simple English hosts.
- No new document under `docs/` is necessary because the Amnesia README contains its user instructions.

## Validation results

- `python3 skills/amnesia/test_save.py` passed.
- `python3 -m py_compile skills/amnesia/save.py skills/amnesia/test_save.py` passed.
- The targeted Ruff check for imports, undefined names, and executable flags passed.
- No OpenCode references remain outside this decision record.
- `git diff --check` passed.
- `pre-commit run --all-files` passed.
- The active Pi Amnesia query command returned a stored memory.
