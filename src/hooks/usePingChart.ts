import { useState, useEffect, useRef } from "react";
import { useNodeData } from "@/contexts/NodeDataContext";
import type { PingHistoryResponse, NodeData } from "@/types/node";

export const usePingChart = (node: NodeData | null, hours: number) => {
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
        const data = await getPingHistory(node.uuid, hours);
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
  }, [node?.uuid, hours, getPingHistory]);

  return {
    loading,
    error,
    pingHistory,
  };
};
