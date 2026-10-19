# Pi session auto-rename

`extensions/pi-session-auto-rename/` is a local fork of `pi-session-auto-rename` version `0.1.4`. It creates short session titles from the first user message or the full conversation.

## Install

Remove the npm package before you install the local extension. The two extensions register the same commands. From the repository root, run:

```bash
pi remove npm:pi-session-auto-rename
pi install "$PWD/extensions/pi-session-auto-rename"
```

Reload an open Pi session with `/reload`. Start a new Pi session if reload fails.

## Beans identifier rule

If the first message contains a Beans identifier, the extension resolves it from the session directory. It uses the Bean title directly. For example, `let's work on acme_ops-a1b2` can become `Rotate staging credentials`.

If Beans is unavailable or the Bean does not exist, the extension requests an AI title. It replaces the identifier with `work item` before that request.

The extension rejects an identifier-only response. It replaces an identifier inside a generated title. An existing session title that is a Beans identifier is treated as unnamed.

## Commands and configuration

The extension keeps the upstream commands:

```text
/name-ai                 Name the session from the full conversation.
/name-ai-config          Show or change the naming model.
/name-ai-config provider/model
```

Set the naming model in `~/.pi/agent/settings.json`:

```json
"autoRename": {
  "model": "anthropic/claude-haiku-4-5"
}
```

Use the `provider/model-id` format. An absent or invalid value uses the default model, `anthropic/claude-haiku-4-5`. The extension reads the value at each session start.

`/name-ai-config` changes the model for the current session only. It does not write `settings.json`. The extension does not read `~/.pi/agent/extensions/pi-session-auto-rename.json`.

Configure authentication for the selected model or automatic naming will not run.

The naming request uses minimal reasoning and a 512-token output cap. If a model does not support minimal reasoning, Pi uses the nearest level that it supports. For example, Claude Haiku 5.5 uses low effort.

## Validation

Run the adjacent test with the host `jiti` setup in [Local Pi resources](local-resources.md):

```bash
node "$host/node_modules/jiti/lib/jiti-cli.mjs" extensions/pi-session-auto-rename/index.test.ts
```

The fork uses the upstream MIT license. See `extensions/pi-session-auto-rename/LICENSE`.
