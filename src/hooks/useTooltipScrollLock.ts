import { useState, useEffect, useCallback, useRef } from "react";

const TOOLTIP_SCROLL_ID = "tooltip-scroll-container";

export function useTooltipScrollLock() {
  const chartContentRef = useRef<HTMLDivElement>(null);
  const tooltipCoordRef = useRef<{ x: number; y: number } | null>(null);
  const [tooltipLocked, setTooltipLocked] = useState(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChartMouseMove = useCallback(
    (state: any) => {
      if (!tooltipLocked && state?.activeCoordinate) {
        tooltipCoordRef.current = state.activeCoordinate;
      }
    },
    [tooltipLocked]
  );

  useEffect(() => {
    const el = chartContentRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      const tooltipEl = document.getElementById(TOOLTIP_SCROLL_ID);
      if (tooltipEl && tooltipEl.scrollHeight > tooltipEl.clientHeight) {
        if (e.cancelable) {
          e.preventDefault();
          e.stopPropagation();
        }
        tooltipEl.scrollTop += e.deltaY;
        setTooltipLocked(true);
        if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
        lockTimerRef.current = setTimeout(() => setTooltipLocked(false), 800);
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => {
      el.removeEventListener("wheel", handler);
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    };
  }, []);

  const tooltipProps =
    tooltipLocked && tooltipCoordRef.current
      ? { position: tooltipCoordRef.current }
      : {};

  return { chartContentRef, handleChartMouseMove, tooltipProps };
}
