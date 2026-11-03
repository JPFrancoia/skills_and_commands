#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "sqlite-vec",
#     "sentence-transformers",
# ]
# ///
"""
amnesia - save.py
Save and query conversation memories with semantic search.

Commands:
    save.py save --id SESSION_ID --title "Title" [--tags "a,b"] [--summary-file FILE]
    save.py query "search terms" [--limit N]
    save.py summary MEMORY_ID
    save.py passages MEMORY_ID "search terms" [--limit N]
    save.py init
"""

import argparse
import contextlib
import io
import json
import logging
import math
import os
import re
import sqlite3
import sys
import warnings
from pathlib import Path

# Lazy load heavy imports
_model = None

SUM_COMMAND_MARKERS = ("<amnesia_sum_command>", "</amnesia_sum_command>")
MIN_RELEVANCE_SCORE = 35.0
PASSAGE_LIMIT = 3
PASSAGE_MAX_CHARS = 1200
TRANSCRIPT_ROLE_PATTERN = re.compile(r"(?m)^(?=(?:USER|ASSISTANT|SUMMARY): )")
WORD_PATTERN = re.compile(r"\w+")


def get_pi_session_root() -> Path:
    return Path(
        os.environ.get(
            "PI_CODING_AGENT_SESSION_DIR",
            os.path.expanduser("~/.pi/agent/sessions"),
        )
    )


def iter_pi_session_files() -> list[Path]:
    root = get_pi_session_root()
    if not root.exists():
        return []
    return sorted(root.rglob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)


def load_pi_session(path: Path) -> tuple[dict, list[dict]]:
    header: dict = {}
    entries: list[dict] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            entry = json.loads(line)
            if entry.get("type") == "session":
                header = entry
            else:
                entries.append(entry)
    if not header:
        raise RuntimeError(f"Pi session has no header: {path}")
    return header, entries


def resolve_pi_session(session_ref: str | None = None) -> Path:
    if session_ref:
        path = Path(os.path.expanduser(session_ref))
        if path.exists():
            return path

    matches: list[Path] = []
    for path in iter_pi_session_files():
        try:
            header, _ = load_pi_session(path)
        except Exception:
            continue

        if not session_ref:
            if header.get("cwd") == os.getcwd():
                return path
            matches.append(path)
            continue

        session_id = str(header.get("id", ""))
        if session_id.startswith(session_ref) or session_ref in path.name:
            matches.append(path)

    if matches:
        return matches[0]
    raise RuntimeError(f"Pi session not found: {session_ref or os.getcwd()}")


def content_to_text(content) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""

    chunks = []
    for part in content:
        if not isinstance(part, dict):
            continue
        if part.get("type") == "text":
            chunks.append(part.get("text", ""))
        elif part.get("type") == "toolCall":
            chunks.append(f"[tool call: {part.get('name', 'unknown')}]")
    return "".join(chunks)


def get_pi_active_entries(entries: list[dict]) -> list[dict]:
    by_id = {entry.get("id"): entry for entry in entries if entry.get("id")}
    leaf = next((entry for entry in reversed(entries) if entry.get("id")), None)
    if not leaf:
        return []

    active = []
    seen = set()
    while leaf and leaf.get("id") not in seen:
        active.append(leaf)
        seen.add(leaf.get("id"))
        leaf = by_id.get(leaf.get("parentId"))
    return list(reversed(active))


def get_pi_session_title(header: dict, entries: list[dict]) -> str:
    for entry in reversed(get_pi_active_entries(entries)):
        if entry.get("type") == "session_info" and entry.get("name"):
            return entry["name"]
    for entry in get_pi_active_entries(entries):
        if entry.get("type") != "message":
            continue
        message = entry.get("message", {})
        if message.get("role") == "user":
            title = content_to_text(message.get("content", "")).strip().splitlines()[0]
            return title[:80] or "Untitled Pi Session"
    return header.get("id", "Untitled Pi Session")


def get_current_pi_session() -> dict:
    path = resolve_pi_session()
    header, entries = load_pi_session(path)
    return {
        "id": header["id"],
        "title": get_pi_session_title(header, entries),
        "path": str(path),
        "source": "pi",
    }


