/**
 * 高级搜索状态管理 Hook
 *
 * 职责：
 * 1. 管理 AdvancedSearchState 状态
 * 2. URL 参数双向同步（读取和写入）
 * 3. 校验逻辑
 * 4. 搜索执行和重置
 */

import { useAppConfig } from "@/config";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type {
  AdvancedSearchState,
  ValidationErrors,
  BooleanFilter,
  TrafficLimitTypeFilter,
  DateSearchMode,
} from "@/types/advancedSearch";
import {
  createDefaultAdvancedSearchState,
  isStateDefault,
  parseTextInput,
} from "@/types/advancedSearch";

/** 最大输入长度限制，防止 JS 数值溢出 */
const MAX_INPUT_LENGTH = 16;

// ======================== URL 参数编码/解码 ========================

/** URL 参数前缀常量 */
const URL_PREFIX = {
  text: "t_",
  bool: "b_",
  enum: "e_",
  price: "p_",
  number: "n_",
  date: "d_",
  range: "r_",
} as const;

/** 合法的布尔过滤值 */
const VALID_BOOL_VALUES = new Set(["true", "false"]);

/** 合法的流量统计方式值 */
const VALID_TLT_VALUES = new Set(["sum", "max", "min", "up", "down"]);

/** 合法的搜索货币代码 */
const VALID_CURRENCIES = new Set(["CNY", "USD", "HKD", "EUR", "GBP", "JPY"]);

/** 合法的日期模式值 */
const VALID_DATE_MODES = new Set(["exact", "range"]);

/** 合法的单位值（按字段） */
const VALID_UNITS: Record<string, Set<string>> = {
  mem_total: new Set(["MB", "GB"]),
  disk_total: new Set(["MB", "GB", "TB", "PB"]),
  swap_total: new Set(["MB", "GB"]),
  traffic_limit: new Set(["MB", "GB", "TB", "PB"]),
};

/** 日期格式校验正则 yyyy-mm-dd */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 将 AdvancedSearchState 序列化为 URL 查询字符串
 * 只序列化非空、非默认值的字段
 */
