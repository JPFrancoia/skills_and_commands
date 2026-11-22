# Pi autonomous work

The `pi-autonomous` extension continues authorized work after a model stops early. It selects work that needs no human answer or approval. It does not grant permissions.

## Commands

| Command | Action |
|---|---|
| `/autonomous on` | Continue authorized work in the current session. |
| `/autonomous <bean-id>` | Work on the exact Bean and its descendants. A Bean is a task record managed by Beans. |
| `/autonomous <prompt>` | Work on the task in the prompt. |
| `/autonomous off` | Disable automatic continuation without forcibly interrupting current work. |
| `/autonomous status` | Show the mode, scope, deadline, and deferred work. |

The default time limit is eight hours. Add `--for 2h` or `--for 30m` at the end of a start command to set a different limit. No token limit applies.

An ID-shaped target must resolve to the exact Bean ID. If it does not resolve, the command fails. Other text becomes a task prompt.

## How it works

The extension continues after a model gives a final answer without doing the work. It adds a request-only reminder with the goal and deadline. Compaction keeps the goal in extension state.

Session mode stays active while idle. It resumes after later input or worker results. A worker is a delegated task that runs in the background. Task and Bean modes stop when no runnable work remains.

For Bean scope, the extension loads the exact Bean and its descendants. It checks blockers and includes unblocked tasks with status `todo` or `in-progress`. It does not select completed, scrapped, draft, or blocked work. It refreshes the work list before selection.

Use `autonomous_work` to inspect the scope, record a task that needs human input, report that no runnable work remains, or report active workers. A deferred task stays visible in status. Deferral does not grant permission.

For a worker wait in Bean scope, `workerBeanIds` must list every ready Bean assigned to an active worker. Each listed Bean must already have status `in-progress`. The model cannot report a wait while other ready Beans lack worker assignments.

The extension defers `ask_user_question` instead of displaying its dialog. It does not answer the question or approve the action. If another extension opens a human-input dialog, autonomous mode stops.

## Limits and safety

- Existing permissions remain unchanged. The extension is not a permission system.
- The extension does not prove that a model completed work correctly.
- Three idle boundaries without tool activity stop a response-only loop.
- A manual abort disables the mode.
- Reload, restart, a new session, or a session tree change disables the mode. A session tree change selects another branch of the session.
- At the deadline, the extension blocks new tool starts and stops at a turn boundary.
- It does not kill active operations, detached workers, or external processes.

## Install

From the repository root, install the package:

```bash
pi install "$PWD/extensions/pi-autonomous"
```

To load the extension in an open Pi session, run `/reload` in that session. You can also restart Pi. New package installs do not reload open sessions.

## Verification

Run the adjacent test with the host `jiti` loader and Pi package aliases:

```bash
host="$(npm root -g)/@earendil-works/pi-coding-agent"
export JITI_ALIAS="{\"@earendil-works/pi-coding-agent\":\"$host/dist/index.js\",\"typebox\":\"$host/node_modules/typebox/build/index.mjs\"}"
node "$host/node_modules/jiti/lib/jiti-cli.mjs" extensions/pi-autonomous/pi-autonomous.test.ts
```

Run the local Pi RPC smoke tests:

```bash
python extensions/pi-autonomous/smoke-test.py
```

The smoke tests use a deterministic local provider. They do not call an external model or use an account.
