import type {
  QuotasResult,
  SupportedQuotaProvider,
} from "../../types/quotas.js";

export type QuotaSnapshot = {
  provider: SupportedQuotaProvider;
  result: QuotasResult;
};

export function filterDashboardSnapshots<T extends QuotaSnapshot>(
  snapshots: T[],
): T[] {
  return snapshots.filter(({ result }) => {
    if (result.success) return result.data.windows.length > 0;
    return !["config", "not_applicable"].includes(result.error.kind);
  });
}
