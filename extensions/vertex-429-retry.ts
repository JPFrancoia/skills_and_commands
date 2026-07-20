import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Vertex/Google return HTTP 429 for transient per-minute throttles with the text
// "Quota exceeded ... RESOURCE_EXHAUSTED". Pi's retry classifier treats any
// "quota exceeded"/"billing" text as NON-retryable and stops instantly, so these
// recoverable throttles never hit the backoff loop. This rewrites the errorMessage
// so pi's retry pattern ("429"/"rate limit") matches and auto-retry kicks in.
//
// ponytail: scoped to transient per-minute/per-model throttles. A genuine daily or
// account quota (no "per_minute"/"per_base_model") is left non-retryable on purpose.
const VERTEX_TRANSIENT_429 =
  /\b429\b|RESOURCE_EXHAUSTED/i;
const TRANSIENT_HINT =
  /per_minute|per_base_model|requests_per|tokens_per/i;

export default function (pi: ExtensionAPI) {
  pi.on("message_end", (event, ctx) => {
    const message = event.message;
    if (message.role !== "assistant") return;
    if (message.stopReason !== "error") return;

    const provider = (message as any).provider ?? ctx.model?.provider ?? "";
    if (!provider.includes("vertex")) return;

    const errorMessage = message.errorMessage ?? "";
    if (errorMessage.includes("[retryable-throttle]")) return; // idempotent
    if (!VERTEX_TRANSIENT_429.test(errorMessage)) return;
    if (!TRANSIENT_HINT.test(errorMessage)) return; // skip hard/daily quotas

    // Strip the words that force pi's non-retryable classification, tag as 429.
    const rewritten =
      "[retryable-throttle] rate limit 429: " +
      errorMessage
        .replace(/quota exceeded/gi, "rate limited")
        .replace(/billing/gi, "throttle");

    return { message: { ...message, errorMessage: rewritten } };
  });
}
