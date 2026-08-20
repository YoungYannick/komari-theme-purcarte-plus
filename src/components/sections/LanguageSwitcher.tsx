import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { resources } from "@/i18n/config";
import { useAppConfig } from "@/config";

// 仅显示配置了 name 字段的语言
const availableLanguages = Object.entries(resources)
  .filter(
    ([, res]) =>
      res && typeof res === "object" && "name" in res && typeof (res as any).name === "string"
  )
  .map(([code, res]) => ({
    code,
    name: (res as { name: string }).name,
  }))
  .sort((a, b) => a.code.localeCompare(b.code));

const LanguageMenuItems = ({
  currentLang,
  changeLanguage,
}: {
  currentLang: string;
  changeLanguage: (lang: string) => void;
}) => (
  <>
    {availableLanguages.map(({ code, name }) => (
      <DropdownMenuItem
        key={code}
        onClick={() => changeLanguage(code)}
        className={currentLang === code ? "bg-(--accent-a5)" : ""}>
        <span>{name}</span>
      </DropdownMenuItem>
    ))}
  </>
);

export const LanguageSwitcher = ({ isMobile }: { isMobile?: boolean }) => {
  const { i18n } = useTranslation();
  const { enableLanguageSwitcher } = useAppConfig();

  if (!enableLanguageSwitcher) return null;

  if (isMobile) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Languages className="size-4 mr-2 text-primary" />
          <span>
            {availableLanguages.find((l) => l.code === i18n.language)?.name ||
              "Language"}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="purcarte-blur border-(--gray-a5) rounded-xl">
          <LanguageMenuItems
            currentLang={i18n.language}
            changeLanguage={(lang) => i18n.changeLanguage(lang)}
          />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Languages className="size-5 text-primary" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="purcarte-blur mt-[.5rem] border-(--gray-a5) rounded-xl">
        <LanguageMenuItems
          currentLang={i18n.language}
          changeLanguage={(lang) => i18n.changeLanguage(lang)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
