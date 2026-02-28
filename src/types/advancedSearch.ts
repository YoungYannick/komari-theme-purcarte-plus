/**
 * 高级搜索 -- 类型定义
 *
 * 定义多条件高级搜索所需的所有字段过滤器状态。
 * NodeData 字段按搜索行为分类：
 * - Text: 模糊关键词搜索，支持 AND/OR 逻辑
 * - Boolean: 三态下拉（true/false/不限）
 * - Enum: 下拉选择
 * - Price: 免费搜索开关 + 精确匹配
 * - Number: 整数输入
 * - Date: 精确日期或范围
 * - Range: 数值范围 + 单位选择
 */

/** 文本字段关键词逻辑运算符 */
export type TextLogicOperator = "and" | "or" | "none";

/** 文本字段搜索条件 */
export interface TextFieldFilter {
  value: string; // 原始输入字符串
  operator: TextLogicOperator; // 检测到的逻辑运算符
  keywords: string[]; // 解析后的关键词列表
}

/** 三态布尔过滤器 */
export type BooleanFilter = "any" | "true" | "false";

/** 流量统计方式枚举过滤器 */
export type TrafficLimitTypeFilter =
  | "any"
  | "sum"
  | "max"
  | "min"
  | "up"
  | "down";

/** 价格字段过滤器 */
export interface PriceFilter {
  isFreeSearch: boolean; // 开关：ON = 搜索免费 (price=-1)
  isExact: boolean; // 开关：ON = 精确匹配（默认），OFF = 范围搜索
  exactValue: string; // 精确价格匹配值
  rangeFrom: string; // 范围模式：最低价格
  rangeTo: string; // 范围模式：最高价格
  currency: string; // 搜索货币代码，默认 "CNY"，自动汇率转换
}

/** 日期搜索模式 */
export type DateSearchMode = "exact" | "range";

/** 日期字段过滤器 */
export interface DateFilter {
  mode: DateSearchMode; // exact=精确日期, range=范围
  exactDate: string; // yyyy-mm-dd 格式 (UTC+8 显示)
  rangeFrom: string; // yyyy-mm-dd
  rangeTo: string; // yyyy-mm-dd
}

/** 内存单位 */
export type MemoryUnit = "MB" | "GB";

/** 磁盘单位 */
export type DiskUnit = "MB" | "GB" | "TB" | "PB";

/** 交换空间单位 */
export type SwapUnit = "MB" | "GB";

/** 流量单位 */
export type TrafficUnit = "MB" | "GB" | "TB" | "PB";

/** 数值范围过滤器（带单位选择） */
export interface RangeFilter<U extends string = string> {
  from: string; // 起始值（字符串用于输入绑定）
  to: string; // 结束值
  unit: U; // 选择的单位
}

/** CPU 核心数过滤器 */
export interface CpuCoresFilter {
  isExact: boolean; // 开关：ON = 精确匹配（默认），OFF = 范围搜索
  exactValue: string; // 精确核心数
  rangeFrom: string; // 范围模式：最少核心
  rangeTo: string; // 范围模式：最多核心
}

/** 所有文本类型的字段名称 */
export const TEXT_FIELD_KEYS = [
  "uuid",
  "name",
  "cpu_name",
  "virtualization",
  "arch",
  "os",
  "kernel_version",
  "gpu_name",
  "region",
  "currency",
  "group",
  "tags",
  "public_remark",
] as const;

export type TextFieldKey = (typeof TEXT_FIELD_KEYS)[number];

/** 完整的高级搜索状态 */
export interface AdvancedSearchState {
  // 统一文本搜索（模糊搜索 uuid, name, cpu_name, virtualization, arch, os,
  // kernel_version, gpu_name, region, currency, group, tags, public_remark）
  textSearch: TextFieldFilter;

  // 布尔字段
  auto_renewal: BooleanFilter;
  hidden: BooleanFilter;

  // 枚举字段
  traffic_limit_type: TrafficLimitTypeFilter;

  // 价格字段
  price: PriceFilter;

