import { useEffect, useRef, useCallback } from "react";
import Globe from "globe.gl";
import type { LogoShapeType } from "@/config/default";

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

interface BgConfig {
  bg: string;
  bgImage: string | null;
  globeImage: string;
  atmosphere: string;
}

interface GlobeRendererProps {
  pointsData: PointData[];
  arcsData: ArcData[];
  bgConfig: BgConfig;
  themeColor: string;
  userLat: number;
  userLng: number;
  earthGlobeLogoUrl: string;
  earthGlobeLogoShape: LogoShapeType;
  onReady: () => void;
}

function calculateFlagSize(altitude: number): number {
  const baseSize = 24;
  const minSize = 16;
  const maxSize = 40;
  const zoomFactor = Math.max(0.5, Math.min(2, 3 - altitude));
  return Math.max(minSize, Math.min(maxSize, baseSize * zoomFactor));
}

function checkOverlap(data: PointData[]): boolean {
  const threshold = 2;
  for (let i = 0; i < data.length; i++) {
    for (let j = i + 1; j < data.length; j++) {
      const latDiff = Math.abs(data[i].lat - data[j].lat);
      const lngDiff = Math.abs(data[i].lng - data[j].lng);
      const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
      if (distance < threshold) return true;
    }
  }
  return false;
}

