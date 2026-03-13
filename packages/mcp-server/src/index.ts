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

/**
 * Helper: send MCP progress notification if the client provided a progressToken.
 */
async function sendProgress(
  extra: { sendNotification: (n: unknown) => Promise<void> },
  progressToken: string | number | undefined,
  progress: number,
  total: number,
  message: string,
): Promise<void> {
  if (progressToken === undefined) return;
  try {
    await extra.sendNotification({
      method: 'notifications/progress',
      params: { progressToken, progress, total, message },
    });
  } catch {
    // Client may not support progress notifications — ignore
  }
}

// Tool: agenteye_plan
server.tool(
  'agenteye_plan',
  'Crawl a target website and generate a YAML test plan, or generate a skeleton plan for a mobile app. ' +
    'NOTE: This tool launches a real browser and crawls web pages. Depending on the site size and crawl depth, ' +
    'it may take 1-5 minutes. Please set your tool call timeout to at least 5 minutes (300s).',
  {
    url: z.string().optional().describe('Target website URL (required for web platform)'),
    platform: z
      .enum(['web', 'ios', 'android'])
      .optional()
      .describe('Test platform, default: web'),
    depth: z.number().optional().describe('Crawl depth, default: 3'),
    exclude: z.array(z.string()).optional().describe('URL patterns to exclude'),
    app_name: z.string().optional().describe('App name (for mobile platforms)'),
    cookies: z.array(z.object({
      name: z.string(),
      value: z.string(),
      domain: z.string(),
    })).optional().describe('Inject cookies for authenticated crawling'),
    headers: z.record(z.string()).optional().describe('Inject HTTP headers for authenticated crawling'),
  },
  async ({ url, platform, depth, exclude, app_name, cookies, headers }, extra) => {
    const progressToken = (extra as unknown as { _meta?: { progressToken?: string | number } })._meta?.progressToken;
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
        `  - url: "${name} - Main Screen"`,
        `    scenarios:`,
        `      - name: "Basic Feature Test"`,
        `        steps:`,
        `          - step: "wait 2 s"`,
        `          - step: "click Login"`,
        `          - step: "type test@example.com into Account"`,
        `          - step: "click Submit"`,
        `            expect: "show Welcome"`,
      ].join('\n');

      const planPath = join(outputDir, 'plans', 'agenteye-plan.yaml');
      await writeFile(planPath, skeletonYaml, 'utf-8');

      return {
        content: [
          {
            type: 'text' as const,
            text: `Mobile (${targetPlatform}) skeleton test plan generated. Saved to: ${planPath}\nPlease modify the plan according to your actual app.\n\n${skeletonYaml}`,
          },
        ],
      };
    }

    if (!url) {
      return {
        content: [
          { type: 'text' as const, text: 'Web platform requires the "url" parameter.' },
        ],
      };
    }

    await sendProgress(extra, progressToken, 0, 1, `Starting crawl of ${url}...`);

    const crawler = new Crawler({
      depth: depth ?? 3,
      exclude: exclude ?? [],
      timeout: 30000,
      cookies: cookies ?? undefined,
      headers: headers ?? undefined,
      onProgress: (p) => {
        sendProgress(extra, progressToken, p.current, p.total, p.message);
      },
    });

    const pages = await crawler.crawl(url);
    const planner = new Planner();
    const plan = planner.generatePlan(pages, url);
    const yamlContent = planner.toYaml(plan);

    // Save plan
    const planPath = join(outputDir, 'plans', 'agenteye-plan.yaml');
    await writeFile(planPath, yamlContent, 'utf-8');

    await sendProgress(extra, progressToken, 1, 1, `Crawl complete: ${pages.length} pages found`);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Test plan generated (${pages.length} pages). Saved to: ${planPath}\n\n${yamlContent}`,
        },
      ],
    };
  },
);

// Tool: agenteye_edit_plan
server.tool(
  'agenteye_edit_plan',
  'Edit a test plan — skip or restore specific pages.',
  {
    page_url: z.string().describe('Page URL to modify'),
    skip: z.boolean().describe('Whether to skip this page'),
    skip_reason: z.string().optional().describe('Reason for skipping'),
    plan_path: z.string().optional().describe('Test plan path'),
  },
  async ({ page_url, skip, skip_reason, plan_path }) => {
    const outputDir = getOutputDir();
    const path = plan_path || join(outputDir, 'plans', 'agenteye-plan.yaml');

    if (!existsSync(path)) {
      return {
        content: [{ type: 'text' as const, text: 'Test plan not found. Please run agenteye_plan first.' }],
      };
    }

    const content = await readFile(path, 'utf-8');
    const plan = parse(content);

    const page = plan.pages?.find(
      (p: { url: string }) => p.url === page_url || p.url.includes(page_url),
    );

    if (!page) {
      return {
        content: [{ type: 'text' as const, text: `Page not found: ${page_url}` }],
      };
    }

    page.skip = skip;
    if (skip_reason) page.skip_reason = skip_reason;

    await writeFile(path, stringify(plan), 'utf-8');

    return {
      content: [
        {
          type: 'text' as const,
          text: `Page ${skip ? 'skipped' : 'restored'}: ${page_url}`,
        },
      ],
    };
  },
);

// Tool: agenteye_run
server.tool(
  'agenteye_run',
  'Run UI tests (Web / iOS / Android). Can execute a test plan or a specific YAML script. Returns a structured JSON test report. ' +
    'NOTE: This tool launches a real browser/device and executes UI tests. Depending on the number of test scenarios, ' +
    'it may take 2-10 minutes (or longer for large test suites or mobile tests). ' +
    'Please set your tool call timeout to at least 10 minutes (600s). ' +
    'Progress notifications will be sent as tests complete.',
  {
    plan_path: z.string().optional().describe('Test plan path'),
    script_path: z.string().optional().describe('YAML test script path'),
    headed: z.boolean().optional().describe('Show browser window'),
    platform: z
      .enum(['web', 'ios', 'android'])
      .optional()
      .describe('Test platform, default: web'),
    app: z.string().optional().describe('App path (.app / .apk)'),
    device: z.string().optional().describe('Device name'),
    platform_version: z.string().optional().describe('Platform version'),
    bundle_id: z.string().optional().describe('iOS Bundle ID'),
    app_package: z.string().optional().describe('Android Package Name'),
    app_activity: z.string().optional().describe('Android Launch Activity'),
    appium_host: z.string().optional().describe('Appium Server Host'),
    appium_port: z.number().optional().describe('Appium Server Port'),
    vars: z.record(z.string()).optional().describe('Variable substitution key-value pairs (overrides YAML vars)'),
    env_file: z.string().optional().describe('Path to .env file for variable substitution'),
  },
  async ({ plan_path, script_path, headed, platform, app, device, platform_version, bundle_id, app_package, app_activity, appium_host, appium_port, vars, env_file }, extra) => {
    const progressToken = (extra as unknown as { _meta?: { progressToken?: string | number } })._meta?.progressToken;
    const outputDir = getOutputDir();
    const targetPlatform = platform ?? 'web';
    const config: AgentEyeConfig = {
      ...DEFAULT_CONFIG,
      platform: targetPlatform,
      headed: headed ?? false,
      outputDir,
      vars: vars ?? undefined,
      envFile: env_file ?? undefined,
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

    // Wire up progress notifications
    const onProgress = (p: { current: number; total: number; message: string }) => {
      sendProgress(extra, progressToken, p.current, p.total, p.message);
    };

    const reporter = new Reporter();
    const planner = new Planner();

    if (script_path) {
      if (!existsSync(script_path)) {
        return {
          content: [{ type: 'text' as const, text: `Script not found: ${script_path}` }],
        };
      }
      const yamlContent = await readFile(script_path, 'utf-8');
      const scenario = parse(yamlContent);

      await sendProgress(extra, progressToken, 0, 1, `Running script: ${script_path}`);

      const startTime = Date.now();
      const runner = new Runner({ ...config, onProgress });
      const result = await runner.runScript(scenario);
      const durationMs = Date.now() - startTime;

      const report = reporter.generateReport(
        scenario.name || script_path,
        [result],
        config,
        durationMs,
      );
      await reporter.writeReport(report, outputDir);

      await sendProgress(extra, progressToken, 1, 1, `Script completed (${(durationMs / 1000).toFixed(1)}s)`);

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
            text: 'Test plan not found. Please run agenteye_plan first.',
          },
        ],
      };
    }

    const yamlContent = await readFile(path, 'utf-8');
    const plan = planner.fromYaml(yamlContent);

    await sendProgress(extra, progressToken, 0, 1, 'Starting test execution...');

    const startTime = Date.now();
    const runner = new Runner({ ...config, onProgress });
    const results = await runner.runPlan(plan);
    const durationMs = Date.now() - startTime;

    const report = reporter.generateReport(
      plan.target,
      results,
      config,
      durationMs,
    );
    await reporter.writeReport(report, outputDir);

    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    await sendProgress(extra, progressToken, results.length, results.length,
      `Tests complete: ${passed} passed, ${failed} failed (${(durationMs / 1000).toFixed(1)}s)`);

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
  'Retrieve test reports. Can get the latest report or a specific run by ID.',
  {
    run_id: z.string().optional().describe('Specific run ID'),
    latest: z.boolean().optional().describe('Get latest report').default(true),
  },
  async ({ run_id }) => {
    const outputDir = getOutputDir();
    const reporter = new Reporter();

    let report;

    if (run_id) {
      const reportPath = join(outputDir, 'reports', run_id, 'report.json');
      if (!existsSync(reportPath)) {
        return {
          content: [{ type: 'text' as const, text: `Report not found: ${run_id}` }],
        };
      }
      report = await reporter.readReport(reportPath);
    } else {
      report = await reporter.getLatestReport(outputDir);
    }

    if (!report) {
      return {
        content: [
          { type: 'text' as const, text: 'No test reports found. Please run agenteye_run first.' },
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
  'Retrieve a test screenshot in base64 format.',
  {
    screenshot_path: z.string().describe('Screenshot file path'),
  },
  async ({ screenshot_path }) => {
    if (!existsSync(screenshot_path)) {
      return {
        content: [
          { type: 'text' as const, text: `Screenshot not found: ${screenshot_path}` },
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
  'List historical test runs.',
  {
    limit: z.number().optional().describe('Maximum number of results').default(10),
  },
  async ({ limit }) => {
    const outputDir = getOutputDir();
    const reporter = new Reporter();
    const runs = await reporter.listRuns(outputDir, limit);

    if (runs.length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No test runs found.' }],
      };
    }

    const text = runs
      .map((r) => `- ${r.run_id} (${r.path})`)
      .join('\n');

    return {
      content: [{ type: 'text' as const, text: `Historical test runs:\n${text}` }],
    };
  },
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
