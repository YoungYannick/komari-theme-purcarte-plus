import { memo, useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Eye,
  EyeOff,
  ArrowRightToLine,
  RefreshCw,
  ArrowLeft,
  ArrowDownUp,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
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
import type { PingHistoryResponse } from "@/types/node";
import Loading from "@/components/loading";
import { useNodeData } from "@/contexts/NodeDataContext";
import {
  cutPeakValues,
  calculateTaskStats,
  interpolateNullsLinear,
} from "@/utils/RecordHelper";
import { useAppConfig } from "@/config";
import { CustomTooltip } from "@/components/ui/tooltip";
import Tips from "@/components/ui/tips";
import { lableFormatter } from "@/utils/chartHelper";
import { useLocale } from "@/config/hooks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils";

// 排序类型定义
type MonitorSortKey = "target" | "name";
type ServerSortKey = "weight" | "name";
type SortDirection = "asc" | "desc";

// localStorage 键
const MONITOR_SORT_KEY = "pingOverview_monitorSort";
const SERVER_SORT_KEY = "pingOverview_serverSort";

// 读写 localStorage 排序配置
function loadSort<K extends string>(
  storageKey: string,
  defaultKey: K,
  defaultDir: SortDirection
): { key: K; dir: SortDirection } {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.key && parsed.dir) return parsed;
    }
  } catch { /* empty */ }
  return { key: defaultKey, dir: defaultDir };
}

function saveSort(storageKey: string, key: string, dir: SortDirection) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ key, dir }));
  } catch { /* empty */ }
}

// 类型定义
interface CombinedLineInfo {
  key: string; // `${uuid}_${taskId}`
  name: string; // `${serverName} - ${taskName}`
  uuid: string;
  taskId: number;
  taskName: string;
  serverName: string;
  interval: number;
}

// 合并线条的颜色生成（按服务器分色相，同服务器内按监测节点偏移色相+亮度+饱和度）
const generateCombinedColor = (
  serverIndex: number,
  totalServers: number,
  taskIndex: number,
  totalTasks: number
) => {
  // 不同服务器：均匀分配色相
  const baseHue = (serverIndex * (360 / Math.max(totalServers, 1))) % 360;
  // 同服务器不同监测节点：色相偏移 + 亮度/饱和度大幅变化
  const hueShift = totalTasks > 1 ? (taskIndex * 30) / (totalTasks - 1) - 15 : 0;
  const hue = (baseHue + hueShift + 360) % 360;

  // OKLCH: 亮度 0.55~0.85，饱和度 0.25~0.12
  const lightness = totalTasks > 1
    ? 0.55 + taskIndex * (0.3 / (totalTasks - 1))
    : 0.7;
  const chroma = totalTasks > 1
    ? 0.25 - taskIndex * (0.13 / (totalTasks - 1))
    : 0.2;

  const oklchColor = `oklch(${lightness} ${chroma} ${hue} / .85)`;

  // HSL 回退: 亮度 40%~70%，饱和度 70%~40%
  const hslLightness = totalTasks > 1
    ? 40 + taskIndex * (30 / (totalTasks - 1))
    : 55;
  const hslSaturation = totalTasks > 1
    ? 70 - taskIndex * (30 / (totalTasks - 1))
    : 55;
  const hslFallback = `hsl(${hue}, ${hslSaturation}%, ${hslLightness}%)`;

  if (
    typeof window !== "undefined" &&
    window.CSS &&
    CSS.supports("color", oklchColor)
  ) {
    return oklchColor;
  }
  return hslFallback;
};

// 过滤 Tooltip（固定高度，新增滚动条）
const FilteredTooltip = (props: any) => {
  const { active, payload, ...rest } = props;
  if (!active || !payload || !payload.length) return null;
  const filtered = payload.filter(
      (item: any) => item.value !== null && item.value !== undefined
  );
  if (!filtered.length) return null;
  return (
      <div id="tooltip-scroll-container" style={{ maxHeight: "300px", overflowY: "auto", pointerEvents: "auto", paddingRight: "4px" }} onWheel={(e) => e.stopPropagation()}>
        <CustomTooltip {...rest} active={true} payload={filtered} />
      </div>
  );
};

