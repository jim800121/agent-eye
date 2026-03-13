export interface DriverLaunchOptions {
  platform: 'web' | 'ios' | 'android';
  headless?: boolean;
  timeout?: number;
  // Web-specific
  browserType?: 'chromium' | 'firefox' | 'webkit';
  // Mobile-specific
  appPath?: string;
  deviceName?: string;
  platformVersion?: string;
  automationName?: string;
  bundleId?: string;
  appPackage?: string;
  appActivity?: string;
  udid?: string;
  appiumHost?: string;
  appiumPort?: number;
}

export interface IDriver {
  launch(options: DriverLaunchOptions): Promise<void>;
  newContext(): Promise<IDriverContext>;
  close(): Promise<void>;
}

export interface IDriverContext {
  newPage(): Promise<IDriverPage>;
  close(): Promise<void>;
}

export interface IDriverPage {
  goto(
    url: string,
    options?: { timeout?: number; waitUntil?: string },
  ): Promise<{ status(): number } | null>;
  title(): Promise<string>;
  url(): string;
  click(target: string, options?: { timeout?: number }): Promise<void>;
  fill(target: string, value: string): Promise<void>;
  textContent(selector: string): Promise<string | null>;
  screenshot(options: { path: string; fullPage?: boolean }): Promise<void>;
  elementScreenshot(selector: string, path: string): Promise<boolean>;
  content(): Promise<string>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
  locator(selector: string): IDriverLocator;
  getByText(text: string, options?: { exact?: boolean }): IDriverLocator;
  getByRole(role: string, options?: { name?: string }): IDriverLocator;
  getByLabel(text: string, options?: { exact?: boolean }): IDriverLocator;
  getByPlaceholder(text: string, options?: { exact?: boolean }): IDriverLocator;
  on(event: string, handler: (...args: unknown[]) => void): void;
  // Mobile-specific
  switchContext?(context: 'NATIVE_APP' | string): Promise<void>;
  getContexts?(): Promise<string[]>;
  swipe?(direction: 'up' | 'down' | 'left' | 'right'): Promise<void>;
  longPress?(selector: string): Promise<void>;
}

export interface IDriverLocator {
  first(): IDriverLocator;
  click(options?: { timeout?: number }): Promise<void>;
  fill(value: string): Promise<void>;
  screenshot(options: { path: string }): Promise<void>;
  count(): Promise<number>;
}
