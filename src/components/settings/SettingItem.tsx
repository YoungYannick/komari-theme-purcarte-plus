import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ConfigOptions } from "@/config/default";
import { resolveI18n } from "./i18nHelper";

interface SettingItemProps {
  item: any;
  editingConfig: Partial<ConfigOptions>;
  onConfigChange: (key: keyof ConfigOptions, value: any) => void;
}

const SettingItem = ({
  item,
  editingConfig,
  onConfigChange,
}: SettingItemProps) => {
  const defaultValue = item.default;
  const currentValue =
    editingConfig[item.key as keyof ConfigOptions] ?? defaultValue;
  const isModified = currentValue !== defaultValue;
  const [localValue, setLocalValue] = useState(currentValue);

  useEffect(() => {
    setLocalValue(currentValue);
  }, [currentValue]);

  const handleBlur = () => {
    if (item.type === "number") {
      onConfigChange(item.key, Number(localValue));
    } else {
      onConfigChange(item.key, localValue);
    }
  };

  const renderInput = () => {
    switch (item.type) {
      case "number":
        return (
          <Input
            type="number"
            className="theme-card-style"
            value={localValue as number}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleBlur}
          />
        );
      case "string":
        return (
          <Input
            type="text"
            className="theme-card-style"
            value={localValue as string}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleBlur}
          />
        );
      case "switch":
        return (
          <Switch
            checked={localValue as boolean}
            onCheckedChange={(checked) => {
              setLocalValue(checked);
              onConfigChange(item.key, checked);
            }}
          />
        );
      case "select":
        return (
          <Select
            value={localValue as string}
            onValueChange={(value) => {
              setLocalValue(value);
              onConfigChange(item.key, value);
            }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {item.options.split(",").map((option: string) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      default:
        return null;
    }
  };

  if (item.type === "title") {
    return <h3 className="text-lg font-semibold mt-4 mb-2">{resolveI18n(item.name)}</h3>;
  }

  if (item.type === "switch" || item.type === "select") {
    return (
      <div className="mb-4 flex items-center justify-between">
        <div>
          <span className="text-base font-bold">
            {resolveI18n(item.name)}
            {isModified && <span className="text-yellow-500 ml-2">*</span>}
          </span>
          {item.help && (
            <p className="text-sm text-gray-500 mt-1">{resolveI18n(item.help)}</p>
          )}
        </div>
        <div className="mt-2">{renderInput()}</div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between">
        <span className="text-base font-bold">
          {resolveI18n(item.name)}
          {isModified && <span className="text-yellow-500 ml-2">*</span>}
        </span>
      </div>
      {item.help && <p className="text-sm text-gray-500 mt-1">{resolveI18n(item.help)}</p>}
      <div className="mt-2">{renderInput()}</div>
    </div>
  );
};

export default SettingItem;
