import { useState, useEffect, lazy, Suspense, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useNodeData } from "@/contexts/NodeDataContext";
import { useLiveData } from "@/contexts/LiveDataContext";
import type { NodeData } from "@/types/node";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CalendarDays, Search } from "lucide-react";
import Instance from "./Instance";
const LoadCharts = lazy(() => import("./LoadCharts"));
const PingChart = lazy(() => import("./PingChart"));
import Loading from "@/components/loading";
import Flag from "@/components/sections/Flag";
import { useAppConfig } from "@/config";
import { useIsMobile } from "@/hooks/useMobile";
import { useLocale } from "@/config/hooks";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const CUSTOM_RANGE_HOURS = -1;

type CustomTimeRange = {
  start: string;
  end: string;
};

const toPositiveNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const toDateTimeLocalValue = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const buildRecentRange = (days: number): CustomTimeRange => {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    start: toDateTimeLocalValue(start),
    end: toDateTimeLocalValue(end),
  };
};

const toQueryRange = (range: CustomTimeRange) => {
  const start = new Date(range.start);
  const end = new Date(range.end);
  if (
    !range.start ||
    !range.end ||
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start
  ) {
    return null;
  }
  return { start: start.toISOString(), end: end.toISOString() };
};

const rangeHours = (range: { start: string; end: string } | null) => {
  if (!range) return 24;
  const hours =
    (new Date(range.end).getTime() - new Date(range.start).getTime()) /
    3_600_000;
  return Number.isFinite(hours) && hours > 0 ? hours : 24;
};

