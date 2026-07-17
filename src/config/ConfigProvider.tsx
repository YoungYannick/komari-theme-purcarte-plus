import { type ReactNode, useEffect, useState, useMemo, useCallback } from "react";
import type { PublicInfo } from "@/types/node.d";
import { ConfigContext } from "./ConfigContext";
import { DEFAULT_CONFIG, type ConfigOptions, type SiteStatus } from "./default";
import { apiService, getWsService } from "@/services/api";
import Loading from "@/components/loading";
import { defaultTexts, otherTexts } from "./locales";
import { mergeTexts, deepMerge } from "@/utils/localeUtils";
import i18next from "i18next";

// 配置提供者属性类型
interface ConfigProviderProps {
  children: ReactNode;
}

type LegacyThemeSettings = Partial<ConfigOptions> & {
  backagroundAlignment?: unknown;
  enableVideoBackground?: unknown;
};

/**
 * 配置提供者组件，用于将配置传递给子组件
 */
export function ConfigProvider({ children }: ConfigProviderProps) {
  const [publicSettings, setPublicSettings] = useState<PublicInfo | null>(null);
  const [config, setConfig] = useState<ConfigOptions | null>(null);
  const [siteStatus, setSiteStatus] = useState<SiteStatus>("public");
  const [previewConfig, setPreviewConfig] =
    useState<Partial<ConfigOptions> | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  const loadConfig = async () => {
    try {
      const { status, publicInfo } = await apiService.checkSiteStatus();
      setSiteStatus(status);
      let publicInfoForState = publicInfo;

      let mergedConfig: ConfigOptions;
      if (publicInfo) {
        const rawSettings =
          (publicInfo.theme_settings as LegacyThemeSettings) || {};
        // 从后端配置中过滤掉 undefined/null 值，以防止
        // 覆盖 DEFAULT_CONFIG 的默认值（修复 React 错误 #130）
        // 对于 string 类型的配置项，允许空字符串通过（用户可能故意清空）
        const themeSettings = Object.fromEntries(
          Object.entries(rawSettings).filter(
            ([k, v]) => v !== undefined && v !== null && (v !== "" || typeof DEFAULT_CONFIG[k as keyof ConfigOptions] === "string")
          )
        ) as Partial<ConfigOptions>;
        if (
          !themeSettings.backgroundAlignment &&
          typeof rawSettings.backagroundAlignment === "string" &&
          rawSettings.backagroundAlignment.trim()
        ) {
          themeSettings.backgroundAlignment = rawSettings.backagroundAlignment;
        }
        mergedConfig = {
          ...DEFAULT_CONFIG,
          ...themeSettings,
          titleText:
            themeSettings.titleText ||
            publicInfo.sitename ||
            DEFAULT_CONFIG.titleText,
        };
        // 向后兼容：旧版 enableVideoBackground: true → backgroundMode: "video"
        if (
          !themeSettings.backgroundMode &&
          rawSettings.enableVideoBackground === true
        ) {
          mergedConfig.backgroundMode = "video";
        }
      } else {
        mergedConfig = DEFAULT_CONFIG;
      }
      setConfig(mergedConfig);

      // Initialize RPC
      if (mergedConfig.enableJsonRPC2Api) {
        const versionInfo = await apiService.getVersion();
        if (versionInfo && versionInfo.version) {
          const match = versionInfo.version.match(/(\d+)\.(\d+)\.(\d+)/);
          if (match) {
            const [, major, minor, patch] = match.map(Number);
            if (
              major > 1 ||
              (major === 1 && minor > 0) ||
              (major === 1 && minor === 0 && patch >= 7)
            ) {
              apiService.useRpc = true;
              getWsService().useRpc = true;
              console.log("RPC has been enabled for API and WebSocket.");
            }
          }
        }
      }

      if (publicInfoForState && apiService.useRpc) {
        const [loadMetricRetentionDays, pingMetricRetentionDays] =
          await Promise.all([
            apiService.getLoadMetricRetentionDays(publicInfoForState),
            apiService.getPingMetricRetentionDays(publicInfoForState),
          ]);
        if (
          loadMetricRetentionDays !== null ||
          pingMetricRetentionDays !== null
        ) {
          publicInfoForState = {
            ...publicInfoForState,
            ...(loadMetricRetentionDays !== null
              ? { load_metric_retention_days: loadMetricRetentionDays }
              : {}),
            ...(pingMetricRetentionDays !== null
              ? { ping_metric_retention_days: pingMetricRetentionDays }
              : {}),
          };
        }
      }

      setPublicSettings(publicInfoForState);
    } catch (error) {
      console.error("Failed to initialize site:", error);
      setConfig(DEFAULT_CONFIG);
      setSiteStatus("private-unauthenticated");
    } finally {
      setLoading(false);
      setTimeout(() => setIsLoaded(true), 300);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const activeCustomTexts = previewConfig?.customTexts ?? config?.customTexts;
  const texts = useMemo(() => {
    const baseTexts = activeCustomTexts
      ? mergeTexts(defaultTexts, activeCustomTexts)
      : defaultTexts;
    return deepMerge(baseTexts, otherTexts);
  }, [activeCustomTexts]);

  const updatePreviewConfig = useCallback((newConfig: Partial<ConfigOptions>) => {
    setPreviewConfig(newConfig);
  }, []);

  const reloadConfig = useCallback(async () => {
    setLoading(true);
    await loadConfig();
  }, []);

  const activeConfig = useMemo(
    () =>
      previewConfig
        ? { ...(config || DEFAULT_CONFIG), ...previewConfig }
        : config || DEFAULT_CONFIG,
    [config, previewConfig]
  );

  if (!isLoaded || !config) {
    return (
      <Loading
        text={i18next.t("homePage.loadingConfig")}
        className={!loading ? "fade-out" : ""}
      />
    );
  }

  return (
    <ConfigContext.Provider
      value={{
        ...activeConfig,
        titleText: config?.titleText || DEFAULT_CONFIG.titleText,
        publicSettings,
        siteStatus,
        texts,
        previewConfig,
        updatePreviewConfig,
        reloadConfig,
      }}>
      {children}
    </ConfigContext.Provider>
  );
}
