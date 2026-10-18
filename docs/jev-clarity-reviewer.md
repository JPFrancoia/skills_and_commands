# Jev clarity reviewer

The Jev clarity reviewer scores supplied source code. It does not report findings or suggest fixes.

The reviewer uses the `typesafe/jev-latest` classifier. It does not run a chat model. It uses the credentials from the installed Pi SDK.

## Input and result

Send a source packet on standard input. The packet must contain source code and useful surrounding context. Do not send a file path or a summary instead of code.

The packet can contain at most 80,000 characters. Split a larger review into complete parts. Do not truncate source code.

The pi-subagents host can add a system wrapper to its input. The command removes that wrapper before it sends the source packet to Jev.

Jev receives the source packet at TypeSafe. The runner does not redact secrets from that packet.

Before review, remove credentials and source that TypeSafe must not receive.

The command writes one JSON object to standard output. A successful assessment has `status: "scored"`. It includes these independent dimensions:

- `naming`
- `control_flow`
- `indirection`
- `comments`

Each dimension has a fractional `score` from 0 through 4. Each dimension also has a `confidence` from 0 through 1.

The result includes `context.choice` and its confidence. If Jev selects `insufficient` or `uncertain`, the result has `status: "not_assessed"` and `scores: null`.

The result also includes `rubric_version`, the answering provider and model, and provider-reported `usage`.

The SDK uses catalog prices for reported cost. Jev entries can have zero catalog prices even when TypeSafe bills requests. Usage values are not billing proofs.

The standalone runner returns usage in JSON. It does not add that usage to the parent Pi session counters.

On an error, the command writes JSON with `status: "error"` and exits with a nonzero status. It does not accept partial scores.

The classifier has a ten-second timeout. It makes no retries. A cancellation stays canceled.

Standard input has a separate 100,000-character limit, including any host wrapper. The source packet still has an 80,000-character limit.

The scores describe perceived clarity. They do not prove correctness, security, formatting quality, or personal-style quality.

## Direct use

Run this command from the repository root without installation:

```bash
printf '%s\n' 'File: math.mjs
export function double(value) { return value * 2; }' | node agents/pi/clarity-reviewer/score.mjs
```

After installation, `pi-clarity-score` runs the same command.

Parse the JSON result. Do not treat a score as a pass or fail result.

## pi-subagents use

After installation, ask Pi to run `clarity-reviewer` with the actual source packet as its task.

For workflow scripts, use this form:

```js
const result = await runs.run("clarity", {
  label: "Score source clarity",
  agent: "clarity-reviewer",
  task: "File: math.mjs\nexport function double(value) { return value * 2; }",
  output: false
});
if (!result.ok) throw new Error("Clarity review failed.");
const report = JSON.parse(result.output);
return report;
```

Launch the script through `subagent({ workflow: "./review.js", async: true })`.

Do not set the child to `async: true` inside this script. That setting returns a launch receipt instead of the completed result.

Do not read `result.structuredOutput`. The reviewer returns raw JSON output. Command-runner agents cannot run in foreground mode.

## Requirements and limits

`pi-clarity-score` finds the `pi` executable through `PATH`. That executable must belong to an installed Node-based Pi package with its SDK.

Standalone Pi is not supported. The installed SDK must provide `typesafe/jev-latest`. Configure TypeSafe credentials in Pi before you run the reviewer.

The reviewer has no Warden integration. This reviewer does not perform a security review.

## Install

Install only if you want to use this local reviewer. Run these commands from the repository root.

First, make sure that `$HOME/.local/bin` is on `PATH` in the shell that starts Pi:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Create the two local directories:

```bash
mkdir -p "$HOME/.local/bin" "$HOME/.pi/agent/agents"
```

Create the command link only if its destination does not exist:

```bash
if [ -e "$HOME/.local/bin/pi-clarity-score" ] || [ -L "$HOME/.local/bin/pi-clarity-score" ]; then
  printf '%s\n' 'Existing pi-clarity-score link or file was not changed.'
else
  ln -s "$PWD/agents/pi/clarity-reviewer/score.mjs" "$HOME/.local/bin/pi-clarity-score"
fi
```

Create the agent link only if its destination does not exist:

```bash
if [ -e "$HOME/.pi/agent/agents/clarity-reviewer.md" ] || [ -L "$HOME/.pi/agent/agents/clarity-reviewer.md" ]; then
  printf '%s\n' 'Existing clarity-reviewer agent link or file was not changed.'
else
  ln -s "$PWD/agents/pi/clarity-reviewer.md" "$HOME/.pi/agent/agents/clarity-reviewer.md"
fi
```

If either destination exists, examine it before you replace it. Do not replace an existing file or link by accident.

Reload each open Pi session after installation:

```text
/reload
```

Start a new Pi session if the agent is not discovered after reload.

## Validate

Run the focused offline test:

```bash
node --test agents/pi/clarity-reviewer/score.test.mjs
```

Run the repository checks:

```bash
git diff --check
pre-commit run --all-files
```
