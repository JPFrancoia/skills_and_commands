# Repository Guidelines

## Purpose

This repository stores reusable Pi configuration: agent definitions, prompt commands, extensions, implementation plans, and skills. Keep changes portable and narrowly scoped. Do not modify a user's live `~/.pi` setup unless the task explicitly asks for installation.

## Layout

- `agents/pi/`: Pi agent definitions.
- `commands/`: reusable Markdown prompt commands.
- `extensions/<name>/`: one local Pi package per extension, with an explicit entry point and adjacent `*.test.ts` files.
- `skills/`: self-contained skills. Each skill's entry point is `SKILL.md`; scripts and references stay inside that skill directory.
- `plans/`: implementation plans and completed decision records. Never delete completed plans.

## Editing Rules

- Read the full file being changed and inspect the nearest similar file first.
- Prefer the smallest change that follows an existing pattern. Do not add dependencies, shared abstractions, or scaffolding for a single use.
- Preserve Markdown front matter and host-specific field names exactly.
- Resolve paths mentioned by a skill relative to that skill's directory.
- Keep tests next to TypeScript extensions and use Node's built-in `assert` unless the existing code requires otherwise.
- Do not edit bundled schemas, licenses, lockfiles, or generated files unless the requested change requires it.
- Never include credentials, tokens, local databases, session logs, or machine-specific secrets.

## Validation

Run only the checks relevant to the changed files, plus the repository-wide hygiene checks:

```bash
git diff --check
pre-commit run --all-files
```

For Pi extension changes, run the adjacent `extensions/<name>/<name>.test.ts` file with Pi's installed jiti loader. Use host package aliases for Pi's import-only ESM packages. See `docs/local-resources.md` for the command. Some packages keep their own test commands.

For Python changes, use the skill's existing `uv` project or script-level test command rather than creating a repository-wide environment.

## Change Notes

In the final response, list changed files and checks run. Call out any validation that could not be performed. Do not claim installation or runtime activation unless it was explicitly performed and verified.
