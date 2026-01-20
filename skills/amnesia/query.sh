#!/usr/bin/env bash
#
# amnesia - query.sh
# Search memories using semantic search
#
# Usage: query.sh "search terms" [--limit N] [--full] [--init]
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AMNESIA_DB="${AMNESIA_DB:-$HOME/amnesia/memories.db}"

# Defaults
LIMIT=5
INIT=false
FULL=false
QUERY=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--limit)
            LIMIT="$2"
            shift 2
            ;;
        -f|--full)
            FULL=true
            shift
            ;;
        --init)
            INIT=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 'search terms' [--limit N] [--full] [--init]"
            echo ""
            echo "Options:"
            echo "  -n, --limit   Number of results (default: 5)"
            echo "  -f, --full    Show full conversation content (not just summary)"
            echo "  --init        Initialize database if it doesn't exist"
            echo "  -h, --help    Show this help"
            exit 0
            ;;
        -*)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
        *)
            QUERY="$1"
            shift
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
        "$SCRIPT_DIR/init-db.sh"
        echo ""
        echo "No memories saved yet. Save one with:"
        echo "  echo 'summary' | $SCRIPT_DIR/save.sh --title 'Title'"
        exit 0
    else
        echo "ERROR: Amnesia database not found at $AMNESIA_DB"
        echo ""
        echo "The database needs to be initialized before searching memories."
        echo ""
        echo "To initialize, run:"
        echo "  $SCRIPT_DIR/init-db.sh"
        echo ""
        echo "Or pass --init to create it now:"
        echo "  $0 --init 'search terms'"
        exit 1
    fi
fi

if [[ -z "$QUERY" ]]; then
    echo "Usage: $0 'search terms' [--limit N] [--full] [--init]"
    exit 1
fi

# Semantic search
if [[ "$FULL" == "true" ]]; then
    uv run --quiet --script "$SCRIPT_DIR/embed.py" --query "$QUERY" --limit "$LIMIT" --full
else
    uv run --quiet --script "$SCRIPT_DIR/embed.py" --query "$QUERY" --limit "$LIMIT"
fi
