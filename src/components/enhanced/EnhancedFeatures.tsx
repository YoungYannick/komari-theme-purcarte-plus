import { useEffect } from "react";
import { useAppConfig } from "@/config";
import { WelcomeBubble } from "./WelcomeBubble";
import { FinanceWidget } from "./FinanceWidget";
import { EarthGlobe } from "./EarthGlobe";
import { ScrollHelpers } from "./ScrollHelpers";
import { Protection } from "./Protection";
import { AnnouncementModal } from "./AnnouncementModal";
import { fetchGeoInfo } from "./useUserGeo";
import "./enhanced.css";

export function EnhancedFeatures() {
  const {
    enableWelcomeBubble,
    enableFinanceWidget,
    enableEarthGlobe,
    enableScrollHelpers,
    enableProtection,
    enableAnnouncement,
  } = useAppConfig();

  // 当欢迎气泡关闭但地球组件开启时，预获取用户位置
  // 因为地球组件需要用户位置来居中地球视角和显示用户标记
  useEffect(() => {
    if (!enableWelcomeBubble && enableEarthGlobe) {
      fetchGeoInfo();
    }
  }, [enableWelcomeBubble, enableEarthGlobe]);

  return (
    <>
      {enableWelcomeBubble && <WelcomeBubble />}
      {enableFinanceWidget && <FinanceWidget />}
      {enableEarthGlobe && <EarthGlobe />}
      {enableScrollHelpers && <ScrollHelpers />}
      {enableAnnouncement && <AnnouncementModal />}
      {enableProtection && <Protection />}
    </>
  );
}

/**
 * 用于 private-unauthenticated 状态下的简化版本
 * 只渲染公告与 Protection 组件
 */
export function EnhancedFeaturesPrivate() {
  const { enableAnnouncement, enableProtection } = useAppConfig();

  return (
    <>
      {enableAnnouncement && <AnnouncementModal />}
      {enableProtection && <Protection />}
    </>
  );
}
