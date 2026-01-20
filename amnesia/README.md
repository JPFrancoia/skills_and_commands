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

# Save a memory
echo "We fixed it by..." | ~/.config/opencode/skills/amnesia/save.sh --init --title "Auth Fix" --tags "auth,bug"
```

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

## Dependencies

- **Required**: SQLite3 (pre-installed on macOS/Linux)
- **Required**: [uv](https://github.com/astral-sh/uv) (manages Python dependencies automatically)

## License

MIT
