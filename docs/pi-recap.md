# Pi recap

`extensions/pi-recap.ts` replaces `pi-tldr` with a local three-line recap above the editor.

```text
Now: <current work or state>
Why: <purpose or motivation>
Last: <latest completed agent work and result>
```

The extension shows a prompt-based recap as soon as the user presses Enter. It requests generated updates after the prompt and each `turn_end` milestone.

A milestone covers one completed model response and its tool results. The extension does not request a summary for every low-level tool event.

The extension stores only the final accepted recap as a custom session entry. It restores that recap after reload or tree navigation.

For an old session, the extension creates one bootstrap recap from bounded context. Later requests use the previous recap and new branch activity.

## Model configuration

The default model is `openai-codex/gpt-5.6-luna`. Codex with a ChatGPT account no longer supports `gpt-5.4-mini` for these requests.

Create `~/.pi/agent/extensions/pi-recap.json` to select another model:

```json
{
  "model": "openai-codex/gpt-5.6-luna"
}
```

Use the `provider/model-id` format. An absent or invalid configuration uses Luna.

Run `/reload` after a model change. Pi recap warns when the selected model is unavailable or unauthenticated.

## Limits

Each field has a 100-character limit. Each request contains at most 12,000 characters of conversation activity.

The extension disables cache retention and retries. It uses minimal reasoning and a ten-second timeout.

The extension keeps the previous recap if the model fails or returns invalid JSON. It discards responses from an older turn or session.

Before the first model result, the extension uses recent conversation text instead of generic placeholder values.

## Privacy

The extension sends bounded conversation text to the Codex provider after the prompt and each milestone. This text can include user messages, assistant text, and tool results.

The extension does not redact secrets. Do not use it with conversation text that the summary provider must not receive.

## Install

If `pi list` contains `pi-tldr`, remove its exact source:

```bash
pi list
pi remove '<pi-tldr source from pi list>'
```

From this repository root, add the local extension symlink:

```bash
ln -s "$PWD/extensions/pi-recap.ts" \
  "$HOME/.pi/agent/extensions/pi-recap.ts"
```

Reload each open Pi session:

```text
/reload
```

The old `tldr` settings section can remain in `~/.pi/agent/settings.json`. The local extension does not read it.

## Validate

Run the focused test:

```bash
~/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/.bin/jiti \
  extensions/pi-recap.test.ts
```

Run the repository checks:

```bash
git diff --check
pre-commit run --all-files
```
