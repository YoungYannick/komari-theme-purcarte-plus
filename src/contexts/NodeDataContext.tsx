import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { apiService } from "../services/api";
import type { NodeData } from "../types/node";

// The core logic from the original useNodeData.ts, now kept internal to this file.
function useNodesInternal() {
  const [staticNodes, setStaticNodes] = useState<NodeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNodes = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nodeData = await apiService.getNodes();
      const sortedNodes = nodeData.sort((a, b) => a.weight - b.weight);
      setStaticNodes(sortedNodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取节点数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshNodes = useCallback(async () => {
    await fetchNodes();
  }, [fetchNodes]);

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  const getNodeDetails = useCallback(async (uuid: string) => {
    try {
      const recentStats = await apiService.getNodeRecentStats(uuid);
      return { recentStats };
    } catch (err) {
      console.error("Failed to fetch node recent stats:", err);
      return null;
    }
  }, []);

  const getLoadHistory = useCallback(
    async (uuid: string, hours: number = 24) => {
      try {
        const loadHistory = await apiService.getLoadHistory(uuid, hours);
        return loadHistory;
      } catch (err) {
        console.error("Failed to fetch load history:", err);
        return null;
      }
    },
    []
  );

  const getPingHistory = useCallback(
    async (uuid: string, hours: number = 24) => {
      try {
        const pingHistory = await apiService.getPingHistory(uuid, hours);
        return pingHistory;
      } catch (err) {
        console.error("Failed to fetch ping history:", err);
        return null;
      }
    },
    []
  );

  const getRecentLoadHistory = useCallback(async (uuid: string) => {
    try {
      const recentStats = await apiService.getNodeRecentStats(uuid);
      if (!recentStats) return null;

      return { count: recentStats.length, records: recentStats };
    } catch (err) {
      console.error("Failed to fetch recent load history:", err);
      return null;
    }
  }, []);

  const getNodesByGroup = useCallback(
    (group: string) => {
      return staticNodes.filter((node) => node.group === group);
    },
    [staticNodes]
  );

  const getGroups = useCallback(() => {
    const groupsSet = new Set<string>();
    staticNodes.forEach((node) => {
      if (node.group) {
        node.group.split(";").forEach((g) => {
          const trimmedGroup = g.trim();
          if (trimmedGroup) {
            groupsSet.add(trimmedGroup);
          }
        });
      }
    });
    return Array.from(groupsSet);
  }, [staticNodes]);

  return {
    nodes: staticNodes,
    loading,
    error,
    refreshNodes,
    getNodeDetails,
    getLoadHistory,
    getPingHistory,
    getRecentLoadHistory,
    getNodesByGroup,
    getGroups,
  };
}

export type NodeDataContextType = ReturnType<typeof useNodesInternal>;

const NodeDataContext = createContext<NodeDataContextType | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useNodeData = () => {
  const context = useContext(NodeDataContext);
  if (!context) {
    throw new Error("useNodeData must be used within a NodeDataProvider");
  }
  return context;
};

interface NodeDataProviderProps {
  children: ReactNode;
}

export const NodeDataProvider = ({ children }: NodeDataProviderProps) => {
  const nodeData = useNodesInternal();
  return (
    <NodeDataContext.Provider value={nodeData}>
      {children}
    </NodeDataContext.Provider>
  );
};
