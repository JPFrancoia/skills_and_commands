import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

// The repository intentionally has no node_modules. Make Pi's own extension
// peers visible so the documented direct jiti command is self-contained.
const require = createRequire(import.meta.url);
const Module = require("node:module") as { _initPaths(): void };
process.env.NODE_PATH = [
	join(homedir(), ".pi", "agent", "npm", "node_modules"),
	join(homedir(), ".npm-global", "lib", "node_modules", "@earendil-works", "pi-coding-agent", "node_modules"),
	join(homedir(), ".npm-global", "lib", "node_modules"),
	"/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules",
	"/opt/homebrew/lib/node_modules",
	process.env.NODE_PATH,
].filter(Boolean).join(delimiter);
Module._initPaths();

const { __test__ } = await import("./pi-open.ts");
const { fetchOpenRequestCounts } = await import("./repos.ts");
const { age, command, markdown, parseRepos, requests } = __test__;

const parsed = parseRepos("https://gitlab.com/acme/group/sub/widgets/, https://github.com/acme/gadgets.git, ftp://x.io/y, https://gitlab.com/group");
assert.deepEqual(parsed.repos, [
	{ host: "gitlab.com", path: "acme/group/sub/widgets", forge: "gitlab" },
	{ host: "github.com", path: "acme/gadgets", forge: "github" },
]);
assert.equal(parsed.errors.length, 2);
assert.deepEqual(parseRepos(undefined), { repos: [], errors: [] });

assert.deepEqual(command(parsed.repos[0]), {
	command: "glab",
	args: [
		"api",
		"--hostname",
		"gitlab.com",
		"graphql",
		"-f",
		'query={project(fullPath:"acme/group/sub/widgets"){mergeRequests(state:opened,first:100){nodes{title webUrl createdAt approved author{username}}}}}',
	],
});
assert.deepEqual(command(parsed.repos[1]), {
	command: "gh",
	args: ["pr", "list", "--repo", "github.com/acme/gadgets", "--state", "open", "--limit", "100", "--json", "title,url,createdAt,author,reviewDecision"],
});

const nodes = (...nodes: unknown[]) => JSON.stringify({ data: { project: { mergeRequests: { nodes } } } });
assert.deepEqual(requests(parsed.repos[0], nodes({ title: "Fix", webUrl: "u", createdAt: "c", approved: true, author: { username: "alice" } })), [
	{ title: "Fix", url: "u", createdAt: "c", author: "alice", approved: true },
]);
assert.deepEqual(requests(parsed.repos[0], JSON.stringify({ data: { project: null } })), []);
assert.deepEqual(requests(parsed.repos[1], JSON.stringify([{ title: "T", url: "u", createdAt: "c", author: { login: "bob" }, reviewDecision: "APPROVED" }])), [
	{ title: "T", url: "u", createdAt: "c", author: "bob", approved: true },
]);
assert.deepEqual(requests(parsed.repos[1], JSON.stringify([{ title: "T", url: "u", createdAt: "c", reviewDecision: "REVIEW_REQUIRED" }])), [
	{ title: "T", url: "u", createdAt: "c", author: "unknown", approved: false },
]);

const now = Date.parse("2026-01-10T00:00:00Z");
assert.equal(age("2026-01-09T23:30:00Z", now), "just now");
assert.equal(age("2026-01-09T12:00:00Z", now), "12h ago");
assert.equal(age("2026-01-09T00:00:00Z", now), "1d ago");

const rendered = markdown(
	[
		{
			repo: parsed.repos[0],
			requests: [
				{ title: "Old", url: "u1", createdAt: "2026-01-01T00:00:00Z", author: "alice", approved: true },
				{ title: "New", url: "u2", createdAt: "2026-01-09T12:00:00Z", author: "bob", approved: false },
			],
		},
		{ repo: parsed.repos[1], requests: [] },
	],
	["boom"],
	now,
);
assert.equal(
	rendered,
	["---", "", "### acme/group/sub/widgets", "- [New](u2) — 12h ago [bob]", "- [Old](u1) — 9d ago (approved) [alice]", "", "- ⚠️ boom"].join("\n"),
);

console.log("ok");

function requestNode(forge: string, draft: boolean, ci: string | null): object {
	return forge === "gitlab"
		? { draft, headPipeline: ci === null ? null : { status: ci } }
		: { isDraft: draft, commits: { nodes: [{ commit: { statusCheckRollup: ci === null ? null : { state: ci } } }] } };
}

function pageResult(forge: string, nodes: unknown[], cursor: string | null = null) {
	const connection = { nodes, pageInfo: { hasNextPage: cursor !== null, endCursor: cursor } };
	return { code: 0, stderr: "", stdout: JSON.stringify({ data: forge === "gitlab"
		? { project: { mergeRequests: connection } }
		: { repository: { pullRequests: connection } } }) };
}