// 组件
const PingOverview = memo(() => {
  const {
    enableConnectBreaks,
    pingChartMaxPoints,
    publicSettings,
  } = useAppConfig();
  const { nodes, loading: nodesLoading, getPingHistory, getGroups } = useNodeData();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { t } = useLocale();

  // 排序状态（从 localStorage 恢复）
  const [monitorSort, setMonitorSort] = useState(() =>
    loadSort<MonitorSortKey>(MONITOR_SORT_KEY, "name", "asc")
  );
  const [serverSort, setServerSort] = useState(() =>
    loadSort<ServerSortKey>(SERVER_SORT_KEY, "weight", "asc")
  );

  const handleMonitorSort = (key: MonitorSortKey, dir: SortDirection) => {
    const newSort = { key, dir };
    setMonitorSort(newSort);
    saveSort(MONITOR_SORT_KEY, key, dir);
  };

  const handleServerSort = (key: ServerSortKey, dir: SortDirection) => {
    const newSort = { key, dir };
    setServerSort(newSort);
    saveSort(SERVER_SORT_KEY, key, dir);
  };

  // 首页分组
  const allGroups = useMemo(() => {
    const groups = getGroups();
    return [t("group.all"), ...groups];
  }, [getGroups, t]);

  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  // 默认选中所有分组
  useEffect(() => {
    if (allGroups.length > 0) {
      setSelectedGroups((prev) => {
        if (prev.size === 0) return new Set(allGroups);
        return prev;
      });
    }
  }, [allGroups]);

  const handleToggleGroup = (group: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (group === t("group.all")) {
        // 点击"所有"：如果已全选则取消全选，否则全选
        if (next.size === allGroups.length) {
          next.clear();
        } else {
          allGroups.forEach((g) => next.add(g));
        }
      } else {
        if (next.has(group)) {
          next.delete(group);
          next.delete(t("group.all"));
        } else {
          next.add(group);
          // 检查是否所有非"所有"的分组都选中了
          const nonAllGroups = allGroups.filter((g) => g !== t("group.all"));
          if (nonAllGroups.every((g) => next.has(g))) {
            next.add(t("group.all"));
          }
        }
      }
      return next;
    });
  };

  const maxPingRecordPreserveTime =
    publicSettings?.ping_record_preserve_time || 24;

  // 时间范围
  const timeRanges = useMemo(() => {
    const ranges = [
      { label: t("instancePage.hours", { count: 1 }), hours: 1 },
      { label: t("instancePage.hours", { count: 4 }), hours: 4 },
      { label: t("instancePage.days", { count: 1 }), hours: 24 },
      { label: t("instancePage.days", { count: 7 }), hours: 168 },
      { label: t("instancePage.days", { count: 30 }), hours: 720 },
    ];
    const filtered = ranges.filter(
      (range) => range.hours <= maxPingRecordPreserveTime
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
  }, [t, maxPingRecordPreserveTime]);

  const [hours, setHours] = useState<number>(1);

  // 数据获取
  const [allPingData, setAllPingData] = useState<
    Map<string, PingHistoryResponse>
  >(new Map());
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const fetchAllPingData = useCallback(async () => {
    if (!nodes || nodes.length === 0) return;
    setDataLoading(true);
    setDataError(null);
    try {
      const results = await Promise.all(
        nodes.map(async (node) => {
          try {
            const data = await getPingHistory(node.uuid, hours);
            return { uuid: node.uuid, data };
          } catch {
            return { uuid: node.uuid, data: null };
          }
        })
      );
      const map = new Map<string, PingHistoryResponse>();
      for (const result of results) {
        if (result.data) {
          map.set(result.uuid, result.data);
        }
      }
      setAllPingData(map);
    } catch (err: any) {
      setDataError(err.message || "Failed to fetch ping data");
    } finally {
      setDataLoading(false);
    }
  }, [nodes, hours, getPingHistory]);

  useEffect(() => {
    if (!nodesLoading && nodes && nodes.length > 0) {
      fetchAllPingData();
    }
  }, [nodesLoading, nodes, fetchAllPingData]);

  // 构建合并线条信息
  const allLines = useMemo<CombinedLineInfo[]>(() => {
    const lines: CombinedLineInfo[] = [];
    for (const node of nodes || []) {
      const pingData = allPingData.get(node.uuid);
      if (!pingData?.tasks) continue;
      for (const task of pingData.tasks) {
        lines.push({
          key: `${node.uuid}_${task.id}`,
          name: `${node.name} - ${task.name}`,
          uuid: node.uuid,
          taskId: task.id,
          taskName: task.name,
          serverName: node.name,
          interval: task.interval,
        });
      }
    }
    return lines.sort((a, b) => a.key.localeCompare(b.key));
  }, [nodes, allPingData]);

  // 去重的监测节点（按任务名）+ 排序
  const uniqueMonitorNodes = useMemo(() => {
    const nameSet = new Set<string>();
    for (const line of allLines) {
      nameSet.add(line.taskName);
    }
    const arr = Array.from(nameSet);
    const { dir: sortDir } = monitorSort;
    arr.sort((a, b) => {
      const cmp = a.localeCompare(b);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [allLines, monitorSort]);

  // 去重的服务器节点 + 排序
  const uniqueServerNodes = useMemo(() => {
    const servers: { uuid: string; name: string; weight: number; group: string }[] = [];
    const seen = new Set<string>();
    for (const line of allLines) {
      if (!seen.has(line.uuid)) {
        seen.add(line.uuid);
        const nodeData = nodes?.find((n) => n.uuid === line.uuid);
        servers.push({
          uuid: line.uuid,
          name: line.serverName,
          weight: nodeData?.weight ?? 0,
          group: nodeData?.group ?? "",
        });
      }
    }
    const { key: sortKey, dir: sortDir } = serverSort;
    servers.sort((a, b) => {
      let cmp: number;
      if (sortKey === "weight") {
        cmp = a.weight - b.weight;
      } else {
        cmp = a.name.localeCompare(b.name);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return servers;
  }, [allLines, nodes, serverSort]);

  // 按分组过滤后的服务器节点
  const filteredServerNodes = useMemo(() => {
    const allLabel = t("group.all");
    if (selectedGroups.has(allLabel)) return uniqueServerNodes;
    return uniqueServerNodes.filter((s) => {
      if (!s.group && selectedGroups.size > 0) return false;
      return selectedGroups.has(s.group);
    });
  }, [uniqueServerNodes, selectedGroups, t]);

  // 可见性状态
  const [visibleMonitorNodes, setVisibleMonitorNodes] = useState<Set<string>>(
    new Set()
  );
  const [visibleServers, setVisibleServers] = useState<Set<string>>(
    new Set()
  );

  // 默认全选：数据变化时选中所有
  useEffect(() => {
    if (uniqueMonitorNodes.length > 0) {
      setVisibleMonitorNodes((prev) => {
        if (prev.size === 0) return new Set(uniqueMonitorNodes);
        return prev;
      });
    }
  }, [uniqueMonitorNodes]);

  useEffect(() => {
    if (filteredServerNodes.length > 0) {
      setVisibleServers((prev) => {
        if (prev.size === 0)
          return new Set(filteredServerNodes.map((s) => s.uuid));
        return prev;
      });
    }
  }, [filteredServerNodes]);

  // 分组变化时同步可见服务器
  useEffect(() => {
    const filteredUuids = new Set(filteredServerNodes.map((s) => s.uuid));
    setVisibleServers(filteredUuids);
  }, [selectedGroups, filteredServerNodes]);

  // 单条线的显隐状态（通过统计卡片点击控制）
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());

  const isLineVisible = useCallback(
    (line: CombinedLineInfo) => {
      return (
        visibleMonitorNodes.has(line.taskName) &&
        visibleServers.has(line.uuid) &&
        !hiddenLines.has(line.key)
      );
    },
    [visibleMonitorNodes, visibleServers, hiddenLines]
  );

  const handleToggleLine = (key: string) => {
    setHiddenLines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // 图表状态
  const [timeRange, setTimeRange] = useState<[number, number] | null>(null);
  const [brushIndices, setBrushIndices] = useState<{
    startIndex?: number;
    endIndex?: number;
  }>({});
  const [cutPeak, setCutPeak] = useState(false);
  const [connectBreaks, setConnectBreaks] = useState(enableConnectBreaks);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (isResetting) {
      setTimeRange(null);
      setBrushIndices({});
      setIsResetting(false);
    }
  }, [isResetting]);

  const chartMargin = { top: 8, right: 16, bottom: 8, left: 16 };

  // 合并所有记录到统一时间线
  const midData = useMemo(() => {
    if (allPingData.size === 0 || allLines.length === 0) return [];

    // 计算最小间隔用于容差
    const intervals = allLines
      .map((l) => l.interval)
      .filter((v) => typeof v === "number" && v > 0);
    const fallbackIntervalSec = intervals.length
      ? Math.min(...intervals)
      : 60;

    const toleranceMs = Math.min(
      6000,
      Math.max(800, Math.floor(fallbackIntervalSec * 1000 * 0.25))
    );

    const grouped: Record<number, any> = {};
    const anchors: number[] = [];

    for (const [uuid, pingData] of allPingData.entries()) {
      if (!pingData?.records) continue;
      for (const rec of pingData.records) {
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
        const lineKey = `${uuid}_${rec.task_id}`;
        grouped[use][lineKey] = rec.value < 0 ? null : rec.value;
      }
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
    return (merged as any[]).slice(startIdx);
  }, [allPingData, allLines, hours]);

  // 图表数据处理
  const chartData = useMemo(() => {
    let full = midData;
    if (!allLines.length || !full.length) return [];

    const keys = allLines.map((l) => l.key);

    if (cutPeak) {
      full = cutPeakValues(full, keys);
    }

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
  }, [midData, cutPeak, allLines, pingChartMaxPoints]);

  // 线条颜色（按服务器分色相，同服务器内按监测节点变化）
  const lineColors = useMemo(() => {
    const map = new Map<string, string>();
    // 构建服务器索引映射
    const serverUuids = [...new Set(allLines.map((l) => l.uuid))];
    const totalServers = serverUuids.length;
    const serverIndexMap = new Map<string, number>();
    serverUuids.forEach((uuid, i) => serverIndexMap.set(uuid, i));
    // 构建每台服务器内的监测节点索引
    const serverTaskCount = new Map<string, number>();
    const serverTaskIndex = new Map<string, number>();
    for (const line of allLines) {
      const count = serverTaskCount.get(line.uuid) || 0;
      serverTaskIndex.set(line.key, count);
      serverTaskCount.set(line.uuid, count + 1);
    }
    for (const line of allLines) {
      const sIdx = serverIndexMap.get(line.uuid) || 0;
      const tIdx = serverTaskIndex.get(line.key) || 0;
      const tTotal = serverTaskCount.get(line.uuid) || 1;
      map.set(line.key, generateCombinedColor(sIdx, totalServers, tIdx, tTotal));
    }
    return map;
  }, [allLines]);

  // 切换处理函数
  const handleToggleMonitorNode = (name: string) => {
    setVisibleMonitorNodes((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleToggleServer = (uuid: string) => {
    setVisibleServers((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  };

  const handleToggleAllMonitorNodes = () => {
    if (visibleMonitorNodes.size === uniqueMonitorNodes.length) {
      setVisibleMonitorNodes(new Set());
    } else {
      setVisibleMonitorNodes(new Set(uniqueMonitorNodes));
    }
  };

  const handleToggleAllServers = () => {
    if (visibleServers.size === filteredServerNodes.length) {
      setVisibleServers(new Set());
    } else {
      setVisibleServers(new Set(filteredServerNodes.map((s) => s.uuid)));
    }
  };

  // 断点标记
  const breakPoints = useMemo(() => {
    if (!connectBreaks || !chartData || chartData.length < 2) {
      return [];
    }
    const points: { x: number; color: string }[] = [];
    for (const line of allLines) {
      if (!isLineVisible(line)) continue;
      const lineKey = line.key;
      for (let i = 1; i < chartData.length; i++) {
        const prevPoint = chartData[i - 1];
        const currentPoint = chartData[i];

        const isBreak =
          (currentPoint[lineKey] === null ||
            currentPoint[lineKey] === undefined) &&
          prevPoint[lineKey] !== null &&
          prevPoint[lineKey] !== undefined;

        if (isBreak) {
          points.push({
            x: currentPoint.time,
            color: lineColors.get(lineKey) || "#000",
          });
        }
      }
    }
    return points;
  }, [chartData, allLines, isLineVisible, connectBreaks, lineColors]);

  // 每条线的统计信息
  const lineStats = useMemo(() => {
    return allLines.map((line) => {
      const pingData = allPingData.get(line.uuid);
      if (!pingData?.records) {
        return {
          ...line,
          value: null as number | null,
          time: null as string | null,
          loss: 0,
          color: lineColors.get(line.key) || "#000",
        };
      }
      // 筛选该任务的记录
      const { loss, latestValue, latestTime } = calculateTaskStats(
        pingData.records,
        line.taskId,
        timeRange
      );
      return {
        ...line,
        value: latestValue,
        time: latestTime,
        loss,
        color: lineColors.get(line.key) || "#000",
      };
    });
  }, [allLines, allPingData, timeRange, lineColors]);

  // 根据选中的服务器节点和监测节点过滤统计信息，并按服务器排序 + 监测节点排序
  const filteredLineStats = useMemo(() => {
    const filtered = lineStats.filter(
      (stat) =>
        visibleServers.has(stat.uuid) && visibleMonitorNodes.has(stat.taskName)
    );

    // 构建服务器排序索引（复用 filteredServerNodes 的顺序）
    const serverOrderMap = new Map<string, number>();
    filteredServerNodes.forEach((s, i) => serverOrderMap.set(s.uuid, i));

    // 构建监测节点排序索引（复用 uniqueMonitorNodes 的顺序）
    const monitorOrderMap = new Map<string, number>();
    uniqueMonitorNodes.forEach((name, i) => monitorOrderMap.set(name, i));

    filtered.sort((a, b) => {
      // 优先按服务器节点排序规则
      const serverCmp =
        (serverOrderMap.get(a.uuid) ?? 0) - (serverOrderMap.get(b.uuid) ?? 0);
      if (serverCmp !== 0) return serverCmp;
      // 其次按监测节点排序规则
      return (
        (monitorOrderMap.get(a.taskName) ?? 0) -
        (monitorOrderMap.get(b.taskName) ?? 0)
      );
    });

    return filtered;
  }, [lineStats, visibleServers, visibleMonitorNodes, filteredServerNodes, uniqueMonitorNodes]);

  // 切换全部线条显隐
  const handleToggleAllLines = () => {
    const allMonitorSelected =
      visibleMonitorNodes.size === uniqueMonitorNodes.length;
    const allServersSelected =
      visibleServers.size === filteredServerNodes.length;
    const noneHidden = hiddenLines.size === 0;

    if (allMonitorSelected && allServersSelected && noneHidden) {
      setVisibleMonitorNodes(new Set());
      setVisibleServers(new Set());
    } else {
      setVisibleMonitorNodes(new Set(uniqueMonitorNodes));
      setVisibleServers(new Set(filteredServerNodes.map((s) => s.uuid)));
      setHiddenLines(new Set());
    }
  };

  const allVisible =
    visibleMonitorNodes.size === uniqueMonitorNodes.length &&
    visibleServers.size === filteredServerNodes.length &&
    hiddenLines.size === 0;

  const isLoading = nodesLoading || dataLoading;

  if (isLoading && allPingData.size === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loading text={t("pingOverview.loadingData")} />
      </div>
    );
  }

  return (
    <div className="text-card-foreground space-y-4 my-4 fade-in @container">
      {/* 返回按钮 + 标题 */}
      <Card className="flex items-center justify-between p-4 text-primary">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            className="flex-shrink-0"
            variant="outline"
            size="icon"
            onClick={() => navigate(-1)}>
            <ArrowLeft />
          </Button>
          <span className="text-xl md:text-2xl font-bold">
            {t("pingOverview.title")}
          </span>
        </div>
      </Card>

      {/* 时间范围选择器 */}
      <div className="flex flex-col items-center w-full space-y-4">
        <Card className={`justify-center p-2 ${isMobile ? "w-full" : ""}`}>
          <div className="flex space-x-2 overflow-x-auto whitespace-nowrap">
            {timeRanges.map((range) => (
              <Button
                key={range.label}
                variant={hours === range.hours ? "default" : "ghost"}
                size="sm"
                onClick={() => setHours(range.hours)}>
                {range.label}
              </Button>
            ))}
          </div>
        </Card>
      </div>

      {/* 监测节点筛选 */}
      {uniqueMonitorNodes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">
                  {t("pingOverview.monitorNodes")}
                </span>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 rounded-full cursor-pointer">
                      <ArrowDownUp className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {(
                      [
                        { key: "target" as MonitorSortKey, dir: "asc" as SortDirection, label: t("pingOverview.sortByTargetAsc") },
                        { key: "target" as MonitorSortKey, dir: "desc" as SortDirection, label: t("pingOverview.sortByTargetDesc") },
                        { key: "name" as MonitorSortKey, dir: "asc" as SortDirection, label: t("pingOverview.sortByNameAsc") },
                        { key: "name" as MonitorSortKey, dir: "desc" as SortDirection, label: t("pingOverview.sortByNameDesc") },
                      ] as const
                    ).map((opt) => (
                      <DropdownMenuItem
                        key={`${opt.key}-${opt.dir}`}
                        className="flex items-center justify-between cursor-pointer"
                        onSelect={() => handleMonitorSort(opt.key, opt.dir)}>
                        <span
                          className={cn(
                            monitorSort.key === opt.key &&
                              monitorSort.dir === opt.dir &&
                              "text-primary font-semibold"
                          )}>
                          {opt.label}
                        </span>
                        {monitorSort.key === opt.key &&
                          monitorSort.dir === opt.dir &&
                          (opt.dir === "asc" ? (
                            <ArrowUp className="h-4 w-4 ml-2" />
                          ) : (
                            <ArrowDown className="h-4 w-4 ml-2" />
                          ))}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleAllMonitorNodes}>
                {visibleMonitorNodes.size === uniqueMonitorNodes.length
                  ? t("pingOverview.deselectAll")
                  : t("pingOverview.selectAll")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {uniqueMonitorNodes.map((name) => {
                const isVisible = visibleMonitorNodes.has(name);
                // 取一条代表性线条用于颜色
                const repLine = allLines.find((l) => l.taskName === name);
                const color = repLine
                  ? lineColors.get(repLine.key)
                  : undefined;
                return (
                  <div
                    key={name}
                    className={`px-3 py-1.5 text-sm cursor-pointer rounded-md transition-all outline-2 outline ${
                      isVisible ? "" : "outline-transparent opacity-50"
                    }`}
                    onClick={() => handleToggleMonitorNode(name)}
                    style={{
                      outlineColor: isVisible ? color : undefined,
                      boxShadow: isVisible
                        ? `0 0 6px ${color}`
                        : undefined,
                    }}>
                    {name}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 服务器节点筛选 */}
      {uniqueServerNodes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">
                  {t("pingOverview.serverNodes")}
                </span>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 rounded-full cursor-pointer">
                      <ArrowDownUp className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {(
                      [
                        { key: "weight" as ServerSortKey, dir: "asc" as SortDirection, label: t("pingOverview.sortByWeightAsc") },
                        { key: "weight" as ServerSortKey, dir: "desc" as SortDirection, label: t("pingOverview.sortByWeightDesc") },
                        { key: "name" as ServerSortKey, dir: "asc" as SortDirection, label: t("pingOverview.sortByNameAsc") },
                        { key: "name" as ServerSortKey, dir: "desc" as SortDirection, label: t("pingOverview.sortByNameDesc") },
                      ] as const
                    ).map((opt) => (
                      <DropdownMenuItem
                        key={`${opt.key}-${opt.dir}`}
                        className="flex items-center justify-between cursor-pointer"
                        onSelect={() => handleServerSort(opt.key, opt.dir)}>
                        <span
                          className={cn(
                            serverSort.key === opt.key &&
                              serverSort.dir === opt.dir &&
                              "text-primary font-semibold"
                          )}>
                          {opt.label}
                        </span>
                        {serverSort.key === opt.key &&
                          serverSort.dir === opt.dir &&
                          (opt.dir === "asc" ? (
                            <ArrowUp className="h-4 w-4 ml-2" />
                          ) : (
                            <ArrowDown className="h-4 w-4 ml-2" />
                          ))}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleAllServers}>
                {visibleServers.size === filteredServerNodes.length
                  ? t("pingOverview.deselectAll")
                  : t("pingOverview.selectAll")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {/* 分组筛选按钮 */}
            {allGroups.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {allGroups.map((group) => {
                  const isSelected = selectedGroups.has(group);
                  return (
                    <Button
                      key={group}
                      variant={isSelected ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => handleToggleGroup(group)}>
                      {group}
                    </Button>
                  );
                })}
              </div>
            )}
            {/* 服务器节点列表 */}
            <div className="flex flex-wrap gap-2">
              {filteredServerNodes.map((server) => {
                const isVisible = visibleServers.has(server.uuid);
                // 取一条代表性线条用于颜色
                const repLine = allLines.find(
                  (l) => l.uuid === server.uuid
                );
                const color = repLine
                  ? lineColors.get(repLine.key)
                  : undefined;
                return (
                  <div
                    key={server.uuid}
                    className={`px-3 py-1.5 text-sm cursor-pointer rounded-md transition-all outline-2 outline ${
                      isVisible ? "" : "outline-transparent opacity-50"
                    }`}
                    onClick={() => handleToggleServer(server.uuid)}
                    style={{
                      outlineColor: isVisible ? color : undefined,
                      boxShadow: isVisible
                        ? `0 0 6px ${color}`
                        : undefined,
                    }}>
                    {server.name}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 线条统计信息摘要 */}
      {filteredLineStats.length > 0 && (
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
              {filteredLineStats.map((stat) => {
                const visible = isLineVisible(stat);
                return (
                  <div
                    key={stat.key}
                    className={`h-auto px-3 py-1.5 flex flex-col leading-snug text-center cursor-pointer rounded-md transition-all outline-2 outline ${
                      visible ? "" : "outline-transparent opacity-50"
                    }`}
                    onClick={() => handleToggleLine(stat.key)}
                    style={{
                      outlineColor: visible ? stat.color : undefined,
                      boxShadow: visible
                        ? `0 0 8px ${stat.color}`
                        : undefined,
                    }}>
                    <div className="font-semibold text-xs">{stat.name}</div>
                    <div className="flex text-xs font-normal">
                      <span>
                        {stat.value !== null
                          ? `${stat.value.toFixed(1)} ms | ${stat.loss.toFixed(
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

      {/* 图表 */}
      <Card className="flex-grow flex flex-col relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center purcarte-blur rounded-lg z-10">
            <Loading text={t("chart.loadingData")} />
          </div>
        )}
        {dataError && (
          <div className="absolute inset-0 flex items-center justify-center purcarte-blur rounded-lg z-10">
            <p className="text-red-500">{dataError}</p>
          </div>
        )}
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap">
            <div className="flex gap-4 flex-wrap">
              <div className="flex items-center space-x-2">
                <Switch
                  id="peak-shaving-overview"
                  checked={cutPeak}
                  onCheckedChange={setCutPeak}
                />
                <Label htmlFor="peak-shaving-overview">
                  {t("chart.smooth")}
                </Label>
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
                  id="connect-breaks-overview"
                  checked={connectBreaks}
                  onCheckedChange={setConnectBreaks}
                />
                <Label htmlFor="connect-breaks-overview">
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
              <Button
                variant="default"
                onClick={handleToggleAllLines}
                size="sm">
                {allVisible ? (
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
        <CardContent className="pt-0 flex-grow flex flex-col"
         onWheel={(e) => {
           const tooltipEl = document.getElementById("tooltip-scroll-container");
           if (tooltipEl && tooltipEl.scrollHeight > tooltipEl.clientHeight) {
             if (e.cancelable) {
               e.preventDefault();
               e.stopPropagation();
             }
             tooltipEl.scrollTop += e.deltaY;
           }
         }}
        >
          {chartData.length > 0 ? (
            <ResponsiveContainer
              width="100%"
              height="100%"
              className="min-h-110">
              <LineChart data={chartData} margin={chartMargin}>
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
                  content={
                    <FilteredTooltip
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
                {allLines.map((line) => (
                  <Line
                    key={line.key}
                    type="monotone"
                    dataKey={line.key}
                    name={line.name}
                    stroke={lineColors.get(line.key) || "#000"}
                    strokeWidth={2}
                    hide={!isLineVisible(line)}
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
              <p>{t("pingOverview.noData")}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

export default PingOverview;
