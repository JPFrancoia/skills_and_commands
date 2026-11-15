import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createReview, recordSearch, recordSourceRead, recordOutcomes, closeSearches, reviewProgress, reviewResponse,
  finishReview, validateReview, validateReviewState, validateReviewReceipts, reviewContinuation, resolvedSearch, reviewReport,
} from "./review.mjs";
import { readSource, searchSources } from "./sources.mjs";

const sources = { sessions: [{ sessionId: "session", entries: [
  { entryId: "user", role: "user", text: "Use short replies." },
  { entryId: "tool", role: "toolResult", text: "The API uses port 9090." },
] }] };
const finding = { id: "f1", sessionId: "session", kind: "preference", subject: "reply style",
  statement: "Use short replies.", evidence: [{ entryId: "user", quote: "Use short replies." }] };
const outcome = (id, kind = "unsupported", searchIds = [], findingIds = []) =>
  ({ id, outcome: kind, reason: "Checked the whole passage against the retained sources.", findingIds, searchIds });

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "dream-review-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "one.md"), "---\ndescription: One.\n---\n\n- Use short replies.\n- Keep this fact.\n");
  writeFileSync(join(root, "two.md"), "---\ndescription: Two.\n---\n\nThe API uses port 8080.\n");
  const manifest = { candidateRoot: root, reviewPaths: ["one.md", "two.md"], sourcesHash: "sources" };
  const candidate = root + "-candidate";
  cpSync(root, candidate, { recursive: true });
  t.after(() => rmSync(candidate, { recursive: true, force: true }));
  return { root, candidate, manifest, review: createReview(manifest) };
}

function complete(f) {
  f.review.readPaths = ["one.md", "two.md"];
  const q = recordSearch(f.review, { query: "unavailable claim" }, { nextOffset: null });
  recordOutcomes(f.review, f.review.files.flatMap((file) => file.passages.map((p) => outcome(p.id, "unsupported", [q]))), [], sources);
  finishReview(f.review, "Compared all selected files for contradictions, duplicates, and links. Preserved evidence gaps.", f.candidate);
}

test("every selected passage needs an outcome, including unchanged files", (t) => {
  const f = fixture(t);
  assert.deepEqual(f.review.files.map((file) => file.passages.length), [2, 1]);
  assert.equal(reviewProgress(f.review, f.candidate).totalFiles, 2);
  assert.throws(() => finishReview(f.review, "Done.", f.candidate), /incomplete/);
  assert.throws(() => validateReview(f.review, f.manifest, f.candidate, [], sources), /incomplete/);
  complete(f);
  assert.equal(validateReview(f.review, f.manifest, f.candidate, [], sources).complete, true);
  assert.match(reviewReport(f.review, f.candidate), /2\/2 files and 3\/3 passages/);
  assert.equal(readFileSync(join(f.candidate, "one.md"), "utf8"), readFileSync(join(f.root, "one.md"), "utf8"));
  delete f.review.outcomes.p2;
  assert.throws(() => validateReview(f.review, f.manifest, f.candidate, [], sources), /incomplete/);
});

test("supported claims need a real finding and an observed source read", (t) => {
  const f = fixture(t);
  const supported = outcome("p1", "supported", [], ["f1"]);
  assert.throws(() => recordOutcomes(f.review, [supported], [], sources), /missing/);
  assert.throws(() => recordOutcomes(f.review, [supported], [{ ...finding, source: "note" }], sources), /note/);
  assert.throws(() => recordOutcomes(f.review, [supported], [finding], sources), /Read the source/);
  recordSourceRead(f.review, readSource(sources, { sessionId: "session", entryId: "tool" }));
  assert.throws(() => recordOutcomes(f.review, [supported], [finding], sources), /Read the source/);
  recordSourceRead(f.review, readSource(sources, { sessionId: "session", entryId: "user", limit: 5 }));
  assert.throws(() => recordOutcomes(f.review, [supported], [finding], sources), /Read the source/);
  recordSourceRead(f.review, readSource(sources, { sessionId: "session", entryId: "user" }));
  recordOutcomes(f.review, [supported], [finding], sources);
  assert.equal(f.review.outcomes.p1.outcome, "supported");
  assert.throws(() => recordOutcomes(f.review, [outcome("p2", "corrected")], [], sources), /source-backed/);
});

