import type { NodeStats } from "../types/node";
import type { RpcNodeStatus } from "../types/rpc";

export function convertNodeStatsToRpcNodeStatus(
  stats: NodeStats,
  clientUuid: string,
  isOnline: boolean
): RpcNodeStatus {
  return {
    client: clientUuid,
    time: stats.updated_at,
    cpu: stats.cpu.usage,
    gpu: stats.gpu?.average_usage ?? 0,
    gpu_detail: stats.gpu?.detailed_info,
    ram: stats.ram.used,
    ram_total: stats.ram.total,
    swap: stats.swap.used,
    swap_total: stats.swap.total,
    load: stats.load.load1,
    load5: stats.load.load5,
    load15: stats.load.load15,
    temp: 0, // Old API does not provide temperature
    disk: stats.disk.used,
    disk_total: stats.disk.total,
    net_in: stats.network.down,
    net_out: stats.network.up,
    net_total_up: stats.network.totalUp,
    net_total_down: stats.network.totalDown,
    process: stats.process,
    connections: stats.connections.tcp,
    connections_udp: stats.connections.udp,
    online: isOnline,
    uptime: stats.uptime,
  };
}
