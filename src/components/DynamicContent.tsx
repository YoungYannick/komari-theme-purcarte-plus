import { type ReactNode, useCallback, useMemo, useEffect, useRef } from "react";
import { useAppConfig } from "@/config/hooks";
import { useIsMobile } from "@/hooks/useMobile";
import { useTheme } from "@/hooks/useTheme";

export function DynamicContent({ children }: { children: ReactNode }) {
  const config = useAppConfig();
  const isMobile = useIsMobile();
  const { appearance } = useTheme();

  // 缓存随机选择的背景 URL，避免每次父组件重渲染时重新随机导致背景闪烁
  const cachedUrlsRef = useRef<Record<string, string>>({});

  const getUrlFromConfig = useCallback(
    (urls: string) => {
      if (!urls) return "";

      // 使用 urls + appearance 作为缓存 key，只有配置值真正变化时才重新随机
      const cacheKey = `${urls}|${appearance}`;
      if (cacheKey in cachedUrlsRef.current) {
        return cachedUrlsRef.current[cacheKey];
      }

      const themes = urls.split("|").map((theme) => theme.trim());
      const themeIndex = appearance === "dark" ? 1 : 0;
      const selectedTheme =
        themes.length > themeIndex ? themes[themeIndex] : themes[0] || "";
      const themeUrls = selectedTheme
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean);
      const randomIndex = Math.floor(Math.random() * themeUrls.length);
      const result = themeUrls[randomIndex] || "";
      cachedUrlsRef.current[cacheKey] = result;
      return result;
    },
    [appearance]
  );

  const backgroundMode = config.backgroundMode || "image";

  // 使用具体的原始值作为依赖，而非整个 config 对象，避免无关配置变化触发重计算
  const bgImage = config.backgroundImage;
  const bgImageMobile = config.backgroundImageMobile;
  const videoBgUrl = config.videoBackgroundUrl;
  const videoBgUrlMobile = config.videoBackgroundUrlMobile;
  const solidColorBg = config.solidColorBackground;
  const mainWidth = config.mainWidth;
  const blurValue = config.blurValue;
  const blurBackgroundColor = config.blurBackgroundColor;
  const bgAlignment = config.backgroundAlignment;

  const imageUrl = useMemo(() => {
    if (backgroundMode !== "image") return "";
    return isMobile && bgImageMobile
      ? getUrlFromConfig(bgImageMobile)
      : getUrlFromConfig(bgImage);
  }, [bgImage, bgImageMobile, isMobile, getUrlFromConfig, backgroundMode]);

  const videoUrl = useMemo(() => {
    if (backgroundMode !== "video") return "";
    return isMobile && videoBgUrlMobile
      ? getUrlFromConfig(videoBgUrlMobile)
      : getUrlFromConfig(videoBgUrl);
  }, [videoBgUrl, videoBgUrlMobile, isMobile, getUrlFromConfig, backgroundMode]);

  const solidColor = useMemo(() => {
    if (backgroundMode !== "solidColor") return "";
    return solidColorBg || "";
  }, [solidColorBg, backgroundMode]);

  const dynamicStyles = useMemo(() => {
    const styles: string[] = [];

    styles.push(`--main-width: ${mainWidth}vw;`);
    styles.push(`--body-background-url: url(${imageUrl});`);
    styles.push(`--purcarte-blur: ${blurValue}px;`);

    const colors = blurBackgroundColor.split("|").map((color) => color.trim());
    if (colors.length >= 2) {
      styles.push(`--card-light: ${colors[0]};`);
      styles.push(`--card-dark: ${colors[1]};`);
    } else if (colors.length === 1) {
      styles.push(`--card-light: ${colors[0]};`);
      styles.push(`--card-dark: ${colors[0]};`);
    }

    return `:root { ${styles.join(" ")} }`;
  }, [mainWidth, blurValue, blurBackgroundColor, imageUrl]);

  useEffect(() => {
    const imageBackground = document.getElementById("image-background");
    const videoBackground = document.getElementById(
      "video-background"
    ) as HTMLVideoElement;
    const [size, position] = bgAlignment
      .split(",")
      .map((s) => s.trim());

    if (imageBackground) {
      if (backgroundMode === "solidColor" && solidColor) {
        imageBackground.style.backgroundImage = "none";
        imageBackground.style.backgroundColor = solidColor;
      } else if (backgroundMode === "image" && imageUrl) {
        imageBackground.style.backgroundColor = "";
        imageBackground.style.backgroundImage = `url(${imageUrl})`;
        imageBackground.style.backgroundSize = size;
        imageBackground.style.backgroundPosition = position;
      } else {
        imageBackground.style.backgroundImage = "none";
        imageBackground.style.backgroundColor = "";
      }
    }

    if (videoBackground) {
      if (backgroundMode === "video" && videoUrl) {
        videoBackground.src = videoUrl;
        videoBackground.style.objectFit = size;
        videoBackground.style.objectPosition = position;
        videoBackground.style.display = "block";
      } else {
        videoBackground.src = "";
        videoBackground.style.display = "none";
      }
    }
  }, [
    imageUrl,
    videoUrl,
    solidColor,
    backgroundMode,
    bgAlignment,
  ]);

  return (
    <>
      <style>{dynamicStyles}</style>
      <div className="fade-in">{children}</div>
    </>
  );
}
