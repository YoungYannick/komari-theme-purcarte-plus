/**
 * 高级搜索模态框组件
 *
 * 提供多条件搜索界面，支持文本/布尔/枚举/价格/数值/日期/范围等多种字段类型。
 * 遵循 ServerTradeModal 的 bubble-header/close/content 模式。
 * 每个子组件均标注作用及限制。
 */

import { useCallback, useRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X, RotateCcw } from "lucide-react";
import { useLocale } from "@/config/hooks";
import type {
  AdvancedSearchState,
  ValidationErrors,
  BooleanFilter,
  TrafficLimitTypeFilter,
  PriceFilter,
  CpuCoresFilter,
  SwapFilter,
  MemoryUnit,
  DiskUnit,
  SwapUnit,
  TrafficUnit,
  DateSearchMode,
} from "@/types/advancedSearch";
import { parseTextInput } from "@/types/advancedSearch";
import { CURRENCY_OPTIONS } from "@/components/enhanced/useExchangeRates";
import "./AdvancedSearchModal.css";

// ======================== 工具函数 ========================

/**
 * 价格输入失焦自动更正
 * 负数（除 -1 外）→ 取绝对值
 */
function correctPriceOnBlur(value: string): string {
  if (!value.trim()) return value;
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  if (num < 0 && num !== -1) return Math.abs(num).toString();
  return value;
}

/**
 * CPU 核心数 / 内存 / 磁盘 输入失焦自动更正
 * 0 → "1"，负数 → 取绝对值
 */
function correctZeroAndNegative(value: string): string {
  if (!value.trim()) return value;
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  if (num === 0) return "1";
  if (num < 0) return Math.abs(num).toString();
  return value;
}

/**
 * 流量限制输入失焦自动更正
 * 负数 → 取绝对值（0 允许）
 */
function correctNegativeOnly(value: string): string {
  if (!value.trim()) return value;
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  if (num < 0) return Math.abs(num).toString();
  return value;
}

interface AdvancedSearchModalProps {
  /** 当前搜索状态 */
  state: AdvancedSearchState;
  /** 更新搜索状态 */
  setState: React.Dispatch<React.SetStateAction<AdvancedSearchState>>;
  /** 执行搜索回调，返回校验错误或 null */
  onSearch: () => ValidationErrors | null;
  /** 重置搜索回调 */
  onReset: () => void;
  /** 关闭模态框回调 */
  onClose: () => void;
  /** 是否已登录（控制 hidden 字段可见性） */
  isAuthenticated: boolean;
  /** 校验错误 */
  validationErrors: ValidationErrors;
  /** 设置校验错误 */
  setValidationErrors: React.Dispatch<React.SetStateAction<ValidationErrors>>;
}

