---
description: Generate a contextual commit message and optionally commit
---

## Your Task

Generate a contextual commit message following the contextual-commit convention. If staged files exist, offer to commit.

### Step 1: Analyze the Commit Scope

Determine what will be committed:

```bash
STAGED=$(git diff --cached --stat)
```

- **If staged changes exist:** these are the commit scope. Do NOT consider unstaged or untracked files.
- **If nothing is staged:** report all unstaged modifications and untracked files, and tell the user to stage first. Then analyze everything as candidates.

```bash
# If staged:
git diff --cached
git diff --cached --stat

# If nothing staged, show what's available:
git diff --stat
git status --short
```

### Step 2: Gather Context

Review the conversation history for:
- What the user asked for (intent)
- What alternatives were discussed or rejected
- What constraints were discovered
- What was learned during implementation

Also check existing contextual commits for scope consistency:

```bash
# Find recently used scopes in this project
git log -20 --format="%B" | grep -E "^(intent|decision|rejected|constraint|learned)\(" | sed 's/(.*//' | sort -u
```

### Step 3: Compose the Message

Follow the contextual-commit skill rules:

1. **Subject line**: Standard Conventional Commit format — `type(scope): description`
2. **Blank line**
3. **Action lines** (only those that carry signal the diff can't show):
   - `intent(scope):` — what the user wanted and why
   - `decision(scope):` — what was chosen when alternatives existed
   - `rejected(scope):` — what was discarded and why (highest value)
   - `constraint(scope):` — hard limits that shaped the approach
   - `learned(scope):` — discovered facts that prevent future mistakes

**Rules:**
- Only write action lines you have session context for. Don't fabricate.
- Trivial changes need zero action lines — just the subject line.
- Each `rejected` line MUST include the reason.
- Use consistent scopes with what already exists in the project history.
- Capture the user's intent in their words, not your implementation summary.

### Step 4: Output the Message

Present the complete commit message in a single fenced code block, ready to copy-paste:

```
type(scope): subject line

action-type(scope): description
action-type(scope): description
```

Then explain to the user how to use it:

- **Lazygit**: The first line goes in **Summary**. Everything after the blank line goes in **Description**.
- **`git commit` (opens editor)**: Paste the whole block as-is. The blank line separates subject from body.
- **Command line**: `git commit -m "subject line" -m "action lines separated by newlines"`

### Step 5: Offer to Commit

If staged files exist, ask the user: **"Want me to commit with this message?"**

- **If the user confirms:** run the commit. Use a heredoc to preserve the blank line between subject and body:
  ```bash
  git commit -m "type(scope): subject line" -m "action-type(scope): description
  action-type(scope): description"
  ```
- **If the user declines:** stop. The message is displayed for manual copy-paste.
- **If nothing was staged:** skip this step entirely — just display the message.

### Important

- Do NOT run `git add` or modify the staging area — only commit what the user already staged.
- Do NOT modify any files.
- Always show the message and ask before committing. Never commit without confirmation.

## Arguments

- `$ARGUMENTS`: Optional hints for the commit scope or type (e.g., `/m feat`, `/m fix auth`). Use these to guide the subject line if provided.
