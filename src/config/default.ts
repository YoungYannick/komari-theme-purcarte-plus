export const DEFAULT_FREE_TAG = "白嫖中";

// 配置类型定义
export interface ConfigOptions {
  // 前端管理开关
  isShowConfigEditButtonInLogined: boolean; // 是否在登录时显示配置编辑按钮
  // 浏览器本地存储配置
  enableLocalStorage: boolean; // 是否启用本地存储
  // 样式调整
  mainWidth: number; // 主内容宽度百分比
  backgroundMode: BackgroundMode; // 背景模式：纯色/图片/视频
  backgroundImage: string; // 桌面端背景图片URL
  backgroundImageMobile: string; // 移动端背景图片URL
  solidColorBackground: string; // 纯色背景颜色值（支持 rgb/rgba/hex/颜色单词）
  videoBackgroundUrl: string; // 桌面端视频背景URL
  videoBackgroundUrlMobile: string; // 移动端视频背景URL
  backgroundAlignment: string; // 背景对齐方式
  enableBlur: boolean; // 是否启用磨砂玻璃效果
  blurValue: number; // 磨砂玻璃模糊值
  blurBackgroundColor: string; // 磨砂玻璃背景颜色
  enableTransparentTags: boolean; // 是否启用标签透明背景
  tagDefaultColorList: string; // 标签默认颜色列表
  freeTag: string; // 免费/白嫖标签文本
  selectThemeColor: ColorType; // 默认主题颜色
  selectedDefaultAppearance: AppearanceType; // 默认外观模式
  // 标题栏设置
  selectedHeaderStyle: HeaderStyle; // 标题栏样式
  enableLogo: boolean; // 是否启用Logo
  logoUrl: string; // Logo图片URL
  logoShape: LogoShapeType; // 标题栏Logo样式
  enableTitle: boolean; // 是否启用标题
  titleText: string; // 标题文本
  enableSearchButton: boolean; // 是否启用搜索按钮
  enableAdvancedSearch: boolean; // 是否启用高级搜索
  enableAdminButton: boolean; // 是否启用管理员按钮
  enableViewModeSwitcher: boolean; // 是否在标题栏显示视图模式切换
  enablePingOverview: boolean; // 是否在标题栏显示延迟总览入口
  enableThemeColorSwitcher: boolean; // 是否在标题栏显示主题颜色模式切换
  enableLanguageSwitcher: boolean; // 是否在标题栏显示语言切换
  // 内容设置
  enableJsonRPC2Api: boolean; // 是否启用 JSON-RPC2 API 适配
  enableStatsBar: boolean; // 是否启用统计栏
  enableSortControl: boolean; // 是否启用排序控制
  statusCardsVisibility: string; // 状态卡片显示控制
  isShowStatsInHeader: boolean; // 是否在标题栏中显示统计信息
  enableGroupedBar: boolean; // 是否启用分组栏
  mergeGroupsWithStats: boolean; // 是否在统计栏中合并分组
  defaultSelectedGroup: string; // 默认选择展示分组
  isOfflineNodesBehind: boolean; // 是否启用离线节点置后显示
  selectedDefaultView: ViewModeType; // 默认视图模式
  selectMobileDefaultView: ViewModeType; // 移动端默认展示视图
  enableSwap: boolean; // 是否启用SWAP显示
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
  // 底栏设置
  selectedFooterStyle: FooterStyle; // 页脚样式
  hideFooterOriginal: boolean; // 是否隐藏底栏原始内容（Powered by...）
  enableServerUptime: boolean; // 是否启用服务器运行时间显示
  serverStartTime: string; // 服务器启动时间（UTC+8），格式: "年,月,日,时,分,秒"
  serverUptimeTemplate: string; // 运行时间显示模板
  footerCustomContent: string; // 底栏自定义内容（换行分割多行，支持markdown链接和图片）
  // Instance 设置
  enableInstanceDetail: boolean; // 是否启用实例详情
  enablePingChart: boolean; // 是否启用延迟图表
  enableCutPeak: boolean; // 是否启用平滑
  enableConnectBreaks: boolean; // 是否启用连接断点
  pingChartTimeInPreview: number; // 预览详情的延迟图表时间范围，单位为小时
  pingChartMaxPoints: number; // 延迟图表最大点数
  monitorNodeSortMode: MonitorNodeSortMode; // 监测节点排序方式
  monitorNodeCustomOrder: string; // 监测节点自定义排序（换行分割名称）
  // 增强功能
  enableWelcomeBubble: boolean; // 是否启用欢迎气泡
  welcomeBubbleSiteName: string; // 欢迎气泡站点名称
  welcomeBubbleLogoUrl: string; // 欢迎气泡Logo图片URL
  welcomeBubbleLogoShape: LogoShapeType; // 欢迎气泡Logo样式
  enableFinanceWidget: boolean; // 是否启用资产统计
  enableEarthGlobe: boolean; // 是否启用地球组件
  earthGlobeLogoUrl: string; // 地球组件Logo图片URL
  earthGlobeLogoShape: LogoShapeType; // 地球组件Logo样式
  earthLightBgImage: string; // 地球组件亮色模式背景图
  earthDarkBgImage: string; // 地球组件暗色模式背景图
  earthLightGlobeImage: string; // 地球组件亮色模式地球贴图
  earthDarkGlobeImage: string; // 地球组件暗色模式地球贴图
  enableSoloPlay: boolean; // 是否启用伪点亮全球效果
  enableScrollHelpers: boolean; // 是否启用滚动辅助按钮
  enableAnnouncement: boolean; // 是否启用公告弹窗
  announcementLogoUrl: string; // 公告弹窗Logo图片URL或特殊占位符
  announcementLogoShape: LogoShapeType; // 公告弹窗Logo样式
  announcementTitle: string; // 公告标题
  announcementContent: string; // 公告主内容
  enableProtection: boolean; // 是否启用自定义警告保护
  protectionLogoUrl: string; // 访客保护弹窗Logo图片URL
  protectionLogoShape: LogoShapeType; // 访客保护弹窗Logo样式
  // UI 自定义
  customTexts: string; // 自定义UI文本
}

