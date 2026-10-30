import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { encodeWav, endpoint, readApiKey, readConfig, transcriptFrom } from "./gemini.ts";

test("encodeWav writes a 16 kHz mono 16-bit header and clamps samples", () => {
  const wav = encodeWav(new Float32Array([0, 1, -1, 2]));
  assert.equal(wav.length, 44 + 8);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(24), 16_000);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.deepEqual([0, 1, 2, 3].map((i) => wav.readInt16LE(44 + i * 2)), [0, 32767, -32768, 32767]);
});

test("endpoint uses the global host or a regional rep host", () => {
  const base = { ...readConfig("/nonexistent"), project: "p" };
  assert.match(endpoint({ ...base, location: "global" }), /^https:\/\/aiplatform\.googleapis\.com\/v1\/projects\/p\/locations\/global\//);
  assert.match(endpoint({ ...base, location: "eu" }), /^https:\/\/aiplatform\.eu\.rep\.googleapis\.com\/.*locations\/eu\//);
});

test("readConfig merges the file over defaults", () => {
  const path = join(mkdtempSync(join(tmpdir(), "pi-voice-")), "c.json");
  writeFileSync(path, JSON.stringify({ location: "eu", apiKeyPassPath: "gcp/pi-voice", customVocabulary: ["Kubernetes"] }));
  const config = readConfig(path);
  assert.equal(config.location, "eu");
  assert.equal(config.apiKeyPassPath, "gcp/pi-voice");
  assert.equal(config.mode, "SMART");
  assert.equal(config.shortcut, "ctrl+space");
  assert.deepEqual(config.customVocabulary, ["Kubernetes"]);
});

test("readApiKey reads the first line through pass without a shell", async () => {
  let invocation: { file: string; args: string[] } | undefined;
  const key = await readApiKey("gcp/pi-voice", undefined, async (file, args) => {
    invocation = { file, args };
    return "secret-key\naccount: voice";
  });
  assert.deepEqual(invocation, { file: "pass", args: ["show", "gcp/pi-voice"] });
  assert.equal(key, "secret-key");

  await assert.rejects(
    readApiKey("gcp/empty", undefined, async () => "\nnotes"),
    /empty first line/,
  );
  await assert.rejects(
    readApiKey("gcp/missing", undefined, async () => { throw new Error("entry missing"); }),
    /Cannot read Google API key from pass entry "gcp\/missing": entry missing/,
  );
});

test("transcriptFrom joins parts and handles empty responses", () => {
  assert.equal(transcriptFrom({ candidates: [{ content: { parts: [{ text: "Hello " }, { text: "world." }] } }] }), "Hello world.");
  assert.equal(transcriptFrom({}), "");
});
