import { useEffect, useCallback, useRef } from "react";

const TOOLTIP_SCROLL_SELECTOR = "[data-tooltip-scroll-container='true']";
const ACTIVE_TOOLTIP_SCROLL_KEY = "__purcarteActiveTooltipScrollEl";

export function useTooltipScrollLock() {
  const chartContentRef = useRef<HTMLDivElement>(null);

  const handleChartMouseMove = useCallback(() => {}, []);

  useEffect(() => {
    const scrollTooltip = (deltaY: number) => {
      const tooltipEl =
        ((window as any)[ACTIVE_TOOLTIP_SCROLL_KEY] as HTMLElement | undefined) ||
        document.querySelector<HTMLElement>(TOOLTIP_SCROLL_SELECTOR);
      if (!tooltipEl || tooltipEl.scrollHeight <= tooltipEl.clientHeight) {
        return false;
      }
      tooltipEl.scrollTop += deltaY;
      return true;
    };

    const handler = (e: WheelEvent) => {
      if (e.defaultPrevented) return;
      if (scrollTooltip(e.deltaY)) {
        if (e.cancelable) {
          e.preventDefault();
        }
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    window.addEventListener("wheel", handler, { passive: false, capture: true });
    return () => {
      window.removeEventListener("wheel", handler, { capture: true });
    };
  }, []);

  return { chartContentRef, handleChartMouseMove, tooltipProps: {} };
}
