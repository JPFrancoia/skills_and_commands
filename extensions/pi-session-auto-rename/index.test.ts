import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	findBeansIdentifier,
	isBeansIdentifier,
	isValidGeneratedSessionName,
	loadModelConfig,
	needsAutoName,
	parseBeansTitle,
	parseModelRef,
	redactBeansIdentifiers,
} from "./policy.ts";

assert.equal(isBeansIdentifier("acme_ops-1vkb"), true);
assert.equal(isBeansIdentifier("project-1234"), true);
assert.equal(isBeansIdentifier("Acme Ops 1vkb"), false);
assert.equal(isBeansIdentifier("relay-service"), false);
assert.equal(findBeansIdentifier("let's work on acme_ops-a1b2"), "acme_ops-a1b2");
assert.equal(findBeansIdentifier("let's work on relay-service"), null);
assert.equal(redactBeansIdentifiers("Fix acme_ops-1vkb"), "Fix work item");
assert.equal(redactBeansIdentifiers("Implement acme_ops-1vkb before project-1234."), "Implement work item before work item.");
assert.equal(isValidGeneratedSessionName("Acme Ops 1vkb"), true);
assert.equal(isValidGeneratedSessionName("acme_ops-1vkb"), false);
assert.equal(isValidGeneratedSessionName(""), false);
assert.equal(needsAutoName(undefined), true);
assert.equal(needsAutoName("acme_ops-1vkb"), true);
assert.equal(needsAutoName("Relay Private Access"), false);
assert.equal(parseBeansTitle('{"title":"Repair production Terraform state"}'), "Repair production Terraform state");
assert.equal(parseBeansTitle('{"status":"in-progress"}'), null);
assert.equal(parseBeansTitle("not json"), null);
assert.deepEqual(parseModelRef(" anthropic/claude-haiku-4-5 "), {
	provider: "anthropic",
	id: "claude-haiku-4-5",
});
assert.equal(parseModelRef("invalid"), null);

const settingsDir = mkdtempSync(join(tmpdir(), "pi-session-auto-rename-"));
const settingsPath = join(settingsDir, "settings.json");
try {
	writeFileSync(settingsPath, JSON.stringify({ autoRename: { model: "openai-codex/gpt-5.5" } }));
	assert.deepEqual(loadModelConfig(settingsPath), { provider: "openai-codex", id: "gpt-5.5" });
	writeFileSync(settingsPath, JSON.stringify({ autoRename: { model: "invalid" } }));
	assert.equal(loadModelConfig(settingsPath), null);
	writeFileSync(settingsPath, JSON.stringify({ autoRename: null }));
	assert.equal(loadModelConfig(settingsPath), null);
	assert.equal(loadModelConfig(join(settingsDir, "missing.json")), null);
} finally {
	rmSync(settingsDir, { recursive: true, force: true });
}

console.log("ok");
