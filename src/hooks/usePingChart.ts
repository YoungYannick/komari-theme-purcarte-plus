import { useState, useEffect, useRef } from "react";
import { useNodeData } from "@/contexts/NodeDataContext";
import type { PingHistoryResponse, NodeData } from "@/types/node";
import type { HistoryQueryRange } from "@/services/api";

export const usePingChart = (
  node: NodeData | null,
  hours: number,
  range?: HistoryQueryRange | null
) => {
  const { getPingHistory } = useNodeData();
  const requestIdRef = useRef(0);
  const [pingHistory, setPingHistory] = useState<PingHistoryResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!node?.uuid) {
      setPingHistory(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setPingHistory(null);

    const fetchHistory = async () => {
      try {
        const data = await getPingHistory(node.uuid, hours, range);
        if (requestId !== requestIdRef.current) return;
        setPingHistory(data);
      } catch (err: any) {
        if (requestId !== requestIdRef.current) return;
        setError(err.message || "Failed to fetch history data");
      } finally {
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
      }
    };

    fetchHistory();
  }, [node?.uuid, hours, range?.start, range?.end, getPingHistory]);

  return {
    loading,
    error,
    pingHistory,
  };
};
