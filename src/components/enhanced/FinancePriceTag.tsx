import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { NodeData } from "@/types/node";
import { useAppConfig, useLocale } from "@/config/hooks";
import {
  calculateRemainValueForDate,
  getBillingCycleText,
  parsePriceToBase,
} from "./financeUtils";
import { CURRENCY_SYMBOLS, useExchangeRates } from "./useExchangeRates";

interface FinancePriceTagProps {
  node: NodeData;
  triggerElement: HTMLElement | null;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const getTodayInShanghai = () => {
  const now = new Date();
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return `${utc8.getUTCFullYear()}-${String(utc8.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(utc8.getUTCDate()).padStart(2, "0")}`;
};

export function FinancePriceTag(props: FinancePriceTagProps) {
  const { enableFinanceWidget } = useAppConfig();

  if (!enableFinanceWidget) return null;

  return <FinancePriceTooltip {...props} />;
}

function FinancePriceTooltip({
  node,
  triggerElement,
}: FinancePriceTagProps) {
  const { t, i18n } = useLocale();
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [userCurrency, setUserCurrency] = useState(
    () => localStorage.getItem("fin_currency") || "CNY"
  );
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const isOpen = isHovered || isPinned;
  const portalRoot =
    triggerElement?.closest(".radix-themes") ||
    document.querySelector(".radix-themes") ||
    document.body;
  const { rates } = useExchangeRates(userCurrency);
  const sym = CURRENCY_SYMBOLS[userCurrency] || userCurrency;
  const { price: billingAmount, isSpecialFree } = parsePriceToBase(node, rates);
  const remainingValue = calculateRemainValueForDate(
    node,
    rates,
    getTodayInShanghai()
  );

  const updatePosition = useCallback(() => {
    const tooltip = tooltipRef.current;
    if (!triggerElement || !tooltip) return;

    const rect = triggerElement.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const gap = 8;
    const margin = 8;
    const left = clamp(
      rect.left + rect.width / 2 - tooltipRect.width / 2,
      margin,
      window.innerWidth - tooltipRect.width - margin
    );
    const top = clamp(
      rect.bottom + gap,
      margin,
      window.innerHeight - tooltipRect.height - margin
    );

    setPosition({ top, left });
  }, [triggerElement]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const frame = requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition, userCurrency, rates]);

  useEffect(() => {
    const handleCurrencyChange = (event: Event) => {
      const next =
        (event as CustomEvent<string>).detail ||
        localStorage.getItem("fin_currency") ||
        "CNY";
      setUserCurrency(next);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "fin_currency") {
        setUserCurrency(event.newValue || "CNY");
      }
    };

    window.addEventListener("finance-currency-change", handleCurrencyChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(
        "finance-currency-change",
        handleCurrencyChange
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!isPinned) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerElement?.contains(target) ||
        tooltipRef.current?.contains(target)
      ) {
        return;
      }
      setIsPinned(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isPinned, triggerElement]);

  useEffect(() => {
    if (!triggerElement) return;

    const handleMouseEnter = () => setIsHovered(true);
    const handleMouseLeave = () => setIsHovered(false);
    const handleClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsPinned((current) => !current);
    };

    triggerElement.addEventListener("mouseenter", handleMouseEnter);
    triggerElement.addEventListener("mouseleave", handleMouseLeave);
    triggerElement.addEventListener("click", handleClick);
    triggerElement.setAttribute("aria-expanded", String(isOpen));

    return () => {
      triggerElement.removeEventListener("mouseenter", handleMouseEnter);
      triggerElement.removeEventListener("mouseleave", handleMouseLeave);
      triggerElement.removeEventListener("click", handleClick);
      triggerElement.removeAttribute("aria-expanded");
    };
  }, [triggerElement, isOpen]);

  const formatMoney = (value: number) => `${sym} ${value.toFixed(2)}`;
  const billingAmountText = isSpecialFree
    ? t("enhanced.trade.free")
    : formatMoney(billingAmount);
  const billingCycleText = getBillingCycleText(node.billing_cycle, t);
  const remainingValueText = formatMoney(remainingValue);
  const expiryText = (() => {
    if (!node.expired_at) return t("node.notSet");
    const expiryDate = new Date(node.expired_at);
    if (Number.isNaN(expiryDate.getTime())) return t("node.notSet");
    const dateText = expiryDate.toLocaleDateString(i18n.language, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Shanghai",
    });
    const diffDays = Math.ceil(
      (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays > 0) {
      return `${dateText} ${t("enhanced.trade.remainingDays", {
        days: diffDays,
      })}`;
    }
    if (diffDays === 0) {
      return `${dateText} ${t("enhanced.trade.expiresToday")}`;
    }
    return `${dateText} ${t("enhanced.trade.expiredDays", {
      days: Math.abs(diffDays),
    })}`;
  })();

  const openTradeModal = () => {
    setIsPinned(false);
    setIsHovered(false);
    window.dispatchEvent(
      new CustomEvent("open-server-trade-modal", {
        detail: { uuid: node.uuid },
      })
    );
  };

  return (
    <>
      {isOpen &&
        createPortal(
          <div
            ref={tooltipRef}
            className="finance-price-tooltip"
            style={{
              top: position.top,
              left: position.left,
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={(event) => event.stopPropagation()}>
            <div className="bubble-header finance-price-tooltip-header">
              <div className="bubble-title finance-price-tooltip-title">
                {node.name}
              </div>
              <button
                type="button"
                className="bubble-close"
                title={t("enhanced.trade.title")}
                aria-label={t("enhanced.trade.title")}
                onClick={openTradeModal}>
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
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </button>
            </div>
            <div className="finance-row finance-price-tooltip-row">
              <span>{t("enhanced.finance.priceTooltipExpiry")}</span>
              <span className="finance-value">{expiryText}</span>
            </div>
            <div className="finance-row finance-price-tooltip-row">
              <span>{t("enhanced.finance.priceTooltipBillingAmount")}</span>
              <span className="finance-value">{billingAmountText}</span>
            </div>
            <div className="finance-row finance-price-tooltip-row">
              <span>{t("enhanced.finance.priceTooltipBillingCycle")}</span>
              <span className="finance-value">{billingCycleText}</span>
            </div>
            <div className="finance-row finance-price-tooltip-row">
              <span>{t("enhanced.finance.priceTooltipRemainingValue")}</span>
              <span className="finance-value">{remainingValueText}</span>
            </div>
          </div>,
          portalRoot
        )}
    </>
  );
}
