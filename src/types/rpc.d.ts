export interface RpcClient {
  uuid: string;
  name: string;
  cpu_name: string;
  virtualization: string;
  arch: string;
  cpu_cores: number;
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

export interface RpcNodeStatus {
  client: string;
  time: string;
  cpu: number;
  gpu: number;
  ram: number;
  ram_total: number;
  swap: number;
  swap_total: number;
  load: number;
  load5: number;
  load15: number;
  temp: number;
  disk: number;
  disk_total: number;
  net_in: number;
  net_out: number;
  net_total_up: number;
  net_total_down: number;
  process: number;
  connections: number;
  connections_udp: number;
  online: boolean;
  uptime: number;
}

export type RpcNodeStatusMap = Record<string, RpcNodeStatus>;

export interface RpcPublicInfo {
  sitename: string;
  description: string;
  theme: string;
  theme_settings: object | null;
  metric_retention_days?: number;
  load_metric_retention_days?: number;
  ping_metric_retention_days?: number;
  record_enabled: boolean;
  record_preserve_time: number;
  ping_record_preserve_time: number;
  private_site: boolean;
  disable_password_login: boolean;
  oauth_enable: boolean;
  oauth_provider: string | null;
  custom_head: string;
  custom_body: string;
  allow_cors: boolean;
}

export interface RpcVersionInfo {
  version: string;
  build_time: string;
  commit_hash: string;
  go_version: string;
  platform: string;
  arch: string;
}

export interface RpcStatusRecord {
  client: string;
  time: string;
  cpu: number;
  gpu: number;
  ram: number;
  ram_total: number;
  swap: number;
  swap_total: number;
  load1: number;
  load5: number;
  load15: number;
  temp: number;
  disk: number;
  disk_total: number;
  net_in: number;
  net_out: number;
  net_total_up: number;
  net_total_down: number;
  process: number;
  connections: number;
  connections_udp: number;
}

export interface RpcPingRecord {
  task_id: number;
  time: string;
  value: number;
}

export interface RpcPingTask {
  id: number;
  name: string;
  interval: number;
  loss: number;
}

export interface RpcRecordsResponse {
  count: number;
  records: RpcStatusRecord[] | RpcPingRecord[];
  tasks?: RpcPingTask[];
}

export interface RpcMe {
  logged_in: boolean;
  username: string;
  "2fa_enabled": boolean;
  sso_id: string;
  sso_type: string;
  uuid: string;
}

export interface RpcError {
  code: number;
  message: string;
  data?: any;
}

export interface RpcResponse<T> {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: T;
  error?: RpcError;
}
