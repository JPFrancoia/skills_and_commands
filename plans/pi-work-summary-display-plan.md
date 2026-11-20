# Plan: Short tool summaries

## Brief

Correct the noisy display shown in `screen-2026-11-19-23-19-07.png`. Leave thinking steps unchanged. Summarize each tool group with its actual action and result, not a description of the files it reads.

## Current state / relevant context

- The extension counts thinking as tool activity and requests summaries for thinking-only work.
- The prompt requires a broad result report, even when the group only locates or reads files.
- The summary shares the green bar and color of its tool row.
- The live settings load this local package and select `openai-codex/gpt-6-luna`.
- `docs/CONTEXT.md` does not exist. Preserve the unrelated router edit.

## Proposed implementation

Keep native thinking rows and their controls. Exclude thinking from summary requests and saved group membership. Restore older mixed groups on their tool rows only.

Remove the compact-row bar. Show the short summary on a separate, muted line with a blank line above it. Keep counts, duration, and expansion controls.

Ask for one short action sentence. Add a second sentence only for a concrete result, failure, needed help, or a stated next action. Use at most 25 words and 220 characters. Explain file searches as searches and reading as reading. Do not describe file contents as completed work. Do not add generic uncertainty warnings.

Keep current tense for running work and past tense for finished actions. Keep the model setting, saved history, and request cancellation unchanged.

## File-by-file impact

- `extensions/pi-work-summary/src/config.ts`: native thinking, no compact-row bar, shorter output limit.
- `extensions/pi-work-summary/src/work-groups.ts`: tool-only membership, specific prompt, bounded output, older saved groups.
- `extensions/pi-work-summary/src/row.ts` and `src/components.ts`: separate muted summary line.
- `extensions/pi-work-summary/pi-work-summary.test.ts`: regression checks for thinking, wording, display, and replay.
- `docs/pi-work-summary.md`: actual display behavior and examples.

## Risks and edge cases

- Native thinking can split visible tool runs. Show each work summary once, on its last tool row.
- Older saved groups can contain only thinking. Do not restore summaries for those groups.
- A model can repeat source text instead of reporting the action. Check examples through the configured model when available.
- Narrow terminals must wrap the summary without a bar or clipped words.
- Historical summaries are not regenerated automatically. Keep saved content without new model calls.

## Validation / testing

- Reproduce a thinking-only summary before the change. Check that no summary request occurs after the change.
- Check mixed thinking and tool messages. Preserve native thinking and count tools only.
- Check the separate summary line, narrow widths, expansion, and saved history.
- Check search, document-reading, failed-test, and interrupted-work examples.
- Run focused tests, strict TypeScript, `git diff --check`, and `pre-commit run --all-files`.
- Use an isolated Pi terminal for the display check. Do not change live settings.

## Step-by-step execution checklist

- [x] Inspect the screenshot, prompt, and display code.
- [x] Correct tool-only summary tracking and short action-led output.
- [x] Separate the summary from the tool row and preserve native thinking.
- [x] Run focused regression tests and isolated terminal checks.
- [x] Update the guide.
- [x] Run strict TypeScript and repository checks. The focused tests, `git diff --check`, and `pre-commit run --all-files` passed.

## Results (2026-11-19)

The implementation now leaves native thinking unchanged and counts tools only. Thinking-only work does not request or save summaries. Summaries appear as muted lines after a blank line, without a bar. New summaries use at most 25 words and 220 characters. They state the action and can add a concrete result, problem, needed help, or stated next action. Search and reading summaries describe those actions. They do not describe file contents as completed work.

Legacy mixed summaries attach only to tools. Legacy thinking-only summaries remain hidden. Saved long summaries remain unchanged. Focused tests passed for these cases, native thinking display and streaming, and summary wrapping. Four configured-model cases passed after prompt refinement. An isolated Pi terminal check passed at 110 and 45 columns with synthetic tool groups. Strict TypeScript and repository checks passed. The secret check also covered the new files.

Completed on 2026-11-19.

See [the work summary guide](../docs/pi-work-summary.md) for current behavior.

## Open questions / assumptions

- Use a separate muted line without the vertical bar as the smallest display change.
- A finished group does not mean that the whole task succeeded.
- Do not change the configured model or remove existing saved entries.
