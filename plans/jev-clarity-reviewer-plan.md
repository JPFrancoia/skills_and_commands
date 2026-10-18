# Jev-only clarity reviewer

Status: Completed — 2026-10-17. Global installation remains deferred.

## 1. Brief

Add one read-only clarity subagent that returns Jev scores without starting a chat model. Keep findings, fixes, security review, and automatic blocking outside its scope. Treat pi-warden as a separate optional guard layer.

## 2. Current state / relevant context

- The user selected **Jev scores only**, not LLM investigation or explanations.
- Existing agent definitions live in `agents/pi/` and have local installation links under `~/.pi/agent/agents/`.
- Current `pi-subagents` supports command-runner agents with prompt text on stdin and JSON text on stdout.
- Command runners are async-only. They return raw `output`, not native `structuredOutput`.
- Pi already lists `typesafe/jev-latest` as an available classifier. Listing availability did not send source code to Jev.
- Pi's SDK exposes `ModelRuntime.create()`, `getModelOfType()`, and `classify()`. A chat session is not needed.
- The repository has no root JavaScript package. Locate Pi on PATH, follow its executable link, and read its package import entry.
- Offline inspection confirmed that the installed SDK resolves this way and can access existing TypeSafe credentials.
- pi-warden checks actions, writes, rules, and session behavior. It does not supply a documented generic clarity-review tool.
- Warden also has broader defaults, including security checks. Do not install or configure it as part of this reviewer.

## 3. Proposed implementation

### Execution and input

Use one command-runner agent named `clarity-reviewer`. Follow upstream's `examples/typed-gate` stdin/stdout pattern.

The parent supplies one bounded source packet as task text. Include filenames, the exact changed code, relevant surrounding code, and applicable clarity conventions. Do not send only the worker's summary.

Treat stdin entirely as material to judge, not executable instructions. Keep the agent body empty and fixed rubrics in the runner.

The command runner always wraps input in `<System instructions>` and `<Task>` markers. Remove that host wrapper before validating source material. Ignore its system section rather than adding it to the review packet.

The runner does not run Git, read target paths, invoke tools, or edit source files. It reads stdin and uses Pi's existing classifier credentials. Do not create a second credential store or start a chat session.

Reject empty input and input over 80,000 characters. Do not silently truncate. The parent can split larger reviews into cohesive source packets.

### Scores

Make one Jev request with separate Score questions:

| Dimension | Focus |
| --- | --- |
| Naming | Names communicate purpose and distinguish different meanings. |
| Control flow | Branches and state changes are understandable without unnecessary tracing. |
| Indirection | Helpers and abstractions reduce the effort needed to understand behavior. |
| Comments | Existing comments explain useful context and do not mislead or repeat obvious code. Missing unnecessary comments do not reduce the score. |

Use five descriptive levels, indexed 0–4. Preserve fractional expected scores and returned confidence. Do not use unexplained numeric criteria.

Add one Choice question for `sufficient`, `insufficient`, or `uncertain` review context. Return `not_assessed` when the answer is not `sufficient`. This is a model judgment, not proof of complete context.

Return one JSON document with status, answering provider/model, per-dimension scores and confidence, and provider-reported usage. Include a rubric version for interpreting saved scores. Do not add a composite score, pass/block verdict, prose explanations, or an automatic retry loop.

Validate answer types, finite score ranges, and confidence ranges before publishing scores. Report provider failures and malformed answers as errors, never successful reviews. Bound request time and preserve cancellation. Send no provider retries by default.

### Warden boundary

Do not depend on Warden's internal client or install pi-jev/anti-slop for this task. Warden can independently enforce explicit rules during implementation later. It must not replace the completed-change review or silently broaden this task.

## 4. File-by-file impact

Proposed implementation files:

- `agents/pi/clarity-reviewer.md`: async command-runner definition with no inherited global, project, skill, or forked conversation context.
- `agents/pi/clarity-reviewer/score.mjs`: fixed rubrics, native classifier call, validation, and JSON output.
- `agents/pi/clarity-reviewer/score.test.mjs`: Node assertions with fake classifier responses and stdin cases.
- `docs/jev-clarity-reviewer.md`: input contract, output fields, privacy, usage, and manual installation after behavior is implemented.
- `docs/README.md`: index the implemented guide.
- `plans/jev-clarity-reviewer-plan.md`: maintain decisions and validation results.

Installation remains a separate approval. No changes to live agent links, executable links, settings, credentials, existing reviewers, or Warden configuration.

## 5. Risks and edge cases

