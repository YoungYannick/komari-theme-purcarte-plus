import type { NodeData } from "@/types/node.d";
import type { ExchangeRates } from "./useExchangeRates";

// 到期时间超过多少年视为无限期（按原价计算）
const LONG_TERM_YEARS = 100;

/**
 * 将货币符号或代码统一标准化为货币代码
 * 处理多字符符号（HK$、JP¥、NT$、S$、A$、C$、NZ$）和单字符符号（¥、$、€、£、₩、฿、₽、₹、₱、₫、₺）
 * 单独的 ¥ 默认视为 CNY（人民币），JPY 需要通过 "JP¥" 或 "JPY" 标识
 * 单独的 $ 默认视为 USD，其他美元需要前缀（HK$、S$、A$、C$、NZ$、NT$）
 */
export function normalizeCurrencyToCode(cur: string): string {
  const trimmed = cur.trim();
  const upper = trimmed.toUpperCase();
  // 标准三字母货币代码（直接返回）
  const KNOWN_CODES = [
    "CNY", "USD", "HKD", "EUR", "GBP", "JPY", "KRW", "THB", "RUB",
    "INR", "TWD", "SGD", "AUD", "CAD", "CHF", "SEK", "NZD", "MYR",
    "PHP", "VND", "BRL", "TRY", "ZAR", "AED", "SAR", "IDR", "PLN",
    "NOK", "DKK", "CZK", "HUF", "ILS", "MXN", "ARS", "CLP", "COP",
    "PEN", "BGN", "RON", "HRK", "ISK",
  ];
  if (KNOWN_CODES.includes(upper)) return upper;
  // 多字符符号（必须在单字符之前匹配）
  const MULTI_CHAR_MAP: Record<string, string> = {
    "HK$": "HKD", "JP¥": "JPY", "NT$": "TWD", "S$": "SGD",
    "A$": "AUD", "C$": "CAD", "NZ$": "NZD", "R$": "BRL",
    "RM": "MYR", "د.إ": "AED", "﷼": "SAR",
  };
  for (const [sym, code] of Object.entries(MULTI_CHAR_MAP)) {
    if (trimmed === sym) return code;
  }
  // 单字符符号
  const SINGLE_CHAR_MAP: Record<string, string> = {
    "¥": "CNY", "$": "USD", "€": "EUR", "£": "GBP",
    "₩": "KRW", "฿": "THB", "₽": "RUB", "₹": "INR",
    "₱": "PHP", "₫": "VND", "₺": "TRY",
  };
  if (SINGLE_CHAR_MAP[trimmed]) return SINGLE_CHAR_MAP[trimmed];
  return upper || "CNY"; // 未知货币返回原始大写，空值默认 CNY
}

/**
 * 将节点价格转换为当前基准货币（rates 的基准货币，即 rates 中值为 1 的那个）
 *
 * rates 由 useExchangeRates(baseCurrency) 返回，baseCurrency=1，
 * 其他货币的值表示 "1 baseCurrency = X otherCurrency"
 *
 * 节点价格 nodePrice 的货币为 nodeCode，要转换为 baseCurrency：
 *   priceInBase = nodePrice / rates[nodeCode]
 *
 * 例：baseCurrency=USD, rates.CNY=7.2, 节点 price=100 CNY
 *   → 100 / 7.2 = 13.89 USD ✓
 */
export function parsePriceToBase(
  node: NodeData,
  rates: ExchangeRates
): { price: number; isSpecialFree: boolean } {
  let price = parseFloat(String(node.price));
  let isSpecialFree = false;

  if (price === -1) {
    price = 0;
    isSpecialFree = true;
  } else if (isNaN(price)) {
    price = 0;
  }

  const cur = node.currency || "¥";
  const code = normalizeCurrencyToCode(cur);
  const rate = rates[code];

  // rate 存在且 > 0 时转换，否则原价返回（未知货币不转换）
  const finalPrice = rate && rate > 0 ? price / rate : price;

  return { price: finalPrice, isSpecialFree };
}

// 向后兼容别名
export const parsePriceToCNY = parsePriceToBase;

/**
 * 计算节点剩余价值（以 rates 基准货币计）
 */
