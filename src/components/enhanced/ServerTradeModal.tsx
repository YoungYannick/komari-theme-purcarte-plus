import { useAppConfig } from "@/config";
import { useState, useCallback, useEffect, useRef } from "react";
import type { NodeData } from "@/types/node.d";
import type { ExchangeRates } from "./useExchangeRates";
import { CURRENCY_SYMBOLS } from "./useExchangeRates";
import { EMOJI_MAP } from "./emojiMap";
import {
  calculateRemainValueForDate,
  formatBytes,
  formatTraffic,
  getBillingCycleText,
  normalizeCurrencyToCode,
} from "./financeUtils";
import { useLocale } from "@/config/hooks";
import { Tag } from "@/components/ui/tag";
import { toast } from "sonner";
import html2canvas from "html2canvas-pro";

interface ServerTradeModalProps {
  node: NodeData;
  rates: ExchangeRates;
  userCurrency: string;
  onClose: () => void;
  initialTradeDate?: string;
  initialTradeAmount?: string;
}

export function ServerTradeModal({
  node,
  rates,
  userCurrency,
  onClose,
  initialTradeDate,
  initialTradeAmount,
}: ServerTradeModalProps) {
  const { t, i18n } = useLocale();
  const { enableSearchButton, enableAdvancedSearch } = useAppConfig();
  const isAdvancedSearchEnabled = enableSearchButton && enableAdvancedSearch;
  const [isClosing, setIsClosing] = useState(false);
  const sym = CURRENCY_SYMBOLS[userCurrency] || userCurrency;
  const regionCode = EMOJI_MAP[node.region] || node.region || "UN";

  // 日期和金额
  const now = new Date();
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayStr = `${utc8.getUTCFullYear()}-${String(utc8.getUTCMonth() + 1).padStart(2, "0")}-${String(utc8.getUTCDate()).padStart(2, "0")}`;
  const [tradeDate, setTradeDate] = useState(initialTradeDate || todayStr);
  const [tradeAmount, setTradeAmount] = useState(initialTradeAmount || "");

  // 计算剩余价值（已经是用户选择的基准货币）
  const displayRemainValue = parseFloat(
    calculateRemainValueForDate(node, rates, tradeDate).toFixed(2)
  );

  // 溢价计算
  const amount = parseFloat(tradeAmount);
  const hasAmount = !isNaN(amount) && amount >= 0;
  const premium = hasAmount ? amount - displayRemainValue : NaN;
  const premiumRate =
    hasAmount && displayRemainValue > 0
      ? (premium / displayRemainValue) * 100
      : 0;

  // 到期时间处理
  let expiredText = "-";
  if (node.expired_at) {
    const expiryDate = new Date(node.expired_at);
    const dateOnlyString = expiryDate.toLocaleDateString(i18n.language, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Shanghai",
    });
    const now = new Date();
    const diffMs = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 0) expiredText = `${dateOnlyString} ${t("enhanced.trade.remainingDays", { days: diffDays })}`;
    else if (diffDays === 0) expiredText = `${dateOnlyString} ${t("enhanced.trade.expiresToday")}`;
    else
      expiredText = `${dateOnlyString} ${t("enhanced.trade.expiredDays", { days: Math.abs(diffDays) })}`;
  }

  // tags & remarks
  const tags = node.tags
    ? node.tags
        .split(";")
        .filter((t) => t.trim())
        .map((t) => t.trim())
    : [];
  const remarks = node.public_remark
    ? node.public_remark
        .split(";")
        .filter((r) => r.trim())
        .map((r) => r.trim())
    : [];

  // 拖拽逻辑
  const modalRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragInitial = useRef({ x: 0, y: 0 });

  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if ((e.target as HTMLElement).closest(".bubble-close")) return;
      const modal = modalRef.current;
      if (!modal) return;

      const clientX =
        "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY =
        "touches" in e ? e.touches[0].clientY : e.clientY;

      dragInitial.current = {
        x: clientX - (modal.offsetLeft || 0),
        y: clientY - (modal.offsetTop || 0),
      };
      isDragging.current = true;
      modal.style.position = "absolute";
    },
    []
  );

  useEffect(() => {
    const handleDrag = (e: MouseEvent | TouchEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
      const modal = modalRef.current;
      if (!modal) return;

      const clientX =
        "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY =
        "touches" in e ? e.touches[0].clientY : e.clientY;

      modal.style.left = clientX - dragInitial.current.x + "px";
      modal.style.top = clientY - dragInitial.current.y + "px";
    };
    const handleDragEnd = () => {
      isDragging.current = false;
    };

    document.addEventListener("mousemove", handleDrag);
    document.addEventListener("mouseup", handleDragEnd);
    document.addEventListener("touchmove", handleDrag, { passive: false });
    document.addEventListener("touchend", handleDragEnd);
    return () => {
      document.removeEventListener("mousemove", handleDrag);
      document.removeEventListener("mouseup", handleDragEnd);
      document.removeEventListener("touchmove", handleDrag);
      document.removeEventListener("touchend", handleDragEnd);
    };
  }, []);

  const handleClose = useCallback(() => {
    setIsClosing(true);
  }, []);

  const handleAnimationEnd = useCallback(() => {
    if (isClosing) {
      setIsClosing(false);
      onClose();
    }
  }, [isClosing, onClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleClose();
      }
    },
    [handleClose]
  );

  const handleShare = useCallback(() => {
    // 如果没有开启高级搜索功能，禁止分享并弹出 Toast 提示
    if (!isAdvancedSearchEnabled) {
      toast.warning(t("enhanced.trade.shareDisabled"));
      return;
    }
    const params = new URLSearchParams();
    // 使用 t_q=uuid 实现唯一搜索
    params.set("t_q", node.uuid);
    // 交易模态框参数
    if (tradeDate) {
      params.set("tm_date", tradeDate);
    }
    if (tradeAmount) {
      params.set("tm_amount", tradeAmount);
    }
    // 货币单位
    if (userCurrency && userCurrency !== "CNY") {
      params.set("tm_cur", userCurrency);
    }
    const shareUrl = `${window.location.origin}/?${params.toString()}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      toast.success(t("enhanced.trade.shareCopied"));
    }).catch(() => {
      // 回退方案：创建临时输入框复制
      const textarea = document.createElement("textarea");
      textarea.value = shareUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast.success(t("enhanced.trade.shareCopied"));
    });
  }, [isAdvancedSearchEnabled, node.uuid, tradeDate, tradeAmount, userCurrency, t]);

  const handleExportImage = useCallback(async () => {
    const modal = modalRef.current;
    if (!modal) return;

    const isDark = !!document.querySelector(".radix-themes.dark");
    const opaqueBg = isDark ? "#000000" : "#ffffff";

    const contentEl = modal.querySelector(".server-trade-content") as HTMLElement | null;

    const headerBtnGroup = modal.querySelector(
      ".bubble-header > div:last-child"
    ) as HTMLElement | null;
    const origBtnDisplay = headerBtnGroup?.style.display;

    // 覆盖半透明子元素
    const semiEls = Array.from(
      modal.querySelectorAll<HTMLElement>(".trade-input, .trade-result-box")
    );

    const inputPairs: { input: HTMLInputElement; placeholder: HTMLDivElement }[] = [];
    // 旗帜：用内联 <svg> 替换 <img>，截图后再换回
    const flagPairs: { img: HTMLImageElement; svgEl: Element; parent: Node }[] = [];
    // 标签元素（try 内赋值，finally 内恢复）
    let tagEls: HTMLElement[] = [];

    try {
      // 1) 将 SVG flag <img> 替换为内联 <svg> 元素
      //    html2canvas 无法渲染外部 SVG <img>，但能渲染内联 <svg>
      const flagImgs = modal.querySelectorAll<HTMLImageElement>('img[src$=".svg"]');
      await Promise.all(
        Array.from(flagImgs).map(async (img) => {
          try {
            const resp = await fetch(img.src);
            const svgText = await resp.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgText, "image/svg+xml");
            const svgEl = doc.documentElement;
            svgEl.setAttribute("width", String(img.width || 20));
            svgEl.setAttribute("height", String(img.height || 15));
            svgEl.style.display = "inline-block";
            svgEl.style.verticalAlign = "middle";
            const parent = img.parentNode!;
            parent.replaceChild(svgEl, img);
            flagPairs.push({ img, svgEl, parent });
          } catch {
            // 加载失败则保持原样
          }
        })
      );

      // 2) 将 <input> 替换为文本 <div>（html2canvas 渲染 input value 有偏移）
      const inputs = modal.querySelectorAll<HTMLInputElement>("input.trade-input");
      inputs.forEach((input) => {
        const computed = window.getComputedStyle(input);
        const div = document.createElement("div");
        div.className = input.className;
        div.textContent = input.value || input.placeholder || "";
        div.style.cssText = input.style.cssText;
        div.style.padding = computed.padding;
        div.style.fontSize = computed.fontSize;
        div.style.lineHeight = computed.lineHeight;
        div.style.height = computed.height;
        div.style.display = "flex";
        div.style.alignItems = "center";
        div.style.color = input.value
          ? computed.color
          : computed.color.replace(")", ", 0.5)").replace("rgb(", "rgba(");
        input.parentNode!.insertBefore(div, input);
        input.style.display = "none";
        inputPairs.push({ input, placeholder: div });
      });

      // 3) 标签去省略：Tag 组件带 overflow-hidden + text-ellipsis，截图时宽度偏差会截断文字
      tagEls = Array.from(
          modal.querySelectorAll<HTMLElement>(".rt-Badge")
      );
      tagEls.forEach((el) => {
        el.style.setProperty("overflow", "visible", "important");
        el.style.setProperty("text-overflow", "clip", "important");
        el.style.setProperty("white-space", "nowrap", "important");
      });

      // 4) 样式覆盖 — CSS 用了 !important，必须用 setProperty 才能覆盖
      modal.style.setProperty("background-color", opaqueBg, "important");
      modal.style.setProperty("backdrop-filter", "none", "important");
      modal.style.setProperty("-webkit-backdrop-filter", "none", "important");
      modal.style.setProperty("box-shadow", "none", "important");
      modal.style.setProperty("max-height", "none", "important");
      modal.style.setProperty("overflow", "visible", "important");

      // 子元素不透明背景
      const subBg = isDark ? "#1a1a1a" : "#f5f5f5";
      const subBorder = isDark ? "#333333" : "#e0e0e0";
      semiEls.forEach((el) => {
        el.style.setProperty("background", subBg, "important");
        el.style.setProperty("border-color", subBorder, "important");
      });

      if (headerBtnGroup) headerBtnGroup.style.display = "none";
      if (contentEl) {
        contentEl.style.setProperty("max-height", "none", "important");
        contentEl.style.setProperty("overflow", "visible", "important");
      }

      const canvas = await html2canvas(modal, {
        backgroundColor: opaqueBg,
        scale: 2,
        useCORS: true,
        allowTaint: true,
        scrollY: -window.scrollY,
      });

      // 二次绘制：给截图添加圆角
      const radius = 16 * 2; // 匹配 CSS border-radius: 16px，scale: 2
      const w = canvas.width;
      const h = canvas.height;
      const rounded = document.createElement("canvas");
      rounded.width = w;
      rounded.height = h;
      const rCtx = rounded.getContext("2d")!;
      rCtx.beginPath();
      rCtx.moveTo(radius, 0);
      rCtx.lineTo(w - radius, 0);
      rCtx.quadraticCurveTo(w, 0, w, radius);
      rCtx.lineTo(w, h - radius);
      rCtx.quadraticCurveTo(w, h, w - radius, h);
      rCtx.lineTo(radius, h);
      rCtx.quadraticCurveTo(0, h, 0, h - radius);
      rCtx.lineTo(0, radius);
      rCtx.quadraticCurveTo(0, 0, radius, 0);
      rCtx.closePath();
      rCtx.clip();
      rCtx.drawImage(canvas, 0, 0);

      rounded.toBlob((blob) => {
        if (!blob) {
          toast.error(t("enhanced.trade.exportFail"));
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const safeName = (node.name || "server").replace(/[^\w\u4e00-\u9fff-]/g, "_");
        a.download = `trade-${safeName}-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(t("enhanced.trade.exportSuccess"));
      }, "image/png");
    } catch {
      toast.error(t("enhanced.trade.exportFail"));
    } finally {
      // removeProperty 让 CSS !important 规则重新生效
      modal.style.removeProperty("background-color");
      modal.style.removeProperty("backdrop-filter");
      modal.style.removeProperty("-webkit-backdrop-filter");
      modal.style.removeProperty("box-shadow");
      modal.style.removeProperty("max-height");
      modal.style.removeProperty("overflow");
      semiEls.forEach((el) => {
        el.style.removeProperty("background");
        el.style.removeProperty("border-color");
      });
      if (headerBtnGroup) headerBtnGroup.style.display = origBtnDisplay || "";
      if (contentEl) {
        contentEl.style.removeProperty("max-height");
        contentEl.style.removeProperty("overflow");
      }
      // 恢复 input
      inputPairs.forEach(({ input, placeholder }) => {
        input.style.display = "";
        placeholder.remove();
      });
      // 恢复旗帜：内联 <svg> 换回 <img>
      flagPairs.forEach(({ img, svgEl, parent }) => {
        parent.replaceChild(img, svgEl);
      });
      // 恢复标签省略样式
      tagEls.forEach((el) => {
        el.style.removeProperty("overflow");
        el.style.removeProperty("text-overflow");
        el.style.removeProperty("white-space");
      });
    }
  }, [node.name, t]);

  return (
    <div
      id="server-trade-overlay"
      className={`custom-alert-overlay trade-overlay${isClosing ? " closing" : ""}`}
      style={{
        display: "flex",
        opacity: 1,
        pointerEvents: "none",
        backgroundColor: "transparent",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
      }}
      onClick={handleOverlayClick}>
      <div
        ref={modalRef}
        id="server-trade-modal"
        className={`server-trade-modal${isClosing ? " closing" : ""}`}
        style={{ pointerEvents: "auto" }}
        onAnimationEnd={handleAnimationEnd}>
        <div
          className="bubble-header server-trade-header"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}>
          <h3 className="bubble-title">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            {t("enhanced.trade.title")}
            <span
              className="help-icon show-help"
              data-tooltip={t("enhanced.trade.calcRules")}
              onClick={(e) => {
                e.stopPropagation();
                (e.currentTarget as HTMLElement).classList.toggle("active");
              }}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
          </h3>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <button
              className="bubble-close"
              title={t("enhanced.trade.share")}
              onClick={handleShare}
              style={{ position: "relative" }}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
            <button
              className="bubble-close"
              title={t("enhanced.trade.exportImage")}
              onClick={handleExportImage}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button className="bubble-close" onClick={handleClose}>
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
        </div>

        <div className="bubble-content server-trade-content">
          {/* 服务器信息 */}
          <div className="trade-section">
            <div className="trade-section-title">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              {t("enhanced.trade.serverInfo")}
            </div>
            <div className="server-info-grid">
              <div className="server-info-row">
                <span className="info-label">{t("enhanced.trade.region")}</span>
                <span className="info-value">
                  <img
                    src={`/assets/flags/${regionCode}.svg`}
                    style={{ width: 20, height: "auto" }}
                    alt={regionCode}
                  />
                </span>
              </div>
              <div className="server-info-row">
                <span className="info-label">{t("enhanced.trade.name")}</span>
                <span className="info-value">{node.name}</span>
              </div>
              <div className="server-info-row">
                <span className="info-label">{t("enhanced.trade.cpu")}</span>
                <span className="info-value">
                  {node.cpu_name || t("enhanced.trade.unknown")}
                </span>
              </div>
              <div className="server-info-row">
                <span className="info-label">{t("enhanced.trade.cores")}</span>
                <span className="info-value">
                  {node.cpu_cores ? t("enhanced.trade.coresUnit", { count: node.cpu_cores }) : t("enhanced.trade.unknown")}
                </span>
              </div>
              <div className="server-info-row">
                <span className="info-label">{t("enhanced.trade.arch")}</span>
                <span className="info-value">{node.arch || t("enhanced.trade.unknown")}</span>
              </div>
              <div className="server-info-row">
                <span className="info-label">{t("enhanced.trade.virtualization")}</span>
                <span className="info-value">
                  {node.virtualization || t("enhanced.trade.unknown")}
                </span>
              </div>
              {node.gpu_name && node.gpu_name !== "None" && (
                <div className="server-info-row">
                  <span className="info-label">{t("enhanced.trade.gpu")}</span>
                  <span className="info-value">{node.gpu_name}</span>
                </div>
              )}
              <div className="server-info-row">
                <span className="info-label">{t("enhanced.trade.memory")}</span>
                <span className="info-value">
                  {node.mem_total ? formatBytes(node.mem_total) : t("enhanced.trade.unknown")}
                </span>
              </div>
              <div className="server-info-row">
                <span className="info-label">{t("enhanced.trade.disk")}</span>
                <span className="info-value">
                  {node.disk_total ? formatBytes(node.disk_total) : t("enhanced.trade.unknown")}
                </span>
              </div>
              <div className="server-info-row">
                <span className="info-label">{t("enhanced.trade.traffic")}</span>
                <span className="info-value">
                  {node.traffic_limit
                    ? formatTraffic(node.traffic_limit, t)
                    : t("enhanced.trade.unknown")}
                </span>
              </div>
              <div className="server-info-row">
                <span className="info-label">{t("enhanced.trade.originalPrice")}</span>
                <span className="info-value">
                  {CURRENCY_SYMBOLS[normalizeCurrencyToCode(node.currency || "¥")] || node.currency || "¥"}{" "}
                  {node.price === -1 ? t("enhanced.trade.free") : node.price}
                </span>
              </div>
              <div className="server-info-row">
                <span className="info-label">{t("enhanced.trade.cycle")}</span>
                <span className="info-value">
                  {getBillingCycleText(node.billing_cycle, t)}
                </span>
              </div>
              <div className="server-info-row">
                <span className="info-label">{t("enhanced.trade.expiryTime")}</span>
                <span className="info-value">{expiredText}</span>
              </div>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="trade-tags-container">
                <span className="trade-tags-label">{t("enhanced.trade.tags")}</span>
                <Tag tags={tags} />
              </div>
            )}

            {/* Remarks */}
            {remarks.length > 0 && (
              <div className="trade-remark-container">
                <span className="trade-remark-label">{t("enhanced.trade.remarks")}</span>
                <Tag tags={remarks} />
              </div>
            )}
          </div>

          <div className="finance-separator" />

          {/* 交易计算 */}
          <div className="trade-section">
            <div className="trade-section-title">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                <path d="M12 18V6" />
              </svg>
              {t("enhanced.trade.tradeCalc")}
            </div>

            <div className="trade-input-group">
              <label className="trade-label">{t("enhanced.trade.tradeDate")}</label>
              <input
                type="date"
                className="trade-input"
                value={tradeDate}
                onChange={(e) => setTradeDate(e.target.value)}
              />
            </div>

            <div className="trade-input-group">
              <label className="trade-label">{t("enhanced.trade.tradeAmount")}</label>
              <input
                type="number"
                className="trade-input"
                placeholder={t("enhanced.trade.tradeAmountPlaceholder")}
                step="0.01"
                min="0"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
              />
            </div>

            <div className="trade-result-box">
              <div className="trade-result-row">
                <span>{t("enhanced.trade.remainValue")}</span>
                <span className="trade-result-value">
                  {sym} {displayRemainValue.toFixed(2)}
                </span>
              </div>
              <div className="trade-result-row">
                <span>{t("enhanced.trade.premiumAmount")}</span>
                <span
                  className={`trade-result-value premium${
                    hasAmount && premium <= 0 ? " positive" : ""
                  }`}>
                  {hasAmount
                    ? `${sym} ${premium.toFixed(2)}`
                    : "-"}
                </span>
              </div>
              <div className="trade-result-row">
                <span>{t("enhanced.trade.premiumRate")}</span>
                <span
                  className={`trade-result-value premium${
                    hasAmount && premium <= 0 ? " positive" : ""
                  }`}>
                  {hasAmount
                    ? `${premiumRate > 0 ? "+" : ""}${premiumRate.toFixed(2)}%`
                    : "-"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
