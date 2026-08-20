import type { NodeData } from "@/types/node";

export type DisplayOptions = {
  currentTime: boolean;
  currentOnline: boolean;
  regionOverview: boolean;
  trafficOverview: boolean;
  networkSpeed: boolean;
  assetValue: boolean;
  monthlyExpense: boolean;
};

export type StatsSnapshot = {
  onlineCount: number;
  totalCount: number;
  uniqueRegions: number;
  totalTrafficUp: number;
  totalTrafficDown: number;
  currentSpeedUp: number;
  currentSpeedDown: number;
};

export type SortKey =
  | "trafficUp"
  | "trafficDown"
  | "speedUp"
  | "speedDown"
  | null;

export interface StatsBarProps {
  displayOptions: DisplayOptions;
  setDisplayOptions: (options: Partial<DisplayOptions>) => void;
  stats: StatsSnapshot;
  loading: boolean;
  /** 首页当前分组/搜索后的可见节点，用于资产统计按展示范围汇总。 */
  financeNodes?: NodeData[];
  enableGroupedBar?: boolean;
  groups?: string[];
  selectedGroup?: string;
  onSelectGroup?: (group: string) => void;
  isShowStatsInHeader?: boolean;
  onSort?: (key: SortKey, direction: "asc" | "desc") => void;
  sortKey?: SortKey;
  sortDirection?: "asc" | "desc";
}
