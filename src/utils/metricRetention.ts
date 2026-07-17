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

export function buildMetricRangeHours(
  maxRetentionHours: number,
  includeLive = false
): number[] {
  const maxHours = toNonNegativeNumber(maxRetentionHours) ?? 0;
  const ranges = includeLive ? [0] : [];

  for (const hours of [1, 4, 24]) {
    if (hours <= maxHours) ranges.push(hours);
  }

  if (maxHours > 24) {
    const halfwayHours = Math.ceil(maxHours / 48) * 24;
    const rollupBoundaryHours = 14 * 24;
    const intermediateHours = Math.min(halfwayHours, rollupBoundaryHours);
    if (intermediateHours > 24 && intermediateHours < maxHours) {
      ranges.push(intermediateHours);
    }
    if (!ranges.includes(maxHours)) ranges.push(maxHours);
  }

  return ranges;
}

export function buildMetricQuickRangeDays(
  maxRetentionHours: number
): number[] {
  const maxHours = toNonNegativeNumber(maxRetentionHours) ?? 0;
  const wholeDayHours = Math.floor(maxHours / 24) * 24;

  return buildMetricRangeHours(wholeDayHours)
    .filter((hours) => hours >= 24 && hours % 24 === 0)
    .map((hours) => hours / 24);
}