  // 数值字段
  cpu_cores: CpuCoresFilter;

  // 日期字段
  expired_at: DateFilter;

  // 范围字段
  mem_total: RangeFilter<MemoryUnit>;
  disk_total: RangeFilter<DiskUnit>;
  swap_total: RangeFilter<SwapUnit>;
  traffic_limit: RangeFilter<TrafficUnit>;
}

/** 校验错误映射 -- key 对应 AdvancedSearchState 字段名 */
export type ValidationErrors = Partial<Record<string, string>>;

/** 创建空的文本字段过滤器 */
function emptyTextFilter(): TextFieldFilter {
  return { value: "", operator: "none", keywords: [] };
}

/** 创建默认的高级搜索状态 */
export function createDefaultAdvancedSearchState(): AdvancedSearchState {
  return {
    textSearch: emptyTextFilter(),
    auto_renewal: "any",
    hidden: "any",
    traffic_limit_type: "any",
    price: { isFreeSearch: false, isExact: true, exactValue: "", rangeFrom: "", rangeTo: "", currency: "CNY" },
    cpu_cores: { isExact: true, exactValue: "", rangeFrom: "", rangeTo: "" },
    expired_at: { mode: "exact", exactDate: "", rangeFrom: "", rangeTo: "" },
    mem_total: { from: "", to: "", unit: "MB" },
    disk_total: { from: "", to: "", unit: "MB" },
    swap_total: { from: "", to: "", unit: "MB" },
    traffic_limit: { from: "", to: "", unit: "MB" },
  };
}

/** 解析文本输入为 TextFieldFilter（检测 & 或 | 分隔符） */
export function parseTextInput(value: string): TextFieldFilter {
  const trimmed = value.trim();
  if (!trimmed) {
    return { value, operator: "none", keywords: [] };
  }

  const hasAnd = trimmed.includes("&");
  const hasOr = trimmed.includes("|");

  if (hasAnd && hasOr) {
    // 混用 & 和 | ，标记为 none 但保留 keywords 为空（校验时报错）
    return { value, operator: "none", keywords: [] };
  }

  if (hasAnd) {
    const keywords = trimmed
      .split("&")
      .map((k) => k.trim())
      .filter(Boolean);
    return { value, operator: "and", keywords };
  }

  if (hasOr) {
    const keywords = trimmed
      .split("|")
      .map((k) => k.trim())
      .filter(Boolean);
    return { value, operator: "or", keywords };
  }

  // 单个关键词
  return { value, operator: "none", keywords: [trimmed] };
}

/** 检查高级搜索状态是否为默认值（即没有任何搜索条件） */
export function isStateDefault(state: AdvancedSearchState): boolean {
  // 检查统一文本搜索
  if (state.textSearch.value.trim() !== "") return false;
  // 检查布尔字段
  if (state.auto_renewal !== "any") return false;
  if (state.hidden !== "any") return false;
  // 检查枚举字段
  if (state.traffic_limit_type !== "any") return false;
  // 检查价格字段
  if (state.price.isFreeSearch) return false;
  if (state.price.exactValue.trim() !== "") return false;
  if (state.price.rangeFrom.trim() !== "" || state.price.rangeTo.trim() !== "") return false;
  // 检查 CPU 核心数
  if (state.cpu_cores.exactValue.trim() !== "") return false;
  if (state.cpu_cores.rangeFrom.trim() !== "" || state.cpu_cores.rangeTo.trim() !== "") return false;
  // 检查日期字段
  if (state.expired_at.exactDate.trim() !== "") return false;
  if (state.expired_at.rangeFrom.trim() !== "") return false;
  if (state.expired_at.rangeTo.trim() !== "") return false;
  // 检查范围字段
  const rangeFields = [
    "mem_total",
    "disk_total",
    "swap_total",
    "traffic_limit",
  ] as const;
  for (const key of rangeFields) {
    if (state[key].from.trim() !== "" || state[key].to.trim() !== "")
      return false;
  }
  return true;
}