for (const repo of parsed.repos) {
	const countCalls: Array<{ bin: string; args: string[]; timeout?: number }> = [];
	const all = Array.from({ length: 213 }, (_, i) => requestNode(repo.forge, i % 3 === 0, i % 3 === 1 ? "SUCCESS" : "PENDING"));
	const counter = { exec: async (bin: string, args: string[], options: { timeout?: number }) => {
		const index = countCalls.length;
		countCalls.push({ bin, args, timeout: options.timeout });
		return pageResult(repo.forge, all.slice(index * 100, (index + 1) * 100), index < 2 ? `page-${index + 1}` : null);
	} };
	assert.deepEqual(await fetchOpenRequestCounts(counter as never, [repo]), [
		{ repo, count: 213, breakdown: { drafts: 71, passing: 71, notPassing: 71 } },
	]);
	assert.equal(countCalls.length, 3);
	assert.equal(countCalls[0].bin, repo.forge === "gitlab" ? "glab" : "gh");
	assert.deepEqual(countCalls[0].args.slice(0, 5), ["api", "--hostname", repo.host, "graphql", "-f"]);
	assert.match(countCalls[0].args[5], /first:100/);
	assert.match(countCalls[0].args[5], /nodes\{draft headPipeline\{status\}\}|nodes\{isDraft commits\(last:1\)/);
	assert.doesNotMatch(countCalls[0].args[5], /after:/);
	assert.match(countCalls[1].args[5], /after:"page-1"/);
	assert.match(countCalls[2].args[5], /after:"page-2"/);
	assert.ok(countCalls.every(({ timeout }) => timeout! > 0 && timeout! <= 15_000));
	assert.deepEqual(await fetchOpenRequestCounts(counter as never, []), []);
	assert.deepEqual(await fetchOpenRequestCounts({ exec: async () => pageResult(repo.forge, []) } as never, [repo]), [
		{ repo, count: 0, breakdown: { drafts: 0, passing: 0, notPassing: 0 } },
	]);

	const otherStates = repo.forge === "gitlab"
		? ["FAILED", "PENDING", "RUNNING", "CANCELED", "SKIPPED", "MANUAL", null]
		: ["FAILURE", "ERROR", "PENDING", null];
	const nodes = [requestNode(repo.forge, true, "SUCCESS"), requestNode(repo.forge, true, null),
		requestNode(repo.forge, false, "SUCCESS"), ...otherStates.map((ci) => requestNode(repo.forge, false, ci))];
	if (repo.forge === "github") nodes.push({ isDraft: false, commits: { nodes: [] } });
	const [classified] = await fetchOpenRequestCounts({ exec: async () => pageResult(repo.forge, nodes) } as never, [repo]);
	assert.deepEqual(classified, { repo, count: nodes.length, breakdown: { drafts: 2, passing: 1, notPassing: nodes.length - 3 } });
	assert.equal(classified.count, Object.values(classified.breakdown!).reduce((a, b) => a + b, 0));

	for (const result of [
		{ code: 1, stderr: "Authentication required", stdout: "" },
		{ code: 0, stderr: "", stdout: "not json" },
		{ code: 0, stderr: "", stdout: '{"errors":[{"message":"Access denied"}]}' },
		{ code: 0, stderr: "", stdout: '{"data":{"repository":null,"project":null}}' },
		pageResult(repo.forge, [null]),
		pageResult(repo.forge, [{ draft: "yes", isDraft: "yes" }]),
		pageResult(repo.forge, [requestNode(repo.forge, false, 42 as never)]),
		pageResult(repo.forge, [], "unexpected-next-page"),
		pageResult(repo.forge, [requestNode(repo.forge, false, "SUCCESS")], ""),
	]) {
		const [failed] = await fetchOpenRequestCounts({ exec: async () => result } as never, [repo]);
		assert.ok(failed.error, result.stdout);
		assert.equal(failed.count, undefined);
		assert.equal(failed.breakdown, undefined);
	}
	let pages = 0;
	const [partial] = await fetchOpenRequestCounts({ exec: async () => ++pages === 1
		? pageResult(repo.forge, [requestNode(repo.forge, false, "SUCCESS")], "next")
		: { code: 1, stdout: "", stderr: "Page two failed" } } as never, [repo]);
	assert.equal(partial.error, "Page two failed");
	assert.equal(partial.count, undefined);
	const [loop] = await fetchOpenRequestCounts({ exec: async () => pageResult(repo.forge, [requestNode(repo.forge, false, null)], "repeat") } as never, [repo]);
	assert.equal(loop.error, "Invalid request pagination");
	assert.equal(loop.count, undefined);
}

const realNow = Date.now;
try {
	let clock = realNow();
	Date.now = () => clock;
	const [timedOut] = await fetchOpenRequestCounts({ exec: async () => {
		clock += 15_001;
		return pageResult("github", [requestNode("github", false, "SUCCESS")], "next");
	} } as never, [parsed.repos[1]]);
	assert.equal(timedOut.error, "Open request refresh timed out");
	assert.equal(timedOut.count, undefined);
} finally {
	Date.now = realNow;
}
const [missing] = await fetchOpenRequestCounts({ exec: async () => { throw new Error("gh missing"); } } as never, [parsed.repos[1]]);
assert.equal(missing.error, "gh missing");
const [badPath] = await fetchOpenRequestCounts({ exec: async () => { throw new Error("must not run"); } } as never, [{ ...parsed.repos[1], path: "owner/repo/extra" }]);
assert.equal(badPath.error, "Invalid GitHub repository path");
console.log("count tests ok");
