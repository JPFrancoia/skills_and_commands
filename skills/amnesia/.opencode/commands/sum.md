---
description: Summarize and save the current conversation to memory
---

Summarize this conversation and save it to the amnesia memory system.

Follow these steps:

1. **Create a comprehensive summary** using this structure:

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

2. **Choose 3-5 relevant tags** from: golang, python, typescript, javascript, bash, docker, kubernetes, git, database, api, testing, debugging, refactoring, performance, security, config, devops, frontend, backend, cli

3. **Create a descriptive title** for this conversation

4. **Capture the full conversation transcript** including both user messages and assistant responses

5. **Save the memory** by running:

```bash
echo 'YOUR_SUMMARY_HERE' | ~/.config/opencode/skills/amnesia/save.sh \
  --title "Descriptive Title" \
  --tags "tag1,tag2,tag3" \
  --full-content "FULL_CONVERSATION_TRANSCRIPT"
```

6. **Confirm** the save was successful and show the memory ID to the user

Note: The summary is used for semantic search. The full conversation is stored for reference but not indexed.
