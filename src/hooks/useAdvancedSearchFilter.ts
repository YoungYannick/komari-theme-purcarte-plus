/**
 * 高级搜索过滤逻辑
 *
 * 纯函数模块：接收 AdvancedSearchState 和节点数组，返回过滤后的节点数组。
 * 每个 match 函数对应一种字段类型的过滤逻辑。
 */

import type { NodeData } from "@/types/node";
import type {
  AdvancedSearchState,
  TextFieldFilter,
  BooleanFilter,
  TrafficLimitTypeFilter,
  PriceFilter,
  CpuCoresFilter,
  DateFilter,
  RangeFilter,
} from "@/types/advancedSearch";
import { TEXT_FIELD_KEYS } from "@/types/advancedSearch";
import type { ExchangeRates } from "@/components/enhanced/useExchangeRates";
import { parsePriceToCNY } from "@/components/enhanced/financeUtils";

/**
 * 单位转换为字节
 * NodeData 中 mem_total/disk_total/swap_total/traffic_limit 存储单位为字节
 */
const UNIT_MULTIPLIERS: Record<string, number> = {
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
  PB: 1024 ** 5,
};

function convertToBytes(value: number, unit: string): number {
  return value * (UNIT_MULTIPLIERS[unit] || 1);
}

/**
 * 文本字段匹配
 * - 空值：不参与过滤（返回 true）
 * - none（单关键词）：模糊匹配
 * - and（& 分隔）：所有关键词必须匹配
 * - or（| 分隔）：任一关键词匹配即可
 */
function matchTextField(nodeValue: string, filter: TextFieldFilter): boolean {
  if (!filter.value.trim()) return true;
  if (filter.keywords.length === 0) return true;

  const lowerNode = (nodeValue || "").toLowerCase();

  if (filter.operator === "and") {
    return filter.keywords.every((kw) => lowerNode.includes(kw.toLowerCase()));
  }
  if (filter.operator === "or") {
    return filter.keywords.some((kw) => lowerNode.includes(kw.toLowerCase()));
  }
  // 单关键词模糊匹配
  return lowerNode.includes(filter.keywords[0].toLowerCase());
}

/**
 * 布尔字段匹配
 * - "any"：不参与过滤
 * - "true"/"false"：精确匹配
 */
function matchBooleanField(
  nodeValue: boolean,
  filter: BooleanFilter
): boolean {
  if (filter === "any") return true;
  return filter === "true" ? nodeValue === true : nodeValue === false;
}

/**
 * 流量统计方式枚举匹配
 * - "any"：不参与过滤
 * - 其他值：精确匹配
 */
function matchEnumField(
  nodeValue: string | undefined,
  filter: TrafficLimitTypeFilter
): boolean {
  if (filter === "any") return true;
  // 当节点未设置 traffic_limit_type 时，默认行为是 "max"
  const effectiveValue = nodeValue || "max";
  return effectiveValue === filter;
}

/**
 * 将搜索输入的价格（货币代码）转换为 CNY
 * 与 parsePriceToCNY 互补：parsePriceToCNY 处理节点的货币符号，此函数处理搜索下拉的货币代码
 */
function searchPriceToCNY(
  price: number,
  currencyCode: string,
  rates: ExchangeRates
): number {
  switch (currencyCode) {
    case "CNY": return price;
    case "USD": return price / (rates.USD || 0.14);
    case "HKD": return price / (rates.HKD || 1.08);
    case "EUR": return price / (rates.EUR || 0.12);
    case "GBP": return price / (rates.GBP || 0.11);
    case "JPY": return price / (rates.JPY || 22.23);
    default: return price;
  }
}

/**
 * 价格字段匹配（货币感知）
 * - isFreeSearch=true：匹配 price === -1（不受货币影响）
 * - 有汇率时：将搜索价格和节点价格统一转换为 CNY 后比较
 * - 无汇率时：直接比较原始数值（向后兼容）
 * - isExact 精确匹配使用 0.01 容差（汇率转换浮点误差）
 */