// 默认配置值
export const DEFAULT_CONFIG: ConfigOptions = {
  // 前端管理开关
  isShowConfigEditButtonInLogined: false,
  // 浏览器本地存储配置
  enableLocalStorage: true,
  // 样式调整
  mainWidth: 85,
  backgroundMode: "image",
  backgroundImage: "/assets/default-background-image.jpg",
  backgroundImageMobile: "",
  solidColorBackground: "",
  videoBackgroundUrl: "/assets/LanternRivers_1080p15fps2Mbps3s.mp4",
  videoBackgroundUrlMobile: "",
  backgroundAlignment: "cover,top",
  enableBlur: true,
  blurValue: 5,
  blurBackgroundColor: "rgba(255, 255, 255, 0.5)|rgba(0, 0, 0, 0.5)",
  enableTransparentTags: true,
  tagDefaultColorList:
    "lime,cyan,pink,crimson,iris,violet,plum,indigo,blue,jade,mint,grass,teal,sky,red,ruby,tomato,orange,amber,yellow,green,purple,gold,bronze,brown,gray,mauve,slate",
  freeTag: DEFAULT_FREE_TAG,
  selectThemeColor: "violet",
  selectedDefaultAppearance: "system",
  // 标题栏设置
  selectedHeaderStyle: "fixed",
  enableLogo: true,
  logoUrl: "/assets/logo.png",
  logoShape: "circle",
  enableTitle: true,
  titleText: "",
  enableSearchButton: true,
  enableAdvancedSearch: true,
  enableAdminButton: true,
  enableViewModeSwitcher: true,
  enablePingOverview: true,
  enableThemeColorSwitcher: true,
  enableLanguageSwitcher: true,
  // 内容设置
  enableJsonRPC2Api: true,
  enableStatsBar: true,
  enableSortControl: true,
  statusCardsVisibility:
      "currentTime:true,currentOnline:true,regionOverview:true,trafficOverview:true,networkSpeed:true,assetValue:true,monthlyExpense:true",
  isShowStatsInHeader: false,
  enableGroupedBar: true,
  mergeGroupsWithStats: false,
  defaultSelectedGroup: "",
  isOfflineNodesBehind: false,
  selectedDefaultView: "grid",
  selectMobileDefaultView: "grid",
  enableSwap: true,
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
  // 底栏设置
  selectedFooterStyle: "followContent",
  hideFooterOriginal: false,
  enableServerUptime: false,
  serverStartTime: "",
  serverUptimeTemplate: "已不稳定运行 {days} 天 {hours} 小时 {minutes} 分钟 {seconds} 秒",
  footerCustomContent: "",
  // Instance 设置
  enableInstanceDetail: true,
  enablePingChart: true,
  enableCutPeak: false,
  enableConnectBreaks: true,
  pingChartTimeInPreview: 1,
  pingChartMaxPoints: 0,
  monitorNodeSortMode: "weight_asc",
  monitorNodeCustomOrder: "",
  // 增强功能
  enableWelcomeBubble: true,
  welcomeBubbleSiteName: "阿米诺斯",
  welcomeBubbleLogoUrl: "/assets/logo.png",
  welcomeBubbleLogoShape: "circle",
  enableFinanceWidget: true,
  enableEarthGlobe: true,
  earthGlobeLogoUrl: "/assets/logo.png",
  earthGlobeLogoShape: "circle",
  earthLightBgImage: "",
  earthDarkBgImage: "//upload.wikimedia.org/wikipedia/commons/6/60/ESO_-_Milky_Way.jpg",
  earthLightGlobeImage: "//upload.wikimedia.org/wikipedia/commons/0/04/Solarsystemscope_texture_8k_earth_daymap.jpg",
  earthDarkGlobeImage: "//upload.wikimedia.org/wikipedia/commons/b/b3/Solarsystemscope_texture_8k_earth_nightmap.jpg",
  enableSoloPlay: false,
  enableScrollHelpers: true,
  enableAnnouncement: false,
  announcementLogoUrl: "/assets/logo.png",
  announcementLogoShape: "circle",
  announcementTitle: "温馨提示",
  announcementContent: "",
  enableProtection: true,
  protectionLogoUrl: "/assets/logo.png",
  protectionLogoShape: "circle",
  // UI 自定义
  customTexts: "",
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
export type MonitorNodeSortMode = "name_asc" | "name_desc" | "id_asc" | "id_desc" | "weight_asc" | "weight_desc" | "target_asc" | "target_desc" | "type_asc" | "type_desc" | "custom";
export type LogoShapeType = "circle" | "original";