function serializeStateToUrl(state: AdvancedSearchState): string {
  const params = new URLSearchParams();

  // 统一文本搜索
  if (state.textSearch.value.trim()) {
    params.set(`${URL_PREFIX.text}q`, state.textSearch.value.trim());
  }

  // 布尔字段
  if (state.auto_renewal !== "any") {
    params.set(`${URL_PREFIX.bool}auto_renewal`, state.auto_renewal);
  }
  if (state.hidden !== "any") {
    params.set(`${URL_PREFIX.bool}hidden`, state.hidden);
  }

  // 枚举字段
  if (state.traffic_limit_type !== "any") {
    params.set(`${URL_PREFIX.enum}tlt`, state.traffic_limit_type);
  }

  // 价格字段
  if (state.price.isFreeSearch) {
    params.set(`${URL_PREFIX.price}free`, "1");
  } else if (state.price.isExact) {
    // 精确模式（非默认）
    if (state.price.exactValue.trim()) {
      params.set(`${URL_PREFIX.price}val`, state.price.exactValue.trim());
    }
  } else {
    // 范围模式（默认）
    if (state.price.rangeFrom.trim()) {
      params.set(`${URL_PREFIX.price}from`, state.price.rangeFrom.trim());
    }
    if (state.price.rangeTo.trim()) {
      params.set(`${URL_PREFIX.price}to`, state.price.rangeTo.trim());
    }
  }
  // 价格货币（非 CNY 时才写入）
  if (state.price.currency && state.price.currency !== "CNY") {
    params.set(`${URL_PREFIX.price}cur`, state.price.currency);
  }

  // CPU 核心数
  if (state.cpu_cores.isExact) {
    // 精确模式（非默认）
    if (state.cpu_cores.exactValue.trim()) {
      params.set(`${URL_PREFIX.number}cpu`, state.cpu_cores.exactValue.trim());
    }
  } else {
    // 范围模式（默认）
    if (state.cpu_cores.rangeFrom.trim()) {
      params.set(`${URL_PREFIX.number}cpu_from`, state.cpu_cores.rangeFrom.trim());
    }
    if (state.cpu_cores.rangeTo.trim()) {
      params.set(`${URL_PREFIX.number}cpu_to`, state.cpu_cores.rangeTo.trim());
    }
  }

  // 日期字段
  if (state.expired_at.mode === "exact") {
    // 精确模式（非默认）
    params.set(`${URL_PREFIX.date}mode`, "exact");
    if (state.expired_at.exactDate.trim()) {
      params.set(`${URL_PREFIX.date}exact`, state.expired_at.exactDate.trim());
    }
  } else {
    // 范围模式（默认）
    if (state.expired_at.rangeFrom.trim()) {
      params.set(`${URL_PREFIX.date}from`, state.expired_at.rangeFrom.trim());
    }
    if (state.expired_at.rangeTo.trim()) {
      params.set(`${URL_PREFIX.date}to`, state.expired_at.rangeTo.trim());
    }
  }

  // 范围字段（不含 swap，swap 单独处理）
  const rangeFields = [
    "mem_total",
    "disk_total",
    "traffic_limit",
  ] as const;
  for (const key of rangeFields) {
    const filter = state[key];
    if (filter.from.trim()) {
      params.set(`${URL_PREFIX.range}${key}_from`, filter.from.trim());
    }
    if (filter.to.trim()) {
      params.set(`${URL_PREFIX.range}${key}_to`, filter.to.trim());
    }
    if (
      filter.unit !== "MB" &&
      (filter.from.trim() || filter.to.trim())
    ) {
      params.set(`${URL_PREFIX.range}${key}_u`, filter.unit);
    }
  }

  // 交换空间（单独处理：支持关闭搜索开关）
  if (state.swap_total.isDisabledSearch) {
    params.set(`${URL_PREFIX.range}swap_total_disabled`, "1");
  } else {
    if (state.swap_total.from.trim()) {
      params.set(`${URL_PREFIX.range}swap_total_from`, state.swap_total.from.trim());
    }
    if (state.swap_total.to.trim()) {
      params.set(`${URL_PREFIX.range}swap_total_to`, state.swap_total.to.trim());
    }
    if (
      state.swap_total.unit !== "MB" &&
      (state.swap_total.from.trim() || state.swap_total.to.trim())
    ) {
      params.set(`${URL_PREFIX.range}swap_total_u`, state.swap_total.unit);
    }
  }

  return params.toString();
}

/**
 * 从 URL 查询字符串解析 AdvancedSearchState
 * 无效参数会被静默丢弃
 */
