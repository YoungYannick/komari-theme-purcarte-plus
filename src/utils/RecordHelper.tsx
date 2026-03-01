import type { Record } from "@/types/LiveData";

export interface RecordFormat {
  client: string;
  time: string;
  cpu: number | null;
  gpu: number | null;
  ram: number | null;
  ram_total: number | null;
  swap: number | null;
  swap_total: number | null;
  load: number | null;
  temp: number | null;
  disk: number | null;
  disk_total: number | null;
  net_in: number | null;
  net_out: number | null;
  net_total_up: number | null;
  net_total_down: number | null;
  process: number | null;
  connections: number | null;
  connections_udp: number | null;
}

export function liveDataToRecords(
  client: string,
  liveData: Record[]
): RecordFormat[] {
  if (!liveData) return [];
  return liveData.map((data) => ({
    client: client,
    time: data.updated_at || "",
    cpu: data.cpu.usage ?? 0,
    gpu: 0,
    ram: data.ram.used ?? 0,
    ram_total: 0,
    swap: data.swap.used ?? 0,
    swap_total: 0,
    load: data.load.load1 ?? 0,
    temp: 0,
    disk: data.disk.used ?? 0,
    disk_total: 0,
    net_in: data.network?.down ?? 0,
    net_out: data.network?.up ?? 0,
    net_total_up: data.network?.totalUp ?? 0,
    net_total_down: data.network?.totalDown ?? 0,
    process: data.process ?? 0,
    connections: data.connections.tcp ?? 0,
    connections_udp: data.connections.udp ?? 0,
  }));
}

/**
 * Creates a template object by recursively setting all numeric properties to null.
 * This is used to create placeholder items for missing time points.
 * @param obj The object to use as a template.
 * @returns A new object with the same structure, but with null for all numeric values.
 */
function createNullTemplate(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (typeof obj === "number") return null;
  if (typeof obj === "string" || typeof obj === "boolean") return obj;
  if (Array.isArray(obj)) return obj.map(createNullTemplate);
  if (typeof obj === "object") {
    const res: any = {};
    for (const k in obj) {
      if (k === "updated_at" || k === "time") continue;
      res[k] = createNullTemplate(obj[k]);
    }
    return res;
  }
  return null;
}

/**
 * Fills in missing time points in a dataset. Operates in two modes:
 * 1. Fixed-Length (default): Generates a dataset of a specific duration (`totalSeconds`) ending at the last data point.
 * 2. Variable-Length: If `totalSeconds` is set to `null`, it fills gaps between the first and last data points without enforcing a total duration.
 *
 * @param data The input data array, should have `time` or `updated_at` properties.
 * @param intervalSec The interval in seconds between each time point.
 * @param totalSeconds The total duration of the data to display in seconds. Set to `null` to fill from the first to the last data point instead.
 * @param matchToleranceSec The tolerance in seconds for matching a data point to a time point. Defaults to `intervalSec`.
 * @returns A new array with missing time points filled with null values.
 */
export default function fillMissingTimePoints<
  T extends { time?: string; updated_at?: string }
