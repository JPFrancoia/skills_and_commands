# Clarity reviewer

The clarity reviewer finds code changes that make software easier to read and maintain. It reports only concrete simplifications that preserve required behavior. It does not edit files or assign scores.

## Review behavior

The reviewer uses `openai-codex/gpt-6.1-sol` with medium thinking. Each review starts with fresh context and uses only the `read` and `bash` tools.

Give it one review target:

- Staged changes.
- A branch diff with an explicit base.
- A commit hash.
- One or more files.

The reviewer reads related code and project documentation when needed. It reports numbered findings with source locations, the maintenance cost, a smaller alternative, and the behavior that must stay. It reports missing evidence instead of claiming that a change is safe. A clean review can report `No worthwhile simplification found.`

The reviewer supplements correctness and security reviews. A clean clarity review does not prove correctness or safety. Its bash read-only boundary is instruction-based, not an OS sandbox.

## Invoke the reviewer

Ask Pi in natural language, for example:

```text
Use the clarity reviewer to review the staged changes in this repository.
```

You can also call the agent through `subagent`:

```js
subagent({agent:'clarity-reviewer', cwd:'...', task:'Review the staged changes.'})
```

To make the agent available to Pi, use the [agent scan instructions](local-resources.md#scan-for-agents).
