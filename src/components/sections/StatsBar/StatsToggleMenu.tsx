import { memo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { DisplayOptions, StatsBarProps } from "./types";
import { useLocale } from "@/config/hooks";
import { useAppConfig } from "@/config";

export const StatsToggleMenu = memo(
  ({
    displayOptions,
    setDisplayOptions,
  }: Pick<StatsBarProps, "displayOptions" | "setDisplayOptions">) => {
    const { t } = useLocale();
    const { enableFinanceWidget } = useAppConfig();
    const optionKeys = (Object.keys(displayOptions) as Array<keyof DisplayOptions>).filter(
      (key) =>
        enableFinanceWidget || (key !== "assetValue" && key !== "monthlyExpense")
    );

    return (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 rounded-full cursor-pointer">
            <Settings2 className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>
            {t("statsBar.displayOptionsTitle")}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {optionKeys.map((key) => (
              <DropdownMenuItem
                key={key}
                className="flex items-center justify-between cursor-pointer">
                <span>
                  {
                    {
                      currentTime: t("statsBar.currentTime"),
                      currentOnline: t("statsBar.currentOnline"),
                      regionOverview: t("statsBar.region"),
                      trafficOverview: t("statsBar.traffic"),
                      networkSpeed: t("statsBar.networkSpeed"),
                      assetValue: t("statsBar.assetValueOption"),
                      monthlyExpense: t("enhanced.finance.monthlyExpense"),
                    }[key]
                  }
                </span>
                <Switch
                  checked={displayOptions[key]}
                  onCheckedChange={(checked) =>
                    setDisplayOptions({ [key]: checked })
                  }
                />
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);
