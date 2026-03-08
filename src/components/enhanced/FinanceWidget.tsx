import { useAppConfig } from "@/config";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNodeData } from "@/contexts/NodeDataContext";
import {
  useExchangeRates,
  CURRENCY_SYMBOLS,
  CURRENCY_OPTIONS,
  CURRENCY_NAMES,
} from "./useExchangeRates";
import type { ExchangeRates } from "./useExchangeRates";
import type { NodeData } from "@/types/node.d";
import {
  parsePriceToCNY,
  calculateRemainingValue,
  calculateMonthlyExpense,
} from "./financeUtils";
import { ServerTradeModal } from "./ServerTradeModal";
import { useLocale } from "@/config/hooks";

type SortBy = "weight_asc" | "weight_desc" | "price_asc" | "price_desc";

const SORT_VALUES: SortBy[] = ["weight_asc", "weight_desc", "price_asc", "price_desc"];
const SORT_LABEL_KEYS: Record<SortBy, string> = {
  weight_asc: "enhanced.finance.sortWeightAsc",
  weight_desc: "enhanced.finance.sortWeightDesc",
  price_asc: "enhanced.finance.sortPriceAsc",
  price_desc: "enhanced.finance.sortPriceDesc",
};

function sortNodes(nodes: NodeData[], sortBy: SortBy): NodeData[] {
  return nodes.slice().sort((a, b) => {
    switch (sortBy) {
      case "weight_asc":
        return a.weight - b.weight;
      case "weight_desc":
        return b.weight - a.weight;
      case "price_asc":
        return a.price - b.price;
      case "price_desc":
        return b.price - a.price;
      default:
        return 0;
    }
  });
}

interface FinanceData {
  totalNodes: number;
  totalPriceCNY: number;
  monthlyPriceCNY: number;
  totalRemainValCNY: number;
  specialCases: string[];
  items: {
    node: NodeData;
    displayVal: number;
    remainingValueCNY: number;
    tooltipText: string;
    isSpecialFree: boolean;
    isLongTerm: boolean;
    isFreeTag: boolean;
  }[];
}

function calculateFinanceData(
  nodes: NodeData[],
  rates: ExchangeRates,
  userCurrency: string,
  excludeFree: boolean,
  sortBy: SortBy,
  t: (key: string, params?: Record<string, string | number>) => string
): FinanceData {
  const sorted = sortNodes(nodes, sortBy);
  const targetRate = rates[userCurrency] || 1;
  const now = new Date();

  let totalPriceCNY = 0;
  let monthlyPriceCNY = 0;
  let totalRemainValCNY = 0;
  const specialCases: string[] = [];

  const items = sorted.map((node) => {
    const isFreeTag = node.tags ? node.tags.includes(t("enhanced.finance.freeTag")) : false;
    const { price: priceCNY, isSpecialFree } = parsePriceToCNY(node, rates);
    const { remainingValue, isLongTerm } = calculateRemainingValue(
      node,
      rates,
      now
    );
    const monthly = calculateMonthlyExpense(priceCNY, node.billing_cycle);

    let tooltipText = "";
    if (isSpecialFree) {
      specialCases.push(`${node.name} (${t("enhanced.finance.freeChicken")})`);
      tooltipText = `${node.name} (${t("enhanced.finance.freeChicken")})`;
    } else if (isLongTerm) {
      specialCases.push(`${node.name} (${t("enhanced.finance.longTermChicken")})`);
      tooltipText = t("enhanced.finance.longTermTooltip");
    } else if (isFreeTag && !(excludeFree && isFreeTag)) {
      specialCases.push(`${node.name} (${t("enhanced.finance.freeTag")})`);
      tooltipText = `${node.name} (${t("enhanced.finance.freeTag")})`;
    }

    const shouldExclude = excludeFree && isFreeTag;
    if (!shouldExclude) {
      totalPriceCNY += priceCNY;
      monthlyPriceCNY += monthly;
      totalRemainValCNY += remainingValue;
    }

    return {
      node,
      displayVal: remainingValue * targetRate,
      remainingValueCNY: remainingValue,
      tooltipText,
      isSpecialFree,
      isLongTerm,
      isFreeTag,
    };
  });

  return {
    totalNodes: nodes.length,
    totalPriceCNY,
    monthlyPriceCNY,
    totalRemainValCNY,
    specialCases,
    items,
  };
}

