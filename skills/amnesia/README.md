# Amnesia

A dead-simple memory system for AI coding assistants. **One folder, zero config.**

## Quick Install

```bash
# Install uv (required)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Clone directly to your skills folder
git clone https://github.com/youruser/amnesia.git ~/.config/opencode/skills/amnesia

# Make scripts executable
chmod +x ~/.config/opencode/skills/amnesia/*.sh
```

For Claude Code:
```bash
git clone https://github.com/youruser/amnesia.git ~/.claude/skills/amnesia
chmod +x ~/.claude/skills/amnesia/*.sh
```

The database is created automatically on first use (pass `--init`).

## What It Does

- **Semantic search** - Find memories by meaning ("container issues" finds "Docker networking")
- **Save conversations** - Run `/sum` to save the current chat
- **Works offline** - Everything runs locally, no API keys needed

## Usage

### In Your AI Assistant

Just ask naturally:
> "Do you remember how we fixed the CORS issue?"

Or save the conversation:
> `/sum`

### Command Line

```bash
# Search memories (--init creates database on first run)
~/.config/opencode/skills/amnesia/query.sh --init "authentication bug"

# Quick save (summary only)
echo "We fixed it by..." | ~/.config/opencode/skills/amnesia/save.sh --init --title "Auth Fix" --tags "auth,bug"

# Save with full conversation (recommended for complex content)
~/.config/opencode/skills/amnesia/save.sh \
    --title "Auth Fix" \
    --tags "auth,bug" \
    --summary-file summary.md \
    --full-content-file transcript.txt
```

### Handling Multi-Line Content

For conversations with multi-line content, use **temporary files** to avoid shell quoting issues:

```bash
# Create temp files
TEMP_SUMMARY=$(mktemp)
TEMP_TRANSCRIPT=$(mktemp)
trap "rm -f $TEMP_SUMMARY $TEMP_TRANSCRIPT" EXIT

# Write summary
cat > "$TEMP_SUMMARY" << 'EOF'
## Summary
Multi-line summary content here...
EOF

# Write transcript
cat > "$TEMP_TRANSCRIPT" << 'EOF'
USER: First message
ASSISTANT: First response
...
EOF

# Save
~/.config/opencode/skills/amnesia/save.sh \
    --title "Session Title" \
    --summary-file "$TEMP_SUMMARY" \
    --full-content-file "$TEMP_TRANSCRIPT"
```

This prevents shell escaping errors with complex multi-line content.

## How It Works

```
Save: /sum → save.sh → SQLite + embeddings
Query: "remember..." → query.sh → semantic search → results
```

## Database

**Location**: `~/amnesia/memories.db`

Override with environment variable:
```bash
export AMNESIA_DB="/path/to/custom/memories.db"
```

### Schema

```sql
-- Text content
memories (
    id TEXT PRIMARY KEY,          -- e.g., "mem_1705753200_a1b2c3d4"
    title TEXT NOT NULL,
    content TEXT NOT NULL,        -- summary (used for search)
    full_content TEXT,            -- full conversation transcript
    tags TEXT,                    -- comma-separated
    created_at TEXT,
    updated_at TEXT
)

-- Vector embeddings for semantic search
memories_vec (
    id TEXT PRIMARY KEY,
    embedding FLOAT[768]          -- all-mpnet-base-v2
)
```

- `content`: The summary (indexed for semantic search)
- `full_content`: Full conversation (stored for reference, not indexed)

- **Embeddings**: all-mpnet-base-v2 (768 dimensions, runs locally via sentence-transformers)
- **Vector DB**: sqlite-vec

## Files

```
amnesia/
├── SKILL.md      # Skill definition (read by AI)
├── query.sh      # Search memories
├── save.sh       # Save memories  
├── init-db.sh    # Database setup
├── embed.py      # Embedding utilities
└── README.md     # This file
```

## Troubleshooting

### Issue: Shell Quoting Errors When Saving Large Content

**Symptom**: `unmatched '` or `unmatched "` errors when running save command

**Solution**: Use temporary files instead of passing content as arguments:

```bash
# ❌ Avoid: Passing multi-line content as arguments
save.sh --title "Title" --full-content "$LARGE_CONTENT"

# ✅ Use: Temporary files
TEMP=$(mktemp)
echo "$LARGE_CONTENT" > "$TEMP"
save.sh --title "Title" --full-content-file "$TEMP"
rm "$TEMP"
```

### Issue: full_content Field Not Populated

**Symptom**: Saved memory exists but `full_content` column is empty

**Solution**: Use `--full-content-file` parameter:

```bash
# ❌ Old way (deprecated)
save.sh --title "Title" --full-content "content"

# ✅ New way
save.sh --title "Title" --full-content-file transcript.txt
```

### Issue: Database Errors

**Symptom**: "Database is locked" or similar SQLite errors

**Solution**: Wait a moment and retry. If persistent, check that only one process is accessing the database:

```bash
# Check for locks
lsof ~/amnesia/memories.db 2>/dev/null || echo "No locks"

# Reinitialize if corrupted
rm ~/amnesia/memories.db
~/.config/opencode/skills/amnesia/init-db.sh
```

## Dependencies

- **Required**: SQLite3 (pre-installed on macOS/Linux)
- **Required**: [uv](https://github.com/astral-sh/uv) (manages Python dependencies automatically)
