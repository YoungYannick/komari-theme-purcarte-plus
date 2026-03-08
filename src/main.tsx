import { StrictMode, useEffect, useRef, useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import "./index.css";
import "@radix-ui/themes/styles.css";
import "@/i18n/config";
import { Theme } from "@radix-ui/themes";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Header } from "@/components/sections/Header";
import { ConfigProvider, useAppConfig } from "@/config";
import { DynamicContent } from "@/components/DynamicContent";
import { useThemeManager, useTheme } from "@/hooks/useTheme";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { NodeDataProvider } from "@/contexts/NodeDataContext";
import { LiveDataProvider } from "@/contexts/LiveDataContext";
import Footer from "@/components/sections/Footer";
import Loading from "./components/loading";
import type { StatsBarProps } from "./components/sections/StatsBar";
import { useNodeListCommons } from "@/hooks/useNodeCommons";
import SettingsPanel from "./components/settings/SettingsPanel";
import { useIsMobile } from "./hooks/useMobile";
import type { SiteStatus } from "./config/default";
import { Toaster } from "@/components/ui/sonner";
import {
  EnhancedFeatures,
  EnhancedFeaturesPrivate,
} from "@/components/enhanced/EnhancedFeatures";
import { useAdvancedSearch } from "@/hooks/useAdvancedSearch";
import { AdvancedSearchModal } from "@/components/enhanced/AdvancedSearchModal";
import type { AdvancedSearchState } from "@/types/advancedSearch";
const HomePage = lazy(() => import("@/pages/Home"));
const InstancePage = lazy(() => import("@/pages/instance"));
const PingOverviewPage = lazy(() => import("@/pages/PingOverview"));
const NotFoundPage = lazy(() => import("@/pages/NotFound"));
const PrivatePage = lazy(() => import("@/pages/Private"));

const homeScrollState = {
  position: 0,
};