export default function GlobeRenderer({
  pointsData,
  arcsData,
  bgConfig,
  themeColor,
  userLat,
  userLng,
  earthGlobeLogoUrl,
  earthGlobeLogoShape,
  onReady,
}: GlobeRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const currentActiveFlagRef = useRef<HTMLElement | null>(null);
  const lastAppliedThemeRef = useRef<BgConfig | null>(null);
  const themeColorRef = useRef(themeColor);

  const hideTooltip = useCallback(() => {
    const tooltip = tooltipRef.current;
    if (tooltip) {
      tooltip.style.display = "none";
      tooltip.style.transform = "";
    }
    const flag = currentActiveFlagRef.current;
    if (flag && flag.classList.contains("earth-flag-img")) {
      flag.style.transform = "translate(-50%, -50%) scale(1)";
      flag.style.zIndex = "auto";
      flag.style.filter = `drop-shadow(0 0 4px ${themeColorRef.current})`;
    }
    currentActiveFlagRef.current = null;
    if (globeRef.current) {
      globeRef.current.controls().autoRotate = true;
    }
  }, []);

  // 抑制 globe.gl 内部的 THREE.js 弃用警告（THREE.Clock 已弃用）
  // globe.gl v2.45.0 尚未迁移到 THREE.Timer，此警告无害但刷屏
  useEffect(() => {
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
      if (
        typeof args[0] === "string" &&
        args[0].includes("has been deprecated")
      )
        return;
      originalWarn.apply(console, args);
    };
    return () => {
      console.warn = originalWarn;
    };
  }, []);

  // 初始化 Globe
  useEffect(() => {
    const container = containerRef.current;
    if (!container || globeRef.current) return;

    // 获取或创建 tooltip
    const renderArea = container.closest("#earth-render-area");
    let tooltip = renderArea?.querySelector("#earth-tooltip") as HTMLDivElement;
    if (!tooltip) {
      tooltip = document.getElementById("earth-tooltip") as HTMLDivElement;
    }
    tooltipRef.current = tooltip;

    const w = container.clientWidth;
    const h = container.clientHeight;
    const hasOverlap = checkOverlap(pointsData);
    const isMobile = window.innerWidth <= 768;
    const initialAltitude = isMobile ? 3.0 : 2.0;

    const globe = new Globe(container)
      .width(w)
      .height(h)
      .backgroundColor(bgConfig.bg)
      .backgroundImageUrl(bgConfig.bgImage)
      .globeImageUrl(bgConfig.globeImage)
      .bumpImageUrl(
        "//upload.wikimedia.org/wikipedia/commons/b/b3/Solarsystemscope_texture_8k_earth_nightmap.jpg"
      )
      .atmosphereColor(bgConfig.atmosphere)
      .atmosphereAltitude(0.15)
      .htmlElementsData(pointsData)
      .htmlLat((d: any) => d.lat)
      .htmlLng((d: any) => d.lng)
      .htmlElement((d: any) => {
        const el = document.createElement("div");

        if (d.type === "user") {
          const marker = document.createElement("div");
          marker.className = "earth-user-marker";
          if (earthGlobeLogoUrl) {
            const isOriginal = earthGlobeLogoShape === "original";
            marker.innerHTML = `<img src="${earthGlobeLogoUrl}" alt="You"${isOriginal ? ' class="earth-user-marker-original"' : ""}>`;
            if (isOriginal) {
              marker.classList.add("earth-user-marker-shape-original");
            }
          } else {
            marker.innerHTML = `<span class="earth-user-marker-text">YOU</span>`;
          }
          marker.onclick = (e) => {
            e.stopPropagation();
            hideTooltip();
            globe.controls().autoRotate = false;
            if (tooltip) {
              tooltip.style.display = "block";
              tooltip.innerHTML = `
                <div class="earth-tooltip-header">
                  <span>YOU</span>
                </div>
                <div class="earth-tooltip-content">
                  <div class="earth-tooltip-item">${d.servers[0]}</div>
                </div>
              `;
              const parentRect = container.getBoundingClientRect();
              const rect = marker.getBoundingClientRect();
              if (window.innerWidth <= 768) {
                tooltip.style.left = "50%";
                tooltip.style.transform = "translateX(-50%)";
                tooltip.style.top = "auto";
                tooltip.style.bottom = "20px";
              } else {
                tooltip.style.left =
                  rect.right - parentRect.left + 15 + "px";
                tooltip.style.top = rect.top - parentRect.top + "px";
                tooltip.style.bottom = "";
                tooltip.style.transform = "";
              }
            }
          };
          el.appendChild(marker);
        } else {
          const img = document.createElement("img");
          img.src = `/assets/flags/${d.code}.svg`;
          img.className = "earth-flag-img";
          img.style.pointerEvents = "auto";

          const updateFlagSize = () => {
            if (!globe) return;
            const controls = globe.controls();
            const altitude = controls.getDistance
              ? controls.getDistance() / 200
              : 2;
            let newSize = calculateFlagSize(altitude);
            if (hasOverlap && altitude < 1.5) {
              newSize = Math.max(16, newSize * 0.7);
            }
            img.style.width = newSize + "px";
          };
          updateFlagSize();
          globe.controls().addEventListener("change", updateFlagSize);

          img.onmouseenter = () => {
            if (currentActiveFlagRef.current !== img) {
              img.style.transform = "translate(-50%, -50%) scale(1.3)";
              img.style.filter = `drop-shadow(0 0 6px ${themeColorRef.current})`;
            }
          };
          img.onmouseleave = () => {
            if (currentActiveFlagRef.current !== img) {
              img.style.transform = "translate(-50%, -50%) scale(1)";
              img.style.filter = `drop-shadow(0 0 4px ${themeColorRef.current})`;
            }
          };
          img.onclick = (e) => {
            e.stopPropagation();
            if (currentActiveFlagRef.current === img) {
              hideTooltip();
              return;
            }
            const prevFlag = currentActiveFlagRef.current;
            if (prevFlag && prevFlag.classList.contains("earth-flag-img")) {
              prevFlag.style.transform = "translate(-50%, -50%) scale(1)";
              prevFlag.style.zIndex = "auto";
              prevFlag.style.filter = `drop-shadow(0 0 4px ${themeColorRef.current})`;
            }
            globe.controls().autoRotate = false;
            currentActiveFlagRef.current = img;
            img.style.transform = "translate(-50%, -50%) scale(1.5)";
            img.style.zIndex = "1000";
            img.style.filter = `drop-shadow(0 0 8px ${themeColorRef.current})`;

            if (tooltip) {
              const rect = img.getBoundingClientRect();
              const parentRect = container.getBoundingClientRect();
              tooltip.style.display = "block";
              tooltip.innerHTML = `
                <div class="earth-tooltip-header">
                  <span>${d.code}</span>
                  <span style="color: var(--gray-11); font-weight: normal; font-size: 0.85rem;">(${d.servers.length})</span>
                </div>
                <div class="earth-tooltip-content">
                  ${d.servers.map((s: string) => `<div class="earth-tooltip-item">${s}</div>`).join("")}
                </div>
              `;
              const tooltipRect = tooltip.getBoundingClientRect();
              if (window.innerWidth <= 768) {
                tooltip.style.left = "50%";
                tooltip.style.transform = "translateX(-50%)";
                tooltip.style.top = "auto";
                tooltip.style.bottom = "20px";
              } else {
                let leftPos = rect.right - parentRect.left + 15;
                let topPos = rect.top - parentRect.top;
                if (leftPos + tooltipRect.width > parentRect.width) {
                  leftPos =
                    rect.left - parentRect.left - tooltipRect.width - 15;
                }
                if (topPos + tooltipRect.height > parentRect.height) {
                  topPos = parentRect.height - tooltipRect.height - 10;
                }
                tooltip.style.left = leftPos + "px";
                tooltip.style.top = topPos + "px";
                tooltip.style.bottom = "";
                tooltip.style.transform = "";
              }
            }
          };
          el.appendChild(img);
        }
        return el;
      })
      .ringsData(pointsData.filter((item) => item.type === "server"))
      .ringColor(() => themeColorRef.current)
      .ringMaxRadius(2)
      .ringPropagationSpeed(1)
      .ringRepeatPeriod(1250)
      .arcsData(arcsData)
      .arcStartLat((d: any) => d.startLat)
      .arcStartLng((d: any) => d.startLng)
      .arcEndLat((d: any) => d.endLat)
      .arcEndLng((d: any) => d.endLng)
      .arcColor(() => themeColorRef.current)
      .arcDashLength(0.5)
      .arcDashGap(1)
      .arcDashAnimateTime(1750)
      .arcStroke(0.8)
      .arcAltitudeAutoScale(0.5);

    globe.pointOfView({
      lat: userLat || 25,
      lng: userLng || 110,
      altitude: initialAltitude,
    });
    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.6;
    globe.controls().enableZoom = true;

    // 点击空白区域隐藏 tooltip
    container.addEventListener("click", (e: Event) => {
      const target = e.target as HTMLElement;
      if (target === container || target.tagName === "CANVAS") {
        hideTooltip();
      }
    });

    // 触摸事件
    let touchStartTime = 0;
    container.addEventListener("touchstart", () => {
      touchStartTime = Date.now();
    });
    container.addEventListener("touchend", (e: Event) => {
      const touchDuration = Date.now() - touchStartTime;
      const target = e.target as HTMLElement;
      if (
        touchDuration < 200 &&
        (target === container || target.tagName === "CANVAS")
      ) {
        hideTooltip();
      }
    });

    // 窗口大小变化
    const handleResize = () => {
      globe.width(container.clientWidth);
      globe.height(container.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    globeRef.current = globe;
    lastAppliedThemeRef.current = { ...bgConfig };
    onReady();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
    // 只在挂载时初始化一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 主题颜色变更时同步 ref 并刷新弧线/脉冲环颜色
  useEffect(() => {
    themeColorRef.current = themeColor;
    const globe = globeRef.current;
    if (!globe) return;
    // 重新设置颜色回调以触发 globe.gl 重绘
    globe.arcColor(() => themeColor);
    globe.ringColor(() => themeColor);
  }, [themeColor]);

  // 主题变更时更新地球外观
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    const last = lastAppliedThemeRef.current;
    if (
      last &&
      last.bg === bgConfig.bg &&
      last.bgImage === bgConfig.bgImage &&
      last.globeImage === bgConfig.globeImage &&
      last.atmosphere === bgConfig.atmosphere
    ) {
      return;
    }

    globe.backgroundColor(bgConfig.bg);
    globe.backgroundImageUrl(bgConfig.bgImage);
    globe.globeImageUrl(bgConfig.globeImage);
    globe.atmosphereColor(bgConfig.atmosphere);
    lastAppliedThemeRef.current = { ...bgConfig };
  }, [bgConfig]);

  // 模态框重新打开时调整尺寸
  useEffect(() => {
    const globe = globeRef.current;
    const container = containerRef.current;
    if (globe && container) {
      const timer = setTimeout(() => {
        globe.width(container.clientWidth);
        globe.height(container.clientHeight);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        cursor: "grab",
        touchAction: "none",
        position: "relative",
        overflow: "hidden",
      }}
    />
  );
}