function matchPriceField(
  node: NodeData,
  filter: PriceFilter,
  rates?: ExchangeRates
): boolean {
  if (filter.isFreeSearch) {
    return node.price === -1;
  }

  // 获取节点价格（转 CNY 或直接使用）
  const getNodePriceCNY = (): number => {
    if (rates) return parsePriceToCNY(node, rates).price;
    return node.price;
  };

  // 获取搜索价格（转 CNY 或直接使用）
  const getSearchPriceCNY = (val: number): number => {
    if (rates) return searchPriceToCNY(val, filter.currency, rates);
    return val;
  };

  if (filter.isExact) {
    if (!filter.exactValue.trim()) return true;
    const target = parseFloat(filter.exactValue);
    if (isNaN(target)) return true;
    const nodeCNY = getNodePriceCNY();
    const searchCNY = getSearchPriceCNY(target);
    return Math.abs(nodeCNY - searchCNY) < 0.01;
  }
  // 范围模式
  const hasFrom = filter.rangeFrom.trim() !== "";
  const hasTo = filter.rangeTo.trim() !== "";
  if (!hasFrom && !hasTo) return true;
  const nodeCNY = getNodePriceCNY();
  if (hasFrom && hasTo) {
    const from = parseFloat(filter.rangeFrom);
    const to = parseFloat(filter.rangeTo);
    if (isNaN(from) || isNaN(to)) return true;
    return nodeCNY >= getSearchPriceCNY(from) && nodeCNY <= getSearchPriceCNY(to);
  }
  if (hasFrom) {
    const from = parseFloat(filter.rangeFrom);
    return isNaN(from) ? true : nodeCNY >= getSearchPriceCNY(from);
  }
  const to = parseFloat(filter.rangeTo);
  return isNaN(to) ? true : nodeCNY <= getSearchPriceCNY(to);
}

/**
 * CPU 核心数匹配
 * - isExact=true 且 exactValue 为空：不参与过滤
 * - isExact=true 且 exactValue 有值：精确匹配（整数）
 * - isExact=false：范围匹配（from/to）
 */
function matchCpuCores(nodeCores: number, filter: CpuCoresFilter): boolean {
  if (filter.isExact) {
    if (!filter.exactValue.trim()) return true;
    const target = parseInt(filter.exactValue, 10);
    if (isNaN(target)) return true;
    return nodeCores === target;
  }
  // 范围模式
  const hasFrom = filter.rangeFrom.trim() !== "";
  const hasTo = filter.rangeTo.trim() !== "";
  if (!hasFrom && !hasTo) return true;
  if (hasFrom && hasTo) {
    const from = parseInt(filter.rangeFrom, 10);
    const to = parseInt(filter.rangeTo, 10);
    if (isNaN(from) || isNaN(to)) return true;
    return nodeCores >= from && nodeCores <= to;
  }
  if (hasFrom) {
    const from = parseInt(filter.rangeFrom, 10);
    return isNaN(from) ? true : nodeCores >= from;
  }
  const to = parseInt(filter.rangeTo, 10);
  return isNaN(to) ? true : nodeCores <= to;
}

/**
 * 将用户输入的 UTC+8 日期字符串转换为 UTC 的 Date 对象
 * 用户输入 "2025-03-15" 表示北京时间该日期的开始
 */
function userDateToUtcStart(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00+08:00");
}

/**
 * 将用户输入的 UTC+8 日期字符串转换为该日结束时间的 UTC Date 对象
 */
function userDateToUtcEnd(dateStr: string): Date {
  return new Date(dateStr + "T23:59:59.999+08:00");
}

/**
 * 日期字段匹配
 * - exact 模式：检查 expired_at 是否在同一 UTC+8 日历日内
 * - range 模式：
 *   - 只有 from：>= from 日开始
 *   - 只有 to：<= to 日结束
 *   - 两者都有：范围内
 * - 日期为空：不参与过滤
 */
