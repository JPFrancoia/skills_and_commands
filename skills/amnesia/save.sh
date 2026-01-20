#!/usr/bin/env bash
#
# amnesia - save.sh
# Save a memory to the database
#
# Usage: 
#   echo "summary" | save.sh --title "Title" [--full-content-file FILE] [--tags "tag1,tag2"] [--id "custom-id"]
#   save.sh --title "Title" --summary-file FILE --full-content-file FILE [--tags "tag1,tag2"] [--id "custom-id"]
#
# For large multi-line content, use --full-content-file or pipe via stdin

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AMNESIA_DB="${AMNESIA_DB:-$HOME/amnesia/memories.db}"

# Parse arguments
TITLE=""
TAGS=""
ID=""
FULL_CONTENT=""
FULL_CONTENT_FILE=""
SUMMARY_FILE=""
INIT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--title)
            TITLE="$2"
            shift 2
            ;;
        --tags)
            TAGS="$2"
            shift 2
            ;;
        --id)
            ID="$2"
            shift 2
            ;;
        --full-content)
            # DEPRECATED: Use --full-content-file instead for multi-line content
            FULL_CONTENT="$2"
            shift 2
            ;;
        --full-content-file)
            FULL_CONTENT_FILE="$2"
            shift 2
            ;;
        --summary-file)
            SUMMARY_FILE="$2"
            shift 2
            ;;
        --init)
            INIT=true
            shift
            ;;
        -h|--help)
            echo "Usage:"
            echo "  echo 'summary' | $0 --title 'Title' [OPTIONS]"
            echo "  $0 --title 'Title' --summary-file SUMMARY_FILE --full-content-file TRANSCRIPT_FILE [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -t, --title              Title for the memory (required)"
            echo "  --summary-file FILE      Read summary from file instead of stdin"
            echo "  --full-content-file FILE Read full conversation from file (for multi-line)"
            echo "  --tags TAGS              Comma-separated tags"
            echo "  --id ID                  Custom ID (defaults to timestamp-based)"
            echo "  --init                   Initialize database if it doesn't exist"
            echo "  -h, --help               Show this help"
            echo ""
            echo "Examples:"
            echo "  # Save from stdin (summary only)"
            echo "  echo 'We fixed it by...' | $0 --title 'Auth Fix' --tags 'auth,bug'"
            echo ""
            echo "  # Save with full conversation from file"
            echo "  $0 --title 'My Session' --summary-file summary.md --full-content-file transcript.txt"
            echo ""
            echo "  # Pipe full content to stdin, summary from file"
            echo "  cat transcript.txt | $0 --title 'Session' --summary-file summary.md --full-content-file /dev/stdin"
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# Check for uv (required)
if ! command -v uv &>/dev/null; then
    echo "ERROR: uv is required for amnesia (provides semantic search)" >&2
    echo "" >&2
    echo "Install uv:" >&2
    echo "  curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
    exit 1
fi

# Check if database exists
if [[ ! -f "$AMNESIA_DB" ]]; then
    if [[ "$INIT" == "true" ]]; then
        "$SCRIPT_DIR/init-db.sh" >&2
        echo "" >&2
    else
        echo "ERROR: Amnesia database not found at $AMNESIA_DB" >&2
        echo "" >&2
        echo "The database needs to be initialized before saving memories." >&2
        echo "" >&2
        echo "To initialize, run:" >&2
        echo "  $SCRIPT_DIR/init-db.sh" >&2
        echo "" >&2
        echo "Or pass --init to create it now:" >&2
        echo "  echo 'summary' | $0 --init --title 'Title'" >&2
        exit 1
    fi
fi

# Validate
if [[ -z "$TITLE" ]]; then
    echo "Error: --title is required" >&2
    exit 1
fi

# Read summary (from file or stdin)
if [[ -n "$SUMMARY_FILE" ]]; then
    if [[ ! -f "$SUMMARY_FILE" ]]; then
        echo "Error: Summary file not found: $SUMMARY_FILE" >&2
        exit 1
    fi
    CONTENT=$(cat "$SUMMARY_FILE")
else
    CONTENT=$(cat)
fi

if [[ -z "$CONTENT" ]]; then
    echo "Error: No summary provided (via stdin or --summary-file)" >&2
    exit 1
fi

# Read full content (from file if specified, otherwise use parameter)
if [[ -n "$FULL_CONTENT_FILE" ]]; then
    if [[ ! -f "$FULL_CONTENT_FILE" ]]; then
        echo "Error: Full content file not found: $FULL_CONTENT_FILE" >&2
        exit 1
    fi
    FULL_CONTENT=$(cat "$FULL_CONTENT_FILE")
fi

# Generate ID if not provided
if [[ -z "$ID" ]]; then
    ID="mem_$(date +%s)_$(openssl rand -hex 4 2>/dev/null || echo $$)"
fi

# Escape single quotes for SQL
escape_sql() {
    echo "$1" | sed "s/'/''/g"
}

TITLE_ESC=$(escape_sql "$TITLE")
CONTENT_ESC=$(escape_sql "$CONTENT")
FULL_CONTENT_ESC=$(escape_sql "$FULL_CONTENT")
TAGS_ESC=$(escape_sql "$TAGS")
ID_ESC=$(escape_sql "$ID")

# Insert or update
sqlite3 "$AMNESIA_DB" <<SQL
INSERT INTO memories (id, title, content, full_content, tags, created_at, updated_at)
VALUES ('$ID_ESC', '$TITLE_ESC', '$CONTENT_ESC', '$FULL_CONTENT_ESC', '$TAGS_ESC', datetime('now'), datetime('now'))
ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    content = excluded.content,
    full_content = excluded.full_content,
    tags = excluded.tags,
    updated_at = datetime('now');
SQL

echo "Memory saved: $ID"

# Generate and save embedding for semantic search (on summary only)
EMBED_TEXT="$TITLE. $CONTENT"
echo "$EMBED_TEXT" | uv run --quiet --script "$SCRIPT_DIR/embed.py" --save --id "$ID"
