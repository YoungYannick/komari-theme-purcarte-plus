import { memo, useEffect, useState } from "react";
import { cn } from "@/utils";
import { useLocale } from "@/config/hooks";
import { CircleHelp } from "lucide-react";

const StatHelpIcon = ({
  helpText,
}: {
  helpText: string;
}) => {
  const { t } = useLocale();

  return (
    <button
      type="button"
      className="help-icon show-help stats-help-icon shrink-0 border-0 bg-transparent p-0"
      data-tooltip={helpText}
      aria-label={t("statsBar.specialCases")}
      onClick={(event) => {
        event.stopPropagation();
        event.currentTarget.classList.toggle("active");
      }}>
      <CircleHelp className="size-3" />
    </button>
  );
};

export const StatChip = memo(
  ({
    label,
    lines,
    isLabelVertical,
    isInHeader,
    isMobile,
    textLeft,
    helpText,
  }: {
    label: string;
    lines: string[];
    isLabelVertical?: boolean;
    isInHeader?: boolean;
    isMobile: boolean;
    textLeft?: boolean;
    helpText?: string;
  }) => {
    if (isMobile || isInHeader) {
      return (
        <div
          className={cn(
            "flex min-w-0 bg-transition px-1.5 py-0.5 text-center items-center",
            isMobile ? "w-full" : "shrink-0",
            isLabelVertical ? "" : "flex-col"
          )}>
          <div
            className={cn(
              "flex items-center justify-center gap-1 text-xs font-semibold",
              isLabelVertical && "self-stretch"
            )}>
            <span
              className={cn(isMobile ? "" : "tracking-widest")}
              style={
                !isMobile && isLabelVertical
                  ? { writingMode: "vertical-rl" }
                  : {}
              }>
              {label}
            </span>
            {helpText && <StatHelpIcon helpText={helpText} />}
          </div>
          <div
            className={`max-w-full text-xs font-semibold leading-tight whitespace-nowrap ${
              textLeft ? "text-left" : ""
            }`}>
            {lines.map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="w-full py-1">
        <div className="flex flex-col gap-2 items-center">
          <div className="flex items-center justify-center gap-1">
            <label>{label}</label>
            {helpText && <StatHelpIcon helpText={helpText} />}
          </div>
          <div className={`font-medium -mt-2 whitespace-nowrap ${textLeft ? "text-left" : ""}`}>
            {lines.map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

export const CurrentTimeChip = memo(
  ({ isInHeader, isMobile }: { isInHeader?: boolean; isMobile: boolean }) => {
    const [time, setTime] = useState(() => new Date());
    const { t } = useLocale();

    useEffect(() => {
      const timer = setInterval(() => setTime(new Date()), 1000);
      return () => clearInterval(timer);
    }, []);

    return (
      <StatChip
        key="currentTime"
        label={t("statsBar.currentTime")}
        lines={[time.toLocaleTimeString()]}
        isInHeader={isInHeader}
        isMobile={isMobile}
      />
    );
  }
);
