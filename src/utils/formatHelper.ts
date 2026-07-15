import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { normalizeCurrencyToCode } from "@/components/enhanced/financeUtils";
import { CURRENCY_SYMBOLS } from "@/components/enhanced/useExchangeRates";

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper function to format bytes
export const formatBytes = (bytes: number, isSpeed = false, decimals = 2) => {
  if (bytes === 0) return isSpeed ? "0 B/s" : "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = isSpeed
    ? ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"]
    : ["B", "KB", "MB", "GB", "TB", "PB", "EB"];

  let i = Math.floor(Math.log(bytes) / Math.log(k));
  let value = bytes / Math.pow(k, i);

  // 如果值大于等于1000，则进位到下一个单位
  if (value >= 1000 && i < sizes.length - 1) {
    i++;
    value = bytes / Math.pow(k, i);
  }

  return parseFloat(value.toFixed(dm)) + " " + sizes[i];
};

const tr = (
  t: TranslateFn | undefined,
  key: string,
  fallback: string,
  params?: Record<string, string | number>
) => (t ? t(key, params) : fallback);

const joinDurationParts = (parts: string[], t?: TranslateFn) =>
  parts.join(tr(t, "time.durationSeparator", ""));

// Helper function to format uptime
export const formatUptime = (seconds: number, t?: TranslateFn) => {
  if (isNaN(seconds) || seconds < 0) {
    return "N/A";
  }
  const days = Math.floor(seconds / (3600 * 24));
  seconds -= days * 3600 * 24;
  const hrs = Math.floor(seconds / 3600);
  seconds -= hrs * 3600;
  const mns = Math.floor(seconds / 60);

  const parts: string[] = [];
  if (days > 0) {
    parts.push(tr(t, "time.durationDay", `${days}天`, { count: days }));
  }
  if (hrs > 0) {
    parts.push(tr(t, "time.durationHour", `${hrs}小时`, { count: hrs }));
  }
  if (mns > 0 && days === 0) {
    // Only show minutes if uptime is less than a day
    parts.push(tr(t, "time.durationMinute", `${mns}分钟`, { count: mns }));
  }
  if (parts.length === 0) {
    return tr(t, "time.justNow", "刚刚");
  }

  return joinDurationParts(parts, t);
};

export const formatPrice = (
  price: number,
  currency: string,
  billingCycle: number,
  t?: TranslateFn
) => {
  if (price === -1) return tr(t, "format.priceFree", "免费");
  if (price === 0) return "";
  if (!currency || !billingCycle) return "N/A";

  // 标准化货币显示符号
  const code = normalizeCurrencyToCode(currency);
  const sym = CURRENCY_SYMBOLS[code] || currency;

  let cycleStr = tr(t, "format.billingDay", `${billingCycle}天`, {
    count: billingCycle,
  });
  if (billingCycle < 0) {
    return `${sym}${price.toFixed(2)}`;
  } else if (billingCycle === 30 || billingCycle === 31) {
    cycleStr = tr(t, "format.billingMonth", "月");
  } else if (billingCycle >= 89 && billingCycle <= 92) {
    cycleStr = tr(t, "format.billingQuarter", "季");
  } else if (billingCycle >= 180 && billingCycle <= 184) {
    cycleStr = tr(t, "format.billingHalfYear", "半年");
  } else if (billingCycle >= 364 && billingCycle <= 366) {
    cycleStr = tr(t, "format.billingYear", "年");
  } else if (billingCycle >= 730 && billingCycle <= 732) {
    cycleStr = tr(t, "format.billingTwoYears", "两年");
  } else if (billingCycle >= 1095 && billingCycle <= 1097) {
    cycleStr = tr(t, "format.billingThreeYears", "三年");
  } else if (billingCycle >= 1825 && billingCycle <= 1827) {
    cycleStr = tr(t, "format.billingFiveYears", "五年");
  }

  return `${sym}${price.toFixed(2)}/${cycleStr}`;
};

export const formatTrafficLimit = (
  limit?: number,
  type?: "sum" | "max" | "min" | "up" | "down",
  t?: TranslateFn
) => {
  if (!limit) return tr(t, "format.trafficLimitUnset", "未设置");

  const limitText = formatBytes(limit);

  const typeKey = type || "max";
  const typeFallback =
    {
      sum: "总和",
      max: "最大值",
      min: "最小值",
      up: "上传",
      down: "下载",
    }[typeKey] || "";
  const typeText = tr(
    t,
    `format.trafficLimitType.${typeKey}`,
    typeFallback
  );

  return tr(t, "format.trafficLimitTemplate", `总 ${limitText} (${typeText})`, {
    limit: limitText,
    type: typeText,
  });
};

// 用于将最后出现时间格式化为相对时间的辅助函数
export const formatLastSeen = (timestamp: string, t?: TranslateFn): string => {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  if (isNaN(then)) return "N/A";

  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return tr(t, "time.justNow", "刚刚");
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return tr(t, "time.minutesAgo", `${diffMin}分钟前`, { count: diffMin });
  }
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return tr(t, "time.hoursAgo", `${diffHour}小时前`, { count: diffHour });
  }
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) {
    return tr(t, "time.daysAgo", `${diffDay}天前`, { count: diffDay });
  }

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const getProgressBarClass = (percentage: number) => {
  if (percentage > 90) return "bg-red-600";
  if (percentage > 50) return "bg-yellow-400";
  return "bg-green-500";
};
