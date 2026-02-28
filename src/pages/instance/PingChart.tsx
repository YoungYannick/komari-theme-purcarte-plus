import { memo, useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/useMobile";
import { Eye, EyeOff, ArrowRightToLine, RefreshCw } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@radix-ui/react-label";
import type { NodeData } from "@/types/node";
import Loading from "@/components/loading";
import { usePingChart } from "@/hooks/usePingChart";
import {
  cutPeakValues,
  calculateTaskStats,
  interpolateNullsLinear,
} from "@/utils/RecordHelper";
import { useAppConfig } from "@/config";
import { ScrollableTooltip } from "@/components/ui/tooltip";
import { useTooltipScrollLock } from "@/hooks/useTooltipScrollLock";
import Tips from "@/components/ui/tips";
import { generateColor, lableFormatter } from "@/utils/chartHelper";
import { useLocale } from "@/config/hooks";

interface PingChartProps {
  node: NodeData;
  hours: number;
}

const PingChart = memo(({ node, hours }: PingChartProps) => {
  const { enableConnectBreaks, pingChartMaxPoints } = useAppConfig();
  const { loading, error, pingHistory } = usePingChart(node, hours);
  const [visiblePingTasks, setVisiblePingTasks] = useState<number[]>([]);
  const [timeRange, setTimeRange] = useState<[number, number] | null>(null);
  const [brushIndices, setBrushIndices] = useState<{
    startIndex?: number;
    endIndex?: number;
  }>({});
  const [cutPeak, setCutPeak] = useState(false);
  const [connectBreaks, setConnectBreaks] = useState(enableConnectBreaks);
  const [isResetting, setIsResetting] = useState(false);
  const isMobile = useIsMobile();
  const { t } = useLocale();
  const { chartContentRef, handleChartMouseMove, tooltipProps } = useTooltipScrollLock();

  useEffect(() => {
    if (pingHistory?.tasks) {
      const taskIds = pingHistory.tasks.map((t) => t.id);
      setVisiblePingTasks((prevVisibleTasks) => {
        const newVisibleTasks = taskIds.filter(
          (id) => prevVisibleTasks.length === 0 || prevVisibleTasks.includes(id)
        );
        return newVisibleTasks.length > 0 ? newVisibleTasks : taskIds;
      });
    }
  }, [pingHistory?.tasks]);

  useEffect(() => {
    if (isResetting) {
      setTimeRange(null);
      setBrushIndices({});
      setIsResetting(false);
    }
  }, [isResetting]);

  const chartMargin = { top: 8, right: 16, bottom: 8, left: 16 };

  const midData = useMemo(() => {
    const data = pingHistory?.records || [];
    const tasks = pingHistory?.tasks || [];
    if (!data.length || !tasks.length) return [];

    const taskIntervals = tasks
      .map((t) => t.interval)
      .filter((v): v is number => typeof v === "number" && v > 0);
    const fallbackIntervalSec = taskIntervals.length
      ? Math.min(...taskIntervals)
      : 60;

    const toleranceMs = Math.min(
      6000,
      Math.max(800, Math.floor(fallbackIntervalSec * 1000 * 0.25))
    );
    const grouped: Record<number, any> = {};
    const anchors: number[] = [];
    for (const rec of data) {
      const ts = new Date(rec.time).getTime();
      let anchor: number | null = null;
      for (const a of anchors) {
        if (Math.abs(a - ts) <= toleranceMs) {
          anchor = a;
          break;
        }
      }
      const use = anchor ?? ts;
      if (!grouped[use]) {
        grouped[use] = { time: new Date(use).toISOString() };
        if (anchor === null) anchors.push(use);
      }
      grouped[use][rec.task_id] = rec.value < 0 ? null : rec.value;
    }
    const merged = Object.values(grouped).sort(
      (a: any, b: any) =>
        new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    if (!merged.length) return [];

    const lastTs = new Date(
      (merged as any[])[(merged as any[]).length - 1].time
    ).getTime();
    const fromTs = lastTs - hours * 3600_000;
    let startIdx = 0;
    for (let i = 0; i < (merged as any[]).length; i++) {
      const ts = new Date((merged as any[])[i].time).getTime();
      if (ts >= fromTs) {
        startIdx = Math.max(0, i - 1);
        break;
      }
    }
    const clipped = (merged as any[]).slice(startIdx);
    return clipped;
  }, [pingHistory, hours]);

  const chartData = useMemo(() => {
    let full = midData;
    const tasks = pingHistory?.tasks || [];
    if (!tasks.length || !full.length) return [];

    if (cutPeak) {
      const taskKeys = tasks.map((task) => String(task.id));
      full = cutPeakValues(full, taskKeys);
    }

    const keys = tasks.map((t) => String(t.id));

    // 暂存-1导致的null值
    const preservedNulls = new Set<string>();
    full.forEach((d, i) => {
      keys.forEach((key) => {
        if (d[key] === null) {
          preservedNulls.add(`${i}-${key}`);
        }
      });
    });

    full = interpolateNullsLinear(full, keys, {
      maxGapMultiplier: 6,
      minCapMs: 2 * 60_000,
      maxCapMs: 30 * 60_000,
    });

    // 恢复-1导致的null值
    full.forEach((d, i) => {
      keys.forEach((key) => {
        if (preservedNulls.has(`${i}-${key}`)) {
          d[key] = null;
        }
      });
    });

    if (full.length > pingChartMaxPoints && pingChartMaxPoints > 0) {
      const samplingFactor = Math.ceil(full.length / pingChartMaxPoints);
      const sampledData = [];
      for (let i = 0; i < full.length; i += samplingFactor) {
        sampledData.push(full[i]);
      }
      full = sampledData;
    }

    return full.map((d: any) => ({
      ...d,
      time: new Date(d.time).getTime(),
    }));
  }, [midData, cutPeak, pingHistory?.tasks, pingChartMaxPoints]);

  const handleTaskVisibilityToggle = (taskId: number) => {
    setVisiblePingTasks((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId]
    );
  };

  const handleToggleAll = () => {
    if (!pingHistory?.tasks) return;
    if (visiblePingTasks.length === pingHistory.tasks.length) {
      setVisiblePingTasks([]);
    } else {
      setVisiblePingTasks(pingHistory.tasks.map((t) => t.id));
    }
  };

  const sortedTasks = useMemo(() => {
    if (!pingHistory?.tasks) return [];
    return [...pingHistory.tasks].sort((a, b) => a.id - b.id);
  }, [pingHistory?.tasks]);

  const breakPoints = useMemo(() => {
    if (!connectBreaks || !chartData || chartData.length < 2) {
      return [];
    }
    const points: { x: number; color: string }[] = [];
    for (const task of sortedTasks) {
      if (!visiblePingTasks.includes(task.id)) {
        continue;
      }
      const taskKey = String(task.id);
      for (let i = 1; i < chartData.length; i++) {
        const prevPoint = chartData[i - 1];
        const currentPoint = chartData[i];

        const isBreak =
          (currentPoint[taskKey] === null ||
            currentPoint[taskKey] === undefined) &&
          prevPoint[taskKey] !== null &&
          prevPoint[taskKey] !== undefined;

        if (isBreak) {
          points.push({
            x: currentPoint.time,
            color: generateColor(task.name, sortedTasks),
          });
        }
      }
    }
    return points;
  }, [chartData, sortedTasks, visiblePingTasks, connectBreaks]);

  const taskStats = useMemo(() => {
    if (!pingHistory?.records || !sortedTasks.length) return [];

    return sortedTasks.map((task) => {
      const { loss, latestValue, latestTime } = calculateTaskStats(
        pingHistory.records,
        task.id,
        timeRange
      );
      return {
        ...task,
        value: latestValue,
        time: latestTime,
        loss: loss,
        color: generateColor(task.name, sortedTasks),
      };
    });
  }, [pingHistory?.records, sortedTasks, timeRange]);

  return (
    <div className="relative space-y-4 h-full flex flex-col min-h-114">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center purcarte-blur rounded-lg z-10">
          <Loading text={t("chart.loadingData")} />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center purcarte-blur rounded-lg z-10">
          <p className="text-red-500">{error}</p>
        </div>
      )}

      {pingHistory?.tasks && pingHistory.tasks.length > 0 && (
        <Card className="relative">
          <div className="absolute top-2 right-2">
            <Tips>
              <span
                dangerouslySetInnerHTML={{
                  __html: t("chart.packetLossCalculationWarning"),
                }}></span>
            </Tips>
          </div>
          <CardContent className="p-2">
            <div className="flex flex-wrap gap-2 items-center justify-center">
              {taskStats.map((task) => {
                const isVisible = visiblePingTasks.includes(task.id);

                return (
                  <div
                    key={task.id}
                    className={`h-auto px-3 py-1.5 flex flex-col leading-snug text-center cursor-pointer rounded-md transition-all outline-2 outline ${
                      isVisible ? "" : "outline-transparent"
                    }`}
                    onClick={() => handleTaskVisibilityToggle(task.id)}
                    style={{
                      outlineColor: isVisible ? task.color : undefined,
                      boxShadow: isVisible
                        ? `0 0 8px ${task.color}`
                        : undefined,
                    }}>
                    <div className="font-semibold">{task.name}</div>
                    <div className="flex text-xs font-normal">
                      <span>
                        {task.value !== null
                          ? `${task.value.toFixed(1)} ms | ${task.loss.toFixed(
                              1
                            )}%`
                          : t("node.notAvailable")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="flex-grow flex flex-col">
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap">
            <div className="flex gap-4 flex-wrap">
              <div className="flex items-center space-x-2">
                <Switch
                  id="peak-shaving"
                  checked={cutPeak}
                  onCheckedChange={setCutPeak}
                />
                <Label htmlFor="peak-shaving">{t("chart.smooth")}</Label>
                <Tips>
                  <span
                    dangerouslySetInnerHTML={{
                      __html: t("chart.smoothTooltipContent"),
                    }}
                  />
                </Tips>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="connect-breaks"
                  checked={connectBreaks}
                  onCheckedChange={setConnectBreaks}
                />
                <Label htmlFor="connect-breaks">
                  {t("chart.connectBreaks")}
                </Label>
                <Tips>
                  <span
                    dangerouslySetInnerHTML={{
                      __html: t("chart.connectBreaksTooltipContent"),
                    }}
                  />
                </Tips>
              </div>
            </div>
            <div className={`flex gap-2 ${isMobile ? "w-full mt-2" : ""}`}>
              <Button variant="default" onClick={handleToggleAll} size="sm">
                {pingHistory?.tasks &&
                visiblePingTasks.length === pingHistory.tasks.length ? (
                  <>
                    <EyeOff size={16} />
                    {t("chart.hideAll")}
                  </>
                ) : (
                  <>
                    <Eye size={16} />
                    {t("chart.showAll")}
                  </>
                )}
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  if (timeRange) {
                    if (chartData.length > 1) {
                      const endIndex = chartData.length - 1;
                      const startIndex = 0;
                      setTimeRange([
                        chartData[startIndex].time,
                        chartData[endIndex].time,
                      ]);
                      setBrushIndices({ startIndex, endIndex });
                      setIsResetting(true);
                    }
                  } else if (chartData.length > 1) {
                    const endIndex = chartData.length - 1;
                    const startIndex = Math.floor(endIndex * 0.75);
                    setTimeRange([
                      chartData[startIndex].time,
                      chartData[endIndex].time,
                    ]);
                    setBrushIndices({ startIndex, endIndex });
                  }
                }}
                size="sm">
                {timeRange ? (
                  <RefreshCw size={16} />
                ) : (
                  <ArrowRightToLine size={16} />
                )}
                {timeRange ? t("chart.resetRange") : t("chart.oneQuarter")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 flex-grow flex flex-col" ref={chartContentRef}>
          {pingHistory?.tasks && pingHistory.tasks.length > 0 ? (
            <ResponsiveContainer
              width="100%"
              height="100%"
              className={"min-h-90"}>
              <LineChart data={chartData} margin={chartMargin} onMouseMove={handleChartMouseMove}>
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="var(--theme-line-muted-color)"
                  vertical={false}
                />
                <XAxis
                  type="number"
                  dataKey="time"
                  domain={timeRange || ["dataMin", "dataMax"]}
                  tickFormatter={(time) => {
                    const date = new Date(time);
                    if (hours === 0) {
                      return date.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      });
                    }
                    return date.toLocaleString([], {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                  }}
                  tick={{ fill: "var(--theme-text-muted-color)" }}
                  axisLine={{
                    stroke: "var(--theme-line-muted-color)",
                  }}
                  scale="time"
                />
                <YAxis
                  mirror={true}
                  width={30}
                  tick={{ fill: "var(--theme-text-muted-color)" }}
                  axisLine={{
                    stroke: "var(--theme-line-muted-color)",
                  }}
                />
                <Tooltip
                  cursor={false}
                  wrapperStyle={{ zIndex: 100, pointerEvents: "none" }}
                  {...tooltipProps}
                  content={
                    <ScrollableTooltip
                      labelFormatter={(value: any) => lableFormatter(value, hours)}
                    />
                  }
                />
                {connectBreaks &&
                  breakPoints.map((point, index) => (
                    <ReferenceLine
                      key={`break-${index}`}
                      x={point.x}
                      stroke={point.color}
                      strokeWidth={1.5}
                      strokeOpacity={0.6}
                    />
                  ))}
                {sortedTasks.map((task) => (
                  <Line
                    key={task.id}
                    type={"monotone"}
                    dataKey={String(task.id)}
                    name={task.name}
                    stroke={generateColor(task.name, sortedTasks)}
                    strokeWidth={2}
                    hide={!visiblePingTasks.includes(task.id)}
                    dot={false}
                    connectNulls={connectBreaks}
                  />
                ))}
                <Brush
                  {...brushIndices}
                  dataKey="time"
                  height={30}
                  stroke="var(--theme-text-muted-color)"
                  fill="var(--accent-a4)"
                  tickFormatter={(time) => {
                    const date = new Date(time);
                    if (hours === 0) {
                      return date.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      });
                    }
                    return date.toLocaleDateString([], {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                  }}
                  onChange={(e: any) => {
                    if (
                      e.startIndex !== undefined &&
                      e.endIndex !== undefined &&
                      chartData[e.startIndex] &&
                      chartData[e.endIndex]
                    ) {
                      setTimeRange([
                        chartData[e.startIndex].time,
                        chartData[e.endIndex].time,
                      ]);
                      setBrushIndices({
                        startIndex: e.startIndex,
                        endIndex: e.endIndex,
                      });
                    } else {
                      setTimeRange(null);
                      setBrushIndices({});
                    }
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="min-h-90 flex items-center justify-center">
              <p>{t("chart.noData")}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

export default PingChart;
