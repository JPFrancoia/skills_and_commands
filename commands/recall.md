---
description: Reconstruct development context from contextual commit history
---

## Your Task

Reconstruct the development story from contextual commit history and present it as a dense, scannable briefing. This command is **read-only** — do not modify any files or make any commits.

### Argument Detection

Parse `$ARGUMENTS` to determine the mode:

- **No arguments** (`/recall`) — run **Default Mode** (full branch/session briefing).
- **Bare word** (`/recall auth`) — treat as a **Scope Query**.
- **`word(word)` pattern** (`/recall rejected(auth)`) — treat as an **Action+Scope Query**.

---

## Default Mode (no arguments)

### Step 1: Detect Branch State

!`git branch --show-current`

```bash
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

# Find the actual parent branch
BASE_BRANCH=$(git rev-parse --abbrev-ref @{upstream} 2>/dev/null | sed 's|^origin/||')

if [ -z "$BASE_BRANCH" ]; then
    CURRENT_BRANCH=$(git branch --show-current)
    BASE_BRANCH=$(git for-each-ref --format='%(refname:short)' refs/heads/ | while read branch; do
        [ "$branch" = "$CURRENT_BRANCH" ] && continue
        echo "$(git log --oneline "$branch..$CURRENT_BRANCH" 2>/dev/null | wc -l | tr -d ' ') $branch"
    done | sort -n | head -1 | awk '{print $2}')
fi

BASE_BRANCH=${BASE_BRANCH:-$DEFAULT_BRANCH}
```

Classify the scenario:
- **A**: On a feature branch with commits ahead of base
- **B**: On a feature branch with no commits yet
- **C**: On the default branch with no uncommitted changes
- **D**: On the default branch with uncommitted changes

### Step 2: Gather Raw Material

**Scenario A** (feature branch with commits):
```bash
git log ${BASE_BRANCH}..HEAD --format="%H%n%s%n%b%n---COMMIT_END---"
git diff --stat
git diff --cached --stat
```

**Scenario B** (feature branch, no commits):
```bash
git diff --stat
git diff --cached --stat
git log ${BASE_BRANCH} -10 --format="%H%n%s%n%b%n---COMMIT_END---"
```

**Scenario C** (default branch, clean):
```bash
git log -20 --format="%H%n%s%n%b%n---COMMIT_END---"
```

**Scenario D** (default branch, uncommitted changes):
```bash
git log -20 --format="%H%n%s%n%b%n---COMMIT_END---"
git diff --stat
git diff --cached --stat
```

### Step 3: Extract Action Lines

From gathered commit bodies, extract lines matching:
```
^(intent|decision|rejected|constraint|learned)\(
```

Group by commit (chronological) and by type (for synthesis).

### Step 4: Synthesize Output

**Signal density over narrative flow.** Every line should be actionable information. No fluff.

Priority order:
1. Active intent (what we're building and why)
2. Current approach (decisions made)
3. Rejected approaches (what NOT to re-explore)
4. Constraints (hard boundaries)
5. Learnings (things that save time)
6. In-progress work (unstaged/staged changes)

If no contextual action lines exist, still produce useful output from commit subjects — group by area of activity and report honestly that no contextual history exists.

**Scale output to the data.** 2 contextual commits = 3-4 lines. 20 commits = a few grouped paragraphs. Never pad.

End with "What do you want to work on?" or similar.

---

## Scope Query (`/recall <scope>`)

Targeted query across **full repo history** for a given scope. Prefix matching: `auth` matches `auth`, `auth-tokens`, `auth-library`, etc.

### Step 1: Query
```bash
SCOPE="$ARGUMENTS"
git log --all --grep="(${SCOPE}" --format="%H%n%s%n%b%n---COMMIT_END---"
```

### Step 2: Extract
From gathered commit bodies, extract lines whose scope starts with the query term:
```bash
grep -E "^(intent|decision|rejected|constraint|learned)\(${SCOPE}"
```

### Step 3: Output
Group by action type, chronological within each group. Show which sub-scopes were found.

If no matches: say so plainly and suggest checking the scope name.

---

## Action+Scope Query (`/recall <action>(<scope>)`)

Query a specific action type for a scope across full repo history.

### Step 1: Parse
Extract `ACTION` and `SCOPE` from the `word(word)` pattern in `$ARGUMENTS`.

### Step 2: Query
```bash
git log --all --grep="${ACTION}(${SCOPE}" --format="%H%n%s%n%b%n---COMMIT_END---"
```

### Step 3: Extract
```bash
grep "^${ACTION}(${SCOPE}"
```

### Step 4: Output
Flat chronological list with commit subject for provenance.

If no matches: say so plainly.

---

## Guidelines

- **Dense over conversational.** No "Here's what's been happening" or "Let me tell you about."
- **Grounded in data.** Only report what action lines, commit subjects, and diffs show. Do not infer or speculate.
- **Surface rejections prominently.** They prevent wasted exploration.
- **Group by scope** when multiple scopes exist on the default branch.
- **This command is read-only.** Do not modify files, stage changes, or create commits.
