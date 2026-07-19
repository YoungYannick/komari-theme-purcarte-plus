import { useState, useEffect, useMemo } from "react";
import { useNodeData } from "@/contexts/NodeDataContext";
import type { HistoryRecord, NodeData } from "@/types/node";
import type { HistoryQueryRange } from "@/services/api";
import type { RpcNodeStatus } from "@/types/rpc";
import { useLiveData } from "@/contexts/LiveDataContext";
import {
  calculateAutoMaxPoints,
  lttbDownsamplePreservingGaps,
} from "@/utils/downsample";

const HISTORY_NUMERIC_KEYS: Array<keyof HistoryRecord> = [
  "cpu",
  "gpu",
  "ram",
  "ram_total",
  "swap",
  "swap_total",
  "load",
  "temp",
  "disk",
  "disk_total",
  "net_in",
  "net_out",
  "net_total_up",
  "net_total_down",
  "process",
  "connections",
  "connections_udp",
];

const MAX_REALTIME_POINTS = 30 * 5;

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeHistoryRecord = (record: HistoryRecord): HistoryRecord => {
  const normalized: Record<string, unknown> = { ...record };
  for (const key of HISTORY_NUMERIC_KEYS) {
    normalized[key] = toFiniteNumber(record[key]);
  }
  return normalized as unknown as HistoryRecord;
};

const createEmptyHistoryRecord = (
  client: string,
  time: number
): HistoryRecord => {
  const record: Record<string, unknown> = {
    client,
    time: new Date(time).toISOString(),
  };
  for (const key of HISTORY_NUMERIC_KEYS) record[key] = null;
  return record as unknown as HistoryRecord;
};

const resolveHistoryBounds = (
  hours: number,
  rangeStart?: string,
  rangeEnd?: string
) => {
  const startTime = rangeStart ? new Date(rangeStart).getTime() : NaN;
  const endTime = rangeEnd ? new Date(rangeEnd).getTime() : NaN;
  if (
    Number.isFinite(startTime) &&
    Number.isFinite(endTime) &&
    endTime > startTime
  ) {
    return { start: startTime, end: endTime };
  }

  if (!Number.isFinite(hours) || hours <= 0) return null;
  const end = Date.now();
  return { start: end - hours * 3_600_000, end };
};

const insertBreakPoints = (records: HistoryRecord[], hours: number) => {
  if (records.length < 2) return records;

  const minute = 60;
  const hour = minute * 60;
  const expectedIntervalSeconds =
    hours > 0 && hours <= 4 ? minute : hours > 120 ? hour : minute * 15;
  const maxGapMs = expectedIntervalSeconds * 2 * 1000;
  const result: HistoryRecord[] = [];

  for (let i = 0; i < records.length; i++) {
    const current = records[i];
    result.push(current);

    const next = records[i + 1];
    if (!next) continue;

    const currentTime = new Date(current.time).getTime();
    const nextTime = new Date(next.time).getTime();
    if (
      Number.isFinite(currentTime) &&
      Number.isFinite(nextTime) &&
      nextTime - currentTime > maxGapMs
    ) {
      result.push(
        createEmptyHistoryRecord(
          current.client,
          currentTime + expectedIntervalSeconds * 1000
        )
      );
    }
  }

  return result;
};

