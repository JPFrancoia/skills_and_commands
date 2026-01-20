#!/usr/bin/env bash
#
# amnesia - init-db.sh
# Initialize the SQLite database for storing memories
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AMNESIA_DB="${AMNESIA_DB:-$HOME/amnesia/memories.db}"

# Check for uv (required for vector search)
if ! command -v uv &>/dev/null; then
    echo "ERROR: uv is required for amnesia (provides semantic search)" >&2
    echo "" >&2
    echo "Install uv:" >&2
    echo "  curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
    exit 1
fi

# Create directory if needed
mkdir -p "$(dirname "$AMNESIA_DB")"

# Create database and schema
sqlite3 "$AMNESIA_DB" <<'SQL'
CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    full_content TEXT,
    tags TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories(tags);
SQL

echo "Database initialized at: $AMNESIA_DB"

# Initialize vector table
uv run --quiet --script "$SCRIPT_DIR/embed.py" --init-db
echo "Vector search enabled (sqlite-vec)"
