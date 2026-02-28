import { useState, useEffect, useMemo } from "react";
import { useUserGeo } from "./useUserGeo";
import { useAppConfig } from "@/config";
import { useLocale } from "@/config/hooks";

function getOperatingSystem(userAgent: string): string {
  if (/android/i.test(userAgent)) return "Android";
  if (/iPad|iPhone|iPod/.test(userAgent)) return "iOS";
  if (/macintosh|mac os x/i.test(userAgent)) return "macOS";
  if (/windows phone/i.test(userAgent)) return "Windows Phone";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/linux/i.test(userAgent)) return "Linux";
  return "";
}

function getBrowserName(userAgent: string): string {
  if (userAgent.includes("Edg")) return "Edge";
  if (userAgent.includes("Firefox")) return "Firefox";
  if (userAgent.includes("Chrome")) return "Chrome";
  if (userAgent.includes("Safari")) return "Safari";
  return "";
}

function OsIcon({ os }: { os: string }) {
  const osLower = os.toLowerCase();
  if (osLower.includes("windows")) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="currentColor">
        <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
      </svg>
    );
  }
  if (osLower.includes("mac") || osLower.includes("ios")) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="currentColor">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
    );
  }
  if (osLower.includes("android")) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="currentColor">
        <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85a.637.637 0 0 0-.83.22l-1.88 3.24a11.43 11.43 0 0 0-8.94 0L5.65 5.67a.643.643 0 0 0-.87-.2c-.28.18-.37.54-.22.83L6.4 9.48A10.81 10.81 0 0 0 1 18h22a10.81 10.81 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
      </svg>
    );
  }
  if (osLower.includes("linux")) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

export function WelcomeBubble() {
  const { geo, loading } = useUserGeo();
  const { welcomeBubbleSiteName, welcomeBubbleLogoUrl, titleText } = useAppConfig();
  const { t, i18n } = useLocale();
  const [visible, setVisible] = useState(false);
  const [ipHidden, setIpHidden] = useState(false);
  const [ispHidden, setIspHidden] = useState(false);

  const siteName = welcomeBubbleSiteName || titleText || "Komari";
  const osName = useMemo(() => {
    const os = getOperatingSystem(navigator.userAgent);
    return os || t("enhanced.welcome.unknownDevice");
  }, [t]);
  const browserName = useMemo(() => {
    const browser = getBrowserName(navigator.userAgent);
    const name = browser || t("enhanced.welcome.unknownBrowser");
    return name + " " + t("enhanced.welcome.browserSuffix");
  }, [t]);
  const dateStr = useMemo(
    () =>
      new Date().toLocaleDateString(i18n.language, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    [i18n.language]
  );

  const welcomeMessage = useMemo(() => {
    if (loading) return t("enhanced.welcome.messageDefault");
    if (geo.city && geo.region)
      return t("enhanced.welcome.messageRegion", { region: geo.region, city: geo.city });
    if (geo.country) return t("enhanced.welcome.messageCountry", { country: geo.country });
    return t("enhanced.welcome.messageDefault");
  }, [loading, geo, t]);

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setVisible(true), 100);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  return (
    <div
      id="welcome-bubble-container"
      className={`welcome-bubble${visible ? " show" : ""}`}>
      <div className="bubble-header">
        <h3 className="bubble-title">
          {welcomeBubbleLogoUrl && <img src={welcomeBubbleLogoUrl} className="bubble-logo-image" alt="logo" />}
          {siteName}
        </h3>
        <button className="bubble-close" onClick={() => setVisible(false)}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            fill="currentColor"
            viewBox="0 0 16 16">
            <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z" />
          </svg>
        </button>
      </div>
      <div className="bubble-content">
        <p className="bubble-info">{welcomeMessage}</p>
        <p className="bubble-info">
          <OsIcon os={osName} />
          <span>{osName}</span>
        </p>
        <p className="bubble-info">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
            <path d="M2 12h20" />
          </svg>
          <span>{browserName}</span>
        </p>
        {geo.ip && (
          <p
            className="bubble-info"
            style={{ cursor: "pointer" }}
            onClick={() => setIpHidden(!ipHidden)}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className={ipHidden ? "spoiler" : ""}>{geo.ip}</span>
          </p>
        )}
        {geo.isp && (
          <p
            className="bubble-info"
            style={{ cursor: "pointer" }}
            onClick={() => setIspHidden(!ispHidden)}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
            </svg>
            <span className={ispHidden ? "spoiler" : ""}>{geo.isp}</span>
          </p>
        )}
        <p className="bubble-info">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>{dateStr}</span>
        </p>
      </div>
    </div>
  );
}
