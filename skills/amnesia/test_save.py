import contextlib
import io
import json
import os
import sqlite3
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import save

OBSERVATION = {
    "id": "a11111111111",
    "content": "The parser rejects the café input with error E417.",
    "timestamp": "2026-10-17T12:00:00Z",
    "relevance": "high",
    "sourceEntryIds": ["user-1"],
    "tokenCount": 16,
}
REFLECTION = {
    "id": "b22222222222",
    "content": "Preserve parser compatibility with café input.",
    "supportingObservationIds": [OBSERVATION["id"]],
    "tokenCount": 12,
}


def memory_entries() -> list[dict]:
    return [
        {
            "type": "message",
            "id": "user-1",
            "parentId": None,
            "message": {"role": "user", "content": "Check the parser"},
        },
        {
            "type": "custom",
            "id": "obs-1",
            "parentId": "user-1",
            "customType": "om.observations.recorded",
            "data": {
                "observations": [OBSERVATION],
                "coversUpToId": "user-1",
            },
        },
        {
            "type": "custom",
            "id": "ref-1",
            "parentId": "obs-1",
            "customType": "om.reflections.recorded",
            "data": {
                "reflections": [REFLECTION],
                "coversUpToId": "user-1",
            },
        },
    ]


def test_memory_extraction() -> None:
    entries = memory_entries() + [
        {
            "type": "custom",
            "id": "duplicate",
            "parentId": "ref-1",
            "customType": "om.observations.recorded",
            "data": {
                "observations": [{**OBSERVATION, "content": "Duplicate must not win"}],
                "coversUpToId": "user-1",
            },
        },
        {
            "type": "custom",
            "id": "drop-1",
            "parentId": "duplicate",
            "customType": "om.observations.dropped",
            "data": {
                "observationIds": [OBSERVATION["id"]],
                "coversUpToId": "user-1",
            },
        },
        {
            "type": "custom",
            "id": "abandoned",
            "parentId": "user-1",
            "customType": "om.reflections.recorded",
            "data": {
                "reflections": [{**REFLECTION, "id": "c33333333333"}],
                "coversUpToId": "user-1",
            },
        },
        {
            "type": "compaction",
            "id": "compact-1",
            "parentId": "drop-1",
            "summary": "Parser work",
            "details": {
                "type": "om.folded",
                "observations": [OBSERVATION],
                "reflections": [REFLECTION],
            },
        },
    ]
    reflections, observations = save.extract_pi_observational_memory(entries)
    assert reflections == [REFLECTION]
    assert observations == [{**OBSERVATION, "dropped": True}]
    assert "dropped" not in OBSERVATION
    assert save.extract_pi_observational_memory(entries[:1]) == ([], [])

    for data in ({"observations": "invalid"}, {"observations": [{}]}, None):
        invalid = {**entries[1], "data": data}
        try:
            save.extract_pi_observational_memory([entries[0], invalid])
        except (TypeError, ValueError) as error:
            assert "observations" in str(error)
        else:
            raise AssertionError("Malformed OM data must not be silently lost")


def test_database_save_and_query() -> None:
    embedding = [1.0] + [0.0] * 767
    with tempfile.TemporaryDirectory() as directory:
        db_path = str(Path(directory) / "memories.db")
        with sqlite3.connect(db_path) as conn:
            conn.execute("""
                CREATE TABLE memories (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
                    full_content TEXT, tags TEXT, created_at TEXT, updated_at TEXT
                )
            """)
            conn.execute(
                "INSERT INTO memories (id, title, content) VALUES (?, ?, ?)",
                ("legacy", "Existing memory", "Do not overwrite"),
            )
        # Opening an old database upgrades it without requiring an explicit init.
        conn = save.get_connection(db_path)
        conn.close()
        with contextlib.redirect_stdout(io.StringIO()):
            save.init_db(db_path)
        for _ in range(2):
            conn = save.get_connection(db_path)
            columns = {row[1] for row in conn.execute("PRAGMA table_info(memories)")}
            assert {"reflections", "observations", "session_directory"} <= columns
            assert conn.execute(
                "SELECT content, reflections, observations FROM memories "
                "WHERE id = 'legacy'"
            ).fetchone() == ("Do not overwrite", None, None)
            conn.close()

        conn = save.get_connection(db_path)
        conn.execute(
            "INSERT INTO memories_vec (id, embedding) VALUES (?, ?)",
            ("legacy", json.dumps(embedding)),
        )
        conn.commit()
        conn.close()

        observations = [{**OBSERVATION, "dropped": False}]
        with patch.object(save, "get_embedding", return_value=embedding) as embed:
            with contextlib.redirect_stdout(io.StringIO()):
                save.save_memory(
                    db_path, "memory", "Parser", "Checked parser",
                    "Original conversation", "parser", "/project",
                    reflections=[REFLECTION], observations=observations,
                )
            embedded_text = embed.call_args.args[0]
            assert REFLECTION["content"] in embedded_text
            assert OBSERVATION["content"] in embedded_text
            with sqlite3.connect(db_path) as conn:
                row = conn.execute(
                    "SELECT reflections, observations FROM memories WHERE id = 'memory'"
                ).fetchone()
            assert json.loads(row[0]) == [REFLECTION]
            assert json.loads(row[1]) == observations

            for full in (False, True):
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    save.query_memories(db_path, "parser", show_full=full)
                text = output.getvalue()
                assert "## Reflections:" in text and "## Observations:" in text
                assert REFLECTION["content"] in text and OBSERVATION["content"] in text
                assert OBSERVATION["id"] in text and "sourceEntryIds" in text
                assert ("Original conversation" in text) is full
                assert "Existing memory" in text and "Found 2 results" in text

            with contextlib.redirect_stdout(io.StringIO()):
                save.save_memory(
                    db_path, "memory", "Updated parser", "Updated", reflections=[],
                    observations=[{**OBSERVATION, "dropped": True}],
                )
                save.save_memory(db_path, "plain", "Plain session", "No OM installed")
            with sqlite3.connect(db_path) as conn:
                row = conn.execute(
                    "SELECT title, reflections, observations FROM memories "
                    "WHERE id = 'memory'"
                ).fetchone()
                assert row[0] == "Updated parser" and json.loads(row[1]) == []
                assert json.loads(row[2]) == [{**OBSERVATION, "dropped": True}]
                assert conn.execute(
                    "SELECT reflections, observations FROM memories WHERE id = 'plain'"
                ).fetchone() == ("[]", "[]")


