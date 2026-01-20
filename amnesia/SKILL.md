---
name: amnesia
description: Search and save conversation memories using semantic search. Use this skill when the user mentions past conversations, asks "do you remember", or when historical context from previous sessions would help solve the current problem.
---

# Amnesia - Conversation Memory Skill

A simple, local-first memory system for AI coding assistants. Store and retrieve conversation summaries using semantic search (vector embeddings).

## When to Use This Skill

Invoke this skill when:

- **User references past conversations**: Phrases like "we discussed this before", "remember when", "last time"
- **Recurring problems**: The user encounters an issue that might have been solved previously
- **Building on previous work**: Extending or modifying solutions from past conversations
- **User asks about history**: Questions about past work, decisions, or implementations

## Querying Memories

```bash
~/.config/opencode/skills/amnesia/query.sh "search terms" [--limit N] [--full] [--init]
```

### Query Parameters

- First argument: Search query (required)
- `--limit N` or `-n N`: Number of results (default: 5)
- `--full` or `-f`: Show full conversation content (not just summary)
- `--init`: Initialize database if it doesn't exist (use on first run)

### Examples

```bash
# Semantic search - finds by meaning
~/.config/opencode/skills/amnesia/query.sh "container networking"  # finds Docker memories
~/.config/opencode/skills/amnesia/query.sh "login flow"            # finds auth memories

# More results
~/.config/opencode/skills/amnesia/query.sh "authentication" --limit 10
```

## Saving Memories

Save a new conversation summary:

```bash
echo 'YOUR_SUMMARY_MARKDOWN' | ~/.config/opencode/skills/amnesia/save.sh --title "Title" [--full-content "FULL_CONVERSATION"] [--tags "tag1,tag2"] [--id "session-id"] [--init]
```

### Save Parameters

- `--title TEXT` or `-t TEXT`: Title for the memory (required)
- `--full-content TEXT`: Full conversation transcript (optional but recommended)
- `--tags TEXT`: Comma-separated tags (optional)
- `--id TEXT`: Custom ID for updates (optional, defaults to timestamp-based)
- `--init`: Initialize database if it doesn't exist (use on first run)

### Summary Format

When saving a summary, use this structure:

```markdown
## Summary
2-3 paragraph summary of what was discussed and key decisions made.

## Key Topics
- Topic 1
- Topic 2

## Technical Details
Important technical information, code patterns, or solutions.

## Files Changed
- path/to/file.go - Brief description

## Outcome
What was the result? Was the problem solved?
```

## /sum Command

When the user runs `/sum`, summarize and save the conversation:

1. Create a comprehensive summary using the structure above
2. Choose 3-5 relevant tags from: golang, python, typescript, javascript, bash, docker, kubernetes, git, database, api, testing, debugging, refactoring, performance, security, config, devops, frontend, backend, cli
3. Capture the full conversation transcript
4. Save with:

```bash
echo 'YOUR_SUMMARY_HERE' | ~/.config/opencode/skills/amnesia/save.sh \
  --title "Descriptive Title" \
  --tags "tag1,tag2,tag3" \
  --full-content "FULL_CONVERSATION_TRANSCRIPT"
```

5. Confirm the save was successful and show the memory ID

Note: The summary is used for semantic search. The full conversation is stored for reference but not indexed.

## How It Works

```
User Query
    ↓
query.sh
    ↓
embed.py (via uv)
    ↓
┌─────────────────────────┐
│ Semantic Search         │ ← sentence-transformers (local)
│ (sqlite-vec)            │   all-mpnet-base-v2 embeddings
└─────────────────────────┘
```

## Database Location

- **Database**: `~/amnesia/memories.db`
- **Override**: Set `AMNESIA_DB` environment variable

## Best Practices

1. **Search first**: Before asking the user to re-explain, search for relevant memories
2. **Use natural language**: "how did we handle errors" works better than "error handling"
3. **Cite sources**: Tell the user which memory you found the information in
4. **Verify information**: Past solutions might be outdated

## Example Workflow

```
User: "I'm stuck on the same auth bug we fixed last month"

Step 1: Search for relevant memories
$ ~/.config/opencode/skills/amnesia/query.sh "authentication bug"

Step 2: Review results - semantic search finds related content
> Result 1 (score: 45.2) - "OAuth Session Fix"
> The problem was related to session token expiration...

Step 3: Apply solution or inform user
> "I found a similar issue we solved. The problem was 
   related to session token expiration. Here's what we did..."
```

## Dependencies

- **Required**: SQLite3 (pre-installed on macOS/Linux)
- **Required**: [uv](https://github.com/astral-sh/uv) for semantic search

```bash
# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh
```

---

**License**: MIT