>(
  data: T[],
  intervalSec: number = 10,
  totalSeconds: number | null = 180,
  matchToleranceSec?: number
): T[] {
  if (!data.length) return [];

  const getTime = (item: T) =>
    new Date(item.time ?? item.updated_at ?? "").getTime();

  // Performance: Pre-calculate timestamps to avoid redundant parsing during sort and search.
  const timedData = data.map((item) => ({ item, timeMs: getTime(item) }));
  timedData.sort((a, b) => a.timeMs - b.timeMs);

  const firstItem = timedData[0];
  const lastItem = timedData[timedData.length - 1];
  const end = lastItem.timeMs;
  const interval = intervalSec * 1000;

  // NEW: Determine the start time based on whether totalSeconds is set for a fixed length.
  const start =
    totalSeconds !== null && totalSeconds > 0
      ? end - totalSeconds * 1000 + interval // Fixed-length mode
      : firstItem.timeMs; // Variable-length mode: start from the first data point

  // Generate the ideal time points for the chart's x-axis.
  const timePoints: number[] = [];
  for (let t = start; t <= end; t += interval) {
    timePoints.push(t);
  }

  // Create a template with null values for missing data points.
  const nullTemplate = createNullTemplate(lastItem.item);

  let dataIdx = 0;
  const matchToleranceMs = (matchToleranceSec ?? intervalSec) * 1000;

  const filled: T[] = timePoints.map((t) => {
    let found: T | undefined = undefined;

    // Advance the data pointer past points that are too old for the current time point.
    while (
      dataIdx < timedData.length &&
      timedData[dataIdx].timeMs < t - matchToleranceMs
    ) {
      dataIdx++;
    }

    // Check if the current data point is within the tolerance window of the ideal time point.
    if (
      dataIdx < timedData.length &&
      Math.abs(timedData[dataIdx].timeMs - t) <= matchToleranceMs
    ) {
      found = timedData[dataIdx].item;
    }

    if (found) {
      // If a point is found, use it, but align its time to the grid.
      return { ...found, time: new Date(t).toISOString() };
    }

    // If no point is found, insert the null template.
    return { ...nullTemplate, time: new Date(t).toISOString() } as T;
  });

  return filled;
}

/**
 * 线性插值填充：在相邻两个有效点之间，用线性插值填充中间的 null 值。
 * - 仅在“两个端点都存在且为数值”时进行插值
 * - 可通过 maxGapMs 控制最大可插值的时间跨度，超过则保留 null（避免横跨过大的真实空洞）
 */
export function interpolateNullsLinear<T extends { [key: string]: any }>(
  rows: T[],
  keys: string[],
  options?:
    | number
    | {
        /** 若提供则为统一的最大插值跨度 */
        maxGapMs?: number;
        /** 若未提供 maxGapMs，则以 典型间隔*该倍数 作为每条线的最大插值跨度 */
        maxGapMultiplier?: number; // default 6
        /** 统一的下限与上限（用于钳制），避免跨度过小/过大 */
        minCapMs?: number; // default 2min
        maxCapMs?: number; // default 30min
      }
): T[] {
  if (!rows || rows.length === 0 || !keys.length) return rows;

  const times = rows.map((r) =>
    new Date((r as any).time ?? (r as any).updated_at ?? "").getTime()
  );
  const out = rows.map((r) => ({ ...r }));

  // 解析配置（向后兼容数字参数）
  const opts =
    typeof options === "number" ? { maxGapMs: options } : options || {};
  const maxGapMsUnified = opts.maxGapMs;
  const multiplier = opts.maxGapMultiplier ?? 6;
  const minCap = opts.minCapMs ?? 2 * 60_000; // 2min
  const maxCap = opts.maxCapMs ?? 30 * 60_000; // 30min

  // 简单工具
  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));

  for (const key of keys) {
    // 收集该列的有效点索引
    const validIdx: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i][key];
      if (typeof v === "number" && Number.isFinite(v)) validIdx.push(i);
    }

    if (validIdx.length < 2) continue;

    // 计算该列的“典型间隔”（使用中位数）
    let perKeyMaxGap = maxGapMsUnified;
    if (perKeyMaxGap === undefined) {
      const gaps: number[] = [];
      for (let s = 0; s < validIdx.length - 1; s++) {
        const i0 = validIdx[s];
        const i1 = validIdx[s + 1];
        const t0 = times[i0];
        const t1 = times[i1];
        if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) {
          gaps.push(t1 - t0);
        }
      }
      if (gaps.length === 0) continue;
      gaps.sort((a, b) => a - b);
      const median = gaps[(gaps.length / 2) | 0];
      perKeyMaxGap = clamp(median * multiplier, minCap, maxCap);
    }

    // 相邻有效点之间做线性插值
    for (let s = 0; s < validIdx.length - 1; s++) {
      const i0 = validIdx[s];
      const i1 = validIdx[s + 1];
      const t0 = times[i0];
      const t1 = times[i1];
      const v0 = rows[i0][key];
      const v1 = rows[i1][key];

      if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) continue;
      if (typeof v0 !== "number" || typeof v1 !== "number") continue;
      if (perKeyMaxGap && t1 - t0 > perKeyMaxGap) continue; // 间隔太大，保持空洞

      for (let j = i0 + 1; j < i1; j++) {
        const tj = times[j];
        const ratio = (tj - t0) / (t1 - t0);
        (out as any)[j][key] = v0 + (v1 - v0) * ratio;
      }
    }
  }

  return out;
}

