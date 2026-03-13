import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
  type Locator,
} from 'playwright';
import type {
  IDriver,
  IDriverContext,
  IDriverPage,
  IDriverLocator,
  DriverLaunchOptions,
} from './types.js';

class PlaywrightLocator implements IDriverLocator {
  constructor(private locator: Locator) {}

  first(): IDriverLocator {
    return new PlaywrightLocator(this.locator.first());
  }

  async click(options?: { timeout?: number }): Promise<void> {
    await this.locator.click(options);
  }

  async fill(value: string): Promise<void> {
    await this.locator.fill(value);
  }

  async screenshot(options: { path: string }): Promise<void> {
    await this.locator.screenshot(options);
  }

  async count(): Promise<number> {
    return this.locator.count();
  }
}

class PlaywrightPage implements IDriverPage {
  constructor(private page: Page) {}

  async goto(
    url: string,
    options?: { timeout?: number; waitUntil?: string },
  ): Promise<{ status(): number } | null> {
    const response = await this.page.goto(url, {
      timeout: options?.timeout,
      waitUntil: (options?.waitUntil as 'domcontentloaded') || 'domcontentloaded',
    });
    return response ? { status: () => response.status() } : null;
  }

  async title(): Promise<string> {
    return this.page.title();
  }

  url(): string {
    return this.page.url();
  }

  async click(target: string, options?: { timeout?: number }): Promise<void> {
    await this.page.click(target, options);
  }

  async fill(target: string, value: string): Promise<void> {
    await this.page.fill(target, value);
  }

  async textContent(selector: string): Promise<string | null> {
    return this.page.textContent(selector);
  }

  async screenshot(options: { path: string; fullPage?: boolean }): Promise<void> {
    await this.page.screenshot(options);
  }

  async elementScreenshot(selector: string, path: string): Promise<boolean> {
    try {
      const locator = this.page.locator(selector).first();
      if ((await locator.count()) === 0) return false;
      await locator.screenshot({ path });
      return true;
    } catch {
      return false;
    }
  }

  async content(): Promise<string> {
    return this.page.content();
  }

  async waitForTimeout(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  async evaluate<T>(fn: () => T): Promise<T> {
    return this.page.evaluate(fn);
  }

  locator(selector: string): IDriverLocator {
    return new PlaywrightLocator(this.page.locator(selector));
  }

  getByText(text: string, options?: { exact?: boolean }): IDriverLocator {
    return new PlaywrightLocator(this.page.getByText(text, options));
  }

  getByRole(role: string, options?: { name?: string }): IDriverLocator {
    return new PlaywrightLocator(
      this.page.getByRole(role as 'button', options),
    );
  }

  getByLabel(text: string, options?: { exact?: boolean }): IDriverLocator {
    return new PlaywrightLocator(this.page.getByLabel(text, options));
  }

  getByPlaceholder(text: string, options?: { exact?: boolean }): IDriverLocator {
    return new PlaywrightLocator(this.page.getByPlaceholder(text, options));
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    this.page.on(event as 'console', handler as never);
  }
}

class PlaywrightContext implements IDriverContext {
  constructor(private context: BrowserContext) {}

  async newPage(): Promise<IDriverPage> {
    const page = await this.context.newPage();
    return new PlaywrightPage(page);
  }

  async close(): Promise<void> {
    await this.context.close();
  }
}

export class PlaywrightDriver implements IDriver {
  private browser: Browser | null = null;

  async launch(options: DriverLaunchOptions): Promise<void> {
    const browserType =
      options.browserType === 'firefox'
        ? firefox
        : options.browserType === 'webkit'
          ? webkit
          : chromium;

    try {
      this.browser = await browserType.launch({
        headless: options.headless ?? true,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes("Executable doesn't exist") ||
        msg.includes('browserType.launch')
      ) {
        throw new Error(
          'Playwright 瀏覽器尚未安裝。請執行: npx playwright install chromium',
        );
      }
      throw error;
    }
  }

  async newContext(): Promise<IDriverContext> {
    if (!this.browser) throw new Error('Browser not launched');
    const context = await this.browser.newContext();
    return new PlaywrightContext(context);
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
