// API 服务 - 用于与 Komari 后端通信
import type {
  NodeData,
  ApiResponse,
  PublicInfo,
  HistoryRecord,
  PingHistoryResponse,
  PingHistoryRecord,
  PingTask,
  PingTaskFull,
  Me,
  NodeStats,
} from "@/types/node";
import type { RpcNodeStatus, RpcNodeStatusMap } from "@/types/rpc";
import { convertNodeStatsToRpcNodeStatus } from "@/utils/converters";
import type { SiteStatus } from "@/config/default";

const LOAD_HISTORY_METRIC_KEYS = [
  "cpu.usage",
  "gpu.usage",
  "memory.used",
  "memory.total",
  "swap.used",
  "swap.total",
  "load.average",
  "temperature",
  "disk.used",
  "disk.total",
  "net.in.rate",
  "net.out.rate",
  "net.total.up",
  "net.total.down",
  "process.count",
  "connections.tcp",
  "connections.udp",
];

const METRIC_DEFAULT_MAX_POINTS = 700;
const METRIC_QUERY_MAX_POINTS = 200_000;
const METRIC_QUERY_POINT_INTERVAL_SECONDS = 30;

export type HistoryQueryRange = {
  start: string;
  end: string;
};

type MetricDefinitionRetention = {
  name?: string;
  metric_key?: string;
  retention_days?: number;
};

const toNonNegativeNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

class ApiService {
  private baseUrl: string;
  public useRpc = false;
  private rpcCallId = 1;
  private rpcWs: WebSocket | null = null;
  private rpcWsPending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();
  private metricDefinitionsPromise: Promise<
    MetricDefinitionRetention[] | null
  > | null = null;

  constructor() {
    this.baseUrl = "";
  }

