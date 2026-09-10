import json
import os
import tempfile
from pathlib import Path

import save


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

    print("Amnesia Pi session test passed")


if __name__ == "__main__":
    main()