/**
 * EWMA（指数加权移动平均）
 * 使用指数加权移动平均算法平滑数据，同时检测并过滤突变值，填充 null/undefined 值
 *
 * @param data 输入数据数组，每个元素应该包含数值型属性
 * @param keys 需要处理的数值属性名数组
 * @param alpha 平滑因子
 * @param windowSize 突变检测窗口大小
 * @param spikeThreshold 突变阈值
 * @returns 处理后的数据数组
 */
export function cutPeakValues<T extends { [key: string]: any }>(
  data: T[],
  keys: string[],
  alpha: number = 0.1,
  windowSize: number = 15,
  spikeThreshold: number = 0.3
): T[] {
  if (!data || data.length === 0) return data;

  // 一次性深拷贝所有对象，后续直接原地修改避免大量 object spread
  const result: { [key: string]: any }[] = data.map((d) => ({ ...d }));
  const halfWindow = Math.floor(windowSize / 2);

  for (const key of keys) {
    // 第一步：检测并移除突变值（直接原地修改）
    for (let i = 0; i < result.length; i++) {
      const currentValue = result[i][key];

      if (currentValue != null && typeof currentValue === "number") {
        const neighborValues: number[] = [];

        for (
          let j = Math.max(0, i - halfWindow);
          j <= Math.min(result.length - 1, i + halfWindow);
          j++
        ) {
          if (j === i) continue;
          const neighbor = result[j][key];
          if (neighbor != null && typeof neighbor === "number") {
            neighborValues.push(neighbor);
          }
        }

        if (neighborValues.length >= 2) {
          const neighborSum = neighborValues.reduce((sum, val) => sum + val, 0);
          const neighborMean =
            neighborValues.length > 0 ? neighborSum / neighborValues.length : 0;

          if (neighborMean > 0) {
            const relativeChange =
              Math.abs(currentValue - neighborMean) / neighborMean;
            if (relativeChange > spikeThreshold) {
              result[i][key] = null;
            }
          } else if (Math.abs(currentValue) > 10) {
            result[i][key] = null;
          }
        }
      }
    }

    // 第二步：使用EWMA平滑和填充（直接原地修改）
    let ewma: number | null = null;

    for (let i = 0; i < result.length; i++) {
      const currentValue = result[i][key];

      if (currentValue != null && typeof currentValue === "number") {
        if (ewma === null) {
          ewma = Math.round(currentValue * 100) / 100;
        } else {
          ewma =
            Math.round((alpha * currentValue + (1 - alpha) * ewma) * 100) /
            100;
        }
        result[i][key] = ewma;
      } else if (ewma !== null) {
        result[i][key] = ewma;
      }
    }
  }

  return result as T[];
}

/**
 * 计算丢包率
 * 根据图表数据计算丢包率，null或undefined的数据视为丢包
 *
 * @param chartData 图表数据数组（包含填充的null值）
 * @param taskId 任务ID
 * @returns 丢包率百分比，保留1位小数
 */
export function calculateLossRate(chartData: any[], taskId: number): number {
  if (!chartData || chartData.length === 0) return 0;

  const totalCount = chartData.length;
  const lostCount = chartData.filter(
    (dataPoint) => dataPoint[taskId] === null || dataPoint[taskId] === undefined
  ).length;

  const lossRate = (lostCount / totalCount) * 100;
  return Math.round(lossRate * 10) / 10; // 保留1位小数
}

/**
 * 根据保留时间对数据进行采样
 * 避免渲染过多的数据点
 *
 * @param data 原始数据数组
 * @param retentionHours 数据保留时间（小时）
 * @param isMiniChart 是否是迷你图表（采样更激进）
 * @returns 采样后的数据数组
 */
