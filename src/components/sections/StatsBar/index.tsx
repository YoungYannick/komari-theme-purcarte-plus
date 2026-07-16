import { useEffect, useMemo, useState } from "react";
import { cn, formatBytes } from "@/utils";
import { useAppConfig } from "@/config";
import { useIsMobile } from "@/hooks/useMobile";
import { CurrentTimeChip, StatChip } from "./StatChips";
import { GroupSelector } from "./GroupSelector";
import { SortToggleMenu } from "./SortToggleMenu";
import { StatsToggleMenu } from "./StatsToggleMenu";
import { useLocale } from "@/config/hooks";
import type { StatsBarProps, SortKey } from "./types";
import { Card } from "@/components/ui/card";
import { useNodeData } from "@/contexts/NodeDataContext";
import {
  CURRENCY_SYMBOLS,
  useExchangeRates,
} from "@/components/enhanced/useExchangeRates";
import { calculateFinanceNodeValues } from "@/components/enhanced/financeUtils";
import { hasDelimitedTag, normalizeFreeTag } from "@/utils/tagHelper";
export type { StatsBarProps };

interface StatEntry {
  key: string;
  label: string;
  lines: string[];
  isLabelVertical?: boolean;
  textLeft?: boolean;
  helpText?: string;
}

export const StatsBar = (props: StatsBarProps) => {
  const {
    displayOptions,
    setDisplayOptions,
    stats,
    loading,
    groups,
    selectedGroup,
    onSelectGroup,
    onSort: onSortProp,
    sortKey: sortKeyProp,
    sortDirection: sortDirectionProp,
  } = props;

  const [sortState, setSortState] = useState<{
    key: SortKey;
    direction: "asc" | "desc";
  }>({
    key: sortKeyProp ?? null,
    direction: sortDirectionProp ?? "desc",
  });

  useEffect(() => {
    setSortState({
      key: sortKeyProp ?? null,
      direction: sortDirectionProp ?? "desc",
    });
  }, [sortKeyProp, sortDirectionProp]);

  const { key: sortKey, direction: sortDirection } = sortState;

  const handleSort = (key: SortKey) => {
    let newDirection: "asc" | "desc" = "desc";
    if (key !== null && key === sortKey) {
      newDirection = sortDirection === "desc" ? "asc" : "desc";
    }
    setSortState({ key, direction: newDirection });
    if (onSortProp) {
      onSortProp(key, newDirection);
    }
  };

  const {
    isShowStatsInHeader,
    mergeGroupsWithStats,
    enableGroupedBar,
    enableSortControl,
    enableFinanceWidget,
    freeTag,
  } = useAppConfig();
  const isMobile = useIsMobile();
  const { t } = useLocale();
  const { nodes } = useNodeData();
  const [financeCurrency, setFinanceCurrency] = useState(
    () => localStorage.getItem("fin_currency") || "CNY"
  );
  const [excludeFree, setExcludeFree] = useState(() => {
    const stored = localStorage.getItem("fin_exclude_free");
    return stored === null ? true : stored === "true";
  });
  const showFinanceStats =
    enableFinanceWidget &&
    (displayOptions.assetValue || displayOptions.monthlyExpense);
  const { rates } = useExchangeRates(financeCurrency, showFinanceStats);
  const financeSymbol = CURRENCY_SYMBOLS[financeCurrency] || financeCurrency;
  const configuredFreeTag = normalizeFreeTag(freeTag);

  useEffect(() => {
    if (!enableFinanceWidget) return;

    const handleCurrencyChange = (event: Event) => {
      const next =
        (event as CustomEvent<string>).detail ||
        localStorage.getItem("fin_currency") ||
        "CNY";
      setFinanceCurrency(next);
    };
    const handleExcludeFreeChange = (event: Event) => {
      const next = (event as CustomEvent<boolean>).detail;
      setExcludeFree(
        typeof next === "boolean"
          ? next
          : localStorage.getItem("fin_exclude_free") !== "false"
      );
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "fin_currency") {
        setFinanceCurrency(event.newValue || "CNY");
      }
      if (event.key === "fin_exclude_free") {
        setExcludeFree(event.newValue !== "false");
      }
    };

    window.addEventListener("finance-currency-change", handleCurrencyChange);
    window.addEventListener(
      "finance-exclude-free-change",
      handleExcludeFreeChange
    );
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(
        "finance-currency-change",
        handleCurrencyChange
      );
      window.removeEventListener(
        "finance-exclude-free-change",
        handleExcludeFreeChange
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, [enableFinanceWidget]);

  const financeSummary = useMemo(() => {
    let totalPrice = 0;
    let monthlyExpense = 0;
    let totalRemainingValue = 0;
    const specialCases: string[] = [];
    const now = new Date();

    if (!showFinanceStats) {
      return { totalPrice, monthlyExpense, totalRemainingValue, specialCases };
    }

    for (const node of nodes) {
      const isFreeTag = hasDelimitedTag(node.tags, configuredFreeTag);
      const values = calculateFinanceNodeValues(node, rates, now);

      if (values.isSpecialFree) {
        specialCases.push(
          `${node.name} (${t("enhanced.finance.freeChicken")})`
        );
      } else if (values.isLongTerm) {
        specialCases.push(
          `${node.name} (${t("enhanced.finance.longTermChicken")})`
        );
      } else if (isFreeTag && excludeFree) {
        specialCases.push(`${node.name} (${configuredFreeTag})`);
      }

      if (values.isSpecialFree || (excludeFree && isFreeTag)) continue;

      totalPrice += values.priceBase;
      monthlyExpense += values.monthlyExpense;
      totalRemainingValue += values.remainingValue;
    }

    return { totalPrice, monthlyExpense, totalRemainingValue, specialCases };
  }, [
    configuredFreeTag,
    excludeFree,
    nodes,
    rates,
    showFinanceStats,
    t,
  ]);

  const resolvedStats = useMemo<StatEntry[]>(() => {
    const getLabel = (compactLabel: string, fullLabel: string) =>
      isShowStatsInHeader ? (isMobile ? fullLabel : compactLabel) : fullLabel;

    const entries: StatEntry[] = [];
    if (displayOptions.currentOnline) {
      entries.push({
        key: "currentOnline",
        label: getLabel(
          t("statsBar.currentOnline"),
          t("statsBar.currentOnline")
        ),
        lines: [loading ? "..." : `${stats.onlineCount} / ${stats.totalCount}`],
      });
    }
    if (displayOptions.regionOverview) {
      entries.push({
        key: "regionOverview",
        label: getLabel(t("statsBar.region"), t("statsBar.region")),
        lines: [loading ? "..." : String(stats.uniqueRegions)],
      });
    }
    const useCompactFinanceText = isShowStatsInHeader && !isMobile;
    const specialCasesText = financeSummary.specialCases.join("\n");
    const formatMoney = (value: number) =>
      `${financeSymbol} ${value.toFixed(2)}`;

    if (enableFinanceWidget && displayOptions.assetValue) {
      entries.push({
        key: "assetValue",
        label: getLabel(
          t("statsBar.assetValueShort"),
          t("statsBar.assetValue")
        ),
        lines: loading
          ? ["...", "..."]
          : [
              `${t("statsBar.totalValueShort")} ${formatMoney(
                financeSummary.totalPrice
              )}`,
              `${t("statsBar.remainingValueShort")} ${formatMoney(
                financeSummary.totalRemainingValue
              )}`,
            ],
        isLabelVertical: useCompactFinanceText,
        textLeft: true,
        helpText: specialCasesText || undefined,
      });
    }
    if (enableFinanceWidget && displayOptions.monthlyExpense) {
      entries.push({
        key: "monthlyExpense",
        label: getLabel(
          t("statsBar.monthlyExpenseShort"),
          t("enhanced.finance.monthlyExpense")
        ),
        lines: [
          loading ? "..." : formatMoney(financeSummary.monthlyExpense),
        ],
        isLabelVertical: useCompactFinanceText,
        helpText: specialCasesText || undefined,
      });
    }
    if (displayOptions.trafficOverview) {
      entries.push({
        key: "trafficOverview",
        label: getLabel(t("statsBar.trafficShort"), t("statsBar.traffic")),
        lines: loading
          ? ["..."]
          : [
              `${t("node.uploadPrefix")} ${formatBytes(stats.totalTrafficUp)}`,
              `${t("node.downloadPrefix")} ${formatBytes(
                stats.totalTrafficDown
              )}`,
            ],
        isLabelVertical: !isMobile && isShowStatsInHeader,
        textLeft: true,
      });
    }
    if (displayOptions.networkSpeed) {
      entries.push({
        key: "networkSpeed",
        label: getLabel(
          t("statsBar.networkSpeedShort"),
          t("statsBar.networkSpeed")
        ),
        lines: loading
          ? ["..."]
          : [
              `${t("node.uploadPrefix")} ${formatBytes(
                stats.currentSpeedUp
              )}/s`,
              `${t("node.downloadPrefix")} ${formatBytes(
                stats.currentSpeedDown
              )}/s`,
            ],
        isLabelVertical: !isMobile && isShowStatsInHeader,
        textLeft: true,
      });
    }
    return entries;
  }, [
    displayOptions,
    enableFinanceWidget,
    financeSummary,
    financeSymbol,
    loading,
    stats,
    isMobile,
    isShowStatsInHeader,
    t,
  ]);

  const hasVisibleStats =
    displayOptions.currentTime ||
    displayOptions.currentOnline ||
    displayOptions.regionOverview ||
    displayOptions.trafficOverview ||
    displayOptions.networkSpeed ||
    (enableFinanceWidget &&
      (displayOptions.assetValue || displayOptions.monthlyExpense));

  if (isShowStatsInHeader && !isMobile) {
    return (
      <div className="flex min-w-0 flex-wrap items-center justify-center gap-2">
        {enableGroupedBar && mergeGroupsWithStats && (
          <GroupSelector
            groups={groups}
            selectedGroup={selectedGroup}
            onSelectGroup={onSelectGroup}
          />
        )}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {displayOptions.currentTime && (
            <CurrentTimeChip isInHeader={true} isMobile={isMobile} />
          )}
          {resolvedStats.map(({ key, ...rest }) => (
            <StatChip
              key={key}
              {...rest}
              isInHeader={true}
              isMobile={isMobile}
            />
          ))}
          <StatsToggleMenu
            displayOptions={displayOptions}
            setDisplayOptions={setDisplayOptions}
          />
          {enableSortControl && (
            <SortToggleMenu
              onSort={handleSort}
              sortKey={sortKey}
              sortDirection={sortDirection}
            />
          )}
        </div>
      </div>
    );
  }

  const getGridTemplateColumns = () => {
    if (!isMobile) {
      return `repeat(auto-fit, minmax(${showFinanceStats ? "120px" : "100px"}, 1fr))`;
    }
    const visibleCount =
      resolvedStats.length +
      (displayOptions.currentTime ? 1 : 0) +
      (enableGroupedBar && mergeGroupsWithStats ? 1 : 0);

    if (showFinanceStats) return "repeat(2, minmax(0, 1fr))";
    return visibleCount >= 5
      ? "repeat(3, minmax(0, 1fr))"
      : "repeat(2, minmax(0, 1fr))";
  };

  return (
    <Card
      className={cn(
        "relative flex items-center text-primary my-4",
        isMobile ? "text-xs p-2" : "text-sm px-4 min-w-[300px] min-h-[5rem]"
      )}>
      <div
        className="grid w-full gap-2 text-center items-center py-3"
        style={{
          gridTemplateColumns: getGridTemplateColumns(),
          gridAutoRows: "min-content",
        }}>
        {enableGroupedBar && mergeGroupsWithStats && (
          <div className="flex flex-col items-center">
            <GroupSelector
              groups={groups}
              selectedGroup={selectedGroup}
              onSelectGroup={onSelectGroup}
            />
          </div>
        )}

        {hasVisibleStats ? (
          <>
            {displayOptions.currentTime && (
              <CurrentTimeChip isMobile={isMobile} />
            )}
            {resolvedStats.map(({ key, ...rest }) => (
              <StatChip key={key} {...rest} isMobile={isMobile} />
            ))}
          </>
        ) : (
          <span className="text-xs text-secondary-foreground">
            {t("statsBar.statsHidden")}
          </span>
        )}
      </div>
      <div className="absolute right-2 top-2">
        <StatsToggleMenu
          displayOptions={displayOptions}
          setDisplayOptions={setDisplayOptions}
        />
      </div>
      {enableSortControl && (
        <div className="absolute right-2">
          <SortToggleMenu
            onSort={handleSort}
            sortKey={sortKey}
            sortDirection={sortDirection}
          />
        </div>
      )}
    </Card>
  );
};
