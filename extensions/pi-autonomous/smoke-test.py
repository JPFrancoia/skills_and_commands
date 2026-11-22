#!/usr/bin/env python3
"""Exercise the real Pi RPC path with a local deterministic model."""

import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import tempfile
import threading
import time


ROOT = Path(__file__).resolve().parent


def run_case(mode, target):
    with tempfile.TemporaryDirectory(prefix="pi-autonomous-rpc-") as temporary:
        directory = Path(temporary)
        env = dict(os.environ, HOME=temporary, USERPROFILE=temporary,
                   PI_CODING_AGENT_DIR=str(directory / "agent"), PI_OFFLINE="1",
                   AUTONOMOUS_TEST_DIR=temporary, AUTONOMOUS_TEST_MODE=mode)
        if mode in ("question", "bean-waiting", "bean-unassigned"):
            def beans(*args):
                result = subprocess.run(["beans", *args, "--json"], cwd=temporary,
                                        capture_output=True, text=True, check=True)
                return json.loads(result.stdout)
            beans("init")
            epic = beans("create", "Example epic", "--type", "epic", "--status", "todo")["bean"]
            safe = beans("create", "Safe task", "--type", "task", "--status", "todo" if mode == "question" else "in-progress", "--parent", epic["id"])["bean"]
            target = epic["id"]
            env.update(AUTONOMOUS_TEST_SAFE=safe["id"])
            if mode == "question":
                approval = beans("create", "Needs approval", "--type", "task", "--status", "todo", "--parent", epic["id"])["bean"]
                env.update(AUTONOMOUS_TEST_APPROVAL=approval["id"])
            else:
                env.update(AUTONOMOUS_TEST_ROOT=epic["id"])
                if mode == "bean-unassigned":
                    extra = beans("create", "Other ready task", "--type", "task", "--status", "todo", "--parent", epic["id"])["bean"]
                    env.update(AUTONOMOUS_TEST_EXTRA=extra["id"])
        process = subprocess.Popen([
            "pi", "--mode", "rpc", "--no-session", "--offline", "--no-extensions",
            "--no-context-files", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-mcp",
            "-e", str(ROOT / "pi-autonomous.ts"), "-e", str(ROOT / "testdata/provider.ts"),
            "--provider", "autonomous-test", "--model", "fixture", "--thinking", "off",
        ], cwd=temporary, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        records = queue.Queue()
        errors = []
        transcript = []

        def read_stdout():
            for line in process.stdout:
                try:
                    records.put(json.loads(line))
                except ValueError:
                    records.put({"invalid": line.decode("utf-8", errors="replace")})
            records.put({"eof": True})

        def read_stderr():
            for line in process.stderr:
                errors.append(line.decode("utf-8", errors="replace"))

        threading.Thread(target=read_stdout, daemon=True).start()
        threading.Thread(target=read_stderr, daemon=True).start()
        sequence = 0

        def command(kind, settled=False, **fields):
            nonlocal sequence
            sequence += 1
            request_id = str(sequence)
            process.stdin.write((json.dumps(dict(id=request_id, type=kind, **fields)) + "\n").encode())
            process.stdin.flush()
            response = None
            did_settle = False
            deadline = time.monotonic() + 45
            while response is None or (settled and not did_settle):
                remaining = deadline - time.monotonic()
                assert remaining > 0, (mode, transcript[-8:], errors)
                try:
                    record = records.get(timeout=remaining)
                except queue.Empty as error:
                    raise AssertionError((mode, transcript[-8:], errors)) from error
                transcript.append(record)
                assert not record.get("eof"), errors
                assert "invalid" not in record, record
                if record.get("type") == "response" and record.get("id") == request_id:
                    assert record.get("success"), record
                    response = record
                if record.get("type") == "agent_settled":
                    did_settle = True
            return response.get("data")

        try:
            commands = command("get_commands")
            assert any(item["name"] == "autonomous" for item in commands["commands"]), commands
            prompt = "Ordinary task" if mode == "disabled" else "/autonomous " + target
            command("prompt", message=prompt, settled=True)
            if mode in ("waiting", "bean-waiting"):
                assert not (directory / "worked.txt").exists()
                command("prompt", message="The example background worker completed.", settled=True)
            assert not any(record.get("type") == "extension_ui_request" and record.get("method") in ("confirm", "select", "custom") for record in transcript), transcript
            assert not (directory / "question-executed.txt").exists()
            calls = (directory / "calls.jsonl").read_text().splitlines()
            if mode in ("empty", "disabled"):
                assert not (directory / "worked.txt").exists()
                assert len(calls) == (3 if mode == "empty" else 1), len(calls)
            else:
                assert (directory / "worked.txt").read_text() == "verified\n"
                assert len(calls) == (5 if mode == "question" else 1 if mode == "deadline" else 3), len(calls)
            command("prompt", message="/autonomous status")
            messages = command("get_messages")["messages"]
            failures = [item for item in messages if item.get("role") == "assistant" and item.get("stopReason") == "error"]
            assert not failures, failures
            if mode == "bean-unassigned":
                assert any(item.get("role") == "toolResult" and item.get("toolName") == "autonomous_work"
                           and item.get("isError") and "worker assignments" in str(item.get("content")) for item in messages), messages
            status = [item for item in messages if item.get("customType") == "autonomous-status"][-1]
            content = status["content"]
            if mode != "disabled":
                state = json.loads(content)
                assert state["enabled"] is (target.startswith("on") and mode not in ("empty", "deadline")), state
                if mode == "question":
                    assert state["scope"]["kind"] == "bean", state
                    assert any(item.get("beanId") == approval["id"] for item in state["deferred"]), state
                    assert beans("show", approval["id"])["status"] == "todo"
            else:
                assert "off" in content
            command("prompt", message="/autonomous off")
            print(f"PASS {mode}: {len(calls)} local model requests, no human dialog")
        finally:
            process.stdin.close()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            process.stdout.close()
            process.stderr.close()
        assert process.returncode == 0, errors
        assert not errors, errors


def main():
    assert shutil.which("pi"), "Install Pi before running this check."
    assert shutil.which("beans"), "Install Beans before running this check."
    run_case("continuation", "on --for 1h")
    run_case("prompt", "perform the local check --for 1h")
    run_case("question", "")
    run_case("empty", "on")
    run_case("waiting", "on")
    run_case("bean-waiting", "")
    run_case("bean-unassigned", "")
    run_case("deadline", "on --for 0.001m")
    run_case("disabled", "")


if __name__ == "__main__":
    main()