export const useLoadCharts = (
  node: NodeData | null,
  hours: number,
  range?: HistoryQueryRange | null
) => {
  const { getLoadHistory, getRecentLoadHistory } = useNodeData();
  const { liveData } = useLiveData();
  const [historicalData, setHistoricalData] = useState<HistoryRecord[]>([]);
  const [realtimeData, setRealtimeData] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDataEmpty, setIsDataEmpty] = useState(false);

  const isRealtime = hours === 0;
  const rangeStart = range?.start;
  const rangeEnd = range?.end;

  // Fetch historical data
  useEffect(() => {
    if (isRealtime || !node?.uuid) return;

    const fetchHistoricalData = async () => {
      setLoading(true);
      setError(null);
      try {
        const queryRange =
          rangeStart && rangeEnd
            ? { start: rangeStart, end: rangeEnd }
            : null;
        const data = await getLoadHistory(node.uuid, hours, queryRange);
        const records = (data?.records || []).map(normalizeHistoryRecord);
        setHistoricalData(records);
        setIsDataEmpty(records.length === 0);

        setRealtimeData([]); // Clear realtime data
      } catch (err: any) {
        setError(err.message || "Failed to fetch historical data");
      } finally {
        setLoading(false);
      }
    };

    fetchHistoricalData();
  }, [node?.uuid, hours, rangeStart, rangeEnd, getLoadHistory, isRealtime]);

  // Fetch initial real-time data and handle WebSocket updates
  useEffect(() => {
    if (!isRealtime || !node?.uuid) return;

    const fetchInitialRealtimeData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getRecentLoadHistory(node.uuid);
        setRealtimeData((data?.records || []).slice(-MAX_REALTIME_POINTS));
        setHistoricalData([]); // Clear historical data
      } catch (err: any) {
        setError(err.message || "Failed to fetch initial real-time data");
      } finally {
        setLoading(false);
      }
    };

    fetchInitialRealtimeData();
  }, [node?.uuid, getRecentLoadHistory, isRealtime]);

  // Separate effect for WebSocket updates
  useEffect(() => {
    if (!isRealtime || !node?.uuid || !liveData || !liveData[node.uuid]) return;

    const stats: RpcNodeStatus = liveData[node.uuid];
    const newRecord: HistoryRecord = {
      client: node.uuid,
      time: new Date(stats.time).toISOString(),
      cpu: stats.cpu,
      ram: stats.ram,
      disk: stats.disk,
      load: stats.load,
      net_in: stats.net_in,
      net_out: stats.net_out,
      process: stats.process,
      connections: stats.connections,
      gpu: stats.gpu,
      ram_total: stats.ram_total,
      swap: stats.swap,
      swap_total: stats.swap_total,
      temp: stats.temp,
      disk_total: stats.disk_total,
      net_total_up: stats.net_total_up,
      net_total_down: stats.net_total_down,
      connections_udp: stats.connections_udp,
    };

    setRealtimeData((prevHistory) => {
      if (
        prevHistory.length > 0 &&
        new Date(prevHistory[prevHistory.length - 1].time).getTime() ===
          new Date(newRecord.time).getTime()
      ) {
        return prevHistory;
      }
      const updatedHistory = [...prevHistory, newRecord];
      return updatedHistory.length > MAX_REALTIME_POINTS
        ? updatedHistory.slice(updatedHistory.length - MAX_REALTIME_POINTS)
        : updatedHistory;
    });
  }, [liveData, node?.uuid, isRealtime]);

  const chartData = useMemo(() => {
    const rawData = isRealtime ? realtimeData : historicalData;
    const mappedData = rawData.map((record) => ({
      ...record,
      time: new Date(record.time).getTime(),
    }));

    if (isRealtime) {
      return mappedData;
    }

    const sortedData = mappedData
      .filter((d) => Number.isFinite(d.time))
      .sort((a, b) => a.time - b.time);

    const bounds = resolveHistoryBounds(hours, rangeStart, rangeEnd);
    const boundedData = bounds
      ? sortedData.filter((d) => d.time >= bounds.start && d.time <= bounds.end)
      : sortedData;
    const stringifiedData = boundedData.map((d) => ({
      ...d,
      time: new Date(d.time).toISOString(),
    })) as HistoryRecord[];

    if (bounds) {
      const client = node?.uuid || stringifiedData[0]?.client || "";
      const timestamps = new Set(boundedData.map((item) => item.time));
      if (!timestamps.has(bounds.start)) {
        stringifiedData.push(createEmptyHistoryRecord(client, bounds.start));
      }
      if (!timestamps.has(bounds.end)) {
        stringifiedData.push(createEmptyHistoryRecord(client, bounds.end));
      }
      stringifiedData.sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
      );
    }

    return insertBreakPoints(
      stringifiedData,
      hours
    )
      .map((d) => ({ ...d, time: new Date(d.time!).getTime() }))
      .filter((d) => Number.isFinite(d.time));
  }, [
    isRealtime,
    realtimeData,
    historicalData,
    hours,
    rangeStart,
    rangeEnd,
    node?.uuid,
  ]);

  const sampledChartData = useMemo(() => {
    if (isRealtime || chartData.length === 0) return chartData;

    const maxPoints = calculateAutoMaxPoints(
      chartData.length,
      HISTORY_NUMERIC_KEYS.length
    );
    if (maxPoints <= 0 || chartData.length <= maxPoints) return chartData;

    return lttbDownsamplePreservingGaps(
      chartData,
      maxPoints,
      HISTORY_NUMERIC_KEYS as string[]
    );
  }, [chartData, isRealtime]);

  const memoryChartData = useMemo(() => {
    return sampledChartData.map((item) => ({
      ...item,
      ram:
        typeof item.ram === "number" && Number.isFinite(item.ram)
          ? (item.ram / (node?.mem_total || 1)) * 100
          : null,
      ram_raw: item.ram,
      swap:
        typeof item.swap === "number" && Number.isFinite(item.swap)
          ? (item.swap / (node?.swap_total || 1)) * 100
          : null,
      swap_raw: item.swap,
    }));
  }, [sampledChartData, node?.mem_total, node?.swap_total]);

  return {
    loading,
    error,
    chartData: sampledChartData,
    memoryChartData,
    isDataEmpty,
  };
};
