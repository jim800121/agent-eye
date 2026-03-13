import { chromium, type Browser, type Page } from 'playwright';
import type { ElementInfo } from '../types/plan.js';
import { logger } from '../utils/logger.js';

export interface CrawlerCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
}

export interface CrawlerProgress {
  current: number;
  total: number;
  message: string;
}

export interface CrawlerOptions {
  depth: number;
  exclude: string[];
  timeout: number;
  maxPages?: number;
  cookies?: CrawlerCookie[];
  headers?: Record<string, string>;
  onProgress?: (progress: CrawlerProgress) => void;
}

export interface CrawledPage {
  url: string;
  title: string;
  status: number;
  elements: ElementInfo[];
  links: string[];
}

export class Crawler {
  private browser: Browser | null = null;
  private visited = new Set<string>();
  private baseOrigin = '';

  constructor(private options: CrawlerOptions) {}

  async crawl(url: string): Promise<CrawledPage[]> {
    this.browser = await chromium.launch({ headless: true });
    this.baseOrigin = new URL(url).origin;
    this.visited.clear();

    const pages: CrawledPage[] = [];
    await this.crawlRecursive(url, 0, pages);
    await this.close();

    return pages;
  }

  private async crawlRecursive(
    url: string,
    depth: number,
    results: CrawledPage[],
  ): Promise<void> {
    const normalized = this.normalizeUrl(url);
    if (this.visited.has(normalized)) return;
    if (depth > this.options.depth) return;
    if (!this.shouldCrawl(normalized)) return;

    const maxPages = this.options.maxPages ?? 50;
    if (this.visited.size >= maxPages) {
      logger.warn(`已達最大爬取頁面數量上限 (${maxPages})，停止爬取`);
      return;
    }

    this.visited.add(normalized);
    logger.info(`爬取: ${normalized} (深度: ${depth})`);
    this.options.onProgress?.({
      current: this.visited.size,
      total: maxPages,
      message: `Crawling: ${normalized}`,
    });

    try {
      const crawled = await this.crawlPage(normalized);
      results.push(crawled);

      for (const link of crawled.links) {
        await this.crawlRecursive(link, depth + 1, results);
      }
    } catch (error) {
      logger.warn(`爬取失敗: ${normalized} — ${error}`);
    }
  }

  private async crawlPage(url: string): Promise<CrawledPage> {
    const context = await this.browser!.newContext({
      extraHTTPHeaders: this.options.headers,
    });
    if (this.options.cookies?.length) {
      await context.addCookies(this.options.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
      })));
    }
    const page = await context.newPage();

    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.options.timeout,
      });

      const title = await page.title();
      const status = response?.status() ?? 0;
      const elements = await this.extractElements(page);
      const links = await this.extractLinks(page);

      return { url, title, status, elements, links };
    } finally {
      await context.close();
    }
  }

  private async extractElements(page: Page): Promise<ElementInfo[]> {
    return page.evaluate(() => {
      const elements: Array<{
        selector: string;
        type: string;
        text?: string;
        name?: string;
      }> = [];

      // Input fields
      document.querySelectorAll('input:not([type="hidden"])').forEach((el) => {
        const input = el as HTMLInputElement;
        const id = input.id ? `#${input.id}` : '';
        const name = input.name ? `[name="${input.name}"]` : '';
        const selector = id || name || `input[type="${input.type || 'text'}"]`;
        elements.push({
          selector,
          type: 'input',
          name: input.name || undefined,
          text: input.placeholder || undefined,
        });
      });

      // Textareas
      document.querySelectorAll('textarea').forEach((el) => {
        const ta = el as HTMLTextAreaElement;
        const selector = ta.id ? `#${ta.id}` : ta.name ? `[name="${ta.name}"]` : 'textarea';
        elements.push({ selector, type: 'textarea', name: ta.name || undefined });
      });

      // Buttons
      document.querySelectorAll('button, input[type="submit"]').forEach((el) => {
        const btn = el as HTMLElement;
        const id = btn.id ? `#${btn.id}` : '';
        const text = btn.textContent?.trim() || '';
        const selector = id || (text ? `button:has-text("${text}")` : 'button');
        elements.push({ selector, type: 'button', text });
      });

      // Select dropdowns
      document.querySelectorAll('select').forEach((el) => {
        const select = el as HTMLSelectElement;
        const selector = select.id ? `#${select.id}` : `[name="${select.name}"]`;
        elements.push({ selector, type: 'select', name: select.name || undefined });
      });

      return elements as Array<{
        selector: string;
        type: 'input' | 'button' | 'link' | 'select' | 'textarea' | 'form';
        text?: string;
        name?: string;
      }>;
    });
  }

  private async extractLinks(page: Page): Promise<string[]> {
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((href) => href.startsWith('http')),
    );

    return links.filter((link) => {
      try {
        const linkOrigin = new URL(link).origin;
        return linkOrigin === this.baseOrigin;
      } catch {
        return false;
      }
    });
  }

  private shouldCrawl(url: string): boolean {
    // Same-origin only
    try {
      const urlOrigin = new URL(url).origin;
      if (urlOrigin !== this.baseOrigin) return false;
    } catch {
      return false;
    }

    // Check exclude patterns
    for (const pattern of this.options.exclude) {
      if (url.includes(pattern)) return false;
    }

    // Skip non-HTML resources
    const skipExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.css', '.js', '.pdf', '.zip'];
    const pathname = new URL(url).pathname.toLowerCase();
    if (skipExtensions.some((ext) => pathname.endsWith(ext))) return false;

    return true;
  }

  private normalizeUrl(url: string): string {
    const u = new URL(url);
    u.hash = '';
    // Remove trailing slash for consistency
    if (u.pathname.endsWith('/') && u.pathname.length > 1) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
