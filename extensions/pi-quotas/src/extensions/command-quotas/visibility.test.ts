import { describe, expect, it } from "vitest";
import type {
  QuotasErrorKind,
  QuotasResult,
  SupportedQuotaProvider,
} from "../../types/quotas.js";
import { filterDashboardSnapshots } from "./visibility.js";

function success(
  provider: SupportedQuotaProvider,
  windowCount = 1,
): QuotasResult {
  return {
    success: true,
    data: {
      provider,
      windows: Array.from({ length: windowCount }, () => ({
        provider,
        label: "5h",
        usedPercent: 10,
        resetsAt: new Date("2026-08-27T12:00:00Z"),
        windowSeconds: 5 * 60 * 60,
        usedValue: 10,
        limitValue: 100,
      })),
    },
  };
}

function failure(message: string, kind: QuotasErrorKind): QuotasResult {
  return { success: false, error: { message, kind } };
}

describe("filterDashboardSnapshots", () => {
  it("keeps providers that returned quota windows", () => {
    const snapshots = [
      { provider: "openai-codex" as const, result: success("openai-codex") },
      { provider: "kimi-coding" as const, result: success("kimi-coding", 2) },
    ];

    expect(filterDashboardSnapshots(snapshots)).toEqual(snapshots);
  });

  it("hides unconfigured, non-applicable, and empty providers", () => {
    const snapshots = [
      {
        provider: "anthropic" as const,
        result: failure("No token", "config"),
      },
      {
        provider: "synthetic" as const,
        result: failure("Direct key", "not_applicable"),
      },
      {
        provider: "openrouter" as const,
        result: success("openrouter", 0),
      },
    ];

    expect(filterDashboardSnapshots(snapshots)).toEqual([]);
  });

  it.each<QuotasErrorKind>(["http", "network", "timeout", "cancelled"])(
    "keeps configured provider failures of kind %s",
    (kind) => {
      const snapshot = {
        provider: "openai-codex" as const,
        result: failure("temporary failure", kind),
      };

      expect(filterDashboardSnapshots([snapshot])).toEqual([snapshot]);
    },
  );
});
