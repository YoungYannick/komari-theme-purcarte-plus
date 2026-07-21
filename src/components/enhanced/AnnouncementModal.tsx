import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAppConfig, useLocale } from "@/config/hooks";
import { renderBasicContent } from "@/utils/contentRender";
import { apiService } from "@/services/api";

type AnnouncementIconType = "info" | "warning" | "important";

const ICON_CONFIG: Record<
  AnnouncementIconType,
  { label: string; children: ReactNode }
> = {
  info: {
    label: "info",
    children: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 10v6" />
        <path d="M12 7h.01" />
      </>
    ),
  },
  warning: {
    label: "warning",
    children: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v7" />
        <path d="M12 17h.01" />
      </>
    ),
  },
  important: {
    label: "important",
    children: (
      <>
        <path d="M12 6 19 18H5L12 6Z" />
        <path d="M12 10.5v4.5" />
        <path d="M12 16.5h.01" />
      </>
    ),
  },
};

function getIconType(logoUrl: string): AnnouncementIconType | null {
  const normalized = logoUrl.trim().toLowerCase();
  if (normalized === "${info}") return "info";
  if (normalized === "${warning}") return "warning";
  if (normalized === "${important}") return "important";
  return null;
}

function AnnouncementLogo({
  logoUrl,
  logoShape,
}: {
  logoUrl: string;
  logoShape: "circle" | "original";
}) {
  const iconType = getIconType(logoUrl);

  if (iconType) {
    const icon = ICON_CONFIG[iconType];
    return (
      <span className="announcement-logo-svg">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-label={icon.label}>
          {icon.children}
        </svg>
      </span>
    );
  }

  if (!logoUrl) return null;

  return (
    <img
      src={logoUrl}
      className={
        logoShape === "original"
          ? "bubble-logo-image bubble-logo-original"
          : "bubble-logo-image"
      }
      alt="logo"
    />
  );
}

function replaceVersionPlaceholders(
  text: string,
  versionInfo: { version: string; hash: string } | null
) {
  return text
    .replace(/\$\{hash\}/g, versionInfo?.hash ?? "")
    .replace(/\$\{version\}/g, versionInfo?.version ?? "");
}

export function AnnouncementModal() {
  const { t } = useLocale();
  const {
    announcementLogoUrl,
    announcementLogoShape,
    announcementTitle,
    announcementContent,
  } = useAppConfig();
  const [isVisible, setIsVisible] = useState(true);
  const [versionInfo, setVersionInfo] = useState<{
    version: string;
    hash: string;
  } | null>(null);

  const hasVersionPlaceholder = useMemo(
    () => /\$\{(?:hash|version)\}/.test(`${announcementTitle}\n${announcementContent}`),
    [announcementTitle, announcementContent]
  );

  useEffect(() => {
    if (!hasVersionPlaceholder) {
      setVersionInfo(null);
      return;
    }

    let cancelled = false;
    apiService
      .getVersion()
      .then((data) => {
        if (!cancelled) setVersionInfo(data);
      })
      .catch(() => {
        if (!cancelled) setVersionInfo({ version: "unknown", hash: "unknown" });
      });

    return () => {
      cancelled = true;
    };
  }, [hasVersionPlaceholder]);

  const resolvedTitle = useMemo(
    () => replaceVersionPlaceholders(announcementTitle, versionInfo),
    [announcementTitle, versionInfo]
  );

  const resolvedContent = useMemo(
    () => replaceVersionPlaceholders(announcementContent, versionInfo),
    [announcementContent, versionInfo]
  );

  const renderedContent = useMemo(
    () => renderBasicContent(resolvedContent),
    [resolvedContent]
  );

  const handleContentClick = useCallback((event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>(".markdown-code-copy");
    if (button) {
      const codeBlock = button.closest(".markdown-code-block");
      const code = codeBlock?.querySelector("code")?.textContent ?? "";
      const setCopied = () => {
        button.dataset.copied = "true";
        button.setAttribute("aria-label", "Copied");
        button.setAttribute("title", "Copied");
        window.setTimeout(() => {
          delete button.dataset.copied;
          button.setAttribute("aria-label", "Copy code");
          button.setAttribute("title", "Copy code");
        }, 1200);
      };
      const fallbackCopy = () => {
        const textarea = document.createElement("textarea");
        textarea.value = code;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied();
      };

      const copyPromise = navigator.clipboard?.writeText?.(code);
      if (copyPromise) {
        copyPromise.then(setCopied).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
      return;
    }

    const summary = target.closest<HTMLElement>("summary");
    const details = summary?.closest<HTMLDetailsElement>("details.markdown-details");
    const body = details?.querySelector<HTMLElement>(".markdown-details-body");
    if (!summary || !details || !body) return;

    event.preventDefault();

    body.getAnimations().forEach((animation) => animation.cancel());

    if (details.open) {
      body.style.height = `${body.scrollHeight}px`;
      body.style.opacity = "1";
      body.style.marginTop = "0.6rem";

      requestAnimationFrame(() => {
        body.style.height = "0px";
        body.style.opacity = "0";
        body.style.marginTop = "0px";
      });

      const handleTransitionEnd = (transitionEvent: TransitionEvent) => {
        if (transitionEvent.propertyName !== "height") return;
        body.removeEventListener("transitionend", handleTransitionEnd);
        details.open = false;
        body.style.height = "";
        body.style.opacity = "";
        body.style.marginTop = "";
      };
      body.addEventListener("transitionend", handleTransitionEnd);
      return;
    }

    details.open = true;
    body.style.height = "0px";
    body.style.opacity = "0";
    body.style.marginTop = "0px";

    requestAnimationFrame(() => {
      body.style.height = `${body.scrollHeight}px`;
      body.style.opacity = "1";
      body.style.marginTop = "0.6rem";
    });

    const handleTransitionEnd = (transitionEvent: TransitionEvent) => {
      if (transitionEvent.propertyName !== "height") return;
      body.removeEventListener("transitionend", handleTransitionEnd);
      body.style.height = "auto";
    };
    body.addEventListener("transitionend", handleTransitionEnd);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="announcement-overlay" role="dialog" aria-modal="true">
      <div className="announcement-modal">
        <div className="bubble-header">
          <h3 className="bubble-title">
            <AnnouncementLogo
              logoUrl={announcementLogoUrl}
              logoShape={announcementLogoShape}
            />
            {resolvedTitle || t("enhanced.announcement.defaultTitle")}
          </h3>
          <button
            className="bubble-close"
            onClick={() => setIsVisible(false)}
            aria-label={t("enhanced.announcement.close")}>
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
        <div className="bubble-content announcement-content" onClick={handleContentClick}>
          {resolvedContent ? (
            <div
              className="announcement-body"
              dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
          ) : (
            <div className="announcement-body announcement-body-empty" />
          )}
        </div>
      </div>
    </div>
  );
}