export function calculateRemainingValue(
  node: NodeData,
  rates: ExchangeRates,
  date: Date = new Date()
): { remainingValue: number; isLongTerm: boolean } {
  if (!node.expired_at) return { remainingValue: 0, isLongTerm: false };

  const { price: priceBase } = parsePriceToBase(node, rates);

  // 一次性付费（billing_cycle = -1）视为长期机器，按原价计算
  if (node.billing_cycle === -1) {
    return { remainingValue: priceBase, isLongTerm: true };
  }

  const exp = new Date(node.expired_at);
  const nowUTC = new Date(date.toISOString());
  const diffMs = exp.getTime() - nowUTC.getTime();
  const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365);

  if (diffYears > LONG_TERM_YEARS) {
    return { remainingValue: priceBase, isLongTerm: true };
  }

  const billingCycleMs = node.billing_cycle * 24 * 60 * 60 * 1000;
  if (diffMs > 0 && billingCycleMs > 0) {
    return { remainingValue: priceBase * (diffMs / billingCycleMs), isLongTerm: false };
  }

  return { remainingValue: 0, isLongTerm: false };
}

/**
 * 计算月均支出（以 rates 基准货币计）
 */
export function calculateMonthlyExpense(
  priceBase: number,
  billingCycleDays: number
): number {
  if (billingCycleDays === -1) return 0;

  let cycleMonths = 1;
  if (billingCycleDays === 30) cycleMonths = 1;
  else if (billingCycleDays === 92) cycleMonths = 3;
  else if (billingCycleDays === 184) cycleMonths = 6;
  else if (billingCycleDays === 365) cycleMonths = 12;
  else if (billingCycleDays === 730) cycleMonths = 24;
  else if (billingCycleDays === 1095) cycleMonths = 36;
  else if (billingCycleDays === 1825) cycleMonths = 60;
  else if (billingCycleDays > 0) cycleMonths = billingCycleDays / 30;

  return cycleMonths > 0 ? priceBase / cycleMonths : 0;
}

/**
 * 根据选择的日期计算剩余价值（以 rates 基准货币计）
 */
export function calculateRemainValueForDate(
  node: NodeData,
  rates: ExchangeRates,
  selectedDateStr: string
): number {
  const now = new Date();
  const todayStr = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })
  )
    .toISOString()
    .split("T")[0];

  let calculationTime: Date;
  if (selectedDateStr === todayStr) {
    calculationTime = now;
  } else {
    calculationTime = new Date(selectedDateStr + "T00:00:00+08:00");
  }

  if (!node.expired_at) return 0;

  const { price: priceBase } = parsePriceToBase(node, rates);

  if (node.billing_cycle === -1) {
    return priceBase;
  }

  const exp = new Date(node.expired_at);
  const nowUTC = new Date(calculationTime.toISOString());
  const diffMs = exp.getTime() - nowUTC.getTime();
  const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365);

  if (diffYears > LONG_TERM_YEARS) {
    return priceBase;
  }

  const billingCycleMs = node.billing_cycle * 24 * 60 * 60 * 1000;
  if (diffMs > 0 && billingCycleMs > 0) {
    return priceBase * (diffMs / billingCycleMs);
  }

  return 0;
}

/**
 * 格式化字节
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * 格式化流量
 */
export function formatTraffic(bytes: number, t?: (key: string) => string): string {
  if (bytes === 362838837166080) return t ? t("enhanced.trade.trafficInfinite") : "∞TB/月";
  if (bytes === 0) return t ? t("enhanced.trade.trafficUnlimited") : "无限制";
  return formatBytes(bytes) + (t ? t("enhanced.trade.trafficPerMonth") : "/月");
}

/**
 * 计费周期文本
 */
export function getBillingCycleText(days: number, t?: (key: string, params?: Record<string, string | number>) => string): string {
  if (t) {
    const cycleMap: Record<string, string> = {
      "30": t("enhanced.trade.billingMonthly"),
      "92": t("enhanced.trade.billingQuarterly"),
      "184": t("enhanced.trade.billingSemiAnnual"),
      "365": t("enhanced.trade.billingYearly"),
      "730": t("enhanced.trade.billingBiennial"),
      "1095": t("enhanced.trade.billingTriennial"),
      "1825": t("enhanced.trade.billingQuinquennial"),
      "-1": t("enhanced.trade.billingOneTime"),
    };
    return cycleMap[String(days)] || t("enhanced.trade.billingDays", { days });
  }
  const cycleMap: Record<string, string> = {
    "30": "月付",
    "92": "季付",
    "184": "半年付",
    "365": "年付",
    "730": "两年付",
    "1095": "三年付",
    "1825": "五年付",
    "-1": "一次性",
  };
  return cycleMap[String(days)] || `${days}天`;
}