export function sampleDataByRetention(
  data: any[],
  retentionHours: number,
  isMiniChart: boolean = false
): any[] {
  if (!data || data.length === 0) return [];

  let sampleInterval: number;

  // 根据保留时间确定采样间隔（分钟）
  if (isMiniChart) {
    // MiniChart 使用更激进的采样，减少点数
    if (retentionHours <= 72) {
      sampleInterval = 5; // 最多5分钟一个点
    } else if (retentionHours <= 168) {
      sampleInterval = 30; // 最多30分钟一个点
    } else if (retentionHours <= 720) {
      sampleInterval = 60; // 最多60分钟一个点
    } else if (retentionHours <= 2160) {
      sampleInterval = 120; // 最多120分钟一个点
    } else {
      sampleInterval = 180; // 最多180分钟一个点
    }
  } else {
    // 主图表的采样间隔
    if (retentionHours <= 72) {
      sampleInterval = 1; // 最多1分钟一个点
    } else if (retentionHours <= 168) {
      sampleInterval = 15; // 最多15分钟一个点
    } else if (retentionHours <= 720) {
      sampleInterval = 30; // 最多30分钟一个点
    } else if (retentionHours <= 2160) {
      sampleInterval = 60; // 最多60分钟一个点
    } else {
      sampleInterval = 90; // 最多90分钟一个点
    }
  }

  // 如果数据点间隔已经大于采样间隔，直接返回原数据
  if (data.length <= 2) return data;

  const result: any[] = [];
  const sampleIntervalMs = sampleInterval * 60 * 1000; // 转换为毫秒

  // 始终保留第一个数据点
  result.push(data[0]);
  let lastSampledTime = new Date(data[0].time).getTime();

  // 采样中间的数据点
  for (let i = 1; i < data.length - 1; i++) {
    const currentTime = new Date(data[i].time).getTime();

    // 如果距离上一个采样点的时间间隔大于等于采样间隔，则保留该点
    if (currentTime - lastSampledTime >= sampleIntervalMs) {
      result.push(data[i]);
      lastSampledTime = currentTime;
    }
  }

  // 始终保留最后一个数据点
  if (data.length > 1) {
    const lastPoint = data[data.length - 1];
    const lastTime = new Date(lastPoint.time).getTime();

    // 如果最后一个点距离上一个采样点太近，替换上一个采样点
    if (
      result.length > 1 &&
      lastTime - lastSampledTime < sampleIntervalMs / 2
    ) {
      result[result.length - 1] = lastPoint;
    } else {
      result.push(lastPoint);
    }
  }

  return result;
}

/**
 * 根据 ping 历史记录计算丢包率。
 * @param records - ping 历史记录数组。
 * @param taskId - 要计算丢包率的任务 ID。
 * @param timeRange - 用于筛选记录的可选时间范围 [开始, 结束]。
 * @returns 以百分比表示的丢包率。
 */
/**
 * 根据 ping 历史记录计算任务的统计数据（丢包率和最新值）。
 * @param records - ping 历史记录数组。
 * @param taskId - 要计算的任务 ID。
 * @param timeRange - 用于筛选记录的可选时间范围 [开始, 结束]。
 * @returns 包含丢包率和最新值的对象。
 */
export function calculateTaskStats(
  records: { time: string; task_id: number; value: number }[],
  taskId: number,
  timeRange: [number, number] | null
): { loss: number; latestValue: number | null; latestTime: string | null } {
  const relevantRecords = timeRange
    ? records.filter((rec) => {
        const t = new Date(rec.time).getTime();
        return t >= timeRange[0] && t <= timeRange[1];
      })
    : records;

  const taskRecords =
    relevantRecords?.filter((rec) => rec.task_id === taskId) || [];

  const totalPings = taskRecords.length;
  const successfulPings = taskRecords.filter((rec) => rec.value >= 0);
  const loss =
    totalPings > 0 ? (1 - successfulPings.length / totalPings) * 100 : 0;

  let latestValue: number | null = null;
  let latestTime: string | null = null;
  if (successfulPings.length > 0) {
    const latestRecord = successfulPings.reduce((latest, current) => {
      return new Date(current.time) > new Date(latest.time) ? current : latest;
    });
    latestValue = latestRecord.value;
    latestTime = latestRecord.time;
  }

  return { loss, latestValue, latestTime };
}
