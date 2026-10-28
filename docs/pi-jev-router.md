# Pi Jev router

`extensions/pi-jev-router/pi-jev-router.ts` registers the `jev/auto` virtual model. Jev classifies each new user prompt and selects a Codex model.

| Jev result | Model |
| --- | --- |
| `simple` | `openai-codex/gpt-6-luna` |
| `routine` | `openai-codex/gpt-5.6-sol` |
| `very_complex` | `openai-codex/gpt-6-astra` |

## Routing behavior

The router sends the latest user prompt and recent activity to TypeSafe. It sends up to 16,000 characters from the latest prompt.

For context, the router sends up to 12 recent user, assistant, and tool-result messages. It sends the last 1,000 text characters from each message, with a total limit of 12,000 characters. It excludes system messages, thinking, images, tool arguments, and tool details. It does not redact other text.

The router normally keeps the selected model during tool continuations. It reassesses the work after any of these thresholds:

- Five continuations since the last check.
- Three new flagged tool errors since the last check.
- Ten minutes since the last check.

These thresholds trigger a check, not a forced upgrade. Checks happen before a model request, not during a running tool. New user requests always trigger classification.

The classifier prefers Sol when the required capability is unclear. Ordinary debugging, recurring errors, or user corrections alone do not justify Astra. Astra is for clearly exceptional reasoning needs or persistent failure after meaningfully different approaches. Persistent failure must show that stronger reasoning is needed. Productive long work, external waiting, or missing credentials alone do not justify Astra. Elapsed time is supporting context, not a deadline.

During a continuation, the router changes to Astra only when the classifier selects Astra. Otherwise, it keeps the current model and thinking level, including when classification fails or returns an unusable result. Astra stays selected for the rest of the run. A new user request triggers classification again for any tier.

API retries keep the failed model. They do not trigger escalation checks.

For direct requests, the router reuses the previous model. If no previous model exists, it uses Sol. The router preserves Pi's selected thinking level.

The classifier uses a five-second provider timeout and no provider retries. For new user requests, Jev failures or unusable results make the router use Sol. Missing Jev access also makes it use Sol. During a continuation, these classifier failures keep the current model and thinking level. If the selected model is unavailable or lacks authentication, the router uses Sol. If Sol is unavailable or lacks authentication, the router reports an error.

The router preserves caller cancellation. It does not change a canceled request into a Sol request.

## Usage tracking

After a classifier call, the router records returned usage in the Pi session. The record has the `classifier` kind and returned provider and model values.

The router writes this record before it checks cancellation or selects a route. If the provider returns no usage, the router records no token counts.

Pi's public extension type does not expose `appendUsage()`. The router uses a narrow type assertion to call the existing runtime method. This compatibility boundary can break after a Pi update.

If Pi does not expose `appendUsage()` at runtime, the router shows a warning and continues routing. If Pi cannot persist usage, the error stops routing.

Jev models have a zero price in the installed catalog. Token reports are not exact Jev billing records.

## Limits and privacy

Jev can select an incorrect complexity level. Bounded recent activity can omit earlier task context. A model switch loses prompt-cache benefits and can trigger normal Pi compaction.

The router sends bounded user, assistant, and tool-result text to TypeSafe. This text can contain private data from tool output. If TypeSafe must not receive this text, do not use this router.

## Install

From this repository root, install the local package:

```bash
pi install "$PWD/extensions/pi-jev-router"
```

In `$HOME/.pi/agent/settings.json`, load the package path and keep these defaults:

```json
"packages": [
  "~/informatique/ai/skills_and_commands/extensions/pi-jev-router"
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

Run the adjacent test with the host `jiti` setup in [Local Pi resources](local-resources.md):

```bash
node "$host/node_modules/jiti/lib/jiti-cli.mjs" extensions/pi-jev-router/pi-jev-router.test.ts
```

Run the repository checks:

```bash
git diff --check
pre-commit run --all-files
```
