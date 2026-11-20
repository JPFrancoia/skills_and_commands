# Pi work summary

`extensions/pi-work-summary/` replaces `pi-minimalist` with grouped tool rows, elapsed time, and short work summaries.

A tool is an action that Pi can run, such as reading a file or running a command. A work group contains related tool rows across model turns. Collapsed thinking has no label or blank line. Press `Ctrl+T` to show thinking. Tool rows and summaries stay visible. A prose message ends the group.

Each group shows the local start time (HH:MM:SS) beside its tools. A thin rule separates the tools from the summary below them. The footer shows the provider and model, elapsed time, and state. Model changes appear in order with arrows. The state is Running, Done, Tool error, or Interrupted. If Pi has no model data, the footer shows `Model unknown`.

The summary states the action. It can add a concrete result, problem, needed help, or stated next action. New summaries have at most 25 words and 220 characters. A search summary states which files or information the assistant found. A reading summary states what the assistant read and why.

Thinking-only activity does not trigger model requests or saved summaries. Tool summaries count tools only. Older saved groups with both thinking and tools attach their summaries to tools. The extension ignores saved summaries for thinking-only groups. It preserves saved long summaries and does not regenerate them.

An AI model is software that creates text from supplied information. The extension asks the selected model to summarize tool activity. A finished group does not mean that the task succeeded.

Pi saves each finished summary and its elapsed time in the session history. The session history stores a Pi conversation. When Pi reopens it, the extension restores the summary without a model call. Older sessions without saved group data show tool counts but do not get automatic summaries.

## UI prototypes

[Open the three-design comparison page](../prototypes/pi-work-summary/index.html). It compares A Signal (open feed), B Ledger (time-led view), and C Slate (compact panels).

The page supports sample selection, model changes, running and failure states, narrow and light views, and tool expansion. The user chose B Ledger. The extension now uses its time-led display. Open the local file directly in a browser. It uses simulated data and does not change the live extension.

## Model settings

The default model is `openai-codex/gpt-6-luna`. Set `workSummary.model` in `~/.pi/agent/settings.json` to choose a model:

```json
"workSummary": {
  "model": "openai-codex/gpt-6-luna"
}
```

Use the `provider/model-id` format. The extension reads this setting at the next request. An absent or invalid value selects the default model.

Display settings are fixed in the extension code. The extension does not read display settings from JSON and does not provide a settings menu.

## Display controls

Click a grouped row to expand it. Press `Ctrl+O` to expand or fold activity. The expanded view shows the tool rows and their results.

A finished group can look like this:

```text
────────────
14:32:07  ✓ read ×6
I read the guide to understand the extension.
openai-codex/gpt-6-luna · 5s · Done
```

The summary appears below the tool rows. The footer shows the provider and model, duration, and state.

A file search can produce: "I located the files needed to answer the question."

## Privacy and cost

The extension sends selected public conversation text, tool names, selected tool arguments, and tool results to the model provider. The provider runs the selected model. The extension does not send private thinking or images. It limits request size and asks for summaries during running work and when a group finishes. These requests can incur provider costs.

If the model is unavailable, lacks authentication, or returns an error, Pi shows a warning. The extension still saves the elapsed time. A saved summary remains available when the session reloads.

## Install

Remove `npm:pi-minimalist` before you load the local package. Both extensions control the same display. From this repository root, run:

```bash
pi remove npm:pi-minimalist
pi install "$PWD/extensions/pi-work-summary"
```

Restart Pi after installation. Do not run both packages in the same session.

## Validation

The extension tests and strict TypeScript check passed. Isolated offline terminal checks at 110 and 52 columns passed for coexistence and replay. No live router run was performed.

`pi-message-timestamps` remains unchanged. Restart Pi after installation. Legacy saved groups recover model names from branch messages without model requests.
