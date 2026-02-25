import { forwardRef, useState, useEffect, useMemo } from "react";
import { useAppConfig, useLocale } from "@/config/hooks";
import { Card } from "../ui/card";
import { cn } from "@/utils";
import { useIsMobile } from "@/hooks/useMobile";
import { Clock } from "lucide-react";

/**
 * 简易 Markdown 解析：将 ![alt](url) 转为 img，[text](url) 转为 a 标签
 * 对输入进行 HTML 转义以防止 XSS，仅允许 markdown 链接和图片语法
 */
function parseMarkdown(text: string): string {
  // 先转义 HTML 特殊字符
  let escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // 处理图片 ![alt](url) — 必须先于链接处理
  escaped = escaped.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" style="max-height:1.5em;vertical-align:middle;display:inline;" />'
  );

  // 处理链接 [text](url)
  escaped = escaped.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-600 transition-colors">$1</a>'
  );

  return escaped;
}

/**
 * 解析 serverStartTime 配置字符串为 Date 对象
 * 格式: "年,月,日,时,分,秒" (UTC+8)，例如 "2025,11,5,20,30,5"
 */
function parseStartTime(timeStr: string): Date | null {
  if (!timeStr) return null;
  const parts = timeStr.split(",").map((s) => parseInt(s.trim(), 10));
  if (parts.length < 3 || parts.some(isNaN)) return null;

  const [year, month, day, hour = 0, minute = 0, second = 0] = parts;
  // 构建 UTC+8 时间：先按 UTC 构建，再减去 8 小时偏移得到真实 UTC 时间
  const utcMs =
    Date.UTC(year, month - 1, day, hour, minute, second) - 8 * 60 * 60 * 1000;
  return new Date(utcMs);
}

/**
 * 根据模板计算运行时间字符串
 * 模板变量: {days} {hours} {minutes} {seconds}
 */
function formatUptime(startTime: Date, template: string): string {
  const now = new Date();
  const diff = now.getTime() - startTime.getTime();
  if (diff < 0) return "尚未启动";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return template
    .replace(/\{days\}/g, String(days))
    .replace(/\{hours\}/g, String(hours))
    .replace(/\{minutes\}/g, String(minutes))
    .replace(/\{seconds\}/g, String(seconds));
}

const Footer = forwardRef<
  HTMLElement,
  {
    isSettingsOpen: boolean;
  }
>(({ isSettingsOpen }, ref) => {
  const { t } = useLocale();
  const {
    selectedFooterStyle,
    hideFooterOriginal,
    enableServerUptime,
    serverStartTime,
    serverUptimeTemplate,
    footerCustomContent,
  } = useAppConfig();
  const isMobile = useIsMobile();

  // 解析启动时间
  const startTime = useMemo(
    () => parseStartTime(serverStartTime),
    [serverStartTime]
  );

  // 运行时间计时器
  const [uptimeText, setUptimeText] = useState("");
  useEffect(() => {
    if (!enableServerUptime || !startTime) {
      setUptimeText("");
      return;
    }
    const tpl = serverUptimeTemplate || "已不稳定运行 {days} 天 {hours} 小时 {minutes} 分钟 {seconds} 秒";
    setUptimeText(formatUptime(startTime, tpl));
    const timer = setInterval(() => {
      setUptimeText(formatUptime(startTime, tpl));
    }, 1000);
    return () => clearInterval(timer);
  }, [enableServerUptime, startTime, serverUptimeTemplate]);

  // 解析自定义内容（支持实际换行符和 ${n} 两种分隔方式）
  const customLines = useMemo(() => {
    if (!footerCustomContent) return [];
    return footerCustomContent
      .split(/\$\{n\}|\n/)
      .filter((line) => line.trim() !== "");
  }, [footerCustomContent]);

  // 判断是否有任何内容需要显示
  const hasContent =
    !hideFooterOriginal ||
    (enableServerUptime && uptimeText) ||
    customLines.length > 0;

  return (
    <footer
      ref={ref}
      className={cn(
        selectedFooterStyle === "levitation"
          ? "fixed"
          : selectedFooterStyle === "followContent"
            ? "mb-4 w-(--main-width) max-w-screen-2xl mx-auto"
            : "",
        "bottom-0 left-0 right-0 flex z-10"
      )}
      style={{
        right: isSettingsOpen && !isMobile ? "var(--setting-width)" : "0",
      }}>
      <Card
        className={cn(
          selectedFooterStyle !== "followContent" ? "rounded-none" : "",
          "p-2 w-full flex items-center justify-center inset-shadow-sm inset-shadow-(color:--accent-a4)"
        )}>
        {hasContent ? (
          <div className="flex flex-col items-center justify-center space-y-1">
            {/* 原始内容 */}
            {!hideFooterOriginal && (
              <p className="flex justify-center text-sm text-secondary-foreground theme-text-shadow whitespace-pre">
                {t("footer.poweredBy")}{" "}
                <a
                  href="https://github.com/komari-monitor/komari"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600 transition-colors">
                  Komari Monitor
                </a>
                {" | "}
                {t("footer.themeBy")}{" "}
                <a
                  href="https://github.com/YoungYannick/komari-theme-purcarte-plus"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600 transition-colors">
                  PurCarte-Plus
                </a>
              </p>
            )}

            {/* 服务器运行时间 */}
            {enableServerUptime && uptimeText && (
              <div className="flex items-center justify-center text-sm text-secondary-foreground theme-text-shadow">
                <Clock className="mr-2" size={14} />
                <span>{uptimeText}</span>
              </div>
            )}

            {/* 自定义内容 */}
            {customLines.map((line, index) => (
              <div
                key={index}
                className="flex items-center justify-center text-sm text-secondary-foreground theme-text-shadow"
                dangerouslySetInnerHTML={{ __html: parseMarkdown(line) }}
              />
            ))}
          </div>
        ) : (
          // 当所有内容都被隐藏时保持最小高度
          <div className="h-2" />
        )}
      </Card>
    </footer>
  );
});

export default Footer;