export function AdvancedSearchModal({
  state,
  setState,
  onSearch,
  onReset,
  onClose,
  isAuthenticated,
  validationErrors,
  setValidationErrors,
}: AdvancedSearchModalProps) {
  const { t } = useLocale();
  const modalRef = useRef<HTMLDivElement>(null);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    setIsClosing(true);
  }, []);

  const handleAnimationEnd = useCallback(() => {
    if (isClosing) {
      setIsClosing(false);
      onClose();
    }
  }, [isClosing, onClose]);

  // 点击遮罩层关闭
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleClose();
      }
    },
    [handleClose]
  );

  // ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  // 搜索按钮点击
  const handleSearch = useCallback(() => {
    onSearch();
  }, [onSearch]);

  // 重置按钮点击
  const handleReset = useCallback(() => {
    onReset();
  }, [onReset]);

  /**
   * 更新统一文本搜索值
   */
  const updateTextSearch = useCallback(
    (value: string) => {
      setState((prev) => ({
        ...prev,
        textSearch: { ...prev.textSearch, value },
      }));
    },
    [setState]
  );

  /**
   * 统一文本搜索失去焦点时解析关键词并校验
   * 限制：禁止 & 和 | 混用
   */
  const handleTextSearchBlur = useCallback(() => {
    setState((prev) => {
      const parsed = parseTextInput(prev.textSearch.value);
      return { ...prev, textSearch: parsed };
    });
    const value = state.textSearch.value.trim();
    if (value && value.includes("&") && value.includes("|")) {
      setValidationErrors((prev) => ({ ...prev, textSearch: "mixedOperators" }));
    } else {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next.textSearch;
        return next;
      });
    }
  }, [setState, state, setValidationErrors]);

  return (
    <div
      className={`advanced-search-overlay${isClosing ? " closing" : ""}`}
      onClick={handleOverlayClick}
    >
      <div
        ref={modalRef}
        className={`advanced-search-modal${isClosing ? " closing" : ""}`}
        onAnimationEnd={handleAnimationEnd}
      >
        {/* ========== 头部：标题 + 关闭按钮 ========== */}
        <div className="bubble-header">
          <h3 className="bubble-title">
            <Search size={18} />
            {t("advancedSearch.title")}
          </h3>
          <button className="bubble-close" onClick={handleClose}>
            <X size={16} />
          </button>
        </div>

        {/* ========== 内容区域 ========== */}
        <div className="advanced-search-content">

          {/* ---- 区域1：统一文本搜索 ---- */}
          {/* 在一个输入框中搜索 uuid, name, cpu_name 等13个文本字段 */}
          <div className="search-section">
            <div className="search-section-title">
              <Search size={16} />
              {t("advancedSearch.textFields")}
            </div>
            <div className="search-field-item">
              <label className="search-field-label">
                {t("advancedSearch.unifiedTextLabel")}
              </label>
              <Input
                type="text"
                placeholder={t("advancedSearch.unifiedTextPlaceholder")}
                value={state.textSearch.value}
                onChange={(e) => updateTextSearch(e.target.value)}
                onBlur={handleTextSearchBlur}
                maxLength={500}
                className={validationErrors.textSearch ? "search-input-error" : ""}
              />
              <span className="search-field-help">{t("advancedSearch.unifiedTextHelp")}</span>
              {validationErrors.textSearch && (
                <span className="search-field-error">
                  {t(`advancedSearch.validation.${validationErrors.textSearch}`)}
                </span>
              )}
            </div>
          </div>

          {/* ---- 区域2：选择字段（布尔 + 枚举） ---- */}
          {/* auto_renewal/hidden 使用三态下拉，traffic_limit_type 使用枚举下拉 */}
          <div className="search-section">
            <div className="search-section-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              {t("advancedSearch.selectFields")}
            </div>
            <div className="search-fields-grid">
              {/* 自动续费：三态下拉 (不限/是/否) */}
              <BooleanSearchField
                fieldKey="auto_renewal"
                value={state.auto_renewal}
                onChange={(val) =>
                  setState((prev) => ({ ...prev, auto_renewal: val }))
                }
                t={t}
              />

              {/* 隐藏状态：仅登录后可见 */}
              {isAuthenticated && (
                <BooleanSearchField
                  fieldKey="hidden"
                  value={state.hidden}
                  onChange={(val) =>
                    setState((prev) => ({ ...prev, hidden: val }))
                  }
                  t={t}
                />
              )}

              {/* 流量统计方式：枚举下拉 */}
              <EnumSearchField
                value={state.traffic_limit_type}
                onChange={(val) =>
                  setState((prev) => ({ ...prev, traffic_limit_type: val }))
                }
                t={t}
              />
            </div>
          </div>

          {/* ---- 区域3：数值字段（价格 + CPU核心数）—— 无分界线 ---- */}
          <div className="search-section">
            <div className="search-section-title search-section-title-no-border">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              {t("advancedSearch.numericFields")}
            </div>

            {/* 价格字段：免费开关 + 精确/范围切换 */}
            <PriceSearchField
              state={state.price}
              onChange={(price) => setState((prev) => ({ ...prev, price }))}
              errors={validationErrors}
              t={t}
            />

            {/* CPU 核心数：精确/范围切换 */}
            <CpuCoresSearchField
              state={state.cpu_cores}
              onChange={(cpu_cores) => setState((prev) => ({ ...prev, cpu_cores }))}
              errors={validationErrors}
              t={t}
            />
          </div>

          {/* ---- 区域4：日期字段 ---- */}
          {/* expired_at：精确日期或范围搜索，UTC+8 北京时间 */}
          <div className="search-section">
            <div className="search-section-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {t("advancedSearch.dateFields")}
            </div>
            <DateSearchField
              state={state.expired_at}
              onChange={(expired_at) =>
                setState((prev) => ({ ...prev, expired_at }))
              }
              errors={validationErrors}
              t={t}
            />
          </div>

          {/* ---- 区域5：范围字段（内存/磁盘/流量）—— 无分界线 ---- */}
          {/* 每个字段有 from/to 输入框 + 单位下拉 */}
          <div className="search-section">
            <div className="search-section-title search-section-title-no-border">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
              {t("advancedSearch.rangeFields")}
            </div>

            {/* 新增关闭搜索开关：ON=搜索已关闭SWAP的节点，OFF=范围搜索 */}
            <SwapSearchField
                state={state.swap_total}
                onChange={(swap_total) =>
                    setState((prev) => ({ ...prev, swap_total }))
                }
                errors={validationErrors}
                t={t}
            />

            {/* 内存：不允许为0，单位 MB/GB */}
            <RangeSearchField<MemoryUnit>
              fieldKey="mem_total"
              state={state.mem_total}
              onChange={(val) =>
                setState((prev) => ({ ...prev, mem_total: val }))
              }
              units={["MB", "GB"] as MemoryUnit[]}
              errors={validationErrors}
              onBlurCorrect={correctZeroAndNegative}
              t={t}
            />

            {/* 磁盘：不允许为0，单位 MB/GB/TB/PB */}
            <RangeSearchField<DiskUnit>
              fieldKey="disk_total"
              state={state.disk_total}
              onChange={(val) =>
                setState((prev) => ({ ...prev, disk_total: val }))
              }
              units={["MB", "GB", "TB", "PB"] as DiskUnit[]}
              errors={validationErrors}
              onBlurCorrect={correctZeroAndNegative}
              t={t}
            />

            {/* 流量限制：允许为0，单位 MB/GB/TB/PB */}
            <RangeSearchField<TrafficUnit>
              fieldKey="traffic_limit"
              state={state.traffic_limit}
              onChange={(val) =>
                setState((prev) => ({ ...prev, traffic_limit: val }))
              }
              units={["MB", "GB", "TB", "PB"] as TrafficUnit[]}
              errors={validationErrors}
              onBlurCorrect={correctNegativeOnly}
              t={t}
            />
          </div>
        </div>

        {/* ========== 底部操作栏 ========== */}
        <div className="advanced-search-footer">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw size={14} className="mr-1" />
            {t("advancedSearch.reset")}
          </Button>
          <Button size="sm" onClick={handleSearch}>
            <Search size={14} className="mr-1" />
            {t("advancedSearch.search")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ======================== 子组件 ========================

/**
 * 布尔字段搜索（三态下拉）
 * 作用：选择 不限/是/否 进行布尔字段过滤
 * 限制：hidden 字段仅在登录后显示（由父组件控制）
 */
function BooleanSearchField({
  fieldKey,
  value,
  onChange,
  t,
}: {
  fieldKey: "auto_renewal" | "hidden";
  value: BooleanFilter;
  onChange: (val: BooleanFilter) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="search-field-item">
      <label className="search-field-label">
        {t(`advancedSearch.field.${fieldKey}`)}
      </label>
      <Select
        value={value}
        onValueChange={(val) => onChange(val as BooleanFilter)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">{t("advancedSearch.noLimit")}</SelectItem>
          <SelectItem value="true">{t("advancedSearch.true")}</SelectItem>
          <SelectItem value="false">{t("advancedSearch.false")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * 流量统计方式枚举搜索
 * 作用：选择 不限/sum/max/min/up/down 进行枚举字段过滤
 * 限制：默认选中"不限"
 */
function EnumSearchField({
  value,
  onChange,
  t,
}: {
  value: TrafficLimitTypeFilter;
  onChange: (val: TrafficLimitTypeFilter) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="search-field-item">
      <label className="search-field-label">
        {t("advancedSearch.field.traffic_limit_type")}
      </label>
      <Select
        value={value}
        onValueChange={(val) => onChange(val as TrafficLimitTypeFilter)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">{t("advancedSearch.noLimit")}</SelectItem>
          <SelectItem value="sum">{t("advancedSearch.trafficType.sum")}</SelectItem>
          <SelectItem value="max">{t("advancedSearch.trafficType.max")}</SelectItem>
          <SelectItem value="min">{t("advancedSearch.trafficType.min")}</SelectItem>
          <SelectItem value="up">{t("advancedSearch.trafficType.up")}</SelectItem>
          <SelectItem value="down">{t("advancedSearch.trafficType.down")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * 价格搜索字段
 * 作用：三种搜索模式
 *   - 免费搜索开关：搜索 price === -1
 *   - 精确搜索：输入精确价格匹配
 *   - 范围搜索（默认）：输入最低/最高价格范围
 * 限制：免费开关优先级最高，开启时禁用其他输入
 * 失焦校正：负数（除 -1 外）自动更正为正数
 */
function PriceSearchField({
  state,
  onChange,
  errors,
  t,
}: {
  state: PriceFilter;
  onChange: (val: PriceFilter) => void;
  errors: ValidationErrors;
  t: (key: string) => string;
}) {
  const fromError = errors.price_from;
  const toError = errors.price_to;
  const rangeError = errors.price;

  return (
    <div className="search-field-item" style={{ marginBottom: 12 }}>
      <label className="search-field-label">
        {t("advancedSearch.field.price")}
      </label>
      <div className="search-toggle-row">
        {/* 免费搜索开关 */}
        <Switch
          checked={state.isFreeSearch}
          onCheckedChange={(checked) =>
            onChange({ ...state, isFreeSearch: checked })
          }
        />
        <span className="search-toggle-label">
          {t("advancedSearch.priceFreeToggle")}
        </span>
      </div>
      {!state.isFreeSearch && (
        <>
          <div className="search-toggle-row">
            {/* 精确/范围模式开关：ON=精确，OFF=范围（默认） */}
            <Switch
              checked={state.isExact}
              onCheckedChange={(checked) =>
                onChange({ ...state, isExact: checked })
              }
            />
            <span className="search-toggle-label">
              {state.isExact
                ? t("advancedSearch.exactToggle")
                : t("advancedSearch.rangeToggle")}
            </span>
          </div>
          {state.isExact ? (
            <div className="search-range-row">
              <div className="search-range-input">
                <Input
                  type="number"
                  placeholder={t("advancedSearch.priceExactPlaceholder")}
                  value={state.exactValue}
                  onChange={(e) =>
                    onChange({ ...state, exactValue: e.target.value })
                  }
                  onBlur={() => {
                    const corrected = correctPriceOnBlur(state.exactValue);
                    if (corrected !== state.exactValue) {
                      onChange({ ...state, exactValue: corrected });
                    }
                  }}
                  maxLength={16}
                  className={rangeError ? "search-input-error" : ""}
                />
              </div>
              <div className="search-range-unit">
                <Select
                  value={state.currency}
                  onValueChange={(val) => onChange({ ...state, currency: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="search-range-row">
              <div className="search-range-input">
                <Input
                  type="number"
                  placeholder={t("advancedSearch.rangeFrom")}
                  value={state.rangeFrom}
                  onChange={(e) =>
                    onChange({ ...state, rangeFrom: e.target.value })
                  }
                  onBlur={() => {
                    const corrected = correctPriceOnBlur(state.rangeFrom);
                    if (corrected !== state.rangeFrom) {
                      onChange({ ...state, rangeFrom: corrected });
                    }
                  }}
                  maxLength={16}
                  className={fromError || rangeError ? "search-input-error" : ""}
                />
              </div>
              <span className="search-range-separator">~</span>
              <div className="search-range-input">
                <Input
                  type="number"
                  placeholder={t("advancedSearch.rangeTo")}
                  value={state.rangeTo}
                  onChange={(e) =>
                    onChange({ ...state, rangeTo: e.target.value })
                  }
                  onBlur={() => {
                    const corrected = correctPriceOnBlur(state.rangeTo);
                    if (corrected !== state.rangeTo) {
                      onChange({ ...state, rangeTo: corrected });
                    }
                  }}
                  maxLength={16}
                  className={toError || rangeError ? "search-input-error" : ""}
                />
              </div>
              <div className="search-range-unit">
                <Select
                  value={state.currency}
                  onValueChange={(val) => onChange({ ...state, currency: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </>
      )}
      <span className="search-field-help">{t("advancedSearch.priceHelp")}</span>
      {fromError && (
        <span className="search-field-error">
          {t("advancedSearch.rangeFrom")}: {t(`advancedSearch.validation.${fromError}`)}
        </span>
      )}
      {toError && (
        <span className="search-field-error">
          {t("advancedSearch.rangeTo")}: {t(`advancedSearch.validation.${toError}`)}
        </span>
      )}
      {rangeError && (
        <span className="search-field-error">
          {t(`advancedSearch.validation.${rangeError}`)}
        </span>
      )}
    </div>
  );
}

/**
 * CPU 核心数搜索字段
 * 作用：两种搜索模式
 *   - 精确搜索：输入整数进行精确匹配
 *   - 范围搜索（默认）：输入最少/最多核心数范围
 * 限制：必须为正整数，不允许为 0，为空则不参与搜索
 * 失焦校正：0 → 1，负数 → 取绝对值
 */
function CpuCoresSearchField({
  state,
  onChange,
  errors,
  t,
}: {
  state: CpuCoresFilter;
  onChange: (val: CpuCoresFilter) => void;
  errors: ValidationErrors;
  t: (key: string) => string;
}) {
  const fromError = errors.cpu_cores_from;
  const toError = errors.cpu_cores_to;
  const rangeError = errors.cpu_cores;

  const handleBlur = (field: "exactValue" | "rangeFrom" | "rangeTo") => {
    const corrected = correctZeroAndNegative(state[field]);
    if (corrected !== state[field]) {
      onChange({ ...state, [field]: corrected });
    }
  };

  return (
    <div className="search-field-item" style={{ marginBottom: 12 }}>
      <label className="search-field-label">
        {t("advancedSearch.field.cpu_cores")}
      </label>
      <div className="search-toggle-row">
        {/* 精确/范围模式开关：ON=精确，OFF=范围（默认） */}
        <Switch
          checked={state.isExact}
          onCheckedChange={(checked) =>
            onChange({ ...state, isExact: checked })
          }
        />
        <span className="search-toggle-label">
          {state.isExact
            ? t("advancedSearch.exactToggle")
            : t("advancedSearch.rangeToggle")}
        </span>
      </div>
      {state.isExact ? (
        <Input
          type="number"
          placeholder={t("advancedSearch.cpuCoresPlaceholder")}
          value={state.exactValue}
          onChange={(e) => onChange({ ...state, exactValue: e.target.value })}
          onBlur={() => handleBlur("exactValue")}
          step="1"
          min="1"
          maxLength={16}
          className={rangeError ? "search-input-error" : ""}
        />
      ) : (
        <div className="search-range-row">
          <div className="search-range-input">
            <Input
              type="number"
              placeholder={t("advancedSearch.rangeFrom")}
              value={state.rangeFrom}
              onChange={(e) =>
                onChange({ ...state, rangeFrom: e.target.value })
              }
              onBlur={() => handleBlur("rangeFrom")}
              step="1"
              min="1"
              maxLength={16}
              className={fromError || rangeError ? "search-input-error" : ""}
            />
          </div>
          <span className="search-range-separator">~</span>
          <div className="search-range-input">
            <Input
              type="number"
              placeholder={t("advancedSearch.rangeTo")}
              value={state.rangeTo}
              onChange={(e) =>
                onChange({ ...state, rangeTo: e.target.value })
              }
              onBlur={() => handleBlur("rangeTo")}
              step="1"
              min="1"
              maxLength={16}
              className={toError || rangeError ? "search-input-error" : ""}
            />
          </div>
        </div>
      )}
      {fromError && (
        <span className="search-field-error">
          {t("advancedSearch.rangeFrom")}: {t(`advancedSearch.validation.${fromError}`)}
        </span>
      )}
      {toError && (
        <span className="search-field-error">
          {t("advancedSearch.rangeTo")}: {t(`advancedSearch.validation.${toError}`)}
        </span>
      )}
      {rangeError && (
        <span className="search-field-error">
          {t(`advancedSearch.validation.${rangeError}`)}
        </span>
      )}
    </div>
  );
}

/**
 * 日期搜索字段 (expired_at)
 * 作用：开关切换精确日期/范围搜索模式
 *   - 精确模式：单个日期输入（年月日），匹配同一 UTC+8 日历日
 *   - 范围模式（默认）：两个日期输入（from/to），支持单侧范围
 * 限制：日期输入为 UTC+8 北京时间，后台存储 ISO UTC 格式需转换
 *       为空则不参与搜索
 */
function DateSearchField({
  state,
  onChange,
  errors,
  t,
}: {
  state: { mode: DateSearchMode; exactDate: string; rangeFrom: string; rangeTo: string };
  onChange: (val: { mode: DateSearchMode; exactDate: string; rangeFrom: string; rangeTo: string }) => void;
  errors: ValidationErrors;
  t: (key: string) => string;
}) {
  return (
    <div className="search-field-item">
      <label className="search-field-label">
        {t("advancedSearch.field.expired_at")}
      </label>

      {/* 日期模式切换开关：ON=精确日期, OFF=范围搜索（默认） */}
      <div className="search-toggle-row">
        <Switch
          checked={state.mode === "exact"}
          onCheckedChange={(checked) =>
            onChange({ ...state, mode: checked ? "exact" : "range" })
          }
        />
        <span className="search-toggle-label">
          {state.mode === "exact"
            ? t("advancedSearch.dateExactMode")
            : t("advancedSearch.dateRangeMode")}
        </span>
      </div>

      {state.mode === "exact" ? (
        /* 精确日期输入 */
        <input
          type="date"
          className={`flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${errors.expired_at ? "search-input-error" : ""}`}
          value={state.exactDate}
          onChange={(e) => onChange({ ...state, exactDate: e.target.value })}
        />
      ) : (
        /* 范围日期输入：from 和 to */
        <div className="search-date-inputs">
          <div className="search-date-input">
            <input
              type="date"
              className={`flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${errors.expired_at_from ? "search-input-error" : ""}`}
              value={state.rangeFrom}
              onChange={(e) =>
                onChange({ ...state, rangeFrom: e.target.value })
              }
              placeholder={t("advancedSearch.dateFrom")}
            />
          </div>
          <span className="search-range-separator">~</span>
          <div className="search-date-input">
            <input
              type="date"
              className={`flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${errors.expired_at_to ? "search-input-error" : ""}`}
              value={state.rangeTo}
              onChange={(e) =>
                onChange({ ...state, rangeTo: e.target.value })
              }
              placeholder={t("advancedSearch.dateTo")}
            />
          </div>
        </div>
      )}

      <span className="search-field-help">{t("advancedSearch.dateHelp")}</span>
      {errors.expired_at && (
        <span className="search-field-error">
          {t(`advancedSearch.validation.${errors.expired_at}`)}
        </span>
      )}
      {errors.expired_at_from && (
        <span className="search-field-error">
          {t(`advancedSearch.validation.${errors.expired_at_from}`)}
        </span>
      )}
      {errors.expired_at_to && (
        <span className="search-field-error">
          {t(`advancedSearch.validation.${errors.expired_at_to}`)}
        </span>
      )}
    </div>
  );
}

/**
 * 交换空间搜索字段
 * 作用：
 *   - 关闭搜索开关 ON：搜索已关闭 SWAP 的节点 (swap_total === 0)
 *   - 关闭搜索开关 OFF：使用 from/to 范围搜索 + 单位下拉
 * 限制：为空则不参与搜索
 */
function SwapSearchField({
  state,
  onChange,
  errors,
  t,
}: {
  state: SwapFilter;
  onChange: (val: SwapFilter) => void;
  errors: ValidationErrors;
  t: (key: string) => string;
}) {
  const fromError = errors.swap_total_from;
  const toError = errors.swap_total_to;
  const rangeError = errors.swap_total;

  return (
    <div className="search-section">
      <div className="search-field-item" style={{ marginBottom: 12 }}>
        <label className="search-field-label">
          {t("advancedSearch.field.swap_total")}
        </label>
        <div className="search-toggle-row">
          {/* 关闭搜索开关：ON=搜索已关闭SWAP的节点(0)，OFF=范围搜索 */}
          <Switch
            checked={state.isDisabledSearch}
            onCheckedChange={(checked) =>
              onChange({ ...state, isDisabledSearch: checked })
            }
          />
          <span className="search-toggle-label">
            {t("advancedSearch.swapDisabledToggle")}
          </span>
        </div>
        {!state.isDisabledSearch && (
          <div className="search-range-row">
            {/* 最小值输入 */}
            <div className="search-range-input">
              <Input
                type="number"
                placeholder={t("advancedSearch.rangeFrom")}
                value={state.from}
                onChange={(e) => onChange({ ...state, from: e.target.value })}
                onBlur={() => {
                  const corrected = correctNegativeOnly(state.from);
                  if (corrected !== state.from) {
                    onChange({ ...state, from: corrected });
                  }
                }}
                step="0.01"
                maxLength={16}
                className={fromError || rangeError ? "search-input-error" : ""}
              />
            </div>
            <span className="search-range-separator">~</span>
            {/* 最大值输入 */}
            <div className="search-range-input">
              <Input
                type="number"
                placeholder={t("advancedSearch.rangeTo")}
                value={state.to}
                onChange={(e) => onChange({ ...state, to: e.target.value })}
                onBlur={() => {
                  const corrected = correctNegativeOnly(state.to);
                  if (corrected !== state.to) {
                    onChange({ ...state, to: corrected });
                  }
                }}
                step="0.01"
                maxLength={16}
                className={toError || rangeError ? "search-input-error" : ""}
              />
            </div>
            {/* 单位选择下拉 */}
            <div className="search-range-unit">
              <Select
                value={state.unit}
                onValueChange={(val) => onChange({ ...state, unit: val as SwapUnit })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["MB", "GB"] as SwapUnit[]).map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <span className="search-field-help">{t("advancedSearch.swapHelp")}</span>
        {fromError && (
          <span className="search-field-error">
            {t("advancedSearch.rangeFrom")}: {t(`advancedSearch.validation.${fromError}`)}
          </span>
        )}
        {toError && (
          <span className="search-field-error">
            {t("advancedSearch.rangeTo")}: {t(`advancedSearch.validation.${toError}`)}
          </span>
        )}
        {rangeError && (
          <span className="search-field-error">
            {t(`advancedSearch.validation.${rangeError}`)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * 范围搜索字段（mem_total/disk_total/traffic_limit）
 * 作用：两个数字输入框（from/to）+ 单位下拉
 *   - 只填 from：大于等于
 *   - 只填 to：小于等于
 *   - 两个都填：范围内
 * 限制：
 *   - 小数最多精确到两位
 *   - to 必须大于 from
 *   - 输入框最大长度 16，防止 JS 溢出
 *   - 为空则不参与搜索
 *   - onBlurCorrect: 失焦时自动更正值
 */
function RangeSearchField<U extends string>({
  fieldKey,
  state,
  onChange,
  units,
  errors,
  onBlurCorrect,
  t,
}: {
  fieldKey: string;
  state: { from: string; to: string; unit: U };
  onChange: (val: { from: string; to: string; unit: U }) => void;
  units: U[];
  errors: ValidationErrors;
  onBlurCorrect?: (value: string) => string;
  t: (key: string) => string;
}) {
  const fromError = errors[`${fieldKey}_from`];
  const toError = errors[`${fieldKey}_to`];
  const rangeError = errors[fieldKey];

  return (
    <div className="search-field-item" style={{ marginBottom: 12 }}>
      <label className="search-field-label">
        {t(`advancedSearch.field.${fieldKey}`)}
      </label>
      <div className="search-range-row">
        {/* 最小值输入 */}
        <div className="search-range-input">
          <Input
            type="number"
            placeholder={t("advancedSearch.rangeFrom")}
            value={state.from}
            onChange={(e) => onChange({ ...state, from: e.target.value })}
            onBlur={onBlurCorrect ? () => {
              const corrected = onBlurCorrect(state.from);
              if (corrected !== state.from) {
                onChange({ ...state, from: corrected });
              }
            } : undefined}
            step="0.01"
            maxLength={16}
            className={fromError || rangeError ? "search-input-error" : ""}
          />
        </div>
        <span className="search-range-separator">~</span>
        {/* 最大值输入 */}
        <div className="search-range-input">
          <Input
            type="number"
            placeholder={t("advancedSearch.rangeTo")}
            value={state.to}
            onChange={(e) => onChange({ ...state, to: e.target.value })}
            onBlur={onBlurCorrect ? () => {
              const corrected = onBlurCorrect(state.to);
              if (corrected !== state.to) {
                onChange({ ...state, to: corrected });
              }
            } : undefined}
            step="0.01"
            maxLength={16}
            className={toError || rangeError ? "search-input-error" : ""}
          />
        </div>
        {/* 单位选择下拉 */}
        <div className="search-range-unit">
          <Select
            value={state.unit}
            onValueChange={(val) => onChange({ ...state, unit: val as U })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {units.map((unit) => (
                <SelectItem key={unit} value={unit}>
                  {unit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {fromError && (
        <span className="search-field-error">
          {t("advancedSearch.rangeFrom")}: {t(`advancedSearch.validation.${fromError}`)}
        </span>
      )}
      {toError && (
        <span className="search-field-error">
          {t("advancedSearch.rangeTo")}: {t(`advancedSearch.validation.${toError}`)}
        </span>
      )}
      {rangeError && (
        <span className="search-field-error">
          {t(`advancedSearch.validation.${rangeError}`)}
        </span>
      )}
    </div>
  );
}
