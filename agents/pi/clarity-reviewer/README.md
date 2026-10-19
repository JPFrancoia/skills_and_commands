# Clarity reviewer

`clarity-reviewer` uses TypeSafe Jev to score source-code clarity. It returns JSON scores, not findings or fixes.

## Setup

The [agent definition](../clarity-reviewer.md) runs the external command `pi-clarity-score`.
Installing the agent definition alone does not install this command.

The command requires:

- A link to [`score.mjs`](score.mjs) named `pi-clarity-score` on `PATH`.
- A Node-based Pi installation with its SDK and `typesafe/jev-latest` classifier.
- TypeSafe credentials configured in Pi.

Follow the [installation guide](../../../docs/jev-clarity-reviewer.md#install) to create both links safely.
Reload Pi with `/reload` after installation.
If you move the repository, update the command link.

## Use

Supply actual source code and surrounding context, not only a path or summary.
The reviewer runs asynchronously through pi-subagents.

**Privacy:** The reviewer sends supplied source to TypeSafe. It does not remove secrets.

Read the [full guide](../../../docs/jev-clarity-reviewer.md) for input limits, JSON fields, workflow examples, and offline tests.

## Command startup check

Run:

```bash
command -v pi-clarity-score
printf '' | pi-clarity-score
```

The empty input must return JSON with `status: "error"` and exit code 1.
This check makes no classifier request. It does not check credentials or live scoring.

If the command is missing, inspect the command link and `PATH` in the shell that starts Pi.