def get_model():
    """Lazy load the embedding model."""
    global _model
    if _model is None:
        os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
        os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
        os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

        logging.getLogger("sentence_transformers").setLevel(logging.ERROR)
        logging.getLogger("transformers").setLevel(logging.ERROR)
        logging.getLogger("huggingface_hub").setLevel(logging.ERROR)
        warnings.filterwarnings("ignore", module="huggingface_hub")

        sink = io.StringIO()
        with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
            from sentence_transformers import SentenceTransformer

            try:
                from transformers.utils import logging as hf_logging

                hf_logging.set_verbosity_error()
                hf_logging.disable_progress_bar()
            except Exception:
                pass

            # Use the cached model first, so a proxy that blocks Hugging Face does not break the skill.
            try:
                _model = SentenceTransformer("all-mpnet-base-v2", local_files_only=True)
            except Exception:
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

    columns = {row[1] for row in conn.execute("PRAGMA table_info(memories)")}
    if columns:
        for column in ("session_directory", "reflections", "observations"):
            if column not in columns:
                conn.execute(f"ALTER TABLE memories ADD COLUMN {column} TEXT")
        conn.commit()
    return conn


def get_embedding(text: str) -> list[float]:
    """Generate embedding for text."""
    model = get_model()
    sink = io.StringIO()
    with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
        embedding = model.encode(text, convert_to_numpy=True)
    return embedding.tolist()


def init_db(db_path: str):
    """Initialize the database and vector table."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    conn = get_connection(db_path)

    # Create memories table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            full_content TEXT,
            reflections TEXT,
            observations TEXT,
            tags TEXT,
            session_directory TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories(tags)")

    # Create vector table (768 dimensions for all-mpnet-base-v2)
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec USING vec0(
            id TEXT PRIMARY KEY,
            embedding FLOAT[768]
        )
    """)

    conn.commit()
    conn.close()
    print(f"Database initialized: {db_path}")


def export_pi_entries(entries: list[dict]) -> str:
    entries = get_pi_active_entries(entries)
    if not entries:
        raise RuntimeError("Session has no messages")

    lines = []
    drop_following_assistants = False
    for entry in entries:
        kind = entry.get("type")
        role = ""
        text = ""
        if kind == "message":
            message = entry.get("message", {})
            role = str(message.get("role", "unknown")).upper()
            text = content_to_text(message.get("content", ""))
        elif kind in {"compaction", "branch_summary"}:
            role = "SUMMARY"
            text = entry.get("summary", "")

        if drop_following_assistants and role == "ASSISTANT":
            continue
        drop_following_assistants = False

        if any(marker in text for marker in SUM_COMMAND_MARKERS):
            drop_following_assistants = True
            continue

        if text:
            lines.append(f"{role}: {text}")
    return "\n".join(lines)


def export_pi_session(session_ref: str) -> str:
    path = resolve_pi_session(session_ref)
    _header, entries = load_pi_session(path)
    return export_pi_entries(entries)


def extract_pi_observational_memory(
    entries: list[dict],
) -> tuple[list[dict], list[dict]]:
    """Archive OM V3 records on the active branch, including dropped observations."""
    reflections = {}
    observations = {}
    dropped = set()
    record_types = {
        "om.reflections.recorded": ("reflections", reflections),
        "om.observations.recorded": ("observations", observations),
    }
    for entry in get_pi_active_entries(entries):
        if entry.get("type") != "custom":
            continue
        kind = entry.get("customType")
        if kind == "om.observations.dropped":
            field = "observationIds"
        elif kind in record_types:
            field, records = record_types[kind]
        else:
            continue

        data = entry.get("data")
        if not isinstance(data, dict) or not isinstance(data.get(field), list):
            raise TypeError(f"Invalid OM {field} in session entry {entry.get('id')}")
        for item in data[field]:
            if kind == "om.observations.dropped":
                if not isinstance(item, str) or not item:
                    raise ValueError(f"Invalid OM observation id in {entry.get('id')}")
                dropped.add(item)
                continue
            if (
                not isinstance(item, dict)
                or not isinstance(item.get("id"), str)
                or not item["id"]
                or not isinstance(item.get("content"), str)
                or not item["content"].strip()
            ):
                raise ValueError(f"Invalid OM {field} record in {entry.get('id')}")
            records.setdefault(item["id"], item)

    return list(reflections.values()), [
        {**item, "dropped": item["id"] in dropped} for item in observations.values()
    ]


def save_memory(
    db_path: str,
    memory_id: str,
    title: str,
    content: str,
    full_content: str = "",
    tags: str = "",
    session_directory: str = "",
    reflections: list[dict] | None = None,
    observations: list[dict] | None = None,
):
    """Save a memory and its recorded OM data to the database."""
    conn = get_connection(db_path)

    conn.execute(
        """
        INSERT INTO memories (
            id, title, content, full_content, tags, session_directory,
            reflections, observations, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            content = excluded.content,
            full_content = excluded.full_content,
            tags = excluded.tags,
            session_directory = excluded.session_directory,
            reflections = excluded.reflections,
            observations = excluded.observations,
            updated_at = datetime('now')
        """,
        (
            memory_id, title, content, full_content, tags, session_directory,
            json.dumps(reflections or [], ensure_ascii=False),
            json.dumps(observations or [], ensure_ascii=False),
        ),
    )
    conn.commit()

    # Save embedding for semantic search
    embed_text = f"{title}. {content}"
    for item in [*(reflections or []), *(observations or [])]:
        embed_text += f"\n{item['content']}"
    embedding = get_embedding(embed_text)

    conn.execute("DELETE FROM memories_vec WHERE id = ?", (memory_id,))
    conn.execute(
        "INSERT INTO memories_vec (id, embedding) VALUES (?, ?)",
        (memory_id, json.dumps(embedding)),
    )
    conn.commit()
    conn.close()

    print(f"Memory saved: {memory_id}")


