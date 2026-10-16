/**
 * OpenCode Go client.
 *
 * Fetches usage data from OpenCode Go dashboard using workspace ID and auth cookie.
 * Scrapes SolidJS SSR hydration output for usage windows.
 *
 * Configuration:
 * - Environment: OPENCODE_GO_WORKSPACE_ID + OPENCODE_GO_AUTH_COOKIE
 * - Config file: ~/.config/opencode/opencode-quota/opencode-go.json
 */

const DASHBOARD_URL_PREFIX = "https://opencode.ai/workspace/";
const DASHBOARD_URL_SUFFIX = "/go";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/148.0";
const REQUEST_TIMEOUT_MS = 10_000;

const SCRAPED_NUMBER_PATTERN = String.raw`(-?\d+(?:\.\d+)?)`;

const RE_ROLLING_PCT_FIRST = new RegExp(
  String.raw`rollingUsage:\$R\[\d+\]=\{[^}]*usagePercent:${SCRAPED_NUMBER_PATTERN}[^}]*resetInSec:${SCRAPED_NUMBER_PATTERN}[^}]*\}`,
);
const RE_ROLLING_RESET_FIRST = new RegExp(
  String.raw`rollingUsage:\$R\[\d+\]=\{[^}]*resetInSec:${SCRAPED_NUMBER_PATTERN}[^}]*usagePercent:${SCRAPED_NUMBER_PATTERN}[^}]*\}`,
);

const RE_WEEKLY_PCT_FIRST = new RegExp(
  String.raw`weeklyUsage:\$R\[\d+\]=\{[^}]*usagePercent:${SCRAPED_NUMBER_PATTERN}[^}]*resetInSec:${SCRAPED_NUMBER_PATTERN}[^}]*\}`,
);
const RE_WEEKLY_RESET_FIRST = new RegExp(
  String.raw`weeklyUsage:\$R\[\d+\]=\{[^}]*resetInSec:${SCRAPED_NUMBER_PATTERN}[^}]*usagePercent:${SCRAPED_NUMBER_PATTERN}[^}]*\}`,
);

const RE_MONTHLY_PCT_FIRST = new RegExp(
  String.raw`monthlyUsage:\$R\[\d+\]=\{[^}]*usagePercent:${SCRAPED_NUMBER_PATTERN}[^}]*resetInSec:${SCRAPED_NUMBER_PATTERN}[^}]*\}`,
);
const RE_MONTHLY_RESET_FIRST = new RegExp(
  String.raw`monthlyUsage:\$R\[\d+\]=\{[^}]*resetInSec:${SCRAPED_NUMBER_PATTERN}[^}]*usagePercent:${SCRAPED_NUMBER_PATTERN}[^}]*\}`,
);

interface ScrapedWindowUsage {
  usagePercent: number;
  resetInSec: number;
}

export interface OpenCodeGoWindow {
  usagePercent: number;
  resetInSec: number;
  percentRemaining: number;
  resetTimeIso: string;
}

export interface OpenCodeGoQuotaResult {
  success: true;
  rolling?: OpenCodeGoWindow;
  weekly?: OpenCodeGoWindow;
  monthly?: OpenCodeGoWindow;
}

export interface OpenCodeGoQuotaError {
  success: false;
  error: string;
}

export type OpenCodeGoResult = OpenCodeGoQuotaResult | OpenCodeGoQuotaError;

export interface OpenCodeGoConfig {
  workspaceId: string;
  authCookie: string;
}

function parseWindowUsage(
  html: string,
  rePctFirst: RegExp,
  reResetFirst: RegExp,
): ScrapedWindowUsage | null {
  const pctFirstMatch = rePctFirst.exec(html);
  if (pctFirstMatch) {
    const usagePercent = Number(pctFirstMatch[1]);
    const resetInSec = Number(pctFirstMatch[2]);
    if (Number.isFinite(usagePercent) && Number.isFinite(resetInSec)) {
      return { usagePercent, resetInSec };
    }
  }

  const resetFirstMatch = reResetFirst.exec(html);
  if (resetFirstMatch) {
    const resetInSec = Number(resetFirstMatch[1]);
    const usagePercent = Number(resetFirstMatch[2]);
    if (Number.isFinite(usagePercent) && Number.isFinite(resetInSec)) {
      return { usagePercent, resetInSec };
    }
  }

  return null;
}

function normalizeWindowUsage(
  window: ScrapedWindowUsage,
  now: number,
): OpenCodeGoWindow {
  const usagePercent = Math.max(0, window.usagePercent);
  const resetInSec = Math.max(0, window.resetInSec);
  return {
    usagePercent,
    resetInSec,
    percentRemaining: 100 - usagePercent,
    resetTimeIso: new Date(now + resetInSec * 1000).toISOString(),
  };
}

export async function queryOpenCodeGoQuota(
  config: OpenCodeGoConfig,
  signal?: AbortSignal,
): Promise<OpenCodeGoResult> {
  try {
    const url = `${DASHBOARD_URL_PREFIX}${encodeURIComponent(config.workspaceId)}${DASHBOARD_URL_SUFFIX}`;
    const signals: AbortSignal[] = [AbortSignal.timeout(REQUEST_TIMEOUT_MS)];
    if (signal) signals.push(signal);
    const combined = AbortSignal.any(signals);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
        Cookie: `auth=${config.authCookie}`,
      },
      signal: combined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        success: false,
        error: `OpenCode Go dashboard error ${response.status}: ${text.slice(0, 120)}`,
      };
    }

    const html = await response.text();
    const rolling = parseWindowUsage(
      html,
      RE_ROLLING_PCT_FIRST,
      RE_ROLLING_RESET_FIRST,
    );
    const weekly = parseWindowUsage(
      html,
      RE_WEEKLY_PCT_FIRST,
      RE_WEEKLY_RESET_FIRST,
    );
    const monthly = parseWindowUsage(
      html,
      RE_MONTHLY_PCT_FIRST,
      RE_MONTHLY_RESET_FIRST,
    );

    if (!rolling && !weekly && !monthly) {
      return {
        success: false,
        error: "Could not parse OpenCode Go dashboard usage windows",
      };
    }

    const now = Date.now();
    return {
      success: true,
      ...(rolling ? { rolling: normalizeWindowUsage(rolling, now) } : {}),
      ...(weekly ? { weekly: normalizeWindowUsage(weekly, now) } : {}),
      ...(monthly ? { monthly: normalizeWindowUsage(monthly, now) } : {}),
    };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { success: false, error: "Request timed out" };
    }
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, error: "Request cancelled" };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
