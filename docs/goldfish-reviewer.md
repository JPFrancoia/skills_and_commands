# Goldfish reviewer

Goldfish reviews a saved document. It starts without the earlier conversation. It does not edit files or decide whether a proposal is accepted.

## Review agents

The coordinator launches four reviewers in one parallel run:

- `goldfish-comprehension` explains the target and finds missing assumptions. It reads only the target and review scope.
- `goldfish-design-critic` reviews design claims, alternatives, risks, and conflicts with accepted decisions.
- `goldfish-zoom-out` reviews the root problem, scope, simplicity, and reuse of existing code.
- `goldfish-implementation-readiness` reviews implementation steps and validation gaps. For an architecture decision record (ADR) without an implementation plan, it reports `not applicable`.

The coordinator combines results into one report. It keeps each reviewer status, the comprehension summary, evidence, and limits. It marks the report incomplete when input, a read, or a reviewer is incomplete. It runs one round. It does not repair files, retry reviewers, or start replacements.

## Inputs and evidence

Give the coordinator a target document, working directory, and review scope. You can also supply a reading list, review rules, and source roots. A source root is a directory that the reviewers can search for evidence.

The coordinator reads the target and follows local links. It uses only supplied context files and source roots, or files linked from the target. It reports missing or inaccessible files. It lists external URLs as unavailable unless you supply local copies.

The comprehension reviewer receives only the target path and review scope. It does not read the separate reading list or source code. The other reviewers receive the target, document type, selected paths, source roots, and applicable review rules. Accepted ADRs constrain a proposal unless it explicitly proposes to replace them.

## Context and models

The coordinator uses its configured default model. The four reviewers use `openai-codex/gpt-6.2-sol` with medium thinking.

The coordinator requests fresh context for each child and limits agent selection to the four named reviewers. Fresh context means that a reviewer starts without earlier conversation history. This explicit option overrides a global fork preference. Do not use `--fork` when you invoke the coordinator.

The agent definitions also set `defaultContext: fresh`. That value alone can be overridden by caller settings, so the coordinator passes the fresh-context option explicitly.

## Tool and delegation limits

The four reviewers can use only `read`, `grep`, `find`, and `ls`. The coordinator has those tools and `subagent`. All five definitions exclude the runtime's `contact_supervisor` tool. Their tool lists exclude `bash`, `edit`, `write`, and `codemode`. Ambient extensions are disabled. Only the coordinator can delegate. It can delegate only to the four named user agents, with a maximum depth of two levels.

These are tool and context controls, not a filesystem sandbox. They do not prove that a design is correct. Runtime artifact storage still writes normal artifacts.

## Load and reload

Add the repository agent directory to `subagents.agentScanDirs` in the existing Pi settings. Preserve the other keys:

```json
"subagents": {
  "agentScanDirs": [
    "~/informatique/ai/skills_and_commands/agents/pi"
  ]
}
```

Reload the Pi session after you add or change agent files or settings:

```text
/reload
```

See [Local Pi resources](local-resources.md#scan-for-agents) for the scan setup.

## Invoke the coordinator

Ask Pi in natural language, for example:

```text
Use Goldfish to review docs/design.md. Working directory: /path/to/repo. Scope: assess the proposal and its implementation plan. Reading list: docs/ADR-001.md. Source roots: src/.
```

The coordinator does not add a command or extension. With the default fresh-context setting, use the existing command:

```text
/run goldfish Review docs/design.md. Scope: assess the proposal. --bg
```

If your global setting selects forked context, use an explicit fresh-context call instead:


```js
subagent({
  agent: 'goldfish',
  cwd: '/path/to/repo',
  task: 'Review docs/design.md. Scope: assess the proposal.',
  async: true,
  options: { context: 'fresh', agentScope: 'user' }
})
```

## Verification and limits

Native checks covered an implementation plan, an ADR without implementation steps, and a missing target. Both coordinator runs launched all four reviewers with overlapping execution times. The combined reports kept the comprehension explanations unchanged.

The checks confirmed unchanged input files and read-only tool calls. Child transcripts excluded parent-only and project-instruction markers. A marker is a unique test string used to detect inherited context.

These checks used synthetic documents. They do not prove isolation for every host setting, extension, or future runtime version. Tool controls do not restrict which accessible files a reviewer can read.

The agents follow the [EGM reviewer prompts](https://github.com/google/elephant-goldfish-model/tree/72d06f52a2482885d9a64bd24b291c6e8628942c/agents). They retain this workflow's separate ADR and implementation-plan roles.

A report can identify serious gaps, but it cannot prove design correctness or safe implementation. Reviewers report advice only. The caller remains responsible for acceptance and edits.
