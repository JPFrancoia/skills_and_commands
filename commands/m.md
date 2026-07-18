---
description: Commit staged changes contextually in the background
argument-hint: "[repo-path]"
---

## Your Task

Launch a background contextual commit for `${1:-.}` and return control as soon as the async subagent starts. Do not compose or perform the commit in the parent conversation.

This prompt is the fallback when the `pi-background-commit` extension is not loaded. The extension normally owns `/m` directly.

### 1. Resolve the Target Repository

Resolve `${1:-.}` relative to the conversation's current working directory, then find its Git root. Stop if it is not a repository or has no staged changes.

```bash
git -C "${1:-.}" rev-parse --show-toplevel
git -C "${1:-.}" diff --cached --quiet --exit-code
```

### 2. Launch the Commit Agent

Use the `subagent` tool to launch `contextual-committer` with:

- `cwd`: the resolved Git root;
- `context`: `fork`;
- `async`: `true`;
- task text containing the resolved Git root and telling the agent to use `git -C` with that exact path.

The task should be:

```text
Target repository: <resolved-git-root>
Commit whatever is staged there when you run. Use git -C with that exact path for every Git command. Follow your contextual commit instructions.
```

Do not wait for completion. Report only that the background run started; Pi will deliver its completion notification.

### Important

- Do not ask for confirmation.
- Do not run `git add`, edit files, or modify the staging area.
- Do not launch the agent when no changes are staged.
