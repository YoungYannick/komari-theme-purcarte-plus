import { useState, useEffect, useRef } from "react";
import { useNodeData } from "@/contexts/NodeDataContext";
import type { PingHistoryResponse, NodeData } from "@/types/node";
import type { HistoryQueryRange } from "@/services/api";
import {
  resolveHistoryBounds,
  type HistoryBounds,
} from "@/utils/RecordHelper";

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
  const [historyBounds, setHistoryBounds] = useState<HistoryBounds | null>(null);
  const [isDataEmpty, setIsDataEmpty] = useState(true);
  const rangeStart = range?.start;
  const rangeEnd = range?.end;

  useEffect(() => {
    if (!node?.uuid) {
      setPingHistory(null);
      setHistoryBounds(null);
      setIsDataEmpty(true);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setPingHistory(null);
    const requestedRange =
      rangeStart && rangeEnd ? { start: rangeStart, end: rangeEnd } : null;
    const requestTime = Date.now();
    setHistoryBounds(
      resolveHistoryBounds(hours, requestedRange, null, requestTime)
    );

    const fetchHistory = async () => {
      try {
        const data = await getPingHistory(node.uuid, hours, requestedRange);
        if (requestId !== requestIdRef.current) return;
        setPingHistory(data);
        setHistoryBounds(
          resolveHistoryBounds(hours, requestedRange, data, requestTime)
        );
        setIsDataEmpty(
          !data?.records.some(
            (record) =>
              typeof record.value === "number" &&
              Number.isFinite(record.value) &&
              record.value >= 0
          )
        );
      } catch (err: any) {
        if (requestId !== requestIdRef.current) return;
        setError(err.message || "Failed to fetch history data");
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    };

    fetchHistory();
  }, [node?.uuid, hours, rangeStart, rangeEnd, getPingHistory]);

  return {
    loading,
    error,
    pingHistory,
    historyBounds,
    isDataEmpty,
  };
};