function parseUrlToState(search: string): AdvancedSearchState {
  const state = createDefaultAdvancedSearchState();
  if (!search || search === "?") return state;

  const params = new URLSearchParams(search);

  // 统一文本搜索
  const textQ = params.get(`${URL_PREFIX.text}q`);
  if (textQ !== null && textQ.trim()) {
    state.textSearch = parseTextInput(textQ);
  }

  // 布尔字段
  const autoRenewal = params.get(`${URL_PREFIX.bool}auto_renewal`);
  if (autoRenewal !== null && VALID_BOOL_VALUES.has(autoRenewal)) {
    state.auto_renewal = autoRenewal as BooleanFilter;
  }
  const hidden = params.get(`${URL_PREFIX.bool}hidden`);
  if (hidden !== null && VALID_BOOL_VALUES.has(hidden)) {
    state.hidden = hidden as BooleanFilter;
  }

  // 枚举字段
  const tlt = params.get(`${URL_PREFIX.enum}tlt`);
  if (tlt !== null && VALID_TLT_VALUES.has(tlt)) {
    state.traffic_limit_type = tlt as TrafficLimitTypeFilter;
  }

  // 价格字段
  const pFree = params.get(`${URL_PREFIX.price}free`);
  const pVal = params.get(`${URL_PREFIX.price}val`);
  const pMode = params.get(`${URL_PREFIX.price}mode`);
  const pFrom = params.get(`${URL_PREFIX.price}from`);
  const pTo = params.get(`${URL_PREFIX.price}to`);
  if (pFree === "1") {
    state.price = { ...state.price, isFreeSearch: true };
  } else if (pVal !== null && pVal.trim() && !isNaN(parseFloat(pVal))) {
    // p_val 存在 → 精确模式（兼容旧URL）
    state.price = { ...state.price, isExact: true, exactValue: pVal.trim() };
  } else if (pMode === "range" || pFrom !== null || pTo !== null) {
    // 显式范围模式或有范围值（兼容旧URL的 p_mode=range）
    state.price = { ...state.price, isExact: false };
    if (pFrom !== null && pFrom.trim() && !isNaN(parseFloat(pFrom))) {
      state.price.rangeFrom = pFrom.trim();
    }
    if (pTo !== null && pTo.trim() && !isNaN(parseFloat(pTo))) {
      state.price.rangeTo = pTo.trim();
    }
  }
  // 价格货币
  const pCur = params.get(`${URL_PREFIX.price}cur`);
  if (pCur !== null && VALID_CURRENCIES.has(pCur)) {
    state.price.currency = pCur;
  }

  // CPU 核心数
  const nCpuMode = params.get(`${URL_PREFIX.number}cpu_mode`);
  const nCpu = params.get(`${URL_PREFIX.number}cpu`);
  const nCpuFrom = params.get(`${URL_PREFIX.number}cpu_from`);
  const nCpuTo = params.get(`${URL_PREFIX.number}cpu_to`);
  if (nCpu !== null && nCpu.trim() && !isNaN(parseInt(nCpu, 10))) {
    // n_cpu 存在 → 精确模式（兼容旧URL）
    state.cpu_cores = { ...state.cpu_cores, isExact: true, exactValue: nCpu.trim() };
  } else if (nCpuMode === "range" || nCpuFrom !== null || nCpuTo !== null) {
    // 显式范围模式或有范围值（兼容旧URL的 n_cpu_mode=range）
    state.cpu_cores = { ...state.cpu_cores, isExact: false };
    if (nCpuFrom !== null && nCpuFrom.trim() && !isNaN(parseInt(nCpuFrom, 10))) {
      state.cpu_cores.rangeFrom = nCpuFrom.trim();
    }
    if (nCpuTo !== null && nCpuTo.trim() && !isNaN(parseInt(nCpuTo, 10))) {
      state.cpu_cores.rangeTo = nCpuTo.trim();
    }
  }

  // 日期字段
  const dMode = params.get(`${URL_PREFIX.date}mode`);
  if (dMode !== null && VALID_DATE_MODES.has(dMode)) {
    state.expired_at.mode = dMode as DateSearchMode;
  }
  const dExact = params.get(`${URL_PREFIX.date}exact`);
  if (dExact !== null && DATE_REGEX.test(dExact)) {
    state.expired_at.exactDate = dExact;
    // d_exact 存在则隐式设为精确模式（兼容旧URL）
    if (!dMode) state.expired_at.mode = "exact";
  }
  const dFrom = params.get(`${URL_PREFIX.date}from`);
  if (dFrom !== null && DATE_REGEX.test(dFrom)) {
    state.expired_at.rangeFrom = dFrom;
  }
  const dTo = params.get(`${URL_PREFIX.date}to`);
  if (dTo !== null && DATE_REGEX.test(dTo)) {
    state.expired_at.rangeTo = dTo;
  }

  // 范围字段（不含 swap，swap 单独处理）
  const rangeFields = [
    "mem_total",
    "disk_total",
    "traffic_limit",
  ] as const;
  for (const key of rangeFields) {
    const from = params.get(`${URL_PREFIX.range}${key}_from`);
    const to = params.get(`${URL_PREFIX.range}${key}_to`);
    const unit = params.get(`${URL_PREFIX.range}${key}_u`);

    if (from !== null && from.trim() && !isNaN(parseFloat(from))) {
      state[key].from = from.trim();
    }
    if (to !== null && to.trim() && !isNaN(parseFloat(to))) {
      state[key].to = to.trim();
    }
    if (unit !== null && VALID_UNITS[key]?.has(unit)) {
      (state[key] as { unit: string }).unit = unit;
    }
  }

  // 交换空间（单独处理：支持关闭搜索开关）
  const swapDisabled = params.get(`${URL_PREFIX.range}swap_total_disabled`);
  if (swapDisabled === "1") {
    state.swap_total.isDisabledSearch = true;
  } else {
    const swapFrom = params.get(`${URL_PREFIX.range}swap_total_from`);
    const swapTo = params.get(`${URL_PREFIX.range}swap_total_to`);
    const swapUnit = params.get(`${URL_PREFIX.range}swap_total_u`);
    if (swapFrom !== null && swapFrom.trim() && !isNaN(parseFloat(swapFrom))) {
      state.swap_total.from = swapFrom.trim();
    }
    if (swapTo !== null && swapTo.trim() && !isNaN(parseFloat(swapTo))) {
      state.swap_total.to = swapTo.trim();
    }
    if (swapUnit !== null && VALID_UNITS.swap_total?.has(swapUnit)) {
      state.swap_total.unit = swapUnit as "MB" | "GB";
    }
  }

  return state;
}