test("missing evidence requires completed searches, not deferred checks", (t) => {
  const f = fixture(t);
  assert.throws(() => recordOutcomes(f.review, [outcome("p1")], [], sources), /completed source search/);
  const input = { query: "not found" };
  const id = recordSearch(f.review, input, searchSources(sources, input));
  recordOutcomes(f.review, [outcome("p1", "unsupported", [id])], [], sources);
  recordOutcomes(f.review, [outcome("p2")], [], { sessions: [] });
  assert.throws(() => recordOutcomes(f.review, [outcome("p3", "unsupported", ["invented"])], [], sources), /incomplete/);
});

test("search coverage cannot skip pages or hide an unfinished broad search", (t) => {
  const f = fixture(t);
  const id = recordSearch(f.review, { query: "API" }, { nextOffset: 20 });
  assert.throws(() => recordOutcomes(f.review, [outcome("p1", "unsupported", [id])], [], sources), /remaining pages/);
  recordSearch(f.review, { query: "API", offset: 40 }, { nextOffset: null });
  assert.equal(resolvedSearch(f.review, f.review.searches[0]), false);
  recordSearch(f.review, { query: "API", offset: 20 }, { nextOffset: 40 });
  assert.equal(resolvedSearch(f.review, f.review.searches[0]), true);
  complete(f);
  recordSearch(f.review, { query: "unfinished" }, { nextOffset: 20 });
  assert.throws(() => validateReview(f.review, f.manifest, f.candidate, [], sources), /incomplete/);
});

test("a completed narrower search preserves the term and session scope", (t) => {
  const f = fixture(t);
  recordSearch(f.review, { query: "API", sessionId: "session" }, { nextOffset: 20 });
  recordSearch(f.review, { query: "other" }, { nextOffset: null });
  recordSearch(f.review, { query: "API port", sessionId: "elsewhere" }, { nextOffset: null });
  recordSearch(f.review, { query: "API port" }, { nextOffset: null });
  assert.equal(resolvedSearch(f.review, f.review.searches[0]), false);
  recordSearch(f.review, { query: "API port", sessionId: "session" }, { nextOffset: 20 });
  assert.equal(resolvedSearch(f.review, f.review.searches[0]), false);
  recordSearch(f.review, { query: "API port", sessionId: "session", offset: 20 }, { nextOffset: null });
  assert.equal(resolvedSearch(f.review, f.review.searches[0]), true);
  assert.match(reviewReport(f.review, f.candidate), /API \(narrowed\)/);
});

test("unread files and missing or stale combined comparisons prevent completion", (t) => {
  const f = fixture(t);
  complete(f);
  f.review.readPaths.pop();
  assert.throws(() => validateReview(f.review, f.manifest, f.candidate, [], sources), /incomplete/);
  f.review.readPaths.push("two.md");
  writeFileSync(join(f.candidate, "two.md"), "---\ndescription: Two.\n---\n\nPort 9090.\n");
  assert.throws(() => validateReview(f.review, f.manifest, f.candidate, [], sources), /incomplete/);
  finishReview(f.review, "Compared both files again after the edit.", f.candidate);
  assert.equal(validateReview(f.review, f.manifest, f.candidate, [], sources).complete, true);
  rmSync(join(f.candidate, "two.md"));
  assert.throws(() => validateReview(f.review, f.manifest, f.candidate, [], sources), /incomplete/);
  finishReview(f.review, "Compared both files again after removal of duplicate content.", f.candidate);
  assert.equal(validateReview(f.review, f.manifest, f.candidate, [], sources).complete, true);
});