def query_memories(db_path: str, query: str, limit: int = 5):
    """Search memory titles and summaries with a minimum relevance score."""
    query_embedding = get_embedding(query)
    conn = get_connection(db_path)

    results = conn.execute(
        """
        SELECT
            v.id,
            v.distance,
            m.title,
            m.content,
            m.tags,
            m.created_at,
            m.session_directory
        FROM memories_vec v
        JOIN memories m ON v.id = m.id
        WHERE v.embedding MATCH ? AND k = ?
        ORDER BY v.distance
        """,
        (json.dumps(query_embedding), limit),
    ).fetchall()

    conn.close()

    accepted = []
    for row in results:
        score = math.exp(-row[1]) * 100
        if score >= MIN_RELEVANCE_SCORE:
            accepted.append((row, score))

    print(f"Semantic search for: {query}\n")
    if not accepted:
        print("No relevant memories found.")
        return

    for i, (row, score) in enumerate(accepted, 1):
        memory_id, _distance, title, content, tags, created_at, directory = row
        preview = content[:200] + "..." if len(content) > 200 else content

        print(f"--- Result {i} (score: {score:.1f}) ---")
        print(f"ID: {memory_id}")
        print(f"Title: {title}")
        print(f"Tags: {tags or '(none)'}")
        print(f"Date: {created_at}")
        print(f"Directory: {directory or '(unknown)'}")
        print(f"Preview: {preview}\n")

    print(f"Found {len(accepted)} relevant results")


def show_memory_summary(db_path: str, memory_id: str) -> bool:
    """Show the stored summary for one exact memory ID."""
    conn = get_connection(db_path)
    row = conn.execute(
        "SELECT title, content FROM memories WHERE id = ?", (memory_id,)
    ).fetchone()
    conn.close()

    if not row:
        print(f"Error: Memory not found: {memory_id}", file=sys.stderr)
        return False

    title, content = row
    print(f"ID: {memory_id}")
    print(f"Title: {title}")
    print(f"\n## Summary:\n{content}")
    return True


def split_transcript(full_content: str) -> list[str]:
    """Split an exported transcript into role-based passages."""
    starts = [match.start() for match in TRANSCRIPT_ROLE_PATTERN.finditer(full_content)]
    if not starts:
        return [full_content.strip()] if full_content.strip() else []

    passages = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else len(full_content)
        passage = full_content[start:end].strip()
        if passage:
            passages.append(passage)
    return passages