const InstancePage = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const { nodes: staticNodes, loading: nodesLoading } = useNodeData();
  const { liveData } = useLiveData();
  useNodeData();
  const [staticNode, setStaticNode] = useState<NodeData | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [chartType, setChartType] = useState<"load" | "ping">("load");
  const [displayedChartType, setDisplayedChartType] = useState<"load" | "ping">(
    "load"
  );
  const [chartAnimationState, setChartAnimationState] = useState<
    "idle" | "fading-out" | "fading-in"
  >("fading-in");
  const [loadHours, setLoadHours] = useState<number>(0);
  const [pingHours, setPingHours] = useState<number>(1); // 默认1小时
  const [customDraftRange, setCustomDraftRange] = useState<CustomTimeRange>(
    () => buildRecentRange(1)
  );
  const [customQueryRange, setCustomQueryRange] = useState<CustomTimeRange>(
    () => buildRecentRange(1)
  );
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);
  const { enableInstanceDetail, enablePingChart, publicSettings } =
    useAppConfig();
  const isMobile = useIsMobile();
  const { t } = useLocale();

  const loadMetricRetentionHours =
    toPositiveNumber(
      publicSettings?.load_metric_retention_days ??
        publicSettings?.metric_retention_days
    ) * 24;
  const pingMetricRetentionHours =
    toPositiveNumber(
      publicSettings?.ping_metric_retention_days ??
        publicSettings?.metric_retention_days
    ) * 24;
  const maxRecordPreserveTime =
    loadMetricRetentionHours ||
    toPositiveNumber(publicSettings?.record_preserve_time);
  const maxPingRecordPreserveTime =
    pingMetricRetentionHours ||
    toPositiveNumber(publicSettings?.ping_record_preserve_time) ||
    24;

  const timeRanges = useMemo(() => {
    return [
      { label: t("instancePage.live"), hours: 0 },
      { label: t("instancePage.hours", { count: 1 }), hours: 1 },
      { label: t("instancePage.hours", { count: 4 }), hours: 4 },
      { label: t("instancePage.days", { count: 1 }), hours: 24 },
      { label: t("instancePage.days", { count: 7 }), hours: 168 },
      { label: t("instancePage.days", { count: 30 }), hours: 720 },
    ];
  }, [t]);

  const pingTimeRanges = useMemo(() => {
    const filtered = timeRanges.filter(
      (range) => range.hours !== 0 && range.hours <= maxPingRecordPreserveTime
    );

    if (maxPingRecordPreserveTime > 720) {
      const dynamicLabel =
        maxPingRecordPreserveTime % 24 === 0
          ? t("instancePage.days", {
              count: Math.floor(maxPingRecordPreserveTime / 24),
            })
          : t("instancePage.hours", { count: maxPingRecordPreserveTime });
      filtered.push({
        label: dynamicLabel,
        hours: maxPingRecordPreserveTime,
      });
    }

    return filtered;
  }, [timeRanges, maxPingRecordPreserveTime, t]);

  const loadTimeRanges = useMemo(() => {
    const filtered = timeRanges.filter(
      (range) => range.hours <= maxRecordPreserveTime
    );
    if (maxRecordPreserveTime > 720) {
      const dynamicLabel =
        maxRecordPreserveTime % 24 === 0
          ? t("instancePage.days", {
              count: Math.floor(maxRecordPreserveTime / 24),
            })
          : t("instancePage.hours", { count: maxRecordPreserveTime });
      filtered.push({
        label: dynamicLabel,
        hours: maxRecordPreserveTime,
      });
    }

    return filtered;
  }, [timeRanges, maxRecordPreserveTime, t]);

  useEffect(() => {
    if (Array.isArray(staticNodes)) {
      const foundNode = staticNodes.find((n: NodeData) => n.uuid === uuid);
      setStaticNode(foundNode || null);
    }
  }, [staticNodes, uuid]);

  useEffect(() => {
    setIsReady(false);
  }, [uuid]);

  const stats = useMemo(() => {
    if (!staticNode || !liveData) return undefined;
    return liveData[staticNode.uuid];
  }, [staticNode, liveData]);

  const node = staticNode;
  const isOnline = stats?.online ?? false;
  const customQuery = useMemo(
    () => toQueryRange(customQueryRange),
    [customQueryRange]
  );
  const activeHours = chartType === "load" ? loadHours : pingHours;
  const isCustomRange = activeHours === CUSTOM_RANGE_HOURS;
  const activeMaxRecordHours =
    chartType === "load" ? maxRecordPreserveTime : maxPingRecordPreserveTime;
  const customQuickRanges = useMemo(
    () => [1, 7, 15, 30].filter((days) => days * 24 <= activeMaxRecordHours),
    [activeMaxRecordHours]
  );
  const loadQueryRange =
    loadHours === CUSTOM_RANGE_HOURS ? customQuery : null;
  const pingQueryRange =
    pingHours === CUSTOM_RANGE_HOURS ? customQuery : null;
  const loadChartHours =
    loadHours === CUSTOM_RANGE_HOURS ? rangeHours(customQuery) : loadHours;
  const pingChartHours =
    pingHours === CUSTOM_RANGE_HOURS ? rangeHours(customQuery) : pingHours;
  const customInputMax = toDateTimeLocalValue(new Date());

  useEffect(() => {
    if (nodesLoading) {
      setIsReady(false);
      return;
    }

    if (!node) {
      return;
    }

    const timer = setTimeout(() => setIsReady(true), 300);

    return () => clearTimeout(timer);
  }, [node, nodesLoading]);

  useEffect(() => {
    if (chartType === displayedChartType) {
      if (chartAnimationState === "fading-in") {
        const timer = setTimeout(() => setChartAnimationState("idle"), 300);
        return () => clearTimeout(timer);
      }
      return;
    }

    setChartAnimationState("fading-out");

    const outTimer = setTimeout(() => {
      setDisplayedChartType(chartType);
      setChartAnimationState("fading-in");
    }, 200);

    return () => clearTimeout(outTimer);
  }, [chartType, displayedChartType, chartAnimationState]);

  const handleChartTypeChange = (nextType: "load" | "ping") => {
    if (nextType === chartType || chartAnimationState === "fading-out") {
      return;
    }
    setChartType(nextType);
  };

  const handleCustomSelect = () => {
    if (chartType === "load") {
      setLoadHours(CUSTOM_RANGE_HOURS);
    } else {
      setPingHours(CUSTOM_RANGE_HOURS);
    }
    setCustomRangeError(null);
  };

  const applyCustomRange = () => {
    const queryRange = toQueryRange(customDraftRange);
    if (
      !queryRange ||
      rangeHours(queryRange) > activeMaxRecordHours
    ) {
      setCustomRangeError(t("instancePage.invalidTimeRange"));
      return;
    }
    setCustomQueryRange(customDraftRange);
    setCustomRangeError(null);
  };

  const selectRecentRange = (days: number) => {
    setCustomDraftRange(buildRecentRange(days));
    setCustomRangeError(null);
  };

  if (!node || !staticNode) {
    if (nodesLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <Loading text={t("instancePage.loadingNodeInfo")} />
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-full">
        {t("instancePage.nodeNotFound")}
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loading
          text={t("instancePage.enteringNodeDetails")}
          className={!nodesLoading ? "fade-out" : ""}
        />
      </div>
    );
  }

  return (
      <div className="text-card-foreground space-y-4 my-4 fade-in @container">
      <Card className="flex items-center justify-between p-4 mb-4 text-primary">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            className="flex-shrink-0"
            variant="outline"
            size="icon"
            onClick={() => navigate(-1)}>
            <ArrowLeft />
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <Flag flag={node.region}></Flag>
            <span className="text-xl md:text-2xl font-bold truncate md:whitespace-normal md:break-words">{node.name}</span>
          </div>
          <span className="text-sm text-secondary-foreground flex-shrink-0">
            {isOnline ? t("node.online") : t("node.offline")}
          </span>
        </div>
      </Card>

      {enableInstanceDetail && node && <Instance node={node} />}

      <div className="flex flex-col items-center w-full space-y-4">
        <Card className="p-2">
          <div className="flex justify-center space-x-2">
            <Button
              variant={chartType === "load" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleChartTypeChange("load")}>
              {t("instancePage.optionLoad")}
            </Button>
            {enablePingChart && (
              <Button
                variant={chartType === "ping" ? "default" : "ghost"}
                size="sm"
                onClick={() => handleChartTypeChange("ping")}>
                {t("instancePage.optionPing")}
              </Button>
            )}
          </div>
        </Card>
        <Card className={`justify-center p-2 ${isMobile ? "w-full" : ""}`}>
          {chartType === "load" ? (
            <div className="flex space-x-2 overflow-x-auto whitespace-nowrap">
              {loadTimeRanges.map((range) => (
                <Button
                  key={range.label}
                  variant={loadHours === range.hours ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setLoadHours(range.hours)}>
                  {range.label}
                </Button>
              ))}
              <Button
                variant={
                  loadHours === CUSTOM_RANGE_HOURS ? "default" : "ghost"
                }
                size="sm"
                onClick={handleCustomSelect}>
                {t("instancePage.customRange")}
              </Button>
            </div>
          ) : (
            <div className="flex space-x-2 overflow-x-auto whitespace-nowrap">
              {pingTimeRanges.map((range) => (
                <Button
                  key={range.label}
                  variant={pingHours === range.hours ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setPingHours(range.hours)}>
                  {range.label}
                </Button>
              ))}
              <Button
                variant={
                  pingHours === CUSTOM_RANGE_HOURS ? "default" : "ghost"
                }
                size="sm"
                onClick={handleCustomSelect}>
                {t("instancePage.customRange")}
              </Button>
            </div>
          )}
        </Card>
        {isCustomRange && (
          <Card className="w-full p-3">
            <div className="flex flex-col gap-3 @md:flex-row @md:flex-wrap @md:items-end">
              <div className="flex items-center gap-2 text-sm font-medium @md:self-center">
                <CalendarDays className="h-4 w-4" />
                <span>{t("instancePage.customRange")}</span>
              </div>
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-secondary-foreground @md:min-w-56">
                <span>{t("instancePage.startTime")}</span>
                <Input
                  type="datetime-local"
                  value={customDraftRange.start}
                  max={customInputMax}
                  onChange={(event) => {
                    setCustomDraftRange((current) => ({
                      ...current,
                      start: event.target.value,
                    }));
                    setCustomRangeError(null);
                  }}
                  aria-label={t("instancePage.startTime")}
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-secondary-foreground @md:min-w-56">
                <span>{t("instancePage.endTime")}</span>
                <Input
                  type="datetime-local"
                  value={customDraftRange.end}
                  max={customInputMax}
                  onChange={(event) => {
                    setCustomDraftRange((current) => ({
                      ...current,
                      end: event.target.value,
                    }));
                    setCustomRangeError(null);
                  }}
                  aria-label={t("instancePage.endTime")}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {customQuickRanges.map((days) => (
                  <Button
                    key={days}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => selectRecentRange(days)}>
                    {t("instancePage.recentDays", { count: days })}
                  </Button>
                ))}
                <Button type="button" size="sm" onClick={applyCustomRange}>
                  <Search className="h-4 w-4" />
                  {t("instancePage.query")}
                </Button>
              </div>
            </div>
            {customRangeError && (
              <div className="pt-2 text-sm text-red-500">
                {customRangeError}
              </div>
            )}
          </Card>
        )}
      </div>

      <div
        className={
          chartAnimationState === "fading-out"
            ? "fade-out"
            : chartAnimationState === "fading-in"
            ? "fade-in"
            : undefined
        }>
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-96">
              <Loading text={t("chart.loading")} />
            </div>
          }>
          {displayedChartType === "load" && staticNode ? (
            <LoadCharts
              node={staticNode}
              hours={loadChartHours}
              range={loadQueryRange}
              liveData={stats}
              isOnline={isOnline}
            />
          ) : displayedChartType === "ping" && staticNode ? (
            <PingChart
              node={staticNode}
              hours={pingChartHours}
              range={pingQueryRange}
            />
          ) : null}
        </Suspense>
      </div>
    </div>
  );
};

export default InstancePage;