test("changed review inputs, invented passages, and empty explanations are rejected", (t) => {
  const f = fixture(t);
  complete(f);
  assert.throws(() => recordOutcomes(f.review, [outcome("invented", "nonfactual")], [], sources), /does not exist/);
  assert.throws(() => recordOutcomes(f.review, [{ ...outcome("p1", "nonfactual"), reason: " " }], [], sources), /explanation/);
  assert.throws(() => recordOutcomes(f.review, [outcome("p1", "unchecked")], [], sources), /invalid/);
  assert.throws(() => finishReview(f.review, "", f.candidate), /explanation/);
  assert.throws(() => validateReview(f.review, { ...f.manifest, sourcesHash: "changed" }, f.candidate, [], sources), /inputs changed/);
  writeFileSync(join(f.root, "one.md"), "---\ndescription: One.\n---\n\nChanged baseline.\n");
  assert.throws(() => validateReview(f.review, f.manifest, f.candidate, [], sources), /inputs changed/);
});

test("continuations keep the full selection and bound repeated stops without progress", (t) => {
  const f = fixture(t);
  const state = {};
  const prior = { type: "custom", customType: "test", data: {} };
  for (let count = 0; count < 3; count += 1) {
    const next = reviewContinuation(f.review, f.candidate, state, [prior]);
    assert.equal(next.continue, true);
    assert.equal(next.entries[0], prior);
    assert.match(next.entries[1].content, /all selected files/);
    assert.match(next.entries[1].content, new RegExp(`no-progress continuation ${count + 1} of 3`));
  }
  assert.equal(reviewContinuation(f.review, f.candidate, state, []), undefined);
  complete(f);
  assert.equal(reviewContinuation(f.review, f.candidate, {}, []), undefined);
});

test("new work permits more than three continuations and resets the stall count", (t) => {
  const f = fixture(t);
  const state = {};
  for (let page = 0; page < 8; page += 1) {
    recordSearch(f.review, { query: "API", offset: page * 20 }, { nextOffset: (page + 1) * 20 });
    const next = reviewContinuation(f.review, f.candidate, state, []);
    assert.equal(next.continue, true);
    assert.equal(state.stalled, 0);
  }
  for (let count = 0; count < 3; count += 1) assert.equal(reviewContinuation(f.review, f.candidate, state, []).continue, true);
  recordOutcomes(f.review, [outcome("p1")], [], { sessions: [] });
  assert.equal(reviewContinuation(f.review, f.candidate, state, []).continue, true);
  assert.equal(state.stalled, 0);
  for (let count = 0; count < 3; count += 1) assert.equal(reviewContinuation(f.review, f.candidate, state, []).continue, true);
  assert.equal(reviewContinuation(f.review, f.candidate, state, []), undefined);
});

test("repeated records, file reads, searches, and source reads are not new work", (t) => {
  const f = fixture(t);
  const state = {};
  const repeat = () => {
    recordOutcomes(f.review, [outcome("p1")], [], { sessions: [] });
    f.review.readPaths.push("one.md");
    recordSearch(f.review, { query: "API" }, { nextOffset: null });
    recordSourceRead(f.review, readSource(sources, { sessionId: "session", entryId: "user" }));
  };
  repeat();
  assert.equal(reviewContinuation(f.review, f.candidate, state, []).continue, true);
  for (let count = 0; count < 3; count += 1) {
    repeat();
    assert.equal(reviewContinuation(f.review, f.candidate, state, []).continue, true);
    assert.equal(state.stalled, count + 1);
  }
  repeat();
  assert.equal(reviewContinuation(f.review, f.candidate, state, []), undefined);
});

test("removing and restoring coverage does not reset the stall count", (t) => {
  const f = fixture(t);
  const state = {};
  recordOutcomes(f.review, [outcome("p1")], [], { sessions: [] });
  reviewContinuation(f.review, f.candidate, state, []);
  delete f.review.outcomes.p1;
  reviewContinuation(f.review, f.candidate, state, []);
  recordOutcomes(f.review, [outcome("p1")], [], { sessions: [] });
  reviewContinuation(f.review, f.candidate, state, []);
  assert.equal(state.stalled, 2);
});