// ======================== 校验逻辑 ========================

/**
 * 校验高级搜索状态
 * 返回空对象表示校验通过
 */
function validateState(state: AdvancedSearchState): ValidationErrors {
  const errors: ValidationErrors = {};

  // 1. 统一文本搜索：检查 & 和 | 是否混用
  const textValue = state.textSearch.value.trim();
  if (textValue) {
    if (textValue.length > 500) {
      errors.textSearch = "inputTooLong";
    } else {
      const hasAnd = textValue.includes("&");
      const hasOr = textValue.includes("|");
      if (hasAnd && hasOr) {
        errors.textSearch = "mixedOperators";
      }
    }
  }

  // 2. CPU 核心数校验
  if (state.cpu_cores.isExact) {
    if (state.cpu_cores.exactValue.trim()) {
      const val = state.cpu_cores.exactValue.trim();
      if (val.length > MAX_INPUT_LENGTH) {
        errors.cpu_cores = "inputTooLong";
      } else {
        const num = parseInt(val, 10);
        if (isNaN(num) || num.toString() !== val) {
          errors.cpu_cores = "invalidInteger";
        } else if (num === 0) {
          errors.cpu_cores = "zeroNotAllowed";
        }
      }
    }
  } else {
    const cpuFrom = state.cpu_cores.rangeFrom.trim();
    const cpuTo = state.cpu_cores.rangeTo.trim();
    if (cpuFrom) {
      if (cpuFrom.length > MAX_INPUT_LENGTH) {
        errors.cpu_cores_from = "inputTooLong";
      } else {
        const num = parseInt(cpuFrom, 10);
        if (isNaN(num) || num.toString() !== cpuFrom) {
          errors.cpu_cores_from = "invalidInteger";
        } else if (num === 0) {
          errors.cpu_cores_from = "zeroNotAllowed";
        }
      }
    }
    if (cpuTo) {
      if (cpuTo.length > MAX_INPUT_LENGTH) {
        errors.cpu_cores_to = "inputTooLong";
      } else {
        const num = parseInt(cpuTo, 10);
        if (isNaN(num) || num.toString() !== cpuTo) {
          errors.cpu_cores_to = "invalidInteger";
        } else if (num === 0) {
          errors.cpu_cores_to = "zeroNotAllowed";
        }
      }
    }
    if (cpuFrom && cpuTo && !errors.cpu_cores_from && !errors.cpu_cores_to) {
      if (parseInt(cpuTo, 10) <= parseInt(cpuFrom, 10)) {
        errors.cpu_cores = "rangeEndLessOrEqual";
      }
    }
  }

  // 3. 价格校验
  if (!state.price.isFreeSearch) {
    if (state.price.isExact) {
      if (state.price.exactValue.trim()) {
        const val = state.price.exactValue.trim();
        if (val.length > MAX_INPUT_LENGTH) {
          errors.price = "inputTooLong";
        } else if (isNaN(parseFloat(val))) {
          errors.price = "invalidNumber";
        }
      }
    } else {
      const priceFrom = state.price.rangeFrom.trim();
      const priceTo = state.price.rangeTo.trim();
      if (priceFrom) {
        if (priceFrom.length > MAX_INPUT_LENGTH) {
          errors.price_from = "inputTooLong";
        } else if (isNaN(parseFloat(priceFrom))) {
          errors.price_from = "invalidNumber";
        }
      }
      if (priceTo) {
        if (priceTo.length > MAX_INPUT_LENGTH) {
          errors.price_to = "inputTooLong";
        } else if (isNaN(parseFloat(priceTo))) {
          errors.price_to = "invalidNumber";
        }
      }
      if (priceFrom && priceTo && !errors.price_from && !errors.price_to) {
        if (parseFloat(priceTo) <= parseFloat(priceFrom)) {
          errors.price = "rangeEndLessOrEqual";
        }
      }
    }
  }

  // 4. 日期范围校验
  if (state.expired_at.mode === "range") {
    const from = state.expired_at.rangeFrom.trim();
    const to = state.expired_at.rangeTo.trim();
    if (from && !DATE_REGEX.test(from)) {
      errors.expired_at_from = "invalidDate";
    }
    if (to && !DATE_REGEX.test(to)) {
      errors.expired_at_to = "invalidDate";
    }
    if (from && to && DATE_REGEX.test(from) && DATE_REGEX.test(to)) {
      if (new Date(to).getTime() <= new Date(from).getTime()) {
        errors.expired_at = "dateRangeInvalid";
      }
    }
  } else if (state.expired_at.mode === "exact") {
    const exact = state.expired_at.exactDate.trim();
    if (exact && !DATE_REGEX.test(exact)) {
      errors.expired_at = "invalidDate";
    }
  }

  // 5. 范围字段校验（不含 swap，swap 单独处理）
  const rangeFieldsConfig = [
    { key: "mem_total", allowZero: false },
    { key: "disk_total", allowZero: false },
    { key: "traffic_limit", allowZero: true },
  ] as const;

  for (const { key, allowZero } of rangeFieldsConfig) {
    const filter = state[key];
    const from = filter.from.trim();
    const to = filter.to.trim();

    // 校验 from
    if (from) {
      if (from.length > MAX_INPUT_LENGTH) {
        errors[`${key}_from`] = "inputTooLong";
      } else {
        const num = parseFloat(from);
        if (isNaN(num)) {
          errors[`${key}_from`] = "invalidNumber";
        } else if (!allowZero && num === 0) {
          errors[`${key}_from`] = "zeroNotAllowed";
        } else {
          // 小数位数检查（最多2位）
          const decimalPart = from.split(".")[1];
          if (decimalPart && decimalPart.length > 2) {
            errors[`${key}_from`] = "tooManyDecimals";
          }
        }
      }
    }

    // 校验 to
    if (to) {
      if (to.length > MAX_INPUT_LENGTH) {
        errors[`${key}_to`] = "inputTooLong";
      } else {
        const num = parseFloat(to);
        if (isNaN(num)) {
          errors[`${key}_to`] = "invalidNumber";
        } else if (!allowZero && num === 0) {
          errors[`${key}_to`] = "zeroNotAllowed";
        } else {
          const decimalPart = to.split(".")[1];
          if (decimalPart && decimalPart.length > 2) {
            errors[`${key}_to`] = "tooManyDecimals";
          }
        }
      }
    }

    // from/to 范围校验：to 不能 <= from
    if (from && to && !errors[`${key}_from`] && !errors[`${key}_to`]) {
      const fromNum = parseFloat(from);
      const toNum = parseFloat(to);
      if (!isNaN(fromNum) && !isNaN(toNum) && toNum <= fromNum) {
        errors[`${key}`] = "rangeEndLessOrEqual";
      }
    }
  }

  // 6. 交换空间校验（仅在非关闭搜索模式下校验范围值）
  if (!state.swap_total.isDisabledSearch) {
    const swapFrom = state.swap_total.from.trim();
    const swapTo = state.swap_total.to.trim();
    if (swapFrom) {
      if (swapFrom.length > MAX_INPUT_LENGTH) {
        errors.swap_total_from = "inputTooLong";
      } else {
        const num = parseFloat(swapFrom);
        if (isNaN(num)) {
          errors.swap_total_from = "invalidNumber";
        } else {
          const decimalPart = swapFrom.split(".")[1];
          if (decimalPart && decimalPart.length > 2) {
            errors.swap_total_from = "tooManyDecimals";
          }
        }
      }
    }
    if (swapTo) {
      if (swapTo.length > MAX_INPUT_LENGTH) {
        errors.swap_total_to = "inputTooLong";
      } else {
        const num = parseFloat(swapTo);
        if (isNaN(num)) {
          errors.swap_total_to = "invalidNumber";
        } else {
          const decimalPart = swapTo.split(".")[1];
          if (decimalPart && decimalPart.length > 2) {
            errors.swap_total_to = "tooManyDecimals";
          }
        }
      }
    }
    if (swapFrom && swapTo && !errors.swap_total_from && !errors.swap_total_to) {
      const fromNum = parseFloat(swapFrom);
      const toNum = parseFloat(swapTo);
      if (!isNaN(fromNum) && !isNaN(toNum) && toNum <= fromNum) {
        errors.swap_total = "rangeEndLessOrEqual";
      }
    }
  }

  return errors;
}