export function FinanceWidget() {
  const { nodes } = useNodeData();
  const { rates, lastUpdated, refreshRates } = useExchangeRates();
  const { t } = useLocale();
  const { enableSearchButton, enableAdvancedSearch } = useAppConfig();
  const isAdvancedSearchEnabled = enableSearchButton && enableAdvancedSearch;
  const [isOpen, setIsOpen] = useState(false);
  const [userCurrency, setUserCurrency] = useState<string>(
    () => localStorage.getItem("fin_currency") || "CNY"
  );
  const [sortBy, setSortBy] = useState<SortBy>(
    () => (localStorage.getItem("fin_sort") as SortBy) || "weight_asc"
  );
  const [excludeFree, setExcludeFree] = useState<boolean>(() => {
    const stored = localStorage.getItem("fin_exclude_free");
    if (stored === null) return true;
    return stored === "true";
  });
  const [tradeNode, setTradeNode] = useState<NodeData | null>(null);
  const [showRatesInfo, setShowRatesInfo] = useState(false);

  // URL 分享参数：交易日期和金额
  const [initialTradeDate, setInitialTradeDate] = useState<string | undefined>();
  const [initialTradeAmount, setInitialTradeAmount] = useState<string | undefined>();
  const urlTradeHandled = useRef(false);

  // 监听来自 Header 按钮的自定义事件
  useEffect(() => {
    const handler = () => setIsOpen((prev) => !prev);
    window.addEventListener("toggle-finance-widget", handler);
    return () => window.removeEventListener("toggle-finance-widget", handler);
  }, []);

  // 从 URL 加载交易模态框参数（仅在首次加载时执行）
  useEffect(() => {
    if (urlTradeHandled.current || nodes.length === 0) return;
    // 如果没有同时开启【搜索按钮】和【高级搜索】，直接中止，不打开交易面板
    if (!isAdvancedSearchEnabled) {
      urlTradeHandled.current = true;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const tmCur = params.get("tm_cur");
    const tmDate = params.get("tm_date");
    const tmAmount = params.get("tm_amount");
    const tq = params.get("t_q");

    // 如果有 tm_cur，更新货币单位到 localStorage 和状态
    if (tmCur && ["CNY", "USD", "HKD", "EUR", "GBP", "JPY"].includes(tmCur)) {
      setUserCurrency(tmCur);
      localStorage.setItem("fin_currency", tmCur);
    }

    // 如果有 t_q（UUID搜索），尝试打开交易模态框
    if (tq && (tmDate || tmAmount || tmCur)) {
      const targetNode = nodes.find((n) => n.uuid === tq);
      if (targetNode) {
        urlTradeHandled.current = true;
        setInitialTradeDate(tmDate || undefined);
        setInitialTradeAmount(tmAmount || undefined);
        setTradeNode(targetNode);
      }
    }
  }, [nodes]);

  const financeData = useMemo(
    () => calculateFinanceData(nodes, rates, userCurrency, excludeFree, sortBy, t),
    [nodes, rates, userCurrency, excludeFree, sortBy, t]
  );

  const sym = CURRENCY_SYMBOLS[userCurrency] || userCurrency;
  const targetRate = rates[userCurrency] || 1;

  const handleCurrencyChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      setUserCurrency(val);
      localStorage.setItem("fin_currency", val);
    },
    []
  );

  const handleSortChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value as SortBy;
      setSortBy(val);
      localStorage.setItem("fin_sort", val);
    },
    []
  );

  const handleToggleFree = useCallback(() => {
    setExcludeFree((prev) => {
      const next = !prev;
      localStorage.setItem("fin_exclude_free", String(next));
      return next;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    refreshRates();
  }, [refreshRates]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  // 汇率列表
  const ratesList = useMemo(() => {
    const all = ["USD", "HKD", "EUR", "GBP", "JPY", "CNY"].filter(
      (c) => c !== userCurrency
    );
    return all.map((c) => ({
      code: c,
      name: CURRENCY_NAMES[c] || c,
      rate: (rates[userCurrency] || 1) / (rates[c] || 1),
    }));
  }, [rates, userCurrency]);

  return (
    <>
      {/* 资产面板 */}
      <div
        id="finance-widget"
        className={`finance-widget${isOpen ? " show" : ""}`}>
        <div className="bubble-header">
          <h3 className="bubble-title">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
              <path d="M12 18V6" />
            </svg>
            {t("enhanced.finance.title")}
          </h3>
          <button className="bubble-close" onClick={handleClose}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="currentColor"
              viewBox="0 0 16 16">
              <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z" />
            </svg>
          </button>
        </div>
        <div className="bubble-content">
          {/* 汇总 */}
          <div className="finance-row">
            <span>{t("enhanced.finance.serverCount")}</span>
            <span className="finance-value">{financeData.totalNodes}</span>
          </div>
          <div className="finance-row">
            <span>{t("enhanced.finance.totalValue")}</span>
            <span className="finance-value">
              {sym} {(financeData.totalPriceCNY * targetRate).toFixed(2)}
            </span>
          </div>
          <div className="finance-row">
            <span>{t("enhanced.finance.monthlyExpense")}</span>
            <span className="finance-value">
              {sym} {(financeData.monthlyPriceCNY * targetRate).toFixed(2)}
            </span>
          </div>
          <div className="finance-row">
            <span>{t("enhanced.finance.remainingValue")}</span>
            <div className="item-right">
              <span className="finance-value">
                {sym}{" "}
                {(financeData.totalRemainValCNY * targetRate).toFixed(2)}
              </span>
              {financeData.specialCases.length > 0 && (
                <div
                  className="help-icon show-help"
                  data-tooltip={financeData.specialCases.join("\n")}
                  onClick={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).classList.toggle("active");
                  }}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <path d="M12 17h.01" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          <div className="finance-separator" />

          {/* 服务器列表 */}
          <div className="finance-list">
            {financeData.items.map((item) => (
              <div
                key={item.node.uuid}
                className="finance-list-item"
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest(".help-icon")) return;
                  setTradeNode(item.node);
                }}>
                <span
                  className="item-name"
                  title={item.node.public_remark || item.node.name}>
                  {item.node.name}
                </span>
                <div className="item-right">
                  <span className="item-value">
                    {sym} {item.displayVal.toFixed(2)}
                  </span>
                  {item.tooltipText && (
                    <div
                      className="help-icon"
                      data-tooltip={item.tooltipText}
                      onClick={(e) => {
                        e.stopPropagation();
                        (e.currentTarget as HTMLElement).classList.toggle(
                          "active"
                        );
                      }}>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <path d="M12 17h.01" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 汇率信息 */}
          <div
            className="finance-tooltip"
            style={{ cursor: "pointer" }}
            onClick={() => setShowRatesInfo((p) => !p)}>
            {lastUpdated
              ? lastUpdated === "使用默认汇率"
                ? t("enhanced.finance.defaultRates")
                : t("enhanced.finance.ratesUpdated", { time: lastUpdated })
              : t("enhanced.finance.ratesUpdating")}
          </div>

          {showRatesInfo && (
            <>
              <div className="finance-separator" />
              <div className="finance-exchange-rates">
                {ratesList.map((r) => (
                  <div key={r.code} className="finance-rate-item">
                    <span>1 {r.name}</span>
                    <span className="finance-rate-value">
                      {sym} {r.rate.toFixed(6)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 控制栏 */}
          <div className="finance-controls">
            <div style={{ display: "flex", gap: 8 }}>
              <select
                className="finance-select"
                value={userCurrency}
                onChange={handleCurrencyChange}>
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                className="finance-select"
                value={sortBy}
                onChange={handleSortChange}>
                {SORT_VALUES.map((val) => (
                  <option key={val} value={val}>
                    {t(SORT_LABEL_KEYS[val])}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <button
                className={`finance-btn${excludeFree ? " active" : ""}`}
                title={
                  excludeFree
                    ? t("enhanced.finance.excludeFreeOn")
                    : t("enhanced.finance.excludeFreeOff")
                }
                onClick={handleToggleFree}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round">
                  <path d="M19 5c-1.5 0-2.8 0.6-3.8 1.6l-1.2 1.2-1.2-1.2C11.8 5.6 10.5 5 9 5 5.5 5 3 7.6 3 11c0 3.5 3 7.6 9 13 6-5.4 9-9.5 9-13 0-3.4-2.5-6-6-6z" />
                </svg>
              </button>
              <button
                className="finance-btn"
                title={t("enhanced.finance.refresh")}
                onClick={handleRefresh}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 交易模态框 */}
      {tradeNode && (
        <ServerTradeModal
          node={tradeNode}
          rates={rates}
          userCurrency={userCurrency}
          onClose={() => {
            setTradeNode(null);
            setInitialTradeDate(undefined);
            setInitialTradeAmount(undefined);
          }}
          initialTradeDate={initialTradeDate}
          initialTradeAmount={initialTradeAmount}
        />
      )}
    </>
  );
}
