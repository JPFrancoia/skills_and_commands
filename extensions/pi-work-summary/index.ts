import { randomUUID } from "node:crypto";
import * as core from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { installBridges, sharedState } from "./src/bridge.ts";
import { SUMMARY_LIMITS } from "./src/config.ts";
import { patchCore } from "./src/core-patch.ts";
import type { RunGrouping } from "./src/run-grouping.ts";
import { refreshMcpTools } from "./src/tools.ts";
import {
  cleanText, loadModel, publicText, recordModel, savedGroup, shortSummary, snapshot, summaryInput,
  SUMMARY_PROMPT, WorkGroups, type Message, type SavedGroup, type WorkGroup,
} from "./src/work-groups.ts";

const ENTRY = "pi-work-summary";

export function renderOrder(entries: readonly SessionEntry[]): string[] {
  const order: string[] = [];
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message.role === "user") {
      const text = typeof message.content === "string" ? message.content : message.content
        .filter((part) => part.type === "text").map((part) => part.text).join("\n");
      order.push(`user:${text}`);
    }
    if (message.role !== "assistant") continue;
    let run = 0;
    for (let index = 0; index < message.content.length; index++) {
      const part = message.content[index];
      if (part.type === "text" && part.text.trim()) order.push(`prose:t${message.timestamp}:${index}`);
      if (part.type === "thinking") {
        let nonempty = Boolean(part.thinking.trim());
        while (message.content[index + 1]?.type === "thinking") {
          index++;
          const next = message.content[index];
          nonempty = (next.type === "thinking" && Boolean(next.thinking.trim())) || nonempty;
        }
        if (nonempty) order.push(`think:t${message.timestamp}:${run++}`);
      }
    }
    // Pi replays the assistant component first, then its tool components in call order.
    for (const part of message.content) if (part.type === "toolCall") order.push(part.id);
  }
  return order;
}

function recentContext(ctx: ExtensionContext): string[] {
  const lines: string[] = [];
  for (const entry of ctx.sessionManager.buildContextEntries()) {
    if (entry.type === "compaction") lines.push(`Earlier context: ${cleanText(entry.summary)}`);
    if (entry.type !== "message") continue;
    if (entry.message.role !== "user" && entry.message.role !== "assistant") continue;
    const text = publicText(entry.message.content);
    if (text) lines.push(`${entry.message.role}: ${text}`);
  }
  return lines.slice(-6);
}

type Request = {
  controller?: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  lastStarted: number;
  input?: string;
};

