export interface NodeData {
  uuid: string;
  name: string;
  cpu_name: string;
  virtualization: string;
  arch: string;
  cpu_cores: number;
  cpu_physical_cores?: number;
  os: string;
  kernel_version: string;
  gpu_name: string;
  region: string;
  mem_total: number;
  swap_total: number;
  disk_total: number;
  weight: number;
  price: number;
  billing_cycle: number;
  currency: string;
  expired_at: string | null;
  auto_renewal: boolean;
  group: string;
  tags: string;
  public_remark: string;
  hidden: boolean;
  traffic_limit?: number;
  traffic_limit_type?: "sum" | "max" | "min" | "up" | "down";
  created_at: string;
  updated_at: string;
}

export interface NodeStats {
  cpu: { usage: number };
  ram: { total: number; used: number };
  swap: { total: number; used: number };
  disk: { total: number; used: number };
  network: { up: number; down: number; totalUp: number; totalDown: number };
  load: { load1: number; load5: number; load15: number };
  gpu?: {
    count: number;
    average_usage: number;
    detailed_info?: Array<{
      name: string;
      memory_total: number;
      memory_used: number;
      utilization: number;
      temperature: number;
    }>;
  };
  uptime: number;
  process: number;
  connections: { tcp: number; udp: number };
  message: string;
  updated_at: string;
}

export interface NodeWithStatus extends NodeData {
  status: "online" | "offline";
  stats?: NodeStats;
}

export interface ApiResponse<T> {
  status: "success" | "error";
  message: string;
  data: T;
}

export interface PublicInfo {
  cors_origin_check_enabled?: boolean;
  allow_cors?: boolean;
  custom_body: string;
  custom_head: string;
  description: string;
  disable_password_login: boolean;
  oauth_enable: boolean;
  oauth_provider: string | null;
  visitor_audit_enabled?: boolean;
  metric_retention_days?: number;
  load_metric_retention_days?: number;
  ping_metric_retention_days?: number;
  ping_record_preserve_time: number;
  private_site: boolean;
  record_enabled: boolean;
  record_preserve_time: number;
  sitename: string;
  theme: string;
  theme_settings: object | null;
}

export interface HistoryRecord {
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

export interface HistoryRangeMetadata {
  from?: string;
  to?: string;
}

export interface LoadHistoryResponse extends HistoryRangeMetadata {
  count: number;
  records: HistoryRecord[];
}

export interface PingHistoryRecord {
  task_id: number;
  time: string;
  value: number | null;
  loss_ratio?: number | null;
  loss_sample_count?: number;
}

export interface PingTask {
  id: number;
  interval: number;
  data_interval?: number;
  name: string;
  loss?: number;
}

export interface PingTaskFull {
  id: number;
  weight: number;
  name: string;
  clients: string[];
  type: string;
  target: string;
  interval: number;
}

export interface PingHistoryResponse extends HistoryRangeMetadata {
  count: number;
  records: PingHistoryRecord[];
  tasks: PingTask[];
}

export interface Me {
  logged_in: boolean;
  username: string;
  "2fa_enabled"?: boolean;
  sso_id?: string;
  sso_type?: string;
  uuid?: string;
}
