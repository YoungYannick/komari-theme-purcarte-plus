import { Badge } from "@radix-ui/themes";
import React, { useState, useRef, useLayoutEffect } from "react";
import { cn } from "@/utils";
import { useAppConfig } from "@/config";
import { allColors } from "@/config/default";
import type { ColorType } from "@/config/default";
import Tips from "./tips";

interface TagProps extends React.HTMLAttributes<HTMLDivElement> {
  tags: string[];
  getTagInteraction?: (context: {
    tag: string;
    text: string;
    index: number;
    badgeColor: ColorType;
    enableTransparentTags: boolean;
  }) =>
    | {
        ref?: (element: HTMLElement | null) => void;
        className?: string;
      }
    | undefined;
}

// 解析带颜色的标签
const parseTagWithColor = (tag: string) => {
  const colorMatch = tag.match(/<(\w+)>$/);
  if (colorMatch && colorMatch) {
    const color = colorMatch[1].toLowerCase();
    const text = tag.replace(/<\w+>$/, "");
    // 检查颜色是否在完整的颜色列表中
    if (allColors.includes(color as ColorType)) {
      return { text, color: color as ColorType };
    }
  }
  return { text: tag, color: null as unknown as ColorType | null };
};

interface TagItemProps {
  tag: string;
  badgeColor: ColorType;
  enableTransparentTags: boolean;
  interaction?: {
    ref?: (element: HTMLElement | null) => void;
    className?: string;
  };
}

const TagItem: React.FC<TagItemProps> = ({
  tag,
  badgeColor,
  enableTransparentTags,
  interaction,
}) => {
  const [isOverflow, setIsOverflow] = useState(false);
  const tagRef = useRef<HTMLElement | null>(null);
  const { text } = parseTagWithColor(tag);
  const setTagElement = (element: HTMLElement | null) => {
    tagRef.current = element;
    interaction?.ref?.(element);
  };

  useLayoutEffect(() => {
    const element = tagRef.current;
    if (element && element.scrollWidth > element.clientWidth) {
      setIsOverflow(true);
    }
  }, [text]);

  const tagContent = !enableTransparentTags ? (
    <Badge
      ref={setTagElement}
      color={badgeColor}
      variant="surface"
      className={cn(
        "text-sm !block !flex-shrink overflow-hidden !text-ellipsis",
        interaction?.className
      )}>
      <label className="text-xs">{text}</label>
    </Badge>
  ) : (
    <div
      ref={setTagElement}
      data-accent-color={badgeColor}
      className={cn(
        "rt-reset rt-Badge rt-r-size-1 !text-xs transition-colors rt-Badge-tag-transparent !block !flex-shrink overflow-hidden text-ellipsis",
        interaction?.className
      )}>
      {text}
    </div>
  );

  if (isOverflow) {
    return (
      <Tips className="w-full" mode="popup" side="top" trigger={tagContent}>
        {text}
      </Tips>
    );
  }

  return tagContent;
};

const Tag = React.forwardRef<HTMLDivElement, TagProps>(
  ({ className, tags, getTagInteraction, ...props }, ref) => {
    const { enableTransparentTags, tagDefaultColorList } = useAppConfig();

    const colorList = React.useMemo(() => {
      return tagDefaultColorList
        .split(",")
        .map((color: string) => color.trim()) as ColorType[];
    }, [tagDefaultColorList]);

    return (
      <div
        ref={ref}
        className={cn("flex flex-wrap gap-1 w-full", className)}
        {...props}>
        {tags.map((tag, index) => {
          const { text, color } = parseTagWithColor(tag);
          const badgeColor = color || colorList[index % colorList.length];
          const interaction = getTagInteraction?.({
            tag,
            text,
            index,
            badgeColor,
            enableTransparentTags,
          });
          return (
            <TagItem
              key={index}
              tag={tag}
              badgeColor={badgeColor}
              enableTransparentTags={enableTransparentTags}
              interaction={interaction}
            />
          );
        })}
      </div>
    );
  }
);

Tag.displayName = "Tag";

export { Tag };
