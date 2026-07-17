import type { PublicInfo } from "@/types/node";

type MetricHistoryKind = "load" | "ping";

const toNonNegativeNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function resolveMetricRetentionHours(
  publicSettings: PublicInfo | null | undefined,
  kind: MetricHistoryKind,
  defaultHours = 24
): number {
  const specificDays = toNonNegativeNumber(
    kind === "load"
      ? publicSettings?.load_metric_retention_days
      : publicSettings?.ping_metric_retention_days
  );
  if (specificDays !== null) return specificDays * 24;

  const legacyDays = toNonNegativeNumber(
    publicSettings?.metric_retention_days
  );
  if (legacyDays !== null) return legacyDays * 24;

  const legacyHours = toNonNegativeNumber(
    kind === "load"
      ? publicSettings?.record_preserve_time
      : publicSettings?.ping_record_preserve_time
  );
  return legacyHours ?? defaultHours;
}

export function limitMetricRetentionHours(
  hours: number,
  isAuthenticated: boolean
): number {
  return isAuthenticated ? hours : Math.min(hours, 24);
}
