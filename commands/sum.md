---
description: Summarize this conversation and save to memory
---

You are tasked with summarizing the current conversation and saving it as a memory for future reference.

## Current Session Information

The current session ID is:
!`opencode session list --format json -n 1 2>/dev/null | jq -r '.[0].id'`

## Instructions

1. **Analyze the entire conversation** above this message carefully.

2. **Generate a comprehensive summary** in markdown format with the following structure:

```markdown
# [Descriptive Title of the Conversation]

## Date
[Current date in YYYY-MM-DD format]

## Project Context
- **Working Directory**: [The directory where this conversation took place]
- **Project Root**: [If identifiable from the conversation]

## Summary
[2-3 paragraph summary of what was discussed, what problems were solved, and key decisions made]

## Key Topics
- [Topic 1]
- [Topic 2]
- [Topic 3]

## Technical Details
[Any important technical information, code patterns, configurations, or solutions that would be useful to remember]

## Code Changes
[If any files were modified, list them with brief descriptions of changes]

## Outcome
[What was the result of this conversation? Was the problem solved? What was decided?]

## Tags
[Relevant keywords for semantic search, e.g.: python, docker, authentication, bug-fix, refactoring]
```

3. **Save the summary** using this command:

```bash
SESSION_ID=$(opencode session list --format json -n 1 2>/dev/null | jq -r '.[0].id')
TEMP_SUMMARY=$(mktemp)
trap "rm -f $TEMP_SUMMARY" EXIT

cat > "$TEMP_SUMMARY" << 'EOF_SUMMARY'
YOUR_SUMMARY_MARKDOWN_HERE
EOF_SUMMARY

~/.config/opencode/skills/amnesia/save.py save \
    --id "$SESSION_ID" \
    --title "TITLE_HERE" \
    --tags "tag1,tag2,tag3" \
    --summary-file "$TEMP_SUMMARY"
```

Replace:
- `TITLE_HERE` with a descriptive title (keep it concise, 5-10 words)
- `tag1,tag2,tag3` with 3-5 relevant tags
- Content between `EOF_SUMMARY` markers with your generated summary markdown

**IMPORTANT**: 
- The full conversation is automatically extracted from the session - you only write the summary
- Tags should be comma-separated, no spaces

4. **Report the result** to the user, including:
   - The memory ID (session ID)
   - Confirmation that the full conversation was exported and saved
   - Confirmation that it was indexed for semantic search
   - A brief preview of the summary title and tags

## Important Notes

- Be thorough but concise in your summary
- Focus on information that would be useful in future conversations
- Include specific technical details, not just high-level descriptions
- Make sure tags are relevant for semantic search
- The full conversation is automatically captured - you don't need to type it out
