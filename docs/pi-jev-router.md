# Pi Jev router

`extensions/pi-jev-router.ts` registers the `jev/auto` virtual model. Jev classifies each new user prompt and selects a Codex model.

| Jev result | Model |
| --- | --- |
| `simple` | `openai-codex/gpt-6-luna` |
| `routine` | `openai-codex/gpt-6.1-sol` |
| `very_complex` | `openai-codex/gpt-6-astra` |

## Routing behavior

The router sends only the latest user prompt to TypeSafe. It sends the first 16,000 characters of text blocks from that prompt.

The router keeps the selected model during tool continuations. It keeps the failed model during a retry. It does not select Luna after a successful edit.

For direct requests, the router reuses the previous model. If no previous model exists, it uses Sol. The router preserves Pi's selected thinking level.

The classifier uses a five-second provider timeout and no provider retries. If Jev is unavailable, returns an unusable result, or returns an error, the router uses Sol. If the selected model is unavailable or lacks authentication, the router uses Sol. If Sol is unavailable or lacks authentication, the router reports an error.

The router preserves caller cancellation. It does not change a canceled request into a Sol request.

## Usage tracking

After a classifier call, the router records returned usage in the Pi session. The record has the `classifier` kind and returned provider and model values.

The router writes this record before it checks cancellation or selects a route. If the provider returns no usage, the router records no token counts.

Pi's public extension type does not expose `appendUsage()`. The router uses a narrow type assertion to call the existing runtime method. This compatibility boundary can break after a Pi update.

If Pi does not expose `appendUsage()` at runtime, the router shows a warning and continues routing. If Pi cannot persist usage, the error stops routing.

Jev models have a zero price in the installed catalog. Token reports are not exact Jev billing records.

## Limits and privacy

Jev can select an incorrect complexity level. A short follow-up prompt does not include earlier task context.

The router sends the bounded prompt text to TypeSafe. Do not use this router if TypeSafe must not receive that prompt text.

## Install

From this repository root, create the local extension symlink:

```bash
ln -s "$PWD/extensions/pi-jev-router.ts" \
  "$HOME/.pi/agent/extensions/pi-jev-router.ts"
```

In `$HOME/.pi/agent/settings.json`, load the local path instead of the official Jev example. Keep these defaults:

```json
"extensions": [
  "~/.pi/agent/extensions/pi-jev-router.ts"
],
"defaultProvider": "jev",
"defaultModel": "auto",
"defaultThinkingLevel": "high"
```

After you install or update the extension, reload each open Pi session:

```text
/reload
```

New Pi sessions use the configured default. Existing sessions keep their selected model after `/reload`.

If an existing session does not select `jev/auto`, select it explicitly:

```text
/model jev/auto
```

## Validate

Run the focused assertions:

```bash
$HOME/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/.bin/jiti \
  extensions/pi-jev-router.test.ts
```

Run the repository checks:

```bash
git diff --check
pre-commit run --all-files
```
