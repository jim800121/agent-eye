export interface MobileConfig {
  /** App 路徑 (.app / .apk) */
  appPath?: string;
  /** 裝置名稱（例如 "iPhone 15"、"Pixel 7"） */
  deviceName?: string;
  /** 平台版本（例如 "17.0"、"14"） */
  platformVersion?: string;
  /** 自動化引擎（"XCUITest" | "UiAutomator2"） */
  automationName?: string;
  /** iOS Bundle ID */
  bundleId?: string;
  /** Android Package Name */
  appPackage?: string;
  /** Android Launch Activity */
  appActivity?: string;
  /** 裝置 UDID */
  udid?: string;
  /** Appium Server Host */
  appiumHost?: string;
  /** Appium Server Port */
  appiumPort?: number;
}

export interface AgentEyeConfig {
  /** 測試平台 */
  platform: 'web' | 'ios' | 'android';
  /** 預設爬取深度 */
  depth: number;
  /** 排除的 URL patterns */
  exclude: string[];
  /** 截圖格式 */
  screenshotFormat: 'png' | 'jpeg';
  /** 全域超時時間 (ms) */
  timeout: number;
  /** 並行數量 */
  parallel: number;
  /** 報告輸出目錄 */
  outputDir: string;
  /** 是否保存 DOM snapshot */
  saveDomSnapshot: boolean;
  /** 是否顯示瀏覽器 */
  headed: boolean;
  /** 最大爬取頁面數量 */
  maxPages: number;
  /** Mobile 設定 */
  mobile?: MobileConfig;
  /** Variable substitution: key-value pairs */
  vars?: Record<string, string>;
  /** Path to .env file for variable substitution */
  envFile?: string;
}

export const DEFAULT_CONFIG: AgentEyeConfig = {
  platform: 'web',
  depth: 3,
  exclude: [],
  screenshotFormat: 'png',
  timeout: 30000,
  parallel: 3,
  outputDir: '.agenteye',
  saveDomSnapshot: true,
  headed: false,
  maxPages: 50,
};