  private async rpcCall<T>(
    method: string,
    params: any = {},
    options: { silent?: boolean } = {}
  ): Promise<ApiResponse<T>> {
    if (typeof window !== "undefined") {
      this.ensureRpcWebSocket();
      if (this.rpcWs?.readyState === WebSocket.OPEN) {
        try {
          const result = await this.rpcCallViaWebSocket<T>(method, params);
          return { status: "success", message: "", data: result };
        } catch {
          // Fall through to HTTP, matching the official RPC2 client strategy.
        }
      }
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/rpc2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method,
          params,
          id: this.rpcCallId++,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const rpcResponse = await response.json();
      if (rpcResponse.error) {
        throw new Error(
          `RPC Error: ${rpcResponse.error.message} (Code: ${rpcResponse.error.code})`
        );
      }
      return { status: "success", message: "", data: rpcResponse.result };
    } catch (error) {
      if (!options.silent) {
        console.error(`RPC call to '${method}' failed:`, error);
      }
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown RPC error",
        data: null as any,
      };
    }
  }

  private ensureRpcWebSocket() {
    if (
      this.rpcWs &&
      (this.rpcWs.readyState === WebSocket.OPEN ||
        this.rpcWs.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.rpcWs = new WebSocket(`${protocol}//${window.location.host}/api/rpc2`);

    this.rpcWs.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data);
        const pending = this.rpcWsPending.get(response.id);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.rpcWsPending.delete(response.id);
        if (response.error) {
          pending.reject(
            new Error(
              `RPC Error: ${response.error.message} (Code: ${response.error.code})`
            )
          );
        } else {
          pending.resolve(response.result);
        }
      } catch (error) {
        console.error("Failed to parse RPC2 WebSocket message:", error);
      }
    };

    this.rpcWs.onclose = () => {
      this.rpcWs = null;
      for (const [, pending] of this.rpcWsPending) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("RPC2 WebSocket disconnected"));
      }
      this.rpcWsPending.clear();
    };
  }

  private rpcCallViaWebSocket<T>(method: string, params: any = {}): Promise<T> {
    if (!this.rpcWs || this.rpcWs.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("RPC2 WebSocket is not connected"));
    }

    const id = this.rpcCallId++;
    const request = {
      jsonrpc: "2.0",
      method,
      params,
      id,
    };

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.rpcWsPending.delete(id);
        reject(new Error(`RPC2 request timed out: ${method}`));
      }, 30000);
      this.rpcWsPending.set(id, { resolve, reject, timeout });
      this.rpcWs?.send(JSON.stringify(request));
    });
  }

  private async rpcFallback<T>(
    attempts: Array<{ method: string; params?: any }>
  ): Promise<ApiResponse<T>> {
    let lastResponse: ApiResponse<T> | null = null;
    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i];
      const response = await this.rpcCall<T>(attempt.method, attempt.params || {}, {
        silent: i < attempts.length - 1,
      });
      if (response.status === "success" && response.data != null) {
        return response;
      }
      lastResponse = response;
    }
    return (
      lastResponse || {
        status: "error",
        message: "No RPC attempts were provided",
        data: null as any,
      }
    );
  }

  private normalizeLoadHistory(
    data: any,
    uuid: string
  ): { count: number; records: HistoryRecord[] } | null {
    if (!data) return null;
    const records = Array.isArray(data.records)
      ? data.records
      : data.records?.[uuid] || [];
    return {
      count: data.count ?? records.length,
      records,
    };
  }

  private normalizePingHistory(data: any): PingHistoryResponse | null {
    if (!data) return null;
    const records: PingHistoryRecord[] = Array.isArray(data.records)
      ? data.records
          .map((record: any) => {
            const taskId = Number(record.task_id);
            const value =
              record.value === null ? null : this.metricValue(record.value);
            if (!Number.isFinite(taskId)) return null;
            return {
              ...record,
              task_id: taskId,
              value: value === null ? null : value,
            };
          })
          .filter(Boolean)
      : [];
    let tasks: PingTask[] = Array.isArray(data.tasks) ? data.tasks : [];

    if (tasks.length === 0 && records.length > 0) {
      const taskIdSet = new Set<number>();
      records.forEach((record: any) => {
        const taskId = Number(record.task_id);
        if (Number.isFinite(taskId)) taskIdSet.add(taskId);
      });

      const basicInfo: Array<{ loss?: number }> = Array.isArray(data.basic_info)
        ? data.basic_info
        : [];
      const avgLoss =
        basicInfo.length > 0
          ? basicInfo.reduce((sum, item) => sum + (item.loss || 0), 0) /
            basicInfo.length
          : 0;

      tasks = Array.from(taskIdSet)
        .sort((a, b) => a - b)
        .map((id) => ({
          id,
          name: `Task ${id}`,
          interval: 30,
          loss: Math.round(avgLoss * 100) / 100,
        }));
    }

    return {
      count: data.count ?? records.length,
      records,
      tasks,
    };
  }

  private metricTags(value: any): Record<string, string> | undefined {
    for (const tags of [value?.tags, value?.tag, value?.labels]) {
      if (
        tags &&
        typeof tags === "object" &&
        Object.keys(tags).length > 0
      ) {
        return tags;
      }
    }
    return undefined;
  }

  private metricValue(value: unknown): number | null {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private hasFiniteMetricValue(records: Array<Record<string, unknown>>) {
    return records.some((record) =>
      Object.entries(record).some(
        ([key, value]) =>
          key !== "time" &&
          key !== "client" &&
          typeof value === "number" &&
          Number.isFinite(value)
      )
    );
  }

  private hasFinitePingValue(records: PingHistoryRecord[]) {
    return records.some(
      (record) =>
        typeof record.value === "number" &&
        Number.isFinite(record.value) &&
        record.value >= 0
    );
  }

  private historyRangeHours(
    hours: number,
    range?: HistoryQueryRange | null
  ) {
    if (range?.start && range?.end) {
      const start = new Date(range.start).getTime();
      const end = new Date(range.end).getTime();
      const rangeHours = (end - start) / 3_600_000;
      if (Number.isFinite(rangeHours) && rangeHours > 0) {
        return rangeHours;
      }
    }
    return Number.isFinite(hours) && hours > 0 ? hours : 1;
  }

  private metricQueryMaxPoints(
    hours: number,
    range?: HistoryQueryRange | null
  ) {
    const rangeSeconds = this.historyRangeHours(hours, range) * 3600;
    const points =
      Math.ceil(rangeSeconds / METRIC_QUERY_POINT_INTERVAL_SECONDS) + 2;
    return Math.min(
      METRIC_QUERY_MAX_POINTS,
      Math.max(METRIC_DEFAULT_MAX_POINTS, points)
    );
  }

  private isPingMetricsConsistent(
    records: PingHistoryRecord[],
    statsData: any
  ) {
    if (!this.hasFinitePingValue(records)) return false;

    const statsList = Array.isArray(statsData?.stats) ? statsData.stats : [];
    if (statsList.length === 0) return true;

    const maxByTask = new Map<number, number>();
    for (const stat of statsList) {
      const taskId = Number(stat.task_id);
      const candidates = [stat.max, stat.latest, stat.avg]
        .map((value) => this.metricValue(value))
        .filter((value): value is number => value !== null && value >= 0);
      if (!Number.isFinite(taskId) || candidates.length === 0) continue;
      maxByTask.set(taskId, Math.max(...candidates));
    }
    if (maxByTask.size === 0) return true;

    for (const record of records) {
      if (
        typeof record.value !== "number" ||
        !Number.isFinite(record.value) ||
        record.value < 0
      ) {
        continue;
      }
      const statMax = maxByTask.get(Number(record.task_id));
      if (typeof statMax !== "number" || !Number.isFinite(statMax)) continue;
      const allowedMax = Math.max(statMax * 3, statMax + 1000);
      if (record.value > allowedMax) return false;
    }

    return true;
  }

  private async getLoadHistoryFromRecordFallbacks(
    uuid: string,
    hours: number
  ): Promise<{ count: number; records: HistoryRecord[] } | null> {
    const attempts = [
      {
        method: "public:getRecordsByUUID",
        params: { uuid, hours: String(hours), load_type: "all" },
      },
      {
        method: "common:getRecords",
        params: {
          uuid,
          hours,
          type: "load",
          load_type: "all",
          maxCount: -1,
        },
      },
    ];

    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i];
      const response = await this.rpcCall<any>(
        attempt.method,
        attempt.params,
        { silent: i < attempts.length - 1 }
      );
      if (response.status !== "success" || !response.data) continue;
      const normalized = this.normalizeLoadHistory(response.data, uuid);
      if (
        normalized &&
        this.hasFiniteMetricValue(normalized.records as any[])
      ) {
        return normalized;
      }
    }

    return null;
  }

  private async getPingHistoryFromRecordFallbacks(
    uuid: string,
    hours: number
  ): Promise<PingHistoryResponse | null> {
    const attempts = [
      {
        method: "public:getPingRecords",
        params: { uuid, hours: String(hours) },
      },
      {
        method: "common:getRecords",
        params: {
          uuid,
          hours,
          type: "ping",
          task_id: -1,
          maxCount: -1,
        },
      },
    ];

    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i];
      const response = await this.rpcCall<any>(
        attempt.method,
        attempt.params,
        { silent: i < attempts.length - 1 }
      );
      if (response.status !== "success" || !response.data) continue;
      const normalized = this.normalizePingHistory(response.data);
      if (normalized && this.hasFinitePingValue(normalized.records)) {
        return normalized;
      }
    }

    return null;
  }

  private async getMetricDefinitions() {
    if (!this.metricDefinitionsPromise) {
      this.metricDefinitionsPromise = this.rpcCall<
        MetricDefinitionRetention[]
      >("public:listMetricDefinitions", {}, { silent: true }).then((response) =>
        response.status === "success" && Array.isArray(response.data)
          ? response.data
          : null
      );
    }
    return this.metricDefinitionsPromise;
  }

  private async getMetricDefinitionKeys() {
    const definitions = await this.getMetricDefinitions();
    if (definitions === null) return null;
    return new Set(
      definitions
        .filter(
          (definition) =>
            (toNonNegativeNumber(definition.retention_days) ?? 0) > 0
        )
        .map((definition) =>
          String(definition.name || definition.metric_key || "")
        )
        .filter(Boolean)
    );
  }

  private async filterAvailableMetricKeys(metricKeys: string[]) {
    const available = await this.getMetricDefinitionKeys();
    if (!available) {
      return metricKeys;
    }
    return metricKeys.filter((key) => available.has(key));
  }

  private async queryMetrics(params: any): Promise<any | null> {
    const response = await this.rpcCall<any>("public:queryMetrics", params, {
      silent: true,
    });
    return response.status === "success" ? response.data : null;
  }

  private legacyMetricRetentionDays(
    publicInfo: PublicInfo | null | undefined,
    kind: "load" | "ping"
  ): number | null {
    const specificDays = toNonNegativeNumber(
      kind === "load"
        ? publicInfo?.load_metric_retention_days
        : publicInfo?.ping_metric_retention_days
    );
    if (specificDays !== null) return specificDays;

    const legacyDays = toNonNegativeNumber(publicInfo?.metric_retention_days);
    if (legacyDays !== null) return legacyDays;

    const legacyHours = toNonNegativeNumber(
      kind === "load"
        ? publicInfo?.record_preserve_time
        : publicInfo?.ping_record_preserve_time
    );
    return legacyHours === null ? null : legacyHours / 24;
  }

  async getLoadMetricRetentionDays(
    publicInfo?: PublicInfo | null
  ): Promise<number | null> {
    if (this.useRpc) {
      const definitions = await this.getMetricDefinitions();
      if (definitions !== null) {
        const keySet = new Set(LOAD_HISTORY_METRIC_KEYS);
        const retentionDays = definitions
          .filter((definition) =>
            keySet.has(String(definition.name || definition.metric_key || ""))
          )
          .map((definition) => toNonNegativeNumber(definition.retention_days))
          .filter((days): days is number => days !== null);
        if (retentionDays.length > 0) {
          const enabledDays = retentionDays.filter((days) => days > 0);
          return enabledDays.length > 0 ? Math.max(...enabledDays) : 0;
        }
      }
    }
    return this.legacyMetricRetentionDays(publicInfo, "load");
  }

  async getPingMetricRetentionDays(
    publicInfo?: PublicInfo | null
  ): Promise<number | null> {
    if (this.useRpc) {
      const definitions = await this.getMetricDefinitions();
      if (definitions !== null) {
        const findRetention = (metricKey: string) => {
          const definition = definitions.find(
            (item) =>
              String(item.name || item.metric_key || "") === metricKey
          );
          return definition
            ? toNonNegativeNumber(definition.retention_days)
            : null;
        };
        const latencyDays = findRetention("ping.latency_ms");
        if (latencyDays !== null) {
          if (latencyDays === 0) return 0;
          const lossDays = findRetention("ping.loss");
          return lossDays !== null && lossDays > 0
            ? Math.min(latencyDays, lossDays)
            : latencyDays;
        }
      }
    }
    return this.legacyMetricRetentionDays(publicInfo, "ping");
  }

  private async getLoadHistoryFromMetrics(
    uuid: string,
    hours: number,
    range?: HistoryQueryRange | null
  ): Promise<{ count: number; records: HistoryRecord[] } | null> {
    const metricToRecordKey: Record<string, keyof HistoryRecord> = {
      "cpu.usage": "cpu",
      "gpu.usage": "gpu",
      "memory.used": "ram",
      "memory.total": "ram_total",
      "swap.used": "swap",
      "swap.total": "swap_total",
      "load.average": "load",
      temperature: "temp",
      "disk.used": "disk",
      "disk.total": "disk_total",
      "net.in.rate": "net_in",
      "net.out.rate": "net_out",
      "net.total.up": "net_total_up",
      "net.total.down": "net_total_down",
      "process.count": "process",
      "connections.tcp": "connections",
      "connections.udp": "connections_udp",
    };
    const metricKeys = await this.filterAvailableMetricKeys(
      Object.keys(metricToRecordKey)
    );
    if (metricKeys.length === 0) return null;
    const buildRecords = (data: any) => {
      const seriesList = Array.isArray(data?.series) ? data.series : [];
      if (seriesList.length === 0) return null;

      const rows = new Map<string, Partial<HistoryRecord>>();
      for (const series of seriesList) {
        const metricKey = series.metric_key || series.name;
        const recordKey = metricToRecordKey[metricKey];
        if (!recordKey) continue;
        for (const point of series.points || []) {
          const time = new Date(point.time).getTime();
          if (!Number.isFinite(time)) continue;
          const timestamp = new Date(time).toISOString();
          const row = rows.get(timestamp) || { client: uuid, time: timestamp };
          (row as any)[recordKey] = this.metricValue(point.value);
          rows.set(timestamp, row);
        }
      }

      const records = Array.from(rows.values())
        .sort(
          (a, b) =>
            new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime()
        )
        .map((row) => ({ client: uuid, ...row } as HistoryRecord))
        .filter((record) => this.hasFiniteMetricValue([record as any]));

      return records.length > 0 ? records : null;
    };

    const baseParams = {
      metric_keys: metricKeys,
      entity_id: uuid,
      ...(range ? { start: range.start, end: range.end } : { hours }),
      aggregation: "avg",
    };
    const data = await this.queryMetrics({
      ...baseParams,
      max_points: this.metricQueryMaxPoints(hours, range),
      downsample: true,
      fill_empty: true,
    });
    const records = buildRecords(data);

    return records && this.hasFiniteMetricValue(records as any[])
      ? { count: records.length, records }
      : null;
  }

  private async getPingHistoryFromMetrics(
    uuid: string,
    hours: number,
    range?: HistoryQueryRange | null
  ): Promise<PingHistoryResponse | null> {
    const metricKeys = await this.filterAvailableMetricKeys(["ping.latency_ms"]);
    if (metricKeys.length === 0) return null;
    const baseMetricParams = {
      metric_keys: metricKeys,
      entity_id: uuid,
      ...(range ? { start: range.start, end: range.end } : { hours }),
      aggregation: "avg",
    };
    const queryMaxPoints = this.metricQueryMaxPoints(hours, range);
    const [metricData, taskList, statsData] = await Promise.all([
      this.queryMetrics({
        ...baseMetricParams,
        max_points: queryMaxPoints,
        downsample: true,
        fill_empty: true,
      }),
      this.getPingTasks(),
      this.rpcCall<any>(
        "public:getPingMetricStats",
        {
          entity_id: uuid,
          ...(range ? { start: range.start, end: range.end } : { hours }),
          max_points: queryMaxPoints,
        },
        { silent: true }
      ).then((response) =>
        response.status === "success" ? response.data : null
      ),
    ]);

    const buildRecords = (data: any) => {
      const seriesList = Array.isArray(data?.series) ? data.series : [];
      if (seriesList.length === 0) return null;

      const records: PingHistoryRecord[] = [];
      const taskIds = new Set<number>();
      const intervalByTask = new Map<number, number>();
      for (const series of seriesList) {
        const seriesInterval = Number(series.interval_seconds);
        for (const point of series.points || []) {
          const tags = this.metricTags(point) || this.metricTags(series);
          const taskId = Number(tags?.task_id);
          const time = new Date(point.time).getTime();
          if (!Number.isFinite(taskId) || !Number.isFinite(time)) continue;
          const value = this.metricValue(point.value);
          if (value === null) continue;
          taskIds.add(taskId);
          if (Number.isFinite(seriesInterval) && seriesInterval > 0) {
            intervalByTask.set(
              taskId,
              Math.max(intervalByTask.get(taskId) || 0, seriesInterval)
            );
          }
          records.push({
            task_id: taskId,
            time: new Date(time).toISOString(),
            value,
            client: uuid,
          } as PingHistoryRecord);
        }
      }
      return { records, taskIds, intervalByTask };
    };

    const built = buildRecords(metricData);
    if (!built || !this.isPingMetricsConsistent(built.records, statsData)) {
      return null;
    }

    const { records, taskIds, intervalByTask } = built;

    const taskMap = new Map<number, PingTask>();
    for (const task of taskList) {
      const id = Number(task.id);
      if (!Number.isFinite(id) || !taskIds.has(id)) continue;
      taskMap.set(id, {
        id,
        name: task.name || `Task ${id}`,
        interval: Number(task.interval) || 60,
        data_interval: intervalByTask.get(id),
        loss: 0,
      });
    }

    const statsList = Array.isArray(statsData?.stats) ? statsData.stats : [];
    for (const stat of statsList) {
      const id = Number(stat.task_id);
      if (!Number.isFinite(id) || !taskIds.has(id)) continue;
      const existing = taskMap.get(id);
      taskMap.set(id, {
        id,
        name: stat.name || existing?.name || `Task ${id}`,
        interval: Number(stat.interval) || existing?.interval || 60,
        data_interval: intervalByTask.get(id) || existing?.data_interval,
        loss: Number(stat.loss) || 0,
      });
    }

    for (const id of taskIds) {
      if (!taskMap.has(id)) {
        taskMap.set(id, {
          id,
          name: `Task ${id}`,
          interval: 60,
          data_interval: intervalByTask.get(id),
          loss: 0,
        });
      }
    }

    records.sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    return {
      count: records.length,
      records,
      tasks: Array.from(taskMap.values()).sort((a, b) => a.id - b.id),
    };
  }

  async get<T>(
    endpoint: string
  ): Promise<ApiResponse<T> | { status: string; message: string; data: any }> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`);
      if (!response.ok) {
        return {
          status: "error",
          message: `HTTP error! status: ${response.status}`,
          data: null as any,
        };
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("API request failed (network error):", error);
      return {
        status: "error",
        message:
          error instanceof Error ? error.message : "Unknown network error",
        data: null as any,
      };
    }
  }

  // 获取所有节点信息
  async getNodes(): Promise<NodeData[]> {
    if (this.useRpc) {
      const response = await this.rpcFallback<NodeData[] | { [uuid: string]: NodeData }>([
        { method: "public:getNodesInformation" },
        { method: "common:getNodes" },
      ]);
      if (response.status === "success" && response.data) {
        return Array.isArray(response.data)
          ? response.data
          : Object.values(response.data);
      }
    }
    const response = await this.get<NodeData[]>("/api/nodes");
    if ("status" in response && response.status === "success") {
      return (response as ApiResponse<NodeData[]>).data;
    }
    return [];
  }

  // 获取指定节点的最近状态
  async getNodeRecentStats(uuid: string): Promise<RpcNodeStatus[]> {
    if (this.useRpc) {
      const response = await this.rpcFallback<RpcNodeStatus[] | { records: RpcNodeStatus[] }>([
        { method: "public:getClientRecentRecords", params: { uuid } },
        { method: "common:getNodeRecentStatus", params: { uuid } },
      ]);
      if (response.status === "success" && response.data) {
        return Array.isArray(response.data)
          ? response.data
          : response.data.records || [];
      }
    }
    return this.getRecentLoadHistory(uuid);
  }

  // 获取实时负载首屏历史，官方 1.2.6 默认主题这里直接使用公开 REST
  async getRecentLoadHistory(uuid: string): Promise<RpcNodeStatus[]> {
    const response = await this.get<NodeStats[]>(`/api/recent/${uuid}`);
    const payload = response as any;
    const records: NodeStats[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
      ? payload.data
      : [];

    return records.map((stats) =>
      convertNodeStatsToRpcNodeStatus(stats, uuid, true)
    );
  }

  // 获取负载历史记录
  async getLoadHistory(
    uuid: string,
    hours: number = 24,
    range?: HistoryQueryRange | null
  ): Promise<{ count: number; records: HistoryRecord[] } | null> {
    if (this.useRpc) {
      const metricHistory = await this.getLoadHistoryFromMetrics(
        uuid,
        hours,
        range
      );
      if (metricHistory) return metricHistory;

      if (range) return null;

      const recordsHistory = await this.getLoadHistoryFromRecordFallbacks(
        uuid,
        hours
      );
      if (recordsHistory) return recordsHistory;
    }
    const response = await this.get<{
      count: number;
      records: HistoryRecord[];
    }>(`/api/records/load?uuid=${uuid}&hours=${hours}`);
    if (response.status === "success" && response.data?.records?.length) {
      const normalized = this.normalizeLoadHistory(response.data, uuid);
      return normalized && this.hasFiniteMetricValue(normalized.records as any[])
        ? normalized
        : null;
    }
    return null;
  }

  // 获取 Ping 历史记录
  async getPingHistory(
    uuid: string,
    hours: number = 24,
    range?: HistoryQueryRange | null
  ): Promise<PingHistoryResponse | null> {
    if (this.useRpc) {
      if (!range && hours > 0 && hours <= 4) {
        const recordsHistory = await this.getPingHistoryFromRecordFallbacks(
          uuid,
          hours
        );
        if (recordsHistory) return recordsHistory;
      }

      const metricHistory = await this.getPingHistoryFromMetrics(
        uuid,
        hours,
        range
      );
      if (metricHistory) return metricHistory;

      if (range) return null;

      const recordsHistory = await this.getPingHistoryFromRecordFallbacks(
        uuid,
        hours
      );
      if (recordsHistory) return recordsHistory;
    }
    const response = await this.get<PingHistoryResponse>(
      `/api/records/ping?uuid=${uuid}&hours=${hours}`
    );
    if (response.status === "success" && response.data?.records?.length) {
      const normalized = this.normalizePingHistory(response.data);
      return normalized && this.hasFinitePingValue(normalized.records)
        ? normalized
        : null;
    }
    return null;
  }

  // 获取监测节点任务列表（管理员API）
  async getPingTasks(): Promise<PingTaskFull[]> {
    try {
      if (this.useRpc) {
        const response = await this.rpcCall<PingTaskFull[]>(
          "public:getPublicPingTasks",
          {},
          { silent: true }
        );
        if (response.status === "success" && Array.isArray(response.data)) {
          return response.data;
        }

        const publicResponse = await this.get<PingTaskFull[]>("/api/task/ping");
        if (
          publicResponse.status === "success" &&
          Array.isArray(publicResponse.data)
        ) {
          return publicResponse.data;
        }

        return [];
      }

      const publicResponse = await this.get<PingTaskFull[]>("/api/task/ping");
      if (
        publicResponse.status === "success" &&
        Array.isArray(publicResponse.data)
      ) {
        return publicResponse.data;
      }

      const response = await this.get<PingTaskFull[]>("/api/admin/ping/");
      if (response.status === "success" && Array.isArray(response.data)) {
        return response.data;
      }
      return [];
    } catch {
      return [];
    }
  }

  // 获取公开设置
  async getPublicSettings(): Promise<PublicInfo | null> {
    if (this.useRpc) {
      const response = await this.rpcFallback<PublicInfo>([
        { method: "public:getPublicSettings" },
        { method: "common:getPublicInfo" },
      ]);
      if (response.status === "success" && response.data) {
        return response.data;
      }
    }
    const response = await this.get<PublicInfo>("/api/public");
    return response.status === "success" ? response.data : null;
  }

  // 获取版本信息
  async getVersion(): Promise<{ version: string; hash: string }> {
    if (this.useRpc) {
      const response = await this.rpcFallback<{ version: string; hash: string }>([
        { method: "public:getVersion" },
        { method: "common:getVersion" },
      ]);
      if (response.status === "success" && response.data) {
        return response.data;
      }
    }
    const response = await this.get<{ version: string; hash: string }>(
      "/api/version"
    );
    return response.status === "success"
      ? response.data
      : { version: "unknown", hash: "unknown" };
  }

  // 获取用户信息
  async getUserInfo(): Promise<Me | null> {
    if (this.useRpc) {
      const response = await this.rpcFallback<Me>([
        { method: "public:getMe" },
        { method: "common:getMe" },
      ]);
      if (response.status === "success" && response.data) {
        return response.data;
      }
    }
    try {
      const response = await fetch(`${this.baseUrl}/api/me`);
      if (!response.ok) {
        return null;
      }
      const data: Me = await response.json();
      return data;
    } catch (error) {
      console.error("API request failed (network error):", error);
      return null;
    }
  }

  // 检查站点状态
  async checkSiteStatus(): Promise<{
    status: SiteStatus;
    publicInfo: PublicInfo | null;
  }> {
    const publicInfoResponse = await this.getPublicSettings();
    const meResponse = await this.getUserInfo();
    const isLoggedIn = meResponse?.logged_in || false;

    if (publicInfoResponse) {
      if (publicInfoResponse.private_site) {
        if (isLoggedIn) {
          return {
            status: "private-authenticated",
            publicInfo: publicInfoResponse,
          };
        }
        return {
          status: "private-unauthenticated",
          publicInfo: publicInfoResponse,
        };
      } else {
        if (isLoggedIn) {
          return { status: "authenticated", publicInfo: publicInfoResponse };
        }
        return { status: "public", publicInfo: publicInfoResponse };
      }
    }
    return { status: "private-unauthenticated", publicInfo: null };
  }

  async saveThemeSettings(
    theme: string,
    settings: Partial<any>
  ): Promise<ApiResponse<any>> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/admin/theme/settings?theme=${theme}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(settings),
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to save theme settings:", error);
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        data: null,
      };
    }
  }
}

// 创建 API 服务实例
export const apiService = new ApiService();

// WebSocket 连接管理
export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 5000;
  private listeners: Set<(data: any) => void> = new Set();
  private url: string;
  private statusInterval: ReturnType<typeof setInterval> | null = null;
  private rpcCallId = 1;
  public useRpc = false;

  constructor(url: string = "") {
    this.url = url;
  }

  connect() {
    if (this.ws && this.ws.readyState < 2) {
      return;
    }

    const endpoint = this.useRpc ? "/api/rpc2" : "/api/clients";
    const wsUrl =
      this.url ||
      `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
        window.location.host
      }${endpoint}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`WebSocket connected to ${endpoint}`);
        this.reconnectAttempts = 0;
        this.sendUpdateRequest();
        this.startStatusUpdates();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (this.useRpc) {
            if (data.result) {
              this.listeners.forEach((listener) => listener(data.result));
            }
          } else {
            if (data.status === "success" && data.data) {
              const oldData = data.data as {
                online: string[];
                data: { [uuid: string]: NodeStats };
              };
              if (oldData.online && oldData.data) {
                const convertedData: RpcNodeStatusMap = {};
                for (const uuid in oldData.data) {
                  const isOnline = oldData.online.includes(uuid);
                  convertedData[uuid] = convertNodeStatsToRpcNodeStatus(
                    oldData.data[uuid],
                    uuid,
                    isOnline
                  );
                }
                this.listeners.forEach((listener) => listener(convertedData));
              }
            }
          }
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      this.ws.onclose = () => {
        console.log("WebSocket disconnected");
        this.stopStatusUpdates();
        this.reconnect();
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    } catch (error) {
      console.error("Failed to connect WebSocket:", error);
      this.reconnect();
    }
  }

  private reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      );
      setTimeout(() => this.connect(), this.reconnectInterval);
    } else {
      console.error("Max reconnection attempts reached");
    }
  }

  private send(data: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  private sendUpdateRequest() {
    if (this.useRpc) {
      const rpcRequest = {
        jsonrpc: "2.0",
        method: "common:getNodesLatestStatus",
        id: this.rpcCallId++,
      };
      this.send(JSON.stringify(rpcRequest));
    } else {
      this.send("get");
    }
  }

  subscribe(listener: (data: any) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.stopStatusUpdates();
    }
  }

  private startStatusUpdates() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
    this.statusInterval = setInterval(() => {
      this.sendUpdateRequest();
    }, 2000);
  }

  private stopStatusUpdates() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
  }
}

// 延迟 WebSocket 服务实例的创建
let wsServiceInstance: WebSocketService | null = null;

export function getWsService(): WebSocketService {
  if (!wsServiceInstance) {
    wsServiceInstance = new WebSocketService();
  }
  return wsServiceInstance;
}
