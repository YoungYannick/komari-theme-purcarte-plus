import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type WheelEvent,
} from "react";

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: any;
  chartConfig?: any;
  labelFormatter?: (label: any) => string;
  scrollable?: boolean;
}

export const CustomTooltip = ({
  active,
  payload,
  label,
  chartConfig,
  labelFormatter,
  scrollable = false,
}: CustomTooltipProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const defaultLabelFormatter = useCallback((value: any) => {
    const date = new Date(value);
    return date.toLocaleString([], {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, []);
  const registerScrollContainer = useCallback(
    (node: HTMLDivElement | null) => {
      if (!scrollable || typeof window === "undefined") return;
      const key = "__purcarteActiveTooltipScrollEl";
      const previous = scrollRef.current;
      if (node) {
        scrollRef.current = node;
        (window as any)[key] = node;
        return;
      }
      if ((window as any)[key] === previous) {
        delete (window as any)[key];
      }
      scrollRef.current = null;
    },
    [scrollable]
  );

  useLayoutEffect(() => {
    if (!scrollable) {
      setHasOverflow(false);
      return;
    }
    const el = scrollRef.current;
    setHasOverflow(!!el && el.scrollHeight > el.clientHeight);
  }, [payload?.length, scrollable]);

  if (active && payload && payload.length) {
    return (
      <div className="purcarte-blur p-3 theme-card-style max-w-xs">
        <p className="text-xs font-medium text-secondary-foreground mb-2">
          {labelFormatter
            ? labelFormatter(label)
            : defaultLabelFormatter(label)}
        </p>
        <div
          ref={scrollable ? registerScrollContainer : undefined}
          {...(scrollable
            ? {
                id: "tooltip-scroll-container",
                "data-tooltip-scroll-container": "true",
              }
            : {})}
          className={`space-y-1 ${hasOverflow ? "pr-1" : ""}`}
          style={
            scrollable
              ? {
                  maxHeight: "min(260px, calc(100vh - 180px))",
                  overflowY: "auto",
                  overscrollBehavior: "contain",
                  scrollbarGutter: hasOverflow ? "stable" : "auto",
                }
              : undefined
          }>
          {payload.map((item: any, index: number) => {
            const series = chartConfig?.series
              ? chartConfig.series.find((s: any) => s.dataKey === item.dataKey)
              : {
                  dataKey: chartConfig?.dataKey || item.dataKey,
                  tooltipLabel: chartConfig?.tooltipLabel || item.name,
                  tooltipFormatter: chartConfig?.tooltipFormatter,
                };

            let value = item.value;
            if (series?.tooltipFormatter) {
              value = series.tooltipFormatter(value, item.payload);
            } else if (typeof value === "number") {
              value = `${value.toFixed(0)}`;
            } else {
              value = value?.toString() || "-";
            }

            return (
              <div
                key={`${item.dataKey}-${index}`}
                className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm font-medium text-foreground">
                    {series?.tooltipLabel || item.name || item.dataKey}:
                  </span>
                </div>
                <span className="text-sm font-bold ml-2">{value}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
};

export const ScrollableTooltip = (props: any) => {
  const { active, payload, ...rest } = props;
  const handleWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    const scrollEl = e.currentTarget.querySelector<HTMLElement>(
      "[data-tooltip-scroll-container='true']"
    );
    if (!scrollEl || scrollEl.scrollHeight <= scrollEl.clientHeight) return;
    e.preventDefault();
    e.stopPropagation();
    scrollEl.scrollTop += e.deltaY;
    window.dispatchEvent(new CustomEvent("purcarte-tooltip-scroll"));
  }, []);

  if (!active || !payload || !payload.length) return null;
  const filtered = payload.filter(
    (item: any) => item.value !== null && item.value !== undefined
  );
  if (!filtered.length) return null;

  return (
    <div
      data-tooltip-shell="true"
      style={{
        pointerEvents: "auto",
      }}
      onWheel={handleWheel}>
      <CustomTooltip {...rest} active={true} payload={filtered} scrollable />
    </div>
  );
};
