import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  Crawler,
  Planner,
  Runner,
  Reporter,
  DEFAULT_CONFIG,
  type AgentEyeConfig,
} from '@agenteye/core';
import { parse, stringify } from 'yaml';

const server = new McpServer({
  name: 'agenteye',
  version: '0.1.0',
});

function getOutputDir(): string {
  return process.env.AGENTEYE_OUTPUT_DIR || join(process.cwd(), '.agenteye');
}

// Tool: agenteye_plan
server.tool(
  'agenteye_plan',
  '爬取目標網站並生成測試計畫（YAML 格式），或為 Mobile App 生成骨架計畫。回傳測試計畫內容。',
  {
    url: z.string().optional().describe('目標網站 URL（Web 平台必填）'),
    platform: z
      .enum(['web', 'ios', 'android'])
      .optional()
      .describe('測試平台，預設 web'),
    depth: z.number().optional().describe('爬取深度，預設 3'),
    exclude: z.array(z.string()).optional().describe('排除的 URL patterns'),
    app_name: z.string().optional().describe('App 名稱（Mobile 平台用）'),
  },
  async ({ url, platform, depth, exclude, app_name }) => {
    const targetPlatform = platform ?? 'web';
    const outputDir = getOutputDir();
    const { mkdir: mkdirFs } = await import('node:fs/promises');
    await mkdirFs(join(outputDir, 'plans'), { recursive: true });

    if (targetPlatform !== 'web') {
      // Generate skeleton plan for mobile
      const name = app_name || 'My App';
      const skeletonYaml = [
        `target: "${name}"`,
        `platform: ${targetPlatform}`,
        targetPlatform === 'ios'
          ? `app:\n  bundle_id: "com.example.app"\n  device: "iPhone 15"\n  platform_version: "17.0"`
          : `app:\n  app_package: "com.example.app"\n  app_activity: ".MainActivity"\n  device: "Pixel 7"\n  platform_version: "14"`,
        `pages:`,
        `  - url: "${name} - 主畫面"`,
        `    scenarios:`,
        `      - name: "基本功能測試"`,
        `        steps:`,
        `          - step: "等待 2 秒"`,
        `          - step: "點擊 登入"`,
        `          - step: "在 帳號 欄位 輸入 test@example.com"`,
        `          - step: "點擊 確認"`,
        `            expect: "顯示 歡迎"`,
      ].join('\n');

      const planPath = join(outputDir, 'plans', 'agenteye-plan.yaml');
      await writeFile(planPath, skeletonYaml, 'utf-8');

      return {
        content: [
          {
            type: 'text' as const,
            text: `Mobile (${targetPlatform}) 測試計畫骨架已生成。儲存於: ${planPath}\n請根據實際 App 修改計畫內容。\n\n${skeletonYaml}`,
          },
        ],
      };
    }

    if (!url) {
      return {
        content: [
          { type: 'text' as const, text: 'Web 平台需提供 url 參數' },
        ],
      };
    }

    const crawler = new Crawler({
      depth: depth ?? 3,
      exclude: exclude ?? [],
      timeout: 30000,
    });

    const pages = await crawler.crawl(url);
    const planner = new Planner();
    const plan = planner.generatePlan(pages, url);
    const yamlContent = planner.toYaml(plan);

    // Save plan
    const planPath = join(outputDir, 'plans', 'agenteye-plan.yaml');
    await writeFile(planPath, yamlContent, 'utf-8');

    return {
      content: [
        {
          type: 'text' as const,
          text: `測試計畫已生成（${pages.length} 個頁面）。儲存於: ${planPath}\n\n${yamlContent}`,
        },
      ],
    };
  },
);

// Tool: agenteye_edit_plan
server.tool(
  'agenteye_edit_plan',
  '修改測試計畫，可以跳過或恢復特定頁面的測試。',
  {
    page_url: z.string().describe('要修改的頁面 URL'),
    skip: z.boolean().describe('是否跳過此頁面'),
    skip_reason: z.string().optional().describe('跳過的原因'),
    plan_path: z.string().optional().describe('測試計畫路徑'),
  },
  async ({ page_url, skip, skip_reason, plan_path }) => {
    const outputDir = getOutputDir();
    const path = plan_path || join(outputDir, 'plans', 'agenteye-plan.yaml');

    if (!existsSync(path)) {
      return {
        content: [{ type: 'text' as const, text: '找不到測試計畫，請先執行 agenteye_plan' }],
      };
    }

    const content = await readFile(path, 'utf-8');
    const plan = parse(content);

    const page = plan.pages?.find(
      (p: { url: string }) => p.url === page_url || p.url.includes(page_url),
    );

    if (!page) {
      return {
        content: [{ type: 'text' as const, text: `找不到頁面: ${page_url}` }],
      };
    }

    page.skip = skip;
    if (skip_reason) page.skip_reason = skip_reason;

    await writeFile(path, stringify(plan), 'utf-8');

    return {
      content: [
        {
          type: 'text' as const,
          text: `已${skip ? '跳過' : '恢復'} 頁面: ${page_url}`,
        },
      ],
    };
  },
);