def test_save_command() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        db_path = root / "memories.db"
        session_path = root / "session.jsonl"
        header = {"type": "session", "version": 3, "id": "om-test", "cwd": str(root)}
        session_path.write_text(
            "\n".join(json.dumps(entry) for entry in [header, *memory_entries()]),
            encoding="utf-8",
        )
        with (
            patch.dict(os.environ, {
                "AMNESIA_DB": str(db_path), "PI_CODING_AGENT_SESSION_DIR": directory,
            }),
            patch.object(sys, "argv", [
                "save.py", "save", "--id", "om-test", "--title", "OM test", "--init",
            ]),
            patch.object(sys, "stdin", io.StringIO("A parser session summary")),
            patch.object(save, "get_embedding", return_value=[1.0] + [0.0] * 767),
            patch.object(save, "load_pi_session", wraps=save.load_pi_session) as load,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            save.main()
            # One discovery read and one consistent export snapshot.
            assert load.call_count == 2
        with sqlite3.connect(db_path) as conn:
            row = conn.execute(
                "SELECT full_content, reflections, observations FROM memories "
                "WHERE id = 'om-test'"
            ).fetchone()
        assert row[0] == "USER: Check the parser"
        assert json.loads(row[1]) == [REFLECTION]
        assert json.loads(row[2]) == [{**OBSERVATION, "dropped": False}]


def main() -> None:
    previous_root = os.environ.get("PI_CODING_AGENT_SESSION_DIR")

    try:
        with tempfile.TemporaryDirectory() as directory:
            session_path = Path(directory) / "session.jsonl"
            entries = [
                {
                    "type": "session",
                    "version": 3,
                    "id": "pi-test",
                    "cwd": os.getcwd(),
                },
                {
                    "type": "message",
                    "id": "user-1",
                    "parentId": None,
                    "message": {"role": "user", "content": "Hello"},
                },
                {
                    "type": "message",
                    "id": "assistant-1",
                    "parentId": "user-1",
                    "message": {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "Hi"}],
                    },
                },
                {
                    "type": "message",
                    "id": "user-2",
                    "parentId": "assistant-1",
                    "message": {
                        "role": "user",
                        "content": "<amnesia_sum_command>save</amnesia_sum_command>",
                    },
                },
                {
                    "type": "message",
                    "id": "assistant-2",
                    "parentId": "user-2",
                    "message": {"role": "assistant", "content": "Memory saved"},
                },
            ]
            session_path.write_text(
                "\n".join(json.dumps(entry) for entry in entries),
                encoding="utf-8",
            )
            os.environ["PI_CODING_AGENT_SESSION_DIR"] = directory

            session = save.get_current_pi_session()
            assert session["id"] == "pi-test"
            assert session["title"] == "Hello"
            assert save.export_pi_session("pi-test") == "USER: Hello\nASSISTANT: Hi"
    finally:
        if previous_root is None:
            os.environ.pop("PI_CODING_AGENT_SESSION_DIR", None)
        else:
            os.environ["PI_CODING_AGENT_SESSION_DIR"] = previous_root

    test_memory_extraction()
    test_database_save_and_query()
    test_save_command()
    print("Amnesia session, observational memory, database, and query tests passed")


if __name__ == "__main__":
    main()
