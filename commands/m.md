---
description: Commit staged changes contextually in the background
argument-hint: "[repo-path]"
---

## Your Task

Launch a background contextual commit for `${1:-.}` and return control as soon as the async subagent starts. Do not compose or perform the commit in the parent conversation.

This prompt is the fallback when the `pi-background-commit` extension is not loaded. The extension normally owns `/m` directly.

### 1. Snapshot the Target Repository

Resolve `${1:-.}` relative to the conversation's current working directory, then find its Git root. Stop if it is not a repository or has no staged changes.

Capture the immutable invocation scope:

```bash
git -C "${1:-.}" rev-parse --show-toplevel
git -C "${1:-.}" diff --cached --quiet --exit-code
git -C "${1:-.}" write-tree
git -C "${1:-.}" rev-parse --verify HEAD  # use UNBORN if HEAD does not exist
```

### 2. Launch the Commit Agent

Use the `subagent` tool to launch `contextual-committer` with:

- `cwd`: the resolved Git root;
- `context`: `fork`;
- `async`: `true`;
- task text containing the expected HEAD and staged tree captured above.

The task should be:

```text
Commit the staged snapshot in the current repository now.
Expected HEAD: <HEAD-or-UNBORN>
Expected staged tree: <tree-id>
Treat these values as immutable invocation guards and follow your contextual commit instructions.
```

Do not wait for completion. Report only that the background run started; Pi will deliver its completion notification.

### Important

- Do not ask for confirmation.
- Do not run `git add`, edit files, or modify the staging area.
- Do not launch the agent when no changes are staged.
