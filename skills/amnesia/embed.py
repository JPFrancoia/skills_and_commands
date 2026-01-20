#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "sqlite-vec",
#     "sentence-transformers",
# ]
# ///
"""
amnesia - embed.py
Generate embeddings for text using sentence-transformers (local, no API)

Usage:
    echo "text" | uv run embed.py                    # outputs JSON array
    uv run embed.py --init-db                        # initialize vector table
    uv run embed.py --save --id "mem_123"            # embed stdin and save
    uv run embed.py --query "search text" [--limit N] # semantic search
"""

import sys
import os
import json
import sqlite3
import argparse

# Lazy load heavy imports
_model = None


def get_model():
    """Lazy load the embedding model."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer

        # all-mpnet-base-v2: 768 dimensions, best quality for sentence embeddings
        _model = SentenceTransformer("all-mpnet-base-v2")
    return _model


def get_db_path():
    return os.environ.get("AMNESIA_DB", os.path.expanduser("~/amnesia/memories.db"))


def get_connection(db_path: str):
    """Get a connection with sqlite-vec loaded."""
    import sqlite_vec

    conn = sqlite3.connect(db_path)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    return conn


def get_embedding(text: str) -> list[float]:
    """Generate embedding for text."""
    model = get_model()
    embedding = model.encode(text, convert_to_numpy=True)
    return embedding.tolist()


def init_vector_table(db_path: str):
    """Initialize the vector table for semantic search."""
    conn = get_connection(db_path)

    # Create vector table (768 dimensions for all-mpnet-base-v2)
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec USING vec0(
            id TEXT PRIMARY KEY,
            embedding FLOAT[768]
        )
    """)
    conn.commit()
    conn.close()
    print(f"Vector table initialized in: {db_path}")


def save_embedding(db_path: str, memory_id: str, text: str):
    """Generate and save embedding for a memory."""
    embedding = get_embedding(text)

    conn = get_connection(db_path)

    # Virtual tables don't support upsert, so delete first then insert
    conn.execute("DELETE FROM memories_vec WHERE id = ?", (memory_id,))
    conn.execute(
        "INSERT INTO memories_vec (id, embedding) VALUES (?, ?)",
        (memory_id, json.dumps(embedding)),
    )

    conn.commit()
    conn.close()
    print(f"Embedding saved for: {memory_id}")


def semantic_search(db_path: str, query: str, limit: int = 5, show_full: bool = False):
    """Search memories using vector similarity."""
    query_embedding = get_embedding(query)

    conn = get_connection(db_path)

    # Vector similarity search with distance
    # sqlite-vec requires k=? in the MATCH clause for KNN queries
    results = conn.execute(
        """
        SELECT 
            v.id,
            v.distance,
            m.title,
            m.content,
            m.full_content,
            m.tags,
            m.created_at
        FROM memories_vec v
        JOIN memories m ON v.id = m.id
        WHERE v.embedding MATCH ? AND k = ?
        ORDER BY v.distance
    """,
        (json.dumps(query_embedding), limit),
    ).fetchall()

    conn.close()

    print(f"Semantic search for: {query}\n")

    for i, (id, distance, title, content, full_content, tags, created_at) in enumerate(
        results, 1
    ):
        # Convert L2 distance to similarity score
        # L2 distance ranges from 0 (identical) to ~2 (very different) for normalized vectors
        # Using exponential decay: similarity = e^(-distance)
        import math

        similarity = math.exp(-distance) * 100

        print(f"--- Result {i} (score: {similarity:.1f}) ---")
        print(f"ID: {id}")
        print(f"Title: {title}")
        print(f"Tags: {tags or '(none)'}")
        print(f"Date: {created_at}")

        if show_full and full_content:
            print(f"\n## Summary:\n{content}")
            print(f"\n## Full Conversation:\n{full_content}")
        else:
            preview = content[:200] + "..." if len(content) > 200 else content
            print(f"Preview: {preview}")
        print()

    print(f"Found {len(results)} results")


def main():
    parser = argparse.ArgumentParser(description="Amnesia embedding utilities")
    parser.add_argument(
        "--init-db", action="store_true", help="Initialize vector table"
    )
    parser.add_argument("--save", action="store_true", help="Save embedding for memory")
    parser.add_argument("--id", type=str, help="Memory ID (for --save)")
    parser.add_argument("--query", "-q", type=str, help="Semantic search query")
    parser.add_argument("--limit", "-n", type=int, default=5, help="Number of results")
    parser.add_argument(
        "--full", "-f", action="store_true", help="Show full conversation content"
    )

    args = parser.parse_args()
    db_path = get_db_path()

    if args.init_db:
        init_vector_table(db_path)
    elif args.save:
        if not args.id:
            print("Error: --id required with --save", file=sys.stderr)
            sys.exit(1)
        text = sys.stdin.read().strip()
        if not text:
            print("Error: No text provided via stdin", file=sys.stderr)
            sys.exit(1)
        save_embedding(db_path, args.id, text)
    elif args.query:
        semantic_search(db_path, args.query, args.limit, args.full)
    else:
        # Default: output embedding as JSON
        text = sys.stdin.read().strip()
        if text:
            embedding = get_embedding(text)
            print(json.dumps(embedding))
        else:
            parser.print_help()


if __name__ == "__main__":
    main()