export function attachWorkSummaries(pi: ExtensionAPI, grouping: RunGrouping, repaint: () => void): void {
  let ctx: ExtensionContext;
  let modelRef = loadModel();
  let epoch = 0;
  let tracker: WorkGroups;
  let warned = false;
  const requests = new Map<string, Request>();

  function cancelAll(): void {
    epoch++;
    for (const request of requests.values()) {
      clearTimeout(request.timer);
      request.controller?.abort();
    }
    requests.clear();
  }

  function warn(reason: string): void {
    if (warned) return;
    warned = true;
    ctx.ui.notify(`Work summary unavailable: ${cleanText(reason, 180)}`, "warning");
  }

  function requestSummary(group: WorkGroup, request: Request): void {
    const input = summaryInput(group);
    if (request.input === input) return;
    request.input = input;
    request.lastStarted = Date.now();
    request.controller?.abort();
    const controller = new AbortController();
    request.controller = controller;
    const requestEpoch = epoch;
    const requestContext = ctx;
    const model = ctx.modelRegistry.find(modelRef.provider, modelRef.id);
    if (!model || !ctx.modelRegistry.hasConfiguredAuth(model)) {
      warn(`model unavailable: ${modelRef.provider}/${modelRef.id}`);
      return;
    }

    void Promise.resolve().then(() => requestContext.modelRegistry.streamSimple(model, {
      systemPrompt: SUMMARY_PROMPT,
      messages: [{ role: "user", content: [{ type: "text", text: input }], timestamp: Date.now() }],
    }, {
      reasoning: "minimal", maxTokens: SUMMARY_LIMITS.outputTokens, maxRetries: 0,
      timeoutMs: SUMMARY_LIMITS.timeoutMs, cacheRetention: "none", sessionId: randomUUID(), signal: controller.signal,
    }).result()).then((response) => {
      if (epoch !== requestEpoch || controller.signal.aborted || request.controller !== controller) return;
      if (response.stopReason !== "stop") {
        warn("The model did not return a complete summary.");
        return;
      }
      const text = shortSummary(response.content);
      if (!text) { warn("The model returned an empty summary."); return; }
      group.summary = text;
      grouping.setWork(snapshot(group));
      repaint();
      if (group.endedAt !== undefined) pi.appendEntry(ENTRY, snapshot(group));
    }).catch((error: unknown) => {
      if (epoch === requestEpoch && !controller.signal.aborted) {
        warn(error instanceof Error ? error.message : String(error));
      }
    });
  }

  function changed(group: WorkGroup, final: boolean): void {
    grouping.setWork(snapshot(group));
    repaint();
    if (!ctx?.hasUI || ctx.mode !== "tui") return;
    if (group.endedAt !== undefined && !final) {
      const previous = requests.get(group.id);
      clearTimeout(previous?.timer);
      previous?.controller?.abort();
      return;
    }
    const request = requests.get(group.id) ?? { lastStarted: 0 };
    requests.set(group.id, request);
    clearTimeout(request.timer);
    if (final) {
      request.controller?.abort();
      // Save timing even when the model is unavailable or the session closes early.
      pi.appendEntry(ENTRY, snapshot(group));
      requestSummary(group, request);
    } else {
      const delay = Math.max(SUMMARY_LIMITS.debounceMs, SUMMARY_LIMITS.refreshMs - (Date.now() - request.lastStarted));
      request.timer = setTimeout(() => {
        request.timer = undefined;
        requestSummary(group, request);
      }, delay);
      request.timer.unref?.();
    }
  }

  function restore(_event: unknown, context: ExtensionContext): void {
    cancelAll();
    ctx = context;
    if (ctx.mode !== "tui") return;
    warned = false;
    modelRef = loadModel();
    tracker = new WorkGroups(changed);
    tracker.setContext(recentContext(ctx));
    const branch = ctx.sessionManager.getBranch();
    const order = renderOrder(branch);
    grouping.retain(order);
    const members = new Set(order);
    const restored = new Map<string, SavedGroup>();
    const restoredMembers = new Map<string, SavedGroup>();
    for (const entry of branch) {
      if (entry.type !== "custom" || entry.customType !== ENTRY) continue;
      const data = savedGroup(entry.data);
      if (!data || !data.memberIds.every((id) => members.has(id))) continue;
      restored.set(data.id, data);
    }
    for (const data of restored.values()) {
      if (!data.models) for (const id of data.memberIds) restoredMembers.set(id, data);
    }
    let activeGroup: SavedGroup | undefined;
    for (const entry of branch) {
      if (entry.type !== "message") continue;
      if (entry.message.role === "user") {
        activeGroup = undefined;
        continue;
      }
      if (entry.message.role !== "assistant") continue;
      const message = entry.message as Message;
      if (!Array.isArray(message.content)) continue;

      for (const block of message.content) {
        if (block.type === "text" && block.text.trim()) {
          if (activeGroup) recordModel(activeGroup, message);
          activeGroup = undefined;
        }
        if (block.type !== "toolCall" || !block.id) continue;
        activeGroup = restoredMembers.get(block.id);
        if (activeGroup) recordModel(activeGroup, message);
      }
    }
    for (const data of restored.values()) grouping.setWork(data);
    repaint();
  }

  pi.on("session_start", restore);
  pi.on("session_tree", restore);
  pi.on("before_agent_start", (_event, context) => {
    ctx = context;
    if (ctx.mode !== "tui") return;
    modelRef = loadModel();
    tracker = new WorkGroups(changed);
    tracker.setContext(recentContext(ctx));
  });
  pi.on("turn_start", (event) => tracker?.turnStarted(event.timestamp));
  pi.on("message_update", (event) => tracker?.message(event.message as Message, false, Date.now()));
  pi.on("message_end", (event) => tracker?.message(event.message as Message, true, Date.now()));
  pi.on("tool_execution_end", (event) => {
    tracker?.result(event.parentToolCallId ?? event.toolCallId, event.toolName, event.result.content, event.isError);
  });
  pi.on("turn_end", () => repaint());
  pi.on("agent_settled", (event) => tracker?.settle(Date.now(), event.aborted));
  pi.on("session_shutdown", () => cancelAll());
}

export default function piWorkSummary(pi: ExtensionAPI): void {
  const { config, grouping } = sharedState();
  let tui: { requestRender(): void } | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined;
  const repaint = () => tui?.requestRender();
  installBridges({ config, grouping, requestRender: repaint });
  patchCore(core);
  attachWorkSummaries(pi, grouping, repaint);

  pi.on("session_start", (_event, ctx) => {
    refreshMcpTools(pi.getAllTools());
    if (!ctx.hasUI || ctx.mode !== "tui") return;
    ctx.ui.setHiddenThinkingLabel("");
    ctx.ui.setWidget("pi-work-summary-repaint", (captured) => {
      tui = captured;
      return { render: () => [], invalidate() {} };
    }, { placement: "belowEditor" });
  });
  pi.on("agent_start", () => {
    grouping.agentStarted();
    clearInterval(ticker);
    if (!tui) return;
    ticker = setInterval(repaint, 1_000);
    ticker.unref?.();
  });
  pi.on("agent_settled", () => {
    grouping.agentSettled();
    clearInterval(ticker);
    repaint();
  });
  pi.on("session_shutdown", () => { clearInterval(ticker); tui = undefined; });
}