// Tool: agenteye_run
server.tool(
  'agenteye_run',
  '執行 UI 測試（Web / iOS / Android）。可以執行測試計畫或特定腳本。回傳結構化 JSON 測試報告。',
  {
    plan_path: z.string().optional().describe('測試計畫路徑'),
    script_path: z.string().optional().describe('YAML 測試腳本路徑'),
    headed: z.boolean().optional().describe('是否顯示瀏覽器'),
    platform: z
      .enum(['web', 'ios', 'android'])
      .optional()
      .describe('測試平台，預設 web'),
    app: z.string().optional().describe('App 路徑 (.app / .apk)'),
    device: z.string().optional().describe('裝置名稱'),
    platform_version: z.string().optional().describe('平台版本'),
    bundle_id: z.string().optional().describe('iOS Bundle ID'),
    app_package: z.string().optional().describe('Android Package Name'),
    app_activity: z.string().optional().describe('Android Launch Activity'),
    appium_host: z.string().optional().describe('Appium Server Host'),
    appium_port: z.number().optional().describe('Appium Server Port'),
  },
  async ({ plan_path, script_path, headed, platform, app, device, platform_version, bundle_id, app_package, app_activity, appium_host, appium_port }) => {
    const outputDir = getOutputDir();
    const targetPlatform = platform ?? 'web';
    const config: AgentEyeConfig = {
      ...DEFAULT_CONFIG,
      platform: targetPlatform,
      headed: headed ?? false,
      outputDir,
    };

    if (targetPlatform !== 'web') {
      config.mobile = {
        appPath: app,
        deviceName: device,
        platformVersion: platform_version,
        bundleId: bundle_id,
        appPackage: app_package,
        appActivity: app_activity,
        appiumHost: appium_host ?? 'localhost',
        appiumPort: appium_port ?? 4723,
      };
    }

    const reporter = new Reporter();
    const planner = new Planner();

    if (script_path) {
      if (!existsSync(script_path)) {
        return {
          content: [{ type: 'text' as const, text: `找不到腳本: ${script_path}` }],
        };
      }
      const yamlContent = await readFile(script_path, 'utf-8');
      const scenario = parse(yamlContent);

      const startTime = Date.now();
      const runner = new Runner(config);
      const result = await runner.runScript(scenario);
      const durationMs = Date.now() - startTime;

      const report = reporter.generateReport(
        scenario.name || script_path,
        [result],
        config,
        durationMs,
      );
      await reporter.writeReport(report, outputDir);

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(report, null, 2) },
        ],
      };
    }

    // Plan mode
    const path =
      plan_path || join(outputDir, 'plans', 'agenteye-plan.yaml');

    if (!existsSync(path)) {
      return {
        content: [
          {
            type: 'text' as const,
            text: '找不到測試計畫，請先執行 agenteye_plan',
          },
        ],
      };
    }

    const yamlContent = await readFile(path, 'utf-8');
    const plan = planner.fromYaml(yamlContent);

    const startTime = Date.now();
    const runner = new Runner(config);
    const results = await runner.runPlan(plan);
    const durationMs = Date.now() - startTime;

    const report = reporter.generateReport(
      plan.target,
      results,
      config,
      durationMs,
    );
    await reporter.writeReport(report, outputDir);

    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(report, null, 2) },
      ],
    };
  },
);

// Tool: agenteye_report
server.tool(
  'agenteye_report',
  '取得測試報告。可以取得最新報告或指定 run ID 的報告。',
  {
    run_id: z.string().optional().describe('指定 run ID'),
    latest: z.boolean().optional().describe('取得最新報告').default(true),
  },
  async ({ run_id }) => {
    const outputDir = getOutputDir();
    const reporter = new Reporter();

    let report;

    if (run_id) {
      const reportPath = join(outputDir, 'reports', run_id, 'report.json');
      if (!existsSync(reportPath)) {
        return {
          content: [{ type: 'text' as const, text: `找不到報告: ${run_id}` }],
        };
      }
      report = await reporter.readReport(reportPath);
    } else {
      report = await reporter.getLatestReport(outputDir);
    }

    if (!report) {
      return {
        content: [
          { type: 'text' as const, text: '目前沒有測試報告，請先執行 agenteye_run' },
        ],
      };
    }

    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(report, null, 2) },
      ],
    };
  },
);

// Tool: agenteye_screenshot
server.tool(
  'agenteye_screenshot',
  '取得特定測試截圖，以 base64 格式回傳。',
  {
    screenshot_path: z.string().describe('截圖檔案路徑'),
  },
  async ({ screenshot_path }) => {
    if (!existsSync(screenshot_path)) {
      return {
        content: [
          { type: 'text' as const, text: `找不到截圖: ${screenshot_path}` },
        ],
      };
    }

    const imageData = await readFile(screenshot_path);
    const base64 = imageData.toString('base64');

    return {
      content: [
        {
          type: 'image' as const,
          data: base64,
          mimeType: 'image/png',
        },
      ],
    };
  },
);

// Tool: agenteye_list_runs
server.tool(
  'agenteye_list_runs',
  '列出歷史測試紀錄。',
  {
    limit: z.number().optional().describe('回傳數量限制').default(10),
  },
  async ({ limit }) => {
    const outputDir = getOutputDir();
    const reporter = new Reporter();
    const runs = await reporter.listRuns(outputDir, limit);

    if (runs.length === 0) {
      return {
        content: [{ type: 'text' as const, text: '目前沒有測試紀錄' }],
      };
    }

    const text = runs
      .map((r) => `- ${r.run_id} (${r.path})`)
      .join('\n');

    return {
      content: [{ type: 'text' as const, text: `歷史測試紀錄：\n${text}` }],
    };
  },
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
