import { useState, useEffect, useCallback, useRef } from "react";

export interface ExchangeRates {
  [key: string]: number;
}

const FALLBACK_RATES_CNY: ExchangeRates = {
  AUD: 0.21151,
  CAD: 0.20763,
  CHF: 0.1194,
  CNY: 1,
  EUR: 0.129,
  GBP: 0.10978,
  HKD: 1.1595,
  INR: 14.221,
  JPY: 23.98,
  KRW: 219.89,
  NZD: 0.25324,
  RUB: 11.4967,
  SGD: 0.19069,
  TWD: 4.7581,
  USD: 0.14775,
};

// 模块级缓存：按 baseCurrency 缓存
const cachedRatesMap = new Map<string, { rates: ExchangeRates; lastUpdated: string }>();
const fetchPromiseMap = new Map<string, Promise<{ rates: ExchangeRates; lastUpdated: string }>>();

const apis = [
  {
    id: "exchangerate-fun",
    ttl: 3600000,
    buildUrl: (base: string) => `https://api.exchangerate.fun/latest?base=${base}`,
    parse: (data: any): Record<string, number> | null => data.rates || null,
  },
  {
    id: "frankfurter",
    ttl: 3600000,
    buildUrl: (base: string) => `https://api.frankfurter.app/latest?from=${base}`,
    parse: (data: any): Record<string, number> | null => data.rates || null,
  },
  {
    id: "exchangerate-api_4",
    ttl: 900000,
    buildUrl: (base: string) => `https://api.exchangerate-api.com/v4/latest/${base}`,
    parse: (data: any): Record<string, number> | null => data.rates || null,
  },
];

async function fetchRatesForBase(baseCurrency: string): Promise<{
  rates: ExchangeRates;
  lastUpdated: string;
}> {
  const cached = cachedRatesMap.get(baseCurrency);
  if (cached) return cached;

  const existing = fetchPromiseMap.get(baseCurrency);
  if (existing) return existing;

  const promise = (async () => {
    for (const api of apis) {
      try {
        const cacheKey = `ex_rates_${api.id}_${baseCurrency}`;
        const cachedStr = localStorage.getItem(cacheKey);
        if (cachedStr) {
          const cachedData = JSON.parse(cachedStr);
          if (Date.now() - cachedData.timestamp < api.ttl) {
            const entry = { rates: cachedData.rates, lastUpdated: cachedData.lastUpdated };
            cachedRatesMap.set(baseCurrency, entry);
            return entry;
          }
        }

        const url = api.buildUrl(baseCurrency);
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          const rates = api.parse(data);
          if (rates) {
            // API 返回的 rates 以 baseCurrency=1 为基准
            const result: ExchangeRates = { [baseCurrency]: 1, ...rates };
            const lastUpdated = new Date().toLocaleTimeString();
            const entry = { rates: result, lastUpdated };

            localStorage.setItem(cacheKey, JSON.stringify({
              timestamp: Date.now(),
              rates: result,
              lastUpdated
            }));

            cachedRatesMap.set(baseCurrency, entry);
            return entry;
          }
        }
      } catch (e) {
        console.warn(`从 ${api.buildUrl(baseCurrency)} 获取汇率失败:`, e);
      }
    }
    // 全部失败：基于 CNY 硬编码汇率推算
    const fallback = buildFallbackRates(baseCurrency);
    const entry = { rates: fallback, lastUpdated: "使用默认汇率" };
    cachedRatesMap.set(baseCurrency, entry);
    return entry;
  })();

  fetchPromiseMap.set(baseCurrency, promise);
  promise.finally(() => fetchPromiseMap.delete(baseCurrency));
  return promise;
}

/** 基于 CNY 硬编码汇率推算任意 base 的汇率表 */
function buildFallbackRates(baseCurrency: string): ExchangeRates {
  const basePerCNY = FALLBACK_RATES_CNY[baseCurrency] || 1;
  const result: ExchangeRates = {};
  for (const [code, codePerCNY] of Object.entries(FALLBACK_RATES_CNY)) {
    result[code] = codePerCNY / basePerCNY;
  }
  result[baseCurrency] = 1;
  return result;
}

export function useExchangeRates(
  baseCurrency: string = "CNY",
  enabled: boolean = true
) {
  const [rates, setRates] = useState<ExchangeRates>(() => {
    const cached = cachedRatesMap.get(baseCurrency);
    return cached?.rates || buildFallbackRates(baseCurrency);
  });
  const [lastUpdated, setLastUpdated] = useState<string>(() => {
    return cachedRatesMap.get(baseCurrency)?.lastUpdated || "";
  });
  const mounted = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    mounted.current = true;
    // baseCurrency 变化时重新获取
    fetchRatesForBase(baseCurrency).then(({ rates: r, lastUpdated: t }) => {
      if (mounted.current) {
        setRates(r);
        setLastUpdated(t);
      }
    });
    return () => { mounted.current = false; };
  }, [baseCurrency, enabled]);

  const refreshRates = useCallback(() => {
    cachedRatesMap.delete(baseCurrency);
    apis.forEach(api => localStorage.removeItem(`ex_rates_${api.id}_${baseCurrency}`));
    fetchRatesForBase(baseCurrency).then(({ rates: r, lastUpdated: t }) => {
      if (mounted.current) {
        setRates(r);
        setLastUpdated(t);
      }
    });
  }, [baseCurrency]);

  return { rates, lastUpdated, refreshRates };
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: "¥",
  USD: "$",
  HKD: "HK$",
  EUR: "€",
  GBP: "£",
  JPY: "JP¥",
  KRW: "₩",
  THB: "฿",
  RUB: "₽",
  INR: "₹",
  TWD: "NT$",
  SGD: "S$",
  AUD: "A$",
  CAD: "C$",
  CHF: "CHF",
  SEK: "kr",
  NZD: "NZ$",
  MYR: "RM",
  PHP: "₱",
  VND: "₫",
  BRL: "R$",
  TRY: "₺",
  ZAR: "R",
  AED: "د.إ",
  SAR: "﷼",
};

export const CURRENCY_OPTIONS = [
  { value: "AUD", label: "AUD (A$)" },
  { value: "CAD", label: "CAD (C$)" },
  { value: "CHF", label: "CHF" },
  { value: "CNY", label: "CNY (¥)" },
  { value: "EUR", label: "EUR (€)" },
  { value: "GBP", label: "GBP (£)" },
  { value: "HKD", label: "HKD (HK$)" },
  { value: "INR", label: "INR (₹)" },
  { value: "JPY", label: "JPY (JP¥)" },
  { value: "KRW", label: "KRW (₩)" },
  { value: "NZD", label: "NZD (NZ$)" },
  { value: "RUB", label: "RUB (₽)" },
  { value: "SGD", label: "SGD (S$)" },
  { value: "TWD", label: "TWD (NT$)" },
  { value: "USD", label: "USD ($)" },
];