test("selected-file reads and new source ranges count as progress", (t) => {
  const f = fixture(t);
  const state = {};
  reviewContinuation(f.review, f.candidate, state, []);
  f.review.readPaths.push("one.md");
  reviewContinuation(f.review, f.candidate, state, []);
  assert.equal(state.stalled, 0);
  reviewContinuation(f.review, f.candidate, state, []);
  recordSourceRead(f.review, readSource(sources, { sessionId: "session", entryId: "user", limit: 5 }));
  reviewContinuation(f.review, f.candidate, state, []);
  assert.equal(state.stalled, 0);
  recordSourceRead(f.review, readSource(sources, { sessionId: "session", entryId: "user", offset: 5 }));
  reviewContinuation(f.review, f.candidate, state, []);
  assert.equal(state.stalled, 0);
});


test("headings and code remain in the coverage inventory", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.root, "one.md"), "---\ndescription: One.\n---\n\n# The API uses port 8080\n\n```sh\necho example\n```\n");
  const review = createReview(f.manifest);
  assert.equal(review.files[0].passages.length, 2);
  assert.match(review.files[0].passages[0].text, /port 8080/);
  assert.match(review.files[0].passages[1].text, /echo example/);
});


test("missing evidence cannot ignore matching sources", (t) => {
  const f = fixture(t);
  const input = { query: "short replies" };
  const id = recordSearch(f.review, input, searchSources(sources, input));
  assert.throws(() => recordOutcomes(f.review, [outcome("p1", "unsupported", [id])], [], sources), /Read the matching source/);
  recordSourceRead(f.review, readSource(sources, { sessionId: "session", entryId: "user", limit: 5 }));
  assert.throws(() => recordOutcomes(f.review, [outcome("p1", "unsupported", [id])], [], sources), /Read the matching source/);
  recordSourceRead(f.review, readSource(sources, { sessionId: "session", entryId: "user" }));
  recordOutcomes(f.review, [outcome("p1", "unsupported", [id])], [], sources);
  assert.equal(f.review.outcomes.p1.outcome, "unsupported");
});


test("large reviews return compact counts and bounded pages without losing text", (t) => {
  const f = fixture(t);
  const paragraphs = Array.from({ length: 262 }, (_, i) => `Passage ${i}: ${"evidence ".repeat(i === 0 ? 3000 : 60)}`.trim());
  writeFileSync(join(f.root, "one.md"), "---\ndescription: Many passages.\n---\n\n" + paragraphs.join("\n\n"));
  const review = createReview(f.manifest);
  assert.equal(reviewProgress(review, f.candidate).totalPassages, 263);
  for (const action of ["record", "finish"]) {
    const response = reviewResponse(review, f.candidate, { action });
    assert.equal(response.pendingPassages, 263);
    assert.equal(response.complete, false);
    assert.equal(response.pending, undefined);
    assert.equal(response.openSearches, undefined);
    assert.ok(JSON.stringify(response).length < 512);
  }
  let cursor;
  const seen = new Map();
  let pages = 0;
  do {
    const response = reviewResponse(review, f.candidate, { action: "status", cursor });
    assert.ok(response.pending.length <= 10);
    assert.ok(response.pending.reduce((sum, item) => sum + item.text.length, 0) <= 8000);
    assert.ok(JSON.stringify(response).length < 12000);
    for (const item of response.pending) {
      const prior = seen.get(item.id) ?? "";
      assert.equal(item.offset, prior.length);
      seen.set(item.id, prior + item.text);
    }
    cursor = response.nextCursor;
    assert.ok(++pages < 100);
  } while (cursor);
  for (const file of review.files) for (const passage of file.passages) assert.equal(seen.get(passage.id), passage.text);
  assert.equal(seen.size, 263);
});

test("original passage cursors stay valid when earlier outcomes are recorded", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.root, "one.md"), "---\ndescription: Many passages.\n---\n\n" + Array.from({ length: 25 }, (_, i) => `Claim ${i}.`).join("\n\n"));
  const review = createReview(f.manifest);
  const first = reviewResponse(review, f.candidate, { action: "status" });
  assert.equal(first.pending.length, 10);
  recordOutcomes(review, first.pending.map((item) => outcome(item.id)), [], { sessions: [] });
  const second = reviewResponse(review, f.candidate, { action: "status", cursor: first.nextCursor });
  assert.equal(second.pending[0].id, "p11");
  assert.equal(second.pending[0].text, "Claim 10.");
  assert.equal(reviewResponse(review, f.candidate, { action: "status" }).pending[0].id, "p11");
});

