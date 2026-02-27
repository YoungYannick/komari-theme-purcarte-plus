/**
 * 将 komari-theme.json 中的 i18n 对象解析为当前语言的字符串。
 * 支持两种格式：
 *  - 纯字符串：直接返回
 *  - 多语言对象：{ "zh-CN": "...", "zh-TW": "...", "en": "...", "ja": "..." }
 *
 * 解析优先级：精确匹配 → 语言前缀匹配 → en 回退 → 对象第一个值
 */
export function resolveI18n(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, string>;
    const lang = navigator.language; // e.g. "zh-CN"
    if (record[lang]) return record[lang];
    const prefix = lang.split("-")[0]; // e.g. "zh"
    const fallbackKey = Object.keys(record).find((k) => k.startsWith(prefix));
    if (fallbackKey) return record[fallbackKey];
    if (record["en"]) return record["en"];
    const first = Object.values(record)[0];
    if (typeof first === "string") return first;
  }
  return String(value ?? "");
}
