import { DEFAULT_FREE_TAG } from "@/config/default";

export function parseDelimitedTags(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(";")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function hasDelimitedTag(value: string | undefined | null, target: string): boolean {
  const normalizedTarget = target.trim();
  if (!normalizedTarget) return false;
  return parseDelimitedTags(value).includes(normalizedTarget);
}

export function normalizeFreeTag(value?: string | null): string {
  return value?.trim() || DEFAULT_FREE_TAG;
}
