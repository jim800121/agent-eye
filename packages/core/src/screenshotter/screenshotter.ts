import type { IDriverPage } from '../driver/types.js';
import { join } from 'node:path';
import { ensureDir, writeText } from '../utils/file.js';

export class Screenshotter {
  constructor(private outputDir: string) {}

  async captureFullPage(page: IDriverPage, name: string): Promise<string> {
    const screenshotDir = join(this.outputDir, 'screenshots');
    await ensureDir(screenshotDir);
    const filePath = join(screenshotDir, `${name}_full.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }

  async captureElement(
    page: IDriverPage,
    selector: string,
    name: string,
  ): Promise<string | undefined> {
    const screenshotDir = join(this.outputDir, 'screenshots');
    await ensureDir(screenshotDir);
    const filePath = join(screenshotDir, `${name}_element.png`);
    const success = await page.elementScreenshot(selector, filePath);
    return success ? filePath : undefined;
  }

  async captureDom(page: IDriverPage, name: string): Promise<string> {
    const snapshotDir = join(this.outputDir, 'snapshots');
    await ensureDir(snapshotDir);
    // For web: saves HTML DOM; for mobile native: saves XML page source
    const content = await page.content();
    const ext = content.trimStart().startsWith('<?xml') ? 'xml' : 'html';
    const filePath = join(snapshotDir, `${name}.${ext}`);
    await writeText(filePath, content);
    return filePath;
  }
}
