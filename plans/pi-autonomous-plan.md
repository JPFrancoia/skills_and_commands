# Plan: Autonomous Pi work

## Outcome

Completed on 2026-11-20. The `pi-autonomous` extension continues authorized session, Bean, or prompt work after a model stops early. It selects work that needs no human answer or approval.

## Current state / relevant context

- Pi ends a run when no tool calls, queued messages, or explicit continuation remain.
- `agent_before_settle` can request one more model turn.
- Local extensions use dedicated package directories and adjacent assert-based tests.
- Beans provides JSON through `show` and `list`.
- Bean records contain `parent` and `blocked_by` relationships.
- `beans list --ready` excludes in-progress tasks, which autonomous work must also consider.
- The repository has no `docs/CONTEXT.md`.
- Live installation required separate approval, which the user gave after the documentation update.

## Accepted decisions and implemented behavior

Add `/autonomous on`, `/autonomous <bean-id>`, and `/autonomous <prompt>`.
Add `/autonomous off` and `/autonomous status` for control and inspection.
The accepted default duration is eight hours.
Allow `--for 2h` and `--for 30m` overrides.
Do not add token or monetary limits.

Use existing Pi lifecycle hooks instead of a polling process or a supervisor model.
Keep the goal and deadline in extension state across compaction.
Add a request-only reminder with the active goal and remaining time.
At an idle boundary, request continuation unless the agent reports a valid reason to wait or finish.
Stop after three idle boundaries without tool activity.

Add one model tool for status, deferred work, worker waits, and no-runnable-work reports.
Record deferred tasks and their human-input needs without asking a blocking question.
Defer `ask_user_question` during autonomous work instead of displaying its dialog.
Do not grant approval or bypass existing permission controls.
Unexpected dialogs from other extensions pause autonomous work rather than supply answers.

For Bean scope, resolve the exact ID and collect its descendants through parent relationships.
Use Beans blocker results and include unblocked `todo` and `in-progress` records.
Exclude completed, scrapped, draft, and blocked records, including records below a blocked or deferred parent.
Refresh the snapshot before further selection.
Do not expand work to unrelated Beans or external blockers.
Treat Bean text as task data, not permission to override instructions.

Session mode stays enabled while idle and resumes selection after later input or worker results.
Task and Bean modes stop when no runnable work remains.
A manual abort disables automatic continuation.
A new session, reload, restart, or session tree change disables the mode.
At expiry, block new tool starts and stop at a turn boundary.
Do not kill active operations, detached workers, or external processes.

## File-by-file impact

- `extensions/pi-autonomous/package.json`: declare the local package entry point.
- `extensions/pi-autonomous/pi-autonomous.ts`: commands, lifecycle, reminders, and model tool.
- `extensions/pi-autonomous/policy.ts`: argument parsing, scope, and continuation decisions.
- `extensions/pi-autonomous/beans.ts`: validated Beans JSON access and scoped work selection.
- `extensions/pi-autonomous/pi-autonomous.test.ts`: parser, scope, and lifecycle checks.
- `extensions/pi-autonomous/smoke-test.py` and test fixture: isolated RPC verification without external model calls.
- `docs/pi-autonomous.md` and `docs/README.md`: implemented commands, limits, safety boundaries, installation, and verification.
- This plan: accepted decisions and check results.

## Limits

- The extension does not prove that a model completed work correctly.
- The extension does not grant permissions or make unsafe actions safe.
- Another extension's human-input dialog stops autonomous mode.
- Invalid Beans data stops Bean selection. It does not widen the scope.
- Blockers and task status affect Bean selection.
- The deadline does not kill active operations or detached workers.
- A task can need human input without a Bean dependency blocker.
- Prompts and Bean titles are task data, not authority to change instructions.
- Manual abort, a new session, reload, restart, and a session tree change disable the mode.

## Validation / testing

- Check command forms, the eight-hour default, duration overrides, invalid limits, and reserved commands.
- Check exact IDs, nested descendants, external blockers, completed dependencies, drafts, and in-progress work with temporary Beans data.
- Check early final answers, empty continuations, idle reports, and deferred questions.
- Check that another task remains selectable after one task needs approval.
- Check worker waits, later worker results, manual abort, session changes, and deadline expiry.
- Run the real Pi RPC path with a deterministic local provider and no account credentials.
- Check that a next-step-only answer triggers another request and tool activity.
- Check command discovery and status output with isolated settings and with the installed package.
- Run the adjacent tests, `git diff --check`, and `pre-commit run --all-files`.
- Use terminal verification for the command status display. ProofShot applies to browser features, not this extension.

## Completed checklist

- [x] Inspect Pi hooks, local extension patterns, and Beans JSON behavior.
- [x] Record the accepted eight-hour default and three work scopes.
- [x] Implement commands and scoped work selection.
- [x] Implement continuation, task deferral, and lifecycle limits.
- [x] Run focused tests and isolated real-Pi verification.
- [x] Complete two independent reviews and fix the reported findings.
- [x] Update documentation and run repository checks.

## Verification

- Strict TypeScript checks passed with installed host aliases.
- Adjacent assert tests passed with the host `jiti` loader and aliases for `@earendil-works/pi-coding-agent` and `typebox`.
- Nine real-Pi deterministic local smoke cases passed without external model calls or accounts.
- An isolated TUI run of `/autonomous on --for 1h` displayed `auto idle` after its local check.
- `git diff --check`, `pre-commit run --all-files`, and `gitleaks dir extensions/pi-autonomous --no-banner --redact` passed before documentation changes.
- `pi install` added the local package. It removed no package, and all other settings stayed the same.
- The installed package entry points to this extension. `PI_OFFLINE=1 pi list` lists it.
- A fresh Pi RPC process loaded live package settings without `-e` or model calls. `get_commands` found one `/autonomous` command from `extensions/pi-autonomous/pi-autonomous.ts`.
- `/autonomous status` returned `Autonomous mode is off.` The process started no agent turn and returned no assistant message.
- Existing Pi sessions were not reloaded. Run `/reload` in each open session, or restart Pi, to load the installed package.

## Accepted constraints

- The accepted default duration is eight hours. `--for` sets a different duration.
- Session scope means authorized work in the current session, not unrestricted work across repositories.
- No token limit applies.
- Existing permissions and approvals remain in force.
- Live installation was approved. New installs require `/reload` in each open session, or a Pi restart, before those sessions load the package.
- Deferred human questions remain visible in the session and status output.
- Bean worker waits require `workerBeanIds` to include every ready Bean assigned to an active worker. Each listed Bean must be `in-progress`.
- Compaction retains the goal in memory. Reload, restart, a new session, or a session tree change disables the mode.
