import type {
  IDriver,
  IDriverContext,
  IDriverPage,
  IDriverLocator,
  DriverLaunchOptions,
} from './types.js';
import { logger } from '../utils/logger.js';

// WebDriverIO types (loaded dynamically)
type WDIOBrowser = {
  $: (selector: string) => Promise<WDIOElement>;
  $$: (selector: string) => Promise<WDIOElement[]>;
  getPageSource: () => Promise<string>;
  saveScreenshot: (path: string) => Promise<void>;
  getTitle: () => Promise<string>;
  getUrl: () => Promise<string>;
  url: (url: string) => Promise<void>;
  pause: (ms: number) => Promise<void>;
  execute: <T>(fn: () => T) => Promise<T>;
  getContexts: () => Promise<string[]>;
  switchContext: (context: string) => Promise<void>;
  touchAction: (action: object) => Promise<void>;
  deleteSession: () => Promise<void>;
  getWindowSize: () => Promise<{ width: number; height: number }>;
};

type WDIOElement = {
  click: () => Promise<void>;
  setValue: (value: string) => Promise<void>;
  getText: () => Promise<string>;
  isDisplayed: () => Promise<boolean>;
  isExisting: () => Promise<boolean>;
  saveScreenshot: (path: string) => Promise<void>;
  touchAction: (action: string | object) => Promise<void>;
};

class AppiumLocator implements IDriverLocator {
  constructor(
    private browser: WDIOBrowser,
    private selector: string,
  ) {}

  first(): IDriverLocator {
    return this;
  }

  async click(options?: { timeout?: number }): Promise<void> {
    const el = await this.browser.$(this.selector);
    await el.click();
  }

  async fill(value: string): Promise<void> {
    const el = await this.browser.$(this.selector);
    await el.setValue(value);
  }

  async screenshot(options: { path: string }): Promise<void> {
    const el = await this.browser.$(this.selector);
    await el.saveScreenshot(options.path);
  }

  async count(): Promise<number> {
    try {
      const elements = await this.browser.$$(this.selector);
      return elements.length;
    } catch {
      return 0;
    }
  }
}

class AppiumPage implements IDriverPage {
  private currentUrl = '';
  private eventHandlers: Map<string, Array<(...args: unknown[]) => void>> =
    new Map();

  constructor(private browser: WDIOBrowser) {}

  async goto(
    url: string,
    options?: { timeout?: number; waitUntil?: string },
  ): Promise<{ status(): number } | null> {
    this.currentUrl = url;
    // For native apps, deep linking or app navigation
    // For hybrid apps in webview context, navigate normally
    try {
      await this.browser.url(url);
      return { status: () => 200 };
    } catch {
      return { status: () => 0 };
    }
  }

  async title(): Promise<string> {
    try {
      return await this.browser.getTitle();
    } catch {
      return '';
    }
  }

  url(): string {
    return this.currentUrl;
  }

  async click(target: string, options?: { timeout?: number }): Promise<void> {
    const selector = this.adaptSelector(target);
    const el = await this.browser.$(selector);
    await el.click();
  }

  async fill(target: string, value: string): Promise<void> {
    const selector = this.adaptSelector(target);
    const el = await this.browser.$(selector);
    await el.setValue(value);
  }

  async textContent(selector: string): Promise<string | null> {
    try {
      const el = await this.browser.$(this.adaptSelector(selector));
      return await el.getText();
    } catch {
      return null;
    }
  }

  async screenshot(options: { path: string; fullPage?: boolean }): Promise<void> {
    await this.browser.saveScreenshot(options.path);
  }

  async elementScreenshot(selector: string, path: string): Promise<boolean> {
    try {
      const el = await this.browser.$(this.adaptSelector(selector));
      if (!(await el.isExisting())) return false;
      await el.saveScreenshot(path);
      return true;
    } catch {
      return false;
    }
  }

  async content(): Promise<string> {
    return this.browser.getPageSource();
  }

  async waitForTimeout(ms: number): Promise<void> {
    await this.browser.pause(ms);
  }

  async evaluate<T>(fn: () => T): Promise<T> {
    return this.browser.execute(fn);
  }

  locator(selector: string): IDriverLocator {
    return new AppiumLocator(this.browser, this.adaptSelector(selector));
  }

  getByText(text: string, _options?: { exact?: boolean }): IDriverLocator {
    // Use XPath to find by text content
    const selector = `//*[contains(@text, "${text}") or contains(@label, "${text}") or contains(@value, "${text}")]`;
    return new AppiumLocator(this.browser, selector);
  }

  getByRole(role: string, options?: { name?: string }): IDriverLocator {
    if (options?.name) {
      return this.getByText(options.name);
    }
    // Map web roles to mobile element types
    const roleMap: Record<string, string> = {
      button: '//android.widget.Button | //XCUIElementTypeButton',
      textbox:
        '//android.widget.EditText | //XCUIElementTypeTextField',
      checkbox:
        '//android.widget.CheckBox | //XCUIElementTypeSwitch',
    };
    const selector = roleMap[role] || `//*[@role="${role}"]`;
    return new AppiumLocator(this.browser, selector);
  }

  getByLabel(text: string, _options?: { exact?: boolean }): IDriverLocator {
    const selector = `//*[contains(@content-desc, "${text}") or contains(@accessibilityLabel, "${text}")]`;
    return new AppiumLocator(this.browser, selector);
  }