const AppRoutes = ({
  searchTerm,
  setSearchTerm,
  isSettingsOpen,
  setIsSettingsOpen,
  headerRef,
  headerHeight,
  footerHeight,
  advancedSearchState,
  enableAdvancedSearch,
  isAdvancedSearchActive,
  onOpenAdvancedSearch,
  onClearAdvancedSearch,
}: {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (isOpen: boolean) => void;
  headerRef: React.RefObject<HTMLElement | null>;
  headerHeight: number;
  footerHeight: number;
  advancedSearchState: AdvancedSearchState | null;
  enableAdvancedSearch: boolean;
  isAdvancedSearchActive: boolean;
  onOpenAdvancedSearch: () => void;
  onClearAdvancedSearch: () => void;
}) => {
  const location = useLocation();
  const {
    loading,
    groups,
    filteredNodes,
    stats,
    selectedGroup,
    setSelectedGroup,
    handleSort,
  } = useNodeListCommons(searchTerm, advancedSearchState);
  const { statusCardsVisibility, setStatusCardsVisibility } = useTheme();
  const { enableGroupedBar, selectedHeaderStyle, selectedFooterStyle, enablePingOverview } =
    useAppConfig();

  const statsBarProps: StatsBarProps = {
    displayOptions: statusCardsVisibility,
    setDisplayOptions: setStatusCardsVisibility,
    stats,
    loading,
    enableGroupedBar,
    groups,
    selectedGroup,
    onSelectGroup: setSelectedGroup,
    onSort: handleSort,
  };

  const homeViewportRef = useRef<HTMLDivElement | null>(null);
  const instanceViewportRef = useRef<HTMLDivElement | null>(null);

  const handleHomeScroll = () => {
    if (location.pathname === "/" && homeViewportRef.current) {
      homeScrollState.position = homeViewportRef.current.scrollTop;
    }
  };

  useEffect(() => {
    if (location.pathname === "/") {
      const timer = setTimeout(() => {
        if (homeViewportRef.current) {
          homeViewportRef.current.scrollTop = homeScrollState.position;
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!location.pathname.startsWith("/instance")) return;
    const frame = requestAnimationFrame(() => {
      instanceViewportRef.current?.scrollTo({ top: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname]);

  return (
    <>
      <Header
        ref={headerRef}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        setIsSettingsOpen={setIsSettingsOpen}
        isSettingsOpen={isSettingsOpen}
        enableAdvancedSearch={enableAdvancedSearch}
        isAdvancedSearchActive={isAdvancedSearchActive}
        onOpenAdvancedSearch={onOpenAdvancedSearch}
        {...statsBarProps}
      />
      <div className="flex-1 min-h-0">
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route
              path="/"
              element={
                <ScrollArea
                  className="h-full"
                  viewportRef={homeViewportRef}
                  viewportProps={{ onScroll: handleHomeScroll }}>
                  <div className="flex flex-col min-h-screen">
                    <main
                      className="w-(--main-width) max-w-screen-2xl mx-auto h-full flex-grow"
                      style={{
                        paddingTop:
                          selectedHeaderStyle === "levitation"
                            ? headerHeight
                            : 0,
                        paddingBottom:
                          selectedFooterStyle === "levitation"
                            ? footerHeight
                            : 0,
                      }}>
                      <HomePage
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        filteredNodes={filteredNodes}
                        selectedGroup={selectedGroup}
                        setSelectedGroup={setSelectedGroup}
                        stats={stats}
                        groups={groups}
                        handleSort={handleSort}
                        isAdvancedSearchActive={isAdvancedSearchActive}
                        onClearAdvancedSearch={onClearAdvancedSearch}
                      />
                    </main>
                    {selectedFooterStyle === "followContent" && (
                      <Footer isSettingsOpen={isSettingsOpen} ref={null} />
                    )}
                  </div>
                </ScrollArea>
              }
            />
            <Route
              path="/instance/:uuid"
              element={
                <ScrollArea
                  className="h-full"
                  viewportRef={instanceViewportRef}>
                  <div className="flex flex-col min-h-screen">
                    <main
                      className="w-(--main-width) max-w-screen-2xl h-full mx-auto flex-1"
                      style={{
                        paddingTop:
                          selectedHeaderStyle === "levitation"
                            ? headerHeight
                            : 0,
                        paddingBottom:
                          selectedFooterStyle === "levitation"
                            ? footerHeight
                            : 0,
                      }}>
                      <InstancePage />
                    </main>
                    {selectedFooterStyle === "followContent" && (
                      <Footer isSettingsOpen={isSettingsOpen} ref={null} />
                    )}
                  </div>
                </ScrollArea>
              }
            />
            {enablePingOverview && (
            <Route
              path="/ping-overview"
              element={
                <ScrollArea className="h-full">
                  <div className="flex flex-col min-h-screen">
                    <main
                      className="w-(--main-width) max-w-screen-2xl h-full mx-auto flex-1"
                      style={{
                        paddingTop:
                          selectedHeaderStyle === "levitation"
                            ? headerHeight
                            : 0,
                        paddingBottom:
                          selectedFooterStyle === "levitation"
                            ? footerHeight
                            : 0,
                      }}>
                      <PingOverviewPage />
                    </main>
                    {selectedFooterStyle === "followContent" && (
                      <Footer isSettingsOpen={isSettingsOpen} ref={null} />
                    )}
                  </div>
                </ScrollArea>
              }
            />
            )}
            <Route
              path="*"
              element={
                <div className="flex flex-col min-h-screen">
                  <main className="w-(--main-width) max-w-screen-2xl h-full mx-auto flex-1">
                    <NotFoundPage />
                  </main>
                  {selectedFooterStyle === "followContent" && (
                    <Footer isSettingsOpen={isSettingsOpen} ref={null} />
                  )}
                </div>
              }
            />
          </Routes>
        </Suspense>
      </div>
    </>
  );
};

export const AppContent = () => {
  const { siteStatus, mainWidth, selectedFooterStyle, enableAdvancedSearch } = useAppConfig();
  const { appearance, color } = useTheme();
  const [searchTerm, setSearchTerm] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const isMobile = useIsMobile();
  const footerRef = useRef<HTMLElement | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  // 高级搜索 hook（必须无条件调用，遵循 React hooks 规则）
  const advancedSearch = useAdvancedSearch();
  const isAuthenticated =
    siteStatus === "authenticated" || siteStatus === "private-authenticated";

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const resizeObserver = new ResizeObserver(() => {
      setHeaderHeight(header.offsetHeight);
    });

    resizeObserver.observe(header);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;

    const resizeObserver = new ResizeObserver(() => {
      const h = footer.offsetHeight;
      setFooterHeight(h);
      document.documentElement.style.setProperty("--footer-height", `${h}px`);
    });

    resizeObserver.observe(footer);

    return () => {
      resizeObserver.disconnect();
      document.documentElement.style.setProperty("--footer-height", "0px");
    };
  }, []);

  useEffect(() => {
    if (isSettingsOpen && !isMobile) {
      document.documentElement.style.setProperty(
        "--main-width",
        `calc(${mainWidth}vw - var(--setting-width))`
      );
    } else {
      document.documentElement.style.setProperty(
        "--main-width",
        `${mainWidth}vw`
      );
    }
  }, [isSettingsOpen, isMobile, mainWidth]);

  return (
    <Theme
      appearance={appearance}
      accentColor={color}
      scaling="110%"
      style={{ backgroundColor: "transparent" }}>
      <Toaster />
      <DynamicContent>
        <div
          className={`main-content-layer grid h-dvh transition-all duration-300 ${
            isSettingsOpen && !isMobile
              ? "grid-cols-[1fr_auto]"
              : "grid-cols-[1fr]"
          } overflow-hidden`}>
          <div className="flex flex-col text-sm flex-1 overflow-hidden">
            {siteStatus === "private-unauthenticated" ? (
              <>
                <Header
                  isPrivate={true}
                  setIsSettingsOpen={setIsSettingsOpen}
                />
                <Suspense fallback={<Loading />}>
                  <div className="flex flex-col min-h-screen">
                    <main className="w-(--main-width) max-w-screen-2xl h-full mx-auto flex-1">
                      <PrivatePage />
                    </main>
                    {selectedFooterStyle === "followContent" && (
                      <Footer isSettingsOpen={isSettingsOpen} ref={null} />
                    )}
                  </div>
                </Suspense>
              </>
            ) : (
              <AppRoutes
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                isSettingsOpen={isSettingsOpen}
                setIsSettingsOpen={setIsSettingsOpen}
                headerRef={headerRef}
                headerHeight={headerHeight}
                footerHeight={footerHeight}
                advancedSearchState={
                  enableAdvancedSearch && advancedSearch.isSearchApplied
                    ? advancedSearch.confirmedState
                    : null
                }
                enableAdvancedSearch={enableAdvancedSearch}
                isAdvancedSearchActive={
                  enableAdvancedSearch && advancedSearch.isSearchApplied
                }
                onOpenAdvancedSearch={() => advancedSearch.setIsModalOpen(true)}
                onClearAdvancedSearch={() => advancedSearch.resetSearch()}
              />
            )}
            {selectedFooterStyle !== "followContent" &&
              selectedFooterStyle !== "hidden" && (
                <Footer ref={footerRef} isSettingsOpen={isSettingsOpen} />
              )}
          </div>
          <SettingsPanel
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
          />
        </div>
        {siteStatus === "private-unauthenticated" ? (
          <EnhancedFeaturesPrivate />
        ) : (
          <EnhancedFeatures />
        )}
        {/* 高级搜索模态框 */}
        {enableAdvancedSearch && advancedSearch.isModalOpen && (
          <AdvancedSearchModal
            state={advancedSearch.state}
            setState={advancedSearch.setState}
            onSearch={advancedSearch.executeSearch}
            onReset={advancedSearch.resetSearch}
            onClose={() => advancedSearch.setIsModalOpen(false)}
            isAuthenticated={isAuthenticated}
            validationErrors={advancedSearch.validationErrors}
            setValidationErrors={advancedSearch.setValidationErrors}
          />
        )}
      </DynamicContent>
    </Theme>
  );
};

const AppProviders = ({
  siteStatus,
  children,
}: {
  siteStatus: SiteStatus;
  children: React.ReactNode;
}) => {
  if (siteStatus === "private-unauthenticated") {
    return <>{children}</>;
  }
  return (
    <NodeDataProvider>
      <LiveDataProvider>{children}</LiveDataProvider>
    </NodeDataProvider>
  );
};

const App = () => {
  const themeManager = useThemeManager();
  const { siteStatus } = useAppConfig();

  return (
    <ThemeProvider value={themeManager}>
      <AppProviders siteStatus={siteStatus}>
        <AppContent />
      </AppProviders>
    </ThemeProvider>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider>
      <Router>
        <App />
      </Router>
    </ConfigProvider>
  </StrictMode>
);
