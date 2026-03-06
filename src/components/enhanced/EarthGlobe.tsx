import {
  useState,
  useEffect,
  useCallback,
  lazy,
  Suspense,
  useMemo,
} from "react";
import { useNodeData } from "@/contexts/NodeDataContext";
import { useUserGeo } from "./useUserGeo";
import { useAppConfig } from "@/config";
import { useTheme } from "@/hooks/useTheme";
import { useLocale } from "@/config/hooks";
import { COORD_MAP, resolveCountryCode } from "./emojiMap";
import type { NodeData } from "@/types/node.d";

// globe.gl 通过 React.lazy 延迟加载
const GlobeComponent = lazy(() => import("./GlobeRenderer"));

interface PointData {
  code: string;
  lat: number;
  lng: number;
  servers: string[];
  type: "server" | "user";
  size: number;
}

interface ArcData {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}

function processData(
  nodes: NodeData[],
  userLat: number,
  userLng: number,
  userCity: string
): { formattedData: PointData[]; arcsData: ArcData[]; totalCount: number } {
  const groups: Record<string, string[]> = {};
  let count = 0;

  nodes.forEach((node) => {
    const code = resolveCountryCode(node.region);
    if (code) {
      if (!groups[code]) groups[code] = [];
      groups[code].push(node.name);
      count++;
    }
  });

  const formattedData: PointData[] = Object.keys(groups)
    .map((code): PointData | null => {
      const coords = COORD_MAP[code];
      if (!coords) return null;
      return {
        code,
        lat: coords[0],
        lng: coords[1],
        servers: groups[code],
        type: "server",
        size: Math.min(groups[code].length * 0.15, 1.5),
      };
    })
    .filter((item): item is PointData => item !== null);

  // 添加用户位置
  formattedData.push({
    code: "USER",
    lat: userLat,
    lng: userLng,
    servers: [userCity],
    type: "user",
    size: 2.0,
  });

  // 生成弧线数据
  const arcsData: ArcData[] = formattedData
    .filter((item) => item.type === "server")
    .map((item) => ({
      startLat: item.lat,
      startLng: item.lng,
      endLat: userLat,
      endLng: userLng,
    }));

  return { formattedData, arcsData, totalCount: count };
}

export function EarthGlobe() {
  const { nodes } = useNodeData();
  const { geo } = useUserGeo();
  const {
    enableSoloPlay,
    earthLightBgImage,
    earthDarkBgImage,
    earthLightGlobeImage,
    earthDarkGlobeImage,
  } = useAppConfig();
  const { appearance } = useTheme();
  const { t } = useLocale();

  const [modalOpen, setModalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [globeReady, setGlobeReady] = useState(false);

  // 监听来自 Header 按钮的自定义事件
  useEffect(() => {
    const handler = () => setModalOpen((prev) => !prev);
    window.addEventListener("toggle-earth-globe", handler);
    return () => window.removeEventListener("toggle-earth-globe", handler);
  }, []);

  // 判断当前是否是暗色模式
  const isDark = useMemo(() => {
    if (appearance === "dark") return true;
    if (appearance === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }, [appearance]);

  // 获取主题色
  const themeColor = useMemo(() => {
    const cssColor = getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-9")
        .trim();
    const storedColor = localStorage.getItem('color')?.replace(/"/g, '');
    return cssColor || storedColor || "#3b82f6";
  }, [isDark, modalOpen]);

  // 背景配置
  const bgConfig = useMemo(() => {
    const bg = "rgba(0, 0, 0, 0)";
    if (isDark) {
      return {
        bg,
        bgImage: earthDarkBgImage || null,
        globeImage:
          earthDarkGlobeImage ||
          "//upload.wikimedia.org/wikipedia/commons/b/b3/Solarsystemscope_texture_8k_earth_nightmap.jpg",
        atmosphere: themeColor,
      };
    }
    return {
      bg,
      bgImage: earthLightBgImage || null,
      globeImage:
        earthLightGlobeImage ||
        "//upload.wikimedia.org/wikipedia/commons/0/04/Solarsystemscope_texture_8k_earth_daymap.jpg",
      atmosphere: "#3b82f6",
    };
  }, [
    isDark,
    earthLightBgImage,
    earthDarkBgImage,
    earthLightGlobeImage,
    earthDarkGlobeImage,
    themeColor,
  ]);

  // 处理节点数据
  const { formattedData, arcsData, totalCount } = useMemo(() => {
    const userLat = geo.lat || 35.8617;
    const userLng = geo.lng || 104.1954;
    const userCity = geo.city || "Your Location";

    if (enableSoloPlay) {
      const fakeNodes = Object.keys(COORD_MAP).map((code) => ({
        name: code,
        region: code,
      })) as NodeData[];
      return processData(fakeNodes, userLat, userLng, userCity);
    }
    return processData(nodes, userLat, userLng, userCity);
  }, [nodes, geo, enableSoloPlay]);

  const handleCloseModal = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.id === "earth-modal-overlay" ||
      target.id === "earth-modal-content"
    ) {
      setIsClosing(true);
    }
  }, []);

  const handleAnimationEnd = useCallback(() => {
    if (isClosing) {
      setModalOpen(false);
      setIsClosing(false);
      setGlobeReady(false);
    }
  }, [isClosing]);

  return (
    <>
      {/* 地球模态框 */}
      {modalOpen && (
        <div
          id="earth-modal-overlay"
          className={`custom-alert-overlay earth-modal-overlay${isClosing ? " closing" : ""}`}
          style={{ display: "flex" }}
          onClick={handleCloseModal}
          onAnimationEnd={handleAnimationEnd}>
          <div
            id="earth-modal-content"
            className={`custom-alert-modal earth-modal-content${isClosing ? " closing" : ""}`}>
            <div className="earth-overlay-counter">
              <span className="counter-label">{t("enhanced.earth.totalServers")}</span>
              <span className="counter-value">{totalCount}</span>
            </div>
            <div
              id="earth-render-area"
              className={globeReady ? "ready" : ""}>
              <Suspense
                fallback={
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                      color: "var(--gray-11)",
                    }}>
                    {t("enhanced.earth.loading")}
                  </div>
                }>
                <GlobeComponent
                  pointsData={formattedData}
                  arcsData={arcsData}
                  bgConfig={bgConfig}
                  themeColor={themeColor}
                  userLat={geo.lat || 35.8617}
                  userLng={geo.lng || 104.1954}
                  onReady={() => {
                    setTimeout(() => setGlobeReady(true), 100);
                  }}
                />
              </Suspense>
            </div>
            <div
              id="earth-tooltip"
              style={{ display: "none" }}
            />
          </div>
        </div>
      )}
    </>
  );
}