function matchDateField(
  nodeDate: string | null,
  filter: DateFilter
): boolean {
  if (filter.mode === "exact") {
    if (!filter.exactDate.trim()) return true;
    if (!nodeDate) return false;
    const nodeTime = new Date(nodeDate).getTime();
    const dayStart = userDateToUtcStart(filter.exactDate).getTime();
    const dayEnd = userDateToUtcEnd(filter.exactDate).getTime();
    return nodeTime >= dayStart && nodeTime <= dayEnd;
  }

  // range 模式
  const hasFrom = filter.rangeFrom.trim() !== "";
  const hasTo = filter.rangeTo.trim() !== "";
  if (!hasFrom && !hasTo) return true;
  if (!nodeDate) return false;

  const nodeTime = new Date(nodeDate).getTime();

  if (hasFrom && hasTo) {
    const fromTime = userDateToUtcStart(filter.rangeFrom).getTime();
    const toTime = userDateToUtcEnd(filter.rangeTo).getTime();
    return nodeTime >= fromTime && nodeTime <= toTime;
  }
  if (hasFrom) {
    const fromTime = userDateToUtcStart(filter.rangeFrom).getTime();
    return nodeTime >= fromTime;
  }
  // 只有 to
  const toTime = userDateToUtcEnd(filter.rangeTo).getTime();
  return nodeTime <= toTime;
}

/**
 * 范围字段匹配（mem_total/disk_total/swap_total/traffic_limit）
 * - from 和 to 都为空：不参与过滤
 * - 只有 from：>= from（转换单位后比较）
 * - 只有 to：<= to（转换单位后比较）
 * - 两者都有：范围内
 */
function matchRangeField(
  nodeValue: number | undefined,
  filter: RangeFilter
): boolean {
  const hasFrom = filter.from.trim() !== "";
  const hasTo = filter.to.trim() !== "";
  if (!hasFrom && !hasTo) return true;

  const actual = nodeValue || 0;

  if (hasFrom && hasTo) {
    const fromBytes = convertToBytes(parseFloat(filter.from), filter.unit);
    const toBytes = convertToBytes(parseFloat(filter.to), filter.unit);
    if (isNaN(fromBytes) || isNaN(toBytes)) return true;
    return actual >= fromBytes && actual <= toBytes;
  }
  if (hasFrom) {
    const fromBytes = convertToBytes(parseFloat(filter.from), filter.unit);
    if (isNaN(fromBytes)) return true;
    return actual >= fromBytes;
  }
  // 只有 to
  const toBytes = convertToBytes(parseFloat(filter.to), filter.unit);
  if (isNaN(toBytes)) return true;
  return actual <= toBytes;
}

/**
 * 主过滤函数：应用所有高级搜索条件过滤节点数组
 * @param rates 可选汇率数据，用于价格字段的跨币种匹配
 */
export function applyAdvancedFilters(
  nodes: (NodeData & { stats?: any })[],
  state: AdvancedSearchState,
  rates?: ExchangeRates
): (NodeData & { stats?: any })[] {
  return nodes.filter((node) => {
    // 1. 统一文本搜索：跨所有文本字段模糊匹配
    if (state.textSearch.value.trim() && state.textSearch.keywords.length > 0) {
      const allTextValues = TEXT_FIELD_KEYS
        .map(key => String(node[key as keyof NodeData] || ""))
        .join(" ");
      if (!matchTextField(allTextValues, state.textSearch)) {
        return false;
      }
    }

    // 2. 布尔字段匹配
    if (!matchBooleanField(node.auto_renewal, state.auto_renewal)) return false;
    if (!matchBooleanField(node.hidden, state.hidden)) return false;

    // 3. 枚举字段匹配
    if (!matchEnumField(node.traffic_limit_type, state.traffic_limit_type))
      return false;

    // 4. 价格字段匹配（货币感知）
    if (!matchPriceField(node, state.price, rates)) return false;

    // 5. CPU 核心数匹配
    if (!matchCpuCores(node.cpu_cores, state.cpu_cores)) return false;

    // 6. 日期字段匹配
    if (!matchDateField(node.expired_at, state.expired_at)) return false;

    // 7. 范围字段匹配
    if (!matchRangeField(node.mem_total, state.mem_total)) return false;
    if (!matchRangeField(node.disk_total, state.disk_total)) return false;
    if (!matchRangeField(node.swap_total, state.swap_total)) return false;
    if (!matchRangeField(node.traffic_limit, state.traffic_limit)) return false;

    return true;
  });
}
