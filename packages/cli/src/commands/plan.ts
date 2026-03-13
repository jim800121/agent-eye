import type { Command } from 'commander';
import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { Crawler, Planner } from '@agenteye/core';
import * as output from '../utils/output.js';

export function registerPlanCommand(program: Command): void {
  program
    .command('plan [url]')
    .description('爬取目標網站並生成測試計畫，或為 Mobile App 生成骨架計畫')
    .option('-d, --depth <number>', '爬取深度', '3')
    .option('-e, --exclude <patterns...>', '排除的 URL patterns')
    .option('-o, --output <path>', '輸出路徑')
    .option('--platform <platform>', '測試平台 (web|ios|android)', 'web')
    .option('--app-name <name>', 'App 名稱 (Mobile 平台用)')
    .action(async (url: string | undefined, options) => {
      const platform = options.platform as 'web' | 'ios' | 'android';
      const outputPath =
        options.output ||
        join(process.cwd(), '.agenteye', 'plans', 'agenteye-plan.yaml');

      // Ensure output directory exists
      const { dirname } = await import('node:path');
      await mkdir(dirname(outputPath), { recursive: true });

      if (platform !== 'web') {
        // Generate skeleton plan for mobile
        const appName = options.appName || 'My App';
        const appConfig =
          platform === 'ios'
            ? `app:\n  bundle_id: "com.example.app"\n  device: "iPhone 15"\n  platform_version: "17.0"`
            : `app:\n  app_package: "com.example.app"\n  app_activity: ".MainActivity"\n  device: "Pixel 7"\n  platform_version: "14"`;

        const skeletonYaml = [
          `target: "${appName}"`,
          `platform: ${platform}`,
          appConfig,
          `pages:`,
          `  - url: "${appName} - 主畫面"`,
          `    scenarios:`,
          `      - name: "基本功能測試"`,
          `        steps:`,
          `          - step: "等待 2 秒"`,
          `          - step: "點擊 登入"`,
          `          - step: "在 帳號 欄位 輸入 test@example.com"`,
          `          - step: "點擊 確認"`,
          `            expect: "顯示 歡迎"`,
        ].join('\n');

        await writeFile(outputPath, skeletonYaml, 'utf-8');

        output.step(
          'clipboard',
          `Mobile (${platform.toUpperCase()}) 測試計畫骨架已生成：${outputPath}`,
        );
        output.info('  請根據實際 App 修改計畫內容');
        output.info('');
        output.step(
          'bulb',
          '提示：修改 app 設定和步驟後執行 agenteye run --platform ' + platform,
        );
        return;
      }

      if (!url) {
        output.fail('Web 平台需提供 URL 參數，例如: agenteye plan https://example.com');
        process.exit(1);
      }

      const depth = parseInt(options.depth, 10);
      const exclude: string[] = options.exclude || [];

      output.step('search', `正在爬取 ${url} ...`);

      const crawler = new Crawler({
        depth,
        exclude,
        timeout: 30000,
      });

      try {
        const pages = await crawler.crawl(url);

        output.info('');
        for (const page of pages) {
          const inputs = page.elements.filter(
            (e) => e.type === 'input' || e.type === 'textarea',
          );
          const buttons = page.elements.filter((e) => e.type === 'button');
          output.info(
            `  ${page.url} (${page.status}) — ${page.title || '無標題'} — ${inputs.length} 個輸入框, ${buttons.length} 個按鈕`,
          );
        }

        const planner = new Planner();
        const plan = planner.generatePlan(pages, url);
        const yamlContent = planner.toYaml(plan);

        await writeFile(outputPath, yamlContent, 'utf-8');

        const totalScenarios = plan.pages.reduce(
          (sum, p) => sum + p.scenarios.length,
          0,
        );
        const totalSteps = plan.pages.reduce(
          (sum, p) =>
            sum + p.scenarios.reduce((s, sc) => s + sc.steps.length, 0),
          0,
        );

        output.info('');
        output.step(
          'clipboard',
          `測試計畫已生成：${outputPath}`,
        );
        output.info(
          `   ${pages.length} 個頁面, ${totalScenarios} 個測試情境, ${totalSteps} 個步驟`,
        );
        output.info('');
        output.step(
          'bulb',
          '提示：編輯 YAML 檔案可以標記 skip: true 來跳過不需要的頁面',
        );
      } catch (error) {
        output.fail(
          `爬取失敗: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    });
}
