// 配置类型定义
export interface ConfigOptions {
  isShowConfigEditButtonInLogined: boolean; // 是否在登录时显示配置编辑按钮
  mainWidth: number; // 主内容宽度百分比
  backgroundImage: string; // 桌面端背景图片URL
  backgroundImageMobile: string; // 移动端背景图片URL
  backgroundMode: BackgroundMode; // 背景模式：纯色/图片/视频
  solidColorBackground: string; // 纯色背景颜色值（支持 rgb/rgba/hex/颜色单词）
  videoBackgroundUrl: string; // 桌面端视频背景URL
  videoBackgroundUrlMobile: string; // 移动端视频背景URL
  backgroundAlignment: string; // 背景对齐方式
  blurValue: number; // 磨砂玻璃模糊值
  blurBackgroundColor: string; // 磨砂玻璃背景颜色
  enableTransparentTags: boolean; // 是否启用标签透明背景
  tagDefaultColorList: string; // 标签默认颜色列表
  selectThemeColor: ColorType; // 默认主题颜色
  enableLocalStorage: boolean; // 是否启用本地存储
  selectedDefaultView: ViewModeType; // 默认视图模式
  selectedDefaultAppearance: AppearanceType; // 默认外观模式
  statusCardsVisibility: string; // 状态卡片显示控制
  selectedHeaderStyle: HeaderStyle; // 标题栏样式
  enableLogo: boolean; // 是否启用Logo
  logoUrl: string; // Logo图片URL
  enableTitle: boolean; // 是否启用标题
  titleText: string; // 标题文本
  enableSearchButton: boolean; // 是否启用搜索按钮
  enableAdvancedSearch: boolean; // 是否启用高级搜索
  enableAdminButton: boolean; // 是否启用管理员按钮
  selectedFooterStyle: FooterStyle; // 页脚样式
  hideFooterOriginal: boolean; // 是否隐藏底栏原始内容（Powered by...）
  enableServerUptime: boolean; // 是否启用服务器运行时间显示
  serverStartTime: string; // 服务器启动时间（UTC+8），格式: "年,月,日,时,分,秒"
  serverUptimeTemplate: string; // 运行时间显示模板
  footerCustomContent: string; // 底栏自定义内容（换行分割多行，支持markdown链接和图片）
  enableJsonRPC2Api: boolean; // 是否启用 JSON-RPC2 API 适配
  isShowStatsInHeader: boolean; // 是否在标题栏中显示统计信息
  mergeGroupsWithStats: boolean; // 是否在统计栏中合并分组
  enableStatsBar: boolean; // 是否启用统计栏
  enableSortControl: boolean; // 是否启用排序控制
  isOfflineNodesBehind: boolean; // 是否启用离线节点置后显示
  enableGroupedBar: boolean; // 是否启用分组栏
  defaultSelectedGroup: string; // 默认选择展示分组
  selectMobileDefaultView: ViewModeType; // 移动端默认展示视图
  enableSwap: boolean; // 是否启用SWAP显示
  pingChartTimeInPreview: number; // 预览详情的延迟图表时间范围，单位为小时
  enableInstanceDetail: boolean; // 是否启用实例详情
  enablePingChart: boolean; // 是否启用延迟图表
  enableCutPeak: boolean; // 是否启用平滑
  enableConnectBreaks: boolean; // 是否启用连接断点
  pingChartMaxPoints: number; // 延迟图表最大点数
  monitorNodeSortMode: MonitorNodeSortMode; // 监测节点排序方式
  monitorNodeCustomOrder: string; // 监测节点自定义排序（换行分割名称）
  isShowHWBarInCard: boolean; // 是否在卡片中显示硬件信息栏
  isShowValueUnderProgressBar: boolean; // 是否在流量进度条下方显示数值
  selectTrafficProgressStyle: "circular" | "linear"; // 流量进度条样式
  enableListItemProgressBar: boolean; // 是否启用列表视图进度条
  gridExpiredAtDisplay: DisplayMode; // 网格视图到期时间显示模式
  gridUptimeDisplay: DisplayMode; // 网格视图在线时间显示模式
  tableExpiredAtDisplay: DisplayMode; // 表格视图到期时间显示模式
  tableUptimeDisplay: DisplayMode; // 表格视图在线时间显示模式
  compactExpiredAtDisplay: DisplayMode; // 紧凑视图到期时间显示模式
  compactUptimeDisplay: DisplayMode; // 紧凑视图在线时间显示模式
  customTexts: string; // 自定义UI文本
  // 增强功能开关
  enableWelcomeBubble: boolean; // 是否启用欢迎气泡
  enableFinanceWidget: boolean; // 是否启用资产统计
  enableEarthGlobe: boolean; // 是否启用地球组件
  enableScrollHelpers: boolean; // 是否启用滚动辅助按钮
  enableProtection: boolean; // 是否启用自定义警告保护
  // 欢迎气泡配置
  welcomeBubbleSiteName: string; // 欢迎气泡站点名称
  welcomeBubbleLogoUrl: string; // 欢迎气泡Logo图片URL
  // 地球组件配置
  earthLightBgImage: string; // 地球组件亮色模式背景图
  earthDarkBgImage: string; // 地球组件暗色模式背景图
  earthLightGlobeImage: string; // 地球组件亮色模式地球贴图
  earthDarkGlobeImage: string; // 地球组件暗色模式地球贴图
  enableSoloPlay: boolean; // 是否启用伪点亮全球效果
}