test("open searches have bounded summaries and stable pages without source matches", (t) => {
  const f = fixture(t);
  for (let index = 0; index < 25; index += 1) {
    recordSearch(f.review, { query: `query ${index}` }, { nextOffset: 20,
      matches: [{ sessionId: "session", entryId: "user", offset: 0, excerpt: "source text" }] });
  }
  const first = reviewResponse(f.review, f.candidate, { action: "status" });
  assert.equal(first.openSearches.length, 10);
  assert.equal(first.openSearchCount, 25);
  assert.equal(first.nextSearchOffset, 10);
  assert.equal(first.openSearches[0].nextOffset, 20);
  assert.equal(first.openSearches[0].pages, undefined);
  recordSearch(f.review, { query: "query 0", offset: 20 }, { nextOffset: null });
  const second = reviewResponse(f.review, f.candidate, { action: "status", searchOffset: first.nextSearchOffset });
  assert.equal(second.openSearches[0].id, "q11");
  const last = reviewResponse(f.review, f.candidate, { action: "status", searchOffset: second.nextSearchOffset });
  assert.equal(last.openSearches.length, 5);
  assert.equal(last.nextSearchOffset, null);
});

test("review paging rejects invalid cursors and accepts the exact end", (t) => {
  const f = fixture(t);
  for (const cursor of [{ passage: -1, offset: 0 }, { passage: 4, offset: 0 }, { passage: 0, offset: -1 },
    { passage: 0, offset: 999 }, { passage: 0.5, offset: 0 }, { passage: 0, offset: NaN }]) {
    assert.throws(() => reviewResponse(f.review, f.candidate, { action: "status", cursor }), /cursor is invalid/);
  }
  for (const searchOffset of [-1, 0.5, 1, NaN]) {
    assert.throws(() => reviewResponse(f.review, f.candidate, { action: "status", searchOffset }), /cursor is invalid/);
  }
  const end = reviewResponse(f.review, f.candidate, { action: "status", cursor: { passage: 3, offset: 0 } });
  assert.deepEqual(end.pending, []);
  assert.equal(end.nextCursor, null);
});


