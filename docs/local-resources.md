# Local Pi resources

This repository stores local Pi extension packages, prompt files, and agents. Install extensions from the repository root.

## Install an extension

Run `pi install` with the package directory:

```bash
pi install "$PWD/extensions/<name>"
```

Reload each open Pi session:

```text
/reload
```

The package manifest declares the extension entry point. Pi settings can load the same package by its local path:

```json
"packages": [
  "~/informatique/ai/skills_and_commands/extensions/<name>"
]
```

Use this repository's path in your settings. Paths can start with `~`. Keep existing package entries and their resource filters.

## Message timestamps

The `pi-message-timestamps` extension keeps timestamps for user messages. Assistant timestamps follow visible rendered content, with a blank line above and below each timestamp. Hidden activity has no timestamp. Old orphan assistant timestamp entries stay in session history, but the extension hides them. The extension does not depend on minimalist settings.

After updating the installed local extension, reload each open Pi session:

```text
/reload
```

## Load prompt files

This setup loads prompts and agents from the local paths in `settings.json`. It no longer uses agent or prompt symlinks.

Pi settings accept prompt file and directory paths. To load the two prompt files that this setup currently enables, add these paths to the existing `prompts` list:

```json
"prompts": [
  "~/informatique/ai/skills_and_commands/commands/sum.md",
  "~/informatique/ai/skills_and_commands/commands/get-feedback.md"
]
```

Do not load the full `commands/` directory to get these files. That directory also contains `/m` and `/pr` fallback templates, which conflict with extension commands. Other templates that are not currently enabled would also load.

## Scan for agents

The installed `pi-subagents` extension supports `subagents.agentScanDirs`. Add the repository's agent directory to the existing `subagents` object:

```json
"subagents": {
  "agentScanDirs": [
    "~/informatique/ai/skills_and_commands/agents/pi"
  ]
}
```

Preserve all existing keys in that object. Paths can start with `~` or use an absolute path.

## Run extension tests

Use the host `jiti` loader and aliases for Pi's import-only ESM packages. From the repository root, run:

```bash
host="$(npm root -g)/@earendil-works/pi-coding-agent"
export JITI_ALIAS="{\"@earendil-works/pi-coding-agent\":\"$host/dist/index.js\",\"@earendil-works/pi-tui\":\"$host/node_modules/@earendil-works/pi-tui/dist/index.js\"}"
node "$host/node_modules/jiti/lib/jiti-cli.mjs" extensions/<name>/<name>.test.ts
```

Replace `<name>` with the extension package name. Some packages use a different test command.