// 默认配置值
export const DEFAULT_CONFIG: ConfigOptions = {
  isShowConfigEditButtonInLogined: false,
  mainWidth: 85,
  backgroundImage: "/assets/default-background-image.jpg",
  backgroundImageMobile: "",
  backgroundMode: "image",
  solidColorBackground: "",
  videoBackgroundUrl: "/assets/LanternRivers_1080p15fps2Mbps3s.mp4",
  videoBackgroundUrlMobile: "",
  backgroundAlignment: "cover,top",
  blurValue: 5,
  blurBackgroundColor: "rgba(255, 255, 255, 0.5)|rgba(0, 0, 0, 0.5)",
  enableTransparentTags: true,
  tagDefaultColorList:
    "lime,cyan,pink,crimson,iris,violet,plum,indigo,blue,jade,mint,grass,teal,sky,red,ruby,tomato,orange,amber,yellow,green,purple,gold,bronze,brown,gray,mauve,slate",
  selectThemeColor: "violet",
  enableLocalStorage: true,
  selectedDefaultView: "grid",
  selectedDefaultAppearance: "system",
  statusCardsVisibility:
    "currentTime:true,currentOnline:true,regionOverview:true,trafficOverview:true,networkSpeed:true",
  selectedHeaderStyle: "fixed",
  enableLogo: true,
  logoUrl: "/assets/logo.png",
  enableTitle: true,
  titleText: "",
  enableSearchButton: true,
  enableAdvancedSearch: true,
  enableAdminButton: true,
  selectedFooterStyle: "followContent",
  hideFooterOriginal: false,
  enableServerUptime: false,
  serverStartTime: "",
  serverUptimeTemplate: "已不稳定运行 {days} 天 {hours} 小时 {minutes} 分钟 {seconds} 秒",
  footerCustomContent: "",
  enableJsonRPC2Api: false,
  isShowStatsInHeader: false,
  mergeGroupsWithStats: false,
  enableStatsBar: true,
  enableSortControl: true,
  isOfflineNodesBehind: false,
  enableGroupedBar: true,
  defaultSelectedGroup: "",
  selectMobileDefaultView: "grid",
  enableSwap: true,
  pingChartTimeInPreview: 1,
  enableInstanceDetail: true,
  enablePingChart: true,
  enableCutPeak: true,
  enableConnectBreaks: false,
  pingChartMaxPoints: 0,
  monitorNodeSortMode: "id_asc",
  monitorNodeCustomOrder: "",
  isShowHWBarInCard: true,
  isShowValueUnderProgressBar: true,
  selectTrafficProgressStyle: "circular",
  enableListItemProgressBar: true,
  gridExpiredAtDisplay: "hideUnset",
  gridUptimeDisplay: "hideUnset",
  tableExpiredAtDisplay: "hideUnset",
  tableUptimeDisplay: "hideUnset",
  compactExpiredAtDisplay: "hideUnset",
  compactUptimeDisplay: "hideUnset",
  customTexts: "",
  // 增强功能开关
  enableWelcomeBubble: true,
  enableFinanceWidget: true,
  enableEarthGlobe: true,
  enableScrollHelpers: true,
  enableProtection: true,
  // 欢迎气泡配置
  welcomeBubbleSiteName: "阿米诺斯",
  welcomeBubbleLogoUrl: "/assets/logo.png",
  // 地球组件配置
  earthLightBgImage: "",
  earthDarkBgImage: "//upload.wikimedia.org/wikipedia/commons/6/60/ESO_-_Milky_Way.jpg",
  earthLightGlobeImage: "//upload.wikimedia.org/wikipedia/commons/0/04/Solarsystemscope_texture_8k_earth_daymap.jpg",
  earthDarkGlobeImage: "//upload.wikimedia.org/wikipedia/commons/b/b3/Solarsystemscope_texture_8k_earth_nightmap.jpg",
  enableSoloPlay: false,
};
// 定义颜色类型
export type ColorType =
  | "ruby"
  | "gray"
  | "gold"
  | "bronze"
  | "brown"
  | "yellow"
  | "amber"
  | "orange"
  | "tomato"
  | "red"
  | "crimson"
  | "pink"
  | "plum"
  | "purple"
  | "violet"
  | "iris"
  | "indigo"
  | "blue"
  | "cyan"
  | "teal"
  | "jade"
  | "green"
  | "grass"
  | "lime"
  | "mint"
  | "sky";
export const allColors: ColorType[] = [
  "ruby",
  "gray",
  "gold",
  "bronze",
  "brown",
  "yellow",
  "amber",
  "orange",
  "tomato",
  "red",
  "crimson",
  "pink",
  "plum",
  "purple",
  "violet",
  "iris",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "jade",
  "green",
  "grass",
  "lime",
  "mint",
  "sky",
];

export type AppearanceType = "light" | "dark" | "system";
export const allAppearance: AppearanceType[] = ["light", "dark", "system"];

export type ViewModeType = "grid" | "table" | "compact";
export const allViewModes: ViewModeType[] = ["grid", "table", "compact"];

export type SiteStatus =
  | "public"
  | "private-unauthenticated"
  | "private-authenticated"
  | "authenticated";

export type HeaderStyle = "fixed" | "levitation";
export type FooterStyle = "fixed" | "levitation" | "followContent" | "hidden";
export type DisplayMode = "show" | "hideAll" | "hideUnset";
export type BackgroundMode = "solidColor" | "image" | "video";
export type MonitorNodeSortMode = "name_asc" | "name_desc" | "id_asc" | "id_desc" | "target_asc" | "target_desc" | "type_asc" | "type_desc" | "custom";
