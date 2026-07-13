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

const PING_HISTORY_METRIC_KEYS = ["ping.latency_ms", "ping.loss"];

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
            const value = Number(record.value);
            if (!Number.isFinite(taskId)) return null;
            return {
              ...record,
              task_id: taskId,
              value: Number.isFinite(value) ? value : -1,
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
    const tags = value?.tag || value?.tags;
    return tags && typeof tags === "object" ? tags : undefined;
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

  private async queryMetrics(params: any): Promise<any | null> {
    const response = await this.rpcCall<any>("public:queryMetrics", params, {
      silent: true,
    });
    return response.status === "success" ? response.data : null;
  }

  private async getMetricRetentionDays(
    metricKeys: string[],
    publicInfo?: PublicInfo | null,
    strategy: "max" | "min" = "max"
  ): Promise<number> {
    if (this.useRpc) {
      const response = await this.rpcCall<
        Array<{ name?: string; retention_days?: number }>
      >(
        "public:listMetricDefinitions",
        {},
        { silent: true }
      );
      if (response.status === "success" && Array.isArray(response.data)) {
        const keySet = new Set(metricKeys);
        const retentionDays = response.data
          .filter((definition) => keySet.has(String(definition.name)))
          .map((definition) => Number(definition.retention_days))
          .filter((days) => Number.isFinite(days) && days > 0);
        if (retentionDays.length > 0) {
          return strategy === "min"
            ? Math.min(...retentionDays)
            : Math.max(...retentionDays);
        }
      }
    }

    const fallback = Number(publicInfo?.metric_retention_days);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  }

  async getLoadMetricRetentionDays(
    publicInfo?: PublicInfo | null
  ): Promise<number> {
    return this.getMetricRetentionDays(
      LOAD_HISTORY_METRIC_KEYS,
      publicInfo,
      "max"
    );
  }

  async getPingMetricRetentionDays(
    publicInfo?: PublicInfo | null
  ): Promise<number> {
    return this.getMetricRetentionDays(
      PING_HISTORY_METRIC_KEYS,
      publicInfo,
      "min"
    );
  }

  private async getLoadHistoryFromMetrics(
    uuid: string,
    hours: number
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
    const metricKeys = Object.keys(metricToRecordKey);
    const data = await this.queryMetrics({
      metric_keys: metricKeys,
      entity_id: uuid,
      hours,
      downsample: true,
      max_points: 700,
      aggregation: "avg",
      fill_empty: true,
    });
    const seriesList = Array.isArray(data?.series) ? data.series : [];
    if (seriesList.length === 0) return null;

    const rows = new Map<string, Partial<HistoryRecord>>();
    for (const series of seriesList) {
      const metricKey = series.metric_key || series.name;
      const recordKey = metricToRecordKey[metricKey];
      if (!recordKey) continue;
      for (const point of series.points || []) {
        const timestamp = new Date(point.time).toISOString();
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
      .map((row) => ({ client: uuid, ...row } as HistoryRecord));

    return records.length > 0 ? { count: records.length, records } : null;
  }

  private async getPingHistoryFromMetrics(
    uuid: string,
    hours: number
  ): Promise<PingHistoryResponse | null> {
    const [metricData, taskList, statsData] = await Promise.all([
      this.queryMetrics({
        metric_keys: ["ping.latency_ms"],
        entity_id: uuid,
        hours,
        downsample: true,
        max_points: 700,
        aggregation: "avg",
        fill_empty: true,
      }),
      this.getPingTasks(),
      this.rpcCall<any>(
        "public:getPingMetricStats",
        { entity_id: uuid, hours, max_points: 700 },
        { silent: true }
      ).then((response) =>
        response.status === "success" ? response.data : null
      ),
    ]);

    const seriesList = Array.isArray(metricData?.series)
      ? metricData.series
      : [];
    if (seriesList.length === 0) return null;

    const records: PingHistoryRecord[] = [];
    const taskIds = new Set<number>();
    for (const series of seriesList) {
      for (const point of series.points || []) {
        const tags = this.metricTags(point) || this.metricTags(series);
        const taskId = Number(tags?.task_id);
        if (!Number.isFinite(taskId)) continue;
        taskIds.add(taskId);
        const value = this.metricValue(point.value);
        records.push({
          task_id: taskId,
          time: new Date(point.time).toISOString(),
          value: value === null ? -1 : value,
          client: uuid,
        } as PingHistoryRecord);
      }
    }

    const taskMap = new Map<number, PingTask>();
    for (const task of taskList) {
      const id = Number(task.id);
      if (!Number.isFinite(id) || !taskIds.has(id)) continue;
      taskMap.set(id, {
        id,
        name: task.name || `Task ${id}`,
        interval: Number(task.interval) || 60,
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
        loss: Number(stat.loss) || 0,
      });
    }

    for (const id of taskIds) {
      if (!taskMap.has(id)) {
        taskMap.set(id, {
          id,
          name: `Task ${id}`,
          interval: 60,
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
    hours: number = 24
  ): Promise<{ count: number; records: HistoryRecord[] } | null> {
    if (this.useRpc) {
      const metricHistory = await this.getLoadHistoryFromMetrics(uuid, hours);
      if (metricHistory) return metricHistory;

      const response = await this.rpcFallback<any>([
        {
          method: "public:getRecordsByUUID",
          params: { uuid, hours, load_type: "all" },
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
      ]);
      if (response.status === "success" && response.data) {
        return this.normalizeLoadHistory(response.data, uuid);
      }
    }
    const response = await this.get<{
      count: number;
      records: HistoryRecord[];
    }>(`/api/records/load?uuid=${uuid}&hours=${hours}`);
    return response.status === "success" ? response.data : null;
  }

  // 获取 Ping 历史记录
  async getPingHistory(
    uuid: string,
    hours: number = 24
  ): Promise<PingHistoryResponse | null> {
    if (this.useRpc) {
      const metricHistory = await this.getPingHistoryFromMetrics(uuid, hours);
      if (metricHistory) return metricHistory;

      const response = await this.rpcFallback<any>([
        {
          method: "public:getPingRecords",
          params: { uuid, hours },
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
      ]);
      if (response.status === "success" && response.data) {
        return this.normalizePingHistory(response.data);
      }
    }
    const response = await this.get<PingHistoryResponse>(
      `/api/records/ping?uuid=${uuid}&hours=${hours}`
    );
    return response.status === "success" ? response.data : null;
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
      const response = await this.rpcCall<{ version: string; hash: string }>(
        "common:getVersion"
      );
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