// ======================== Hook ========================

export function useAdvancedSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const isInitialized = useRef(false);

  // 获取配置，判断是否真正开启高级搜索
  const { enableSearchButton, enableAdvancedSearch } = useAppConfig();
  const isFeatureEnabled = enableSearchButton && enableAdvancedSearch;

  // 从 URL 初始化状态
  const [state, setState] = useState<AdvancedSearchState>(() =>
    parseUrlToState(window.location.search)
  );

  // 模态框显示状态
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 存储最后一次搜索执行的校验错误
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>(
    {}
  );

  // 如果 URL 中有高级搜索参数，标记已初始化，自动打开模态框
  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      if (isFeatureEnabled) {
        const parsed = parseUrlToState(location.search);
        if (!isStateDefault(parsed)) {
          setState(parsed);
        }
      }
    }
  }, [isFeatureEnabled, location.search]);

  // 计算是否有活跃的搜索条件
  const isActive = useMemo(
      () => isFeatureEnabled && !isStateDefault(state),
      [state, isFeatureEnabled]
  );

  // 用于搜索后判断的已确认搜索状态
  const [confirmedState, setConfirmedState] =
    useState<AdvancedSearchState | null>(() => {
      const initial = parseUrlToState(window.location.search);
      return isStateDefault(initial) ? null : initial;
    });

  /**
   * 执行搜索
   * 1. 校验状态
   * 2. 如果校验通过，序列化到 URL 并关闭模态框
   * 3. 返回校验错误（null 表示成功）
   */
  const executeSearch = useCallback(() => {
    const errors = validateState(state);
    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) {
      return errors;
    }

    // 序列化到 URL
    const queryString = serializeStateToUrl(state);
    if (queryString) {
      navigate(`/?${queryString}`, { replace: true });
    } else {
      navigate("/", { replace: true });
    }

    setConfirmedState(isStateDefault(state) ? null : { ...state });
    setIsModalOpen(false);
    return null;
  }, [state, navigate]);

  /**
   * 重置所有搜索条件
   * 清空状态并导航到根路径
   */
  const resetSearch = useCallback(() => {
    const defaultState = createDefaultAdvancedSearchState();
    setState(defaultState);
    setConfirmedState(null);
    setValidationErrors({});
    navigate("/", { replace: true });
  }, [navigate]);

  /**
   * 校验当前状态（供外部使用）
   */
  const validate = useCallback(() => validateState(state), [state]);

  return {
    /** 当前编辑中的搜索状态 */
    state,
    /** 更新搜索状态 */
    setState,
    /** 已确认的搜索状态（点击搜索后） */
    confirmedState: isFeatureEnabled ? confirmedState : null,
    /** 模态框是否打开 */
    isModalOpen,
    /** 设置模态框打开状态 */
    setIsModalOpen,
    /** 是否有活跃的搜索条件（基于编辑状态） */
    isActive,
    /** 是否有已确认的搜索结果 */
    isSearchApplied: isFeatureEnabled && confirmedState !== null,
    /** 执行搜索 */
    executeSearch,
    /** 重置搜索 */
    resetSearch,
    /** 校验当前状态 */
    validate,
    /** 最后一次校验错误 */
    validationErrors,
    /** 设置校验错误 */
    setValidationErrors,
  };
}

export type UseAdvancedSearchReturn = ReturnType<typeof useAdvancedSearch>;