  getByPlaceholder(text: string, _options?: { exact?: boolean }): IDriverLocator {
    const selector = `//*[contains(@hint, "${text}") or contains(@placeholder, "${text}")]`;
    return new AppiumLocator(this.browser, selector);
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    // Mobile native apps don't have console events
    // Store handlers for potential webview context usage
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  // Mobile-specific methods
  async switchContext(context: 'NATIVE_APP' | string): Promise<void> {
    await this.browser.switchContext(context);
  }

  async getContexts(): Promise<string[]> {
    return this.browser.getContexts();
  }

  async swipe(direction: 'up' | 'down' | 'left' | 'right'): Promise<void> {
    const size = await this.browser.getWindowSize();
    const midX = Math.floor(size.width / 2);
    const midY = Math.floor(size.height / 2);

    const swipeMap = {
      up: { startX: midX, startY: midY + 200, endX: midX, endY: midY - 200 },
      down: { startX: midX, startY: midY - 200, endX: midX, endY: midY + 200 },
      left: { startX: midX + 200, startY: midY, endX: midX - 200, endY: midY },
      right: { startX: midX - 200, startY: midY, endX: midX + 200, endY: midY },
    };

    const { startX, startY, endX, endY } = swipeMap[direction];
    await this.browser.touchAction([
      { action: 'press', x: startX, y: startY },
      { action: 'wait', ms: 300 },
      { action: 'moveTo', x: endX, y: endY },
      'release',
    ] as unknown as object);
  }

  async longPress(selector: string): Promise<void> {
    const el = await this.browser.$(this.adaptSelector(selector));
    await el.touchAction('longPress');
  }

  /**
   * Adapt web CSS selectors to mobile selectors
   */
  private adaptSelector(selector: string): string {
    // Already an XPath or accessibility selector
    if (
      selector.startsWith('//') ||
      selector.startsWith('~') ||
      selector.startsWith('-')
    ) {
      return selector;
    }

    // ID selector (#id) → accessibility id
    if (selector.startsWith('#')) {
      return `~${selector.slice(1)}`;
    }

    // [name="xxx"] → accessibility id
    const nameMatch = selector.match(/\[name="(.+?)"\]/);
    if (nameMatch) {
      return `~${nameMatch[1]}`;
    }

    // Text-based selector (button:has-text("xxx"))
    const textMatch = selector.match(/:has-text\("(.+?)"\)/);
    if (textMatch) {
      return `//*[contains(@text, "${textMatch[1]}") or contains(@label, "${textMatch[1]}")]`;
    }

    // Fallback: try as accessibility id
    return `~${selector}`;
  }
}

class AppiumContext implements IDriverContext {
  constructor(private browser: WDIOBrowser) {}

  async newPage(): Promise<IDriverPage> {
    return new AppiumPage(this.browser);
  }

  async close(): Promise<void> {
    // Appium doesn't have the concept of contexts like Playwright
    // Session cleanup happens in driver.close()
  }
}

export class AppiumDriver implements IDriver {
  private browser: WDIOBrowser | null = null;

  async launch(options: DriverLaunchOptions): Promise<void> {
    let remote: (opts: object) => Promise<WDIOBrowser>;

    try {
      const moduleName = 'webdriverio';
      const wdio = await import(/* webpackIgnore: true */ moduleName);
      remote = wdio.remote as unknown as typeof remote;
    } catch {
      throw new Error(
        'WebDriverIO 尚未安裝。請執行: npm install webdriverio\n' +
          '並確保 Appium Server 正在運行: npx appium',
      );
    }

    const capabilities = this.buildCapabilities(options);
    const host = options.appiumHost || 'localhost';
    const port = options.appiumPort || 4723;

    logger.info(
      `連接 Appium Server: ${host}:${port} (${options.platform})`,
    );

    try {
      this.browser = (await remote({
        hostname: host,
        port,
        path: '/',
        capabilities,
        logLevel: 'warn',
      })) as unknown as WDIOBrowser;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('ECONNREFUSED')) {
        throw new Error(
          `無法連接 Appium Server (${host}:${port})。\n` +
            '請確保 Appium 正在運行: npx appium',
        );
      }
      throw error;
    }
  }

  async newContext(): Promise<IDriverContext> {
    if (!this.browser) throw new Error('Appium session not started');
    return new AppiumContext(this.browser);
  }

  async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.deleteSession();
      } catch {
        // Session may already be closed
      }
      this.browser = null;
    }
  }

  private buildCapabilities(
    options: DriverLaunchOptions,
  ): Record<string, unknown> {
    const caps: Record<string, unknown> = {};

    if (options.platform === 'ios') {
      caps['platformName'] = 'iOS';
      caps['appium:automationName'] = options.automationName || 'XCUITest';
      caps['appium:deviceName'] = options.deviceName || 'iPhone 15';
      if (options.platformVersion) {
        caps['appium:platformVersion'] = options.platformVersion;
      }
      if (options.appPath) {
        caps['appium:app'] = options.appPath;
      }
      if (options.bundleId) {
        caps['appium:bundleId'] = options.bundleId;
      }
      if (options.udid) {
        caps['appium:udid'] = options.udid;
      }
    } else if (options.platform === 'android') {
      caps['platformName'] = 'Android';
      caps['appium:automationName'] = options.automationName || 'UiAutomator2';
      caps['appium:deviceName'] = options.deviceName || 'Android Emulator';
      if (options.platformVersion) {
        caps['appium:platformVersion'] = options.platformVersion;
      }
      if (options.appPath) {
        caps['appium:app'] = options.appPath;
      }
      if (options.appPackage) {
        caps['appium:appPackage'] = options.appPackage;
      }
      if (options.appActivity) {
        caps['appium:appActivity'] = options.appActivity;
      }
      if (options.udid) {
        caps['appium:udid'] = options.udid;
      }
    }

    return caps;
  }
}