test("saved outcome history is bounded and preserves full records across pages", (t) => {
  const f = fixture(t);
  recordOutcomes(f.review, [outcome("p1", "nonfactual"), outcome("p3", "nonfactual")], [], sources);
  f.review.outcomes.p1.reason = "x".repeat(4000);
  f.review.outcomes.p3.reason = "y".repeat(4000);
  const seen = new Map();
  let cursor;
  do {
    const page = reviewResponse(f.review, f.candidate, { action: "history", cursor });
    assert.equal(page.pending, undefined);
    assert.ok(page.recorded.reduce((size, item) => size + item.text.length, 0) <= 8000);
    for (const item of page.recorded) {
      const previous = seen.get(item.id) ?? "";
      assert.equal(item.offset, previous.length);
      seen.set(item.id, previous + item.text);
    }
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual([...seen.keys()], ["p1", "p3"]);
  for (const [id, text] of seen) assert.deepEqual(JSON.parse(text), f.review.outcomes[id]);
  assert.equal(reviewResponse(f.review, f.candidate, { action: "status" }).pending[0].id, "p2");
});

test("partial state validates independently of completion and replays source receipts", (t) => {
  const f = fixture(t);
  recordSourceRead(f.review, readSource(sources, { sessionId: "session", entryId: "user" }));
  const input = { query: "short" };
  recordSearch(f.review, input, searchSources(sources, input));
  recordOutcomes(f.review, [outcome("p1", "supported", ["q1"], ["f1"])], [finding], sources);
  validateReviewState(f.review, f.manifest, [finding], sources);
  validateReviewReceipts(f.review, sources);
  assert.throws(() => validateReview(f.review, f.manifest, f.candidate, [finding], sources), /incomplete/);
  f.review.searches[0].pages[0].matches = [];
  assert.throws(() => validateReviewReceipts(f.review, sources), /searches changed/);
});

test("an explicitly closed unused search no longer blocks combined completion", (t) => {
  const f = fixture(t);
  complete(f);
  const id = recordSearch(f.review, { query: "exploratory" }, { nextOffset: 20 });
  assert.throws(() => finishReview(f.review, "Compared all selected files.", f.candidate), /incomplete/);
  closeSearches(f.review, [{ id, reason: "Discarded this broad query. The outcomes use other evidence." }]);
  assert.equal(f.review.comparison, undefined);
  assert.equal(resolvedSearch(f.review, f.review.searches.find((search) => search.id === id)), false);
  const response = reviewResponse(f.review, f.candidate, { action: "close_searches" });
  assert.equal(response.closedSearchCount, 1);
  assert.equal(response.openSearchCount, 0);
  assert.equal(response.pending, undefined);
  assert.ok(JSON.stringify(response).length < 512);
  assert.match(reviewReport(f.review, f.candidate), /Unused searches closed without evidence/);
  assert.match(reviewReport(f.review, f.candidate), /Discarded this broad query/);
  assert.doesNotThrow(() => finishReview(f.review, "Compared all selected files with the unused search excluded.", f.candidate));
  assert.equal(validateReview(f.review, f.manifest, f.candidate, [], sources).complete, true);
});


test("closed searches cannot establish evidence or complete another search", (t) => {
  const f = fixture(t);
  const id = recordSearch(f.review, { query: "API" }, { nextOffset: 20 });
  closeSearches(f.review, [{ id, reason: "Unused exploratory query." }]);
  recordSourceRead(f.review, readSource(sources, { sessionId: "session", entryId: "user" }));
  for (const kind of ["supported", "corrected", "unsupported", "nonfactual"]) {
    assert.throws(() => recordOutcomes(f.review, [outcome("p1", kind, [id], ["f1"])], [finding], sources), /incomplete/);
  }
  assert.throws(() => recordOutcomes(f.review, [outcome("p1")], [], sources), /completed source search/);
  assert.throws(() => finishReview(f.review, "Still unchecked.", f.candidate), /incomplete/);
  recordSearch(f.review, { query: "AP" }, { nextOffset: 20 });
  assert.equal(resolvedSearch(f.review, f.review.searches[1]), false);
  f.review.searches[0].pages[0].nextOffset = null;
  assert.equal(resolvedSearch(f.review, f.review.searches[1]), false, "forged completed closures cannot resolve another search");
  assert.throws(() => validateReviewState(f.review, f.manifest, [], sources), /Completed search/);
});

test("closure rejects cited and completed searches and validates the whole batch first", (t) => {
  const f = fixture(t);
  complete(f);
  const id = recordSearch(f.review, { query: "exploratory" }, { nextOffset: 20 });
  const valid = { id, reason: "Not needed for any passage." };
  for (const closures of [[], null, Array(21).fill(valid), [valid, valid], [valid, { id: "unknown", reason: "Unused." }],
    [valid, { id: "q1", reason: "Used evidence." }], [{ id, reason: " " }], [{ id, reason: "x".repeat(4001) }], [null]]) {
    const before = JSON.stringify(f.review);
    assert.throws(() => closeSearches(f.review, closures));
    assert.equal(JSON.stringify(f.review), before);
  }
  recordSearch(f.review, { query: "API" }, { nextOffset: 20 });
  recordSearch(f.review, { query: "API port" }, { nextOffset: null });
  recordOutcomes(f.review, [outcome("p1", "unsupported", ["q3"])], [], sources);
  assert.throws(() => closeSearches(f.review, [{ id: "q3", reason: "Cited broad search." }]), /used by a review outcome/);
  assert.throws(() => closeSearches(f.review, [{ id: "q4", reason: "Required narrower search." }]), /already complete/);
  delete f.review.outcomes.p1;
  assert.throws(() => closeSearches(f.review, [{ id: "q3", reason: "Already narrowed." }]), /already complete or narrowed/);
});

test("a new source search reopens a closure and invalidates the final comparison", (t) => {
  const f = fixture(t);
  complete(f);
  const input = { query: "exploratory", sessionId: "session" };
  const id = recordSearch(f.review, input, { nextOffset: 20 });
  const closure = { id, reason: "Unused query." };
  closeSearches(f.review, [closure]);
  finishReview(f.review, "Compared all selected files.", f.candidate);
  const before = JSON.stringify(f.review);
  closeSearches(f.review, [closure]);
  assert.equal(JSON.stringify(f.review), before, "identical closure is a no-op");
  assert.equal(recordSearch(f.review, input, { nextOffset: 20 }), id);
  assert.equal(f.review.searches.find((search) => search.id === id).closedReason, undefined);
  assert.equal(f.review.comparison, undefined);
  assert.equal(f.review.finalHashes, undefined);
  assert.equal(reviewProgress(f.review, f.candidate).openSearches.length, 1);
  recordSearch(f.review, { ...input, offset: 20 }, { nextOffset: null });
  recordOutcomes(f.review, [outcome("p1", "unsupported", [id])], [], sources);
  finishReview(f.review, "Compared all selected files after the reopened search.", f.candidate);
  assert.equal(validateReview(f.review, f.manifest, f.candidate, [], sources).complete, true);
});

test("receipt replay preserves valid closures and rejects damaged closure records", (t) => {
  const f = fixture(t);
  const many = { sessions: [{ sessionId: "session", entries: Array.from({ length: 21 }, (_, index) => ({
    entryId: String(index), role: "user", text: "exploratory match",
  })) }] };
  const input = { query: "exploratory" };
  const id = recordSearch(f.review, input, searchSources(many, input));
  closeSearches(f.review, [{ id, reason: "Unrelated exploratory results." }]);
  validateReviewState(f.review, f.manifest, [], many);
  validateReviewReceipts(f.review, many);
  const original = JSON.stringify(f.review);
  for (const corrupt of ["reason", "matches", "cited", "extra"]) {
    const review = JSON.parse(original);
    if (corrupt === "reason") review.searches[0].closedReason = " ";
    if (corrupt === "matches") review.searches[0].pages[0].matches = [];
    if (corrupt === "cited") review.outcomes.p1 = outcome("p1", "unsupported", [id]);
    if (corrupt === "extra") review.searches[0].unexpected = true;
    assert.throws(() => validateReviewReceipts(review, many), /explanation|searches changed|used by a review outcome/, corrupt);
  }
});

test("closures preserve search cursors and repeated closures do not reset stalls", (t) => {
  const f = fixture(t);
  for (let i = 0; i < 25; i += 1) recordSearch(f.review, { query: `query-${i}` }, { nextOffset: 20 });
  const first = reviewResponse(f.review, f.candidate, { action: "status" });
  closeSearches(f.review, first.openSearches.map((search) => ({ id: search.id, reason: "Unused query." })));
  const second = reviewResponse(f.review, f.candidate, { action: "status", searchOffset: first.nextSearchOffset });
  assert.equal(second.openSearches[0].id, "q11");
  assert.equal(second.closedSearchCount, 10);
  assert.equal(second.openSearchCount, 15);
  const state = {};
  reviewContinuation(f.review, f.candidate, state, []);
  reviewContinuation(f.review, f.candidate, state, []);
  closeSearches(f.review, [{ id: "q11", reason: "Unused query." }]);
  reviewContinuation(f.review, f.candidate, state, []);
  assert.equal(state.stalled, 0);
  for (let i = 0; i < 3; i += 1) {
    closeSearches(f.review, [{ id: "q11", reason: "Unused query." }]);
    assert.equal(reviewContinuation(f.review, f.candidate, state, []).continue, true);
    assert.equal(state.stalled, i + 1);
  }
  recordSearch(f.review, { query: "query-10" }, { nextOffset: 20 });
  closeSearches(f.review, [{ id: "q11", reason: "Unused query again." }]);
  assert.equal(reviewContinuation(f.review, f.candidate, state, []), undefined);
});