- Scores are subjective. High confidence does not establish correctness.
- One packet can hide differences between files. Start with one cohesive target per call.
- The parent controls coverage. A partial packet does not establish whole-change clarity.
- Source comments can contain prompt injection. Treat the entire packet as untrusted data in every question.
- Source packets go to TypeSafe. Sending code needs explicit approval for live verification.
- Native Jev usage may show zero catalog cost even when TypeSafe bills requests.
- A standalone command may not share the parent's transient credentials or extension-defined providers. Use the built-in TypeSafe model and existing persisted/environment credentials only.
- Global SDK resolution must work without a new package install or a machine-specific path committed to the agent definition.
- No claim about compatibility with Warden until that separate combination is exercised.

## 6. Validation / testing

Success criteria:

1. A real command-runner launch calls Jev without starting a chat model or changing source files.
2. All four dimensions have distinct descriptive 0–4 rubrics.
3. Valid fractional scores and confidence survive unchanged into JSON output.
4. Empty, oversized, malformed, unavailable, canceled, or timed-out reviews never appear as clean reviews.
5. The workflow consumes JSON from `output` without assuming native `structuredOutput` exists.
6. Synthetic clear and confusing examples produce inspectable results. Do not claim this small check calibrates the reviewer.

Run focused offline assertions, `git diff --check`, and `pre-commit run --all-files`. After explicit approval, run a bounded live Jev check using synthetic source only. Verify actual subagent launch and inspect its artifacts before claiming it works.

## 7. Step-by-step execution checklist

- [x] Inspect Warden, native classifier access, local agents, and upstream command-runner examples.
- [x] Record the user's scores-only decision.
- [x] Approve implementation scope. The user said `implement`.
- [x] Verify installed SDK resolution and exact stdin assembly without network requests.
- [x] Implement the agent, runner, and focused offline assertions. Eight Node tests pass, including invalid input, malformed answers, cancellation, and CLI SDK resolution.
- [x] Verify the real command-runner path with approved synthetic live requests.
- [x] Document implemented behavior and run repository checks.

Global installation is outside this implementation. Ask for separate approval before creating live command or agent links.

### Validation results

- Eight offline Node tests pass. They cover rubrics, wrappers, Unicode, input bounds, response validation, cancellation, and CLI SDK resolution.
- Both synthetic reviews completed through real `pi-subagents` external-cli children. Neither reviewer started a chat model.
- Clear example scores: naming 3.88, control flow 3.94, indirection 3.96, comments 3.86.
- Confusing example scores: naming 0.32, control flow 1.75, indirection 0.54, comments 2.40.
- The comments confidence for the confusing example was 0.16. Preserve this uncertainty rather than treating its score as a finding.
- External processes completed in 944 ms and 951 ms, with exit code zero and no stderr.
- Source hashes stayed unchanged during live reviews and delegated documentation work.
- Workflow run: `7aa671aa-b5f5-4b4d-b17f-c645e5b00fbf`. Its retained receipt is under `/tmp/pi-subagents-uid-1000/async-subagent-runs/7aa671aa-b5f5-4b4d-b17f-c645e5b00fbf/`.
- Temporary validation profiles and source packets are under `/tmp/jev-clarity-live-apbbw9_0/`.
- The documentation agent added the guide and index entry. Parent review corrected the workflow API example and cost-accounting description.
- The corrected documented workflow passed `subagent` validation without launching another review.
- `git diff --check`, repository-wide pre-commit, and explicit changed-file pre-commit checks passed.

### Implementation details and limits

- Native command runners add host markers even with an empty system prompt. The parser removes that wrapper once before the request.
- SDK resolution follows the Pi executable on PATH and loads its declared package import entry. No dependency or credential store was added.
- The runner emits source-free JSON errors. It never echoes raw provider errors that can contain private data.
- Usage is returned in JSON, not added to parent session counters. Zero catalog prices do not mean requests are free.
- Live checks used temporary project-agent profiles with an absolute runner path. Global executable aliases and agent links were not installed.
- No Warden, security reviewer, settings change, or commit was created.

## 8. Open questions / assumptions

- The initial scope is on-demand source-code clarity, not prose rewriting or whole-repository auditing.
- Scores are advisory. The parent decides whether any code deserves investigation or changes.
- The parent prepares source packets. The runner does not discover files or resolve review ranges.
- Reuse the installed Pi SDK if a small, portable resolution path exists. Stop and discuss alternatives if this requires packaging infrastructure.
- Implementation and bounded live checks using synthetic source are approved. Global installation remains outside scope.