def excerpt_passage(passage: str, search: str, terms: set[str]) -> str:
    """Keep a transcript passage near its first matching term."""
    if len(passage) <= PASSAGE_MAX_CHARS:
        return passage

    normalized = passage.casefold()
    phrase_position = normalized.find(search.casefold())
    positions = [normalized.find(term) for term in terms]
    positions = [position for position in positions if position >= 0]
    hit = phrase_position if phrase_position >= 0 else min(positions, default=0)

    body_limit = PASSAGE_MAX_CHARS - 6
    start = max(0, hit - body_limit // 3)
    end = min(len(passage), start + body_limit)
    if end == len(passage):
        start = max(0, end - body_limit)

    prefix = "..." if start else ""
    suffix = "..." if end < len(passage) else ""
    return f"{prefix}{passage[start:end].strip()}{suffix}"


def find_transcript_passages(
    db_path: str, memory_id: str, search: str, limit: int = PASSAGE_LIMIT
) -> bool:
    """Show bounded transcript passages that match search terms."""
    conn = get_connection(db_path)
    row = conn.execute(
        "SELECT title, full_content FROM memories WHERE id = ?", (memory_id,)
    ).fetchone()
    conn.close()

    if not row:
        print(f"Error: Memory not found: {memory_id}", file=sys.stderr)
        return False

    title, full_content = row
    if not full_content:
        print(f"Error: Memory has no saved transcript: {memory_id}", file=sys.stderr)
        return False

    terms = set(WORD_PATTERN.findall(search.casefold()))
    if not terms:
        print("Error: Passage search needs at least one word", file=sys.stderr)
        return False

    matches = []
    phrase = search.casefold()
    for source_index, passage in enumerate(split_transcript(full_content), 1):
        words = set(WORD_PATTERN.findall(passage.casefold()))
        overlap = len(terms & words)
        if overlap:
            matches.append((phrase in passage.casefold(), overlap, source_index, passage))

    matches.sort(key=lambda item: (-item[0], -item[1], item[2]))
    matches = matches[:limit]

    print(f"ID: {memory_id}")
    print(f"Title: {title}")
    print(f"Search: {search}\n")
    if not matches:
        print("No matching transcript passages found.")
        return True

    for result_index, (_exact, _overlap, source_index, passage) in enumerate(matches, 1):
        print(f"--- Passage {result_index} (transcript section {source_index}) ---")
        print(excerpt_passage(passage, search, terms))
        print()

    print(f"Found {len(matches)} matching passages")
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Save and query conversation memories with semantic search"
    )
    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # save command
    save_parser = subparsers.add_parser("save", help="Save a memory")
    save_parser.add_argument("--id", help="Session ID (auto-detected if not provided)")
    save_parser.add_argument(
        "--title", "-t", help="Memory title (uses session title if not provided)"
    )
    save_parser.add_argument("--tags", default="", help="Comma-separated tags")
    save_parser.add_argument(
        "--summary-file", help="Read summary from file instead of stdin"
    )
    save_parser.add_argument(
        "--init", action="store_true", help="Initialize database if needed"
    )

    # query command
    query_parser = subparsers.add_parser("query", help="Search memories")
    query_parser.add_argument("search", help="Search query")
    query_parser.add_argument(
        "--limit", "-n", type=int, default=5, help="Number of results"
    )
    query_parser.add_argument(
        "--init", action="store_true", help="Initialize database if needed"
    )

    summary_parser = subparsers.add_parser("summary", help="Show one memory summary")
    summary_parser.add_argument("id", help="Exact memory ID")

    passages_parser = subparsers.add_parser(
        "passages", help="Find passages in one saved transcript"
    )
    passages_parser.add_argument("id", help="Exact memory ID")
    passages_parser.add_argument("search", help="Words to find in the transcript")
    passages_parser.add_argument(
        "--limit", "-n", type=int, default=PASSAGE_LIMIT,
        help="Number of passages",
    )

    # init command
    subparsers.add_parser("init", help="Initialize the database")

    args = parser.parse_args()
    db_path = get_db_path()

    if args.command == "init":
        init_db(db_path)

    elif args.command == "save":
        # Check/init database
        if not os.path.exists(db_path):
            if args.init:
                init_db(db_path)
            else:
                print(f"Error: Database not found: {db_path}", file=sys.stderr)
                print("Run 'save.py init' to create it", file=sys.stderr)
                sys.exit(1)

        # Get session info (auto-detect if not provided)
        session_id = args.id
        title = args.title
        if not session_id or not title:
            try:
                session = get_current_pi_session()
                if not session_id:
                    session_id = session["id"]
                if not title:
                    title = session.get("title", "Untitled Session")
            except Exception as e:
                print(f"Error: Failed to get session info: {e}", file=sys.stderr)
                sys.exit(1)

        # Read summary
        if args.summary_file:
            with open(args.summary_file, "r") as f:
                content = f.read().strip()
        else:
            content = sys.stdin.read().strip()

        if not content:
            print("Error: No summary provided", file=sys.stderr)
            sys.exit(1)

        # Export the transcript and OM records from the same session snapshot.
        try:
            path = resolve_pi_session(session_id)
            _header, entries = load_pi_session(path)
            full_content = export_pi_entries(entries)
            reflections, observations = extract_pi_observational_memory(entries)
        except Exception as e:
            print(f"Error exporting session: {e}", file=sys.stderr)
            sys.exit(1)

        session_directory = os.getcwd()
        save_memory(
            db_path, session_id, title, content, full_content, args.tags,
            session_directory, reflections=reflections, observations=observations,
        )

    elif args.command in {"query", "summary", "passages"}:
        if not os.path.exists(db_path):
            if args.command == "query" and args.init:
                init_db(db_path)
                print("No memories saved yet.\n")
                return
            print(f"Error: Database not found: {db_path}", file=sys.stderr)
            sys.exit(1)

        if args.command == "query":
            if args.limit < 1:
                print("Error: Result limit must be at least 1", file=sys.stderr)
                sys.exit(1)
            query_memories(db_path, args.search, args.limit)
        elif args.command == "summary":
            if not show_memory_summary(db_path, args.id):
                sys.exit(1)
        else:
            if args.limit < 1:
                print("Error: Passage limit must be at least 1", file=sys.stderr)
                sys.exit(1)
            if not find_transcript_passages(db_path, args.id, args.search, args.limit):
                sys.exit(1)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
