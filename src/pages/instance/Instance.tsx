import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { NodeData } from "@/types/node";
import { memo, useMemo, type ReactNode } from "react";
import { formatBytes, formatUptime, formatLastSeen, formatTrafficLimit } from "@/utils";
import { CircleProgress } from "@/components/ui/progress-circle";
import { useNodeCommons } from "@/hooks/useNodeCommons";
import { useLiveData } from "@/contexts/LiveDataContext";
import { useLocale } from "@/config/hooks";

interface InfoItemProps {
  label: string;
  value: ReactNode;
  className?: string;
}

const InfoItem = ({ label, value, className }: InfoItemProps) => (
  <div className={className}>
    <p className="text-secondary-foreground">{label}</p>
    {typeof value === "string" ? <p>{value}</p> : value}
  </div>
);

interface InstanceProps {
  node: NodeData;
}

const Instance = memo(({ node }: InstanceProps) => {
  const { liveData } = useLiveData();
  const nodeWithStats = useMemo(
    () => ({
      ...node,
      stats: liveData?.[node.uuid],
    }),
    [node, liveData]
  );

  const { stats, isOnline, trafficPercentage } = useNodeCommons(nodeWithStats);
  const { t } = useLocale();

  const swapValue = useMemo(() => {
    if (node.swap_total === 0) return t("node.off");
    if (stats && isOnline) {
      return `${formatBytes(stats.swap)} / ${formatBytes(node.swap_total)}`;
    }
    return `${t("node.notAvailable")} / ${formatBytes(node.swap_total)}`;
  }, [node.swap_total, stats, isOnline, t]);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle>{t("instancePage.title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 @md:grid-cols-3 @lg:grid-cols-4 gap-3">
        <InfoItem
          className="@md:col-span-2"
          label={t("instancePage.cpu")}
          value={`${node.cpu_name} (x${node.cpu_cores})`}
        />
        <InfoItem label={t("instancePage.architecture")} value={node.arch} />
        <InfoItem
          label={t("instancePage.virtualization")}
          value={node.virtualization}
        />
        <InfoItem
          label={t("instancePage.gpu")}
          value={node.gpu_name || t("node.notAvailable")}
        />
        <InfoItem label={t("instancePage.os")} value={node.os} />
        <InfoItem
          label={t("instancePage.mem")}
          value={
            stats && isOnline
              ? `${formatBytes(stats.ram)} / ${formatBytes(node.mem_total)}`
              : `${t("node.notAvailable")} / ${formatBytes(node.mem_total)}`
          }
        />
        <InfoItem label={t("instancePage.swap")} value={swapValue} />
        <InfoItem
          label={t("instancePage.disk")}
          value={
            stats && isOnline
              ? `${formatBytes(stats.disk)} / ${formatBytes(node.disk_total)}`
              : `${t("node.notAvailable")} / ${formatBytes(node.disk_total)}`
          }
        />
        <InfoItem
          label={t("instancePage.realtimeNetwork")}
          value={
            stats && isOnline
              ? `${t("node.uploadPrefix")} ${formatBytes(
                  stats.net_out,
                  true
                )} ${t("node.downloadPrefix")} ${formatBytes(
                  stats.net_in,
                  true
                )}`
              : t("node.notAvailable")
          }
        />
        <InfoItem
          label={t("instancePage.totalTraffic")}
          value={
            <div className="flex items-center gap-2">
              {node.traffic_limit !== 0 && isOnline && stats && (
                <CircleProgress
                  value={trafficPercentage}
                  maxValue={100}
                  size={32}
                  strokeWidth={4}
                  showPercentage={true}
                />
              )}
              <div>
                <p>
                  {stats && isOnline
                    ? `${t("node.uploadPrefix")} ${formatBytes(
                        stats.net_total_up
                      )} ${t("node.downloadPrefix")} ${formatBytes(
                        stats.net_total_down
                      )}`
                    : t("node.notAvailable")}
                </p>
                <p>
                  {formatTrafficLimit(
                    node.traffic_limit,
                    node.traffic_limit_type
                  )}
                </p>
              </div>
            </div>
          }
        />
        <InfoItem
          label={t("instancePage.load")}
          value={
            stats && isOnline
              ? `${stats.load.toFixed(2)} | ${stats.load5.toFixed(
                  2
                )} | ${stats.load15.toFixed(2)}`
              : t("node.notAvailable")
          }
        />
        <InfoItem
          label={isOnline ? t("instancePage.runtime") : t("node.lastSeen")}
          value={
            stats && isOnline
              ? formatUptime(stats.uptime)
              : stats?.time
                ? formatLastSeen(stats.time)
                : t("node.notAvailable")
          }
        />
        <InfoItem
          label={t("instancePage.lastUpdated")}
          value={
            stats?.time
              ? new Date(stats.time).toLocaleString()
              : t("node.notAvailable")
          }
        />
      </CardContent>
    </Card>
  );
});

export default Instance;
