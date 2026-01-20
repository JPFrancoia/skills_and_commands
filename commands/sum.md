---
description: Summarize this conversation and save to memory
---

You are tasked with summarizing the current conversation and saving it as a memory for future reference.

## Current Session Information

The current session ID is:
!`opencode session list --format json -n 1 2>/dev/null | jq -r '.[0].id'`

## Instructions

1. **Analyze the entire conversation** above this message carefully.

2. **Capture the full conversation transcript** by reviewing all messages exchanged in this session, formatting them as:
```
USER: [first user message]
ASSISTANT: [first assistant response]
USER: [second user message]
ASSISTANT: [second assistant response]
...
```

3. **Generate a comprehensive summary** in markdown format with the following structure:

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

4. **Save the summary** using the improved method with temporary files to handle multi-line content reliably.

**CRITICAL**: Use temporary files to avoid shell quoting issues with large multi-line content. The session ID is automatically captured to ensure updates overwrite the previous summary.

```bash
# Generate unique temp files
TEMP_SUMMARY=$(mktemp)
TEMP_TRANSCRIPT=$(mktemp)
trap "rm -f $TEMP_SUMMARY $TEMP_TRANSCRIPT" EXIT

# Write your summary to the temp file
cat > "$TEMP_SUMMARY" << 'EOF_SUMMARY'
YOUR_SUMMARY_MARKDOWN_HERE
EOF_SUMMARY

# Write the full conversation to the temp transcript file
cat > "$TEMP_TRANSCRIPT" << 'EOF_TRANSCRIPT'
USER: [user message 1]
ASSISTANT: [assistant response 1]
USER: [user message 2]
ASSISTANT: [assistant response 2]
...
EOF_TRANSCRIPT

# Save with automatic session ID
SESSION_ID=$(opencode session list --format json -n 1 2>/dev/null | jq -r '.[0].id')
~/.config/opencode/skills/amnesia/save.sh \
    --id "$SESSION_ID" \
    --title "TITLE_HERE" \
    --tags "tag1,tag2,tag3" \
    --summary-file "$TEMP_SUMMARY" \
    --full-content-file "$TEMP_TRANSCRIPT"
```

Replace:
- `TITLE_HERE` with a descriptive title (keep it concise, 5-10 words)
- `tag1,tag2,tag3` with 3-5 relevant tags
- Content between `EOF_SUMMARY` markers with your generated summary markdown
- Content between `EOF_TRANSCRIPT` markers with the complete conversation (user and assistant messages)

**IMPORTANT**: 
- DO NOT manually type the session ID - let the command fetch it automatically
- Use temp files for multi-line content to avoid quoting issues
- The full_content field should contain ONLY the raw conversation - no prefixes, no annotations
- Tags should be comma-separated, no spaces

5. **Report the result** to the user, including:
   - The file path where the summary was saved
   - Whether this was a new summary or an update to an existing one
   - Confirmation that it was indexed for semantic search
   - A brief preview of the summary

## Important Notes

- Be thorough but concise in your summary
- Focus on information that would be useful in future conversations
- Include specific technical details, not just high-level descriptions
- Make sure tags are relevant for semantic search
- Always use the session ID to enable summary updates
