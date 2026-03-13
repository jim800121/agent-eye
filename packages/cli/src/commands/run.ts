import type { Command } from 'commander';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  Runner,
  Planner,
  Reporter,
  DEFAULT_CONFIG,
  type AgentEyeConfig,
} from '@agenteye/core';
import * as output from '../utils/output.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('執行 UI 測試')
    .option('-p, --plan <path>', '指定測試計畫路徑')
    .option('-s, --script <path>', '執行特定 YAML 腳本')
    .option('--headed', '顯示瀏覽器視窗')
    .option('-t, --timeout <ms>', '超時時間 (ms)', '30000')
    .option('--parallel <n>', '並行數量', '3')
    .option('--platform <platform>', '測試平台 (web|ios|android)', 'web')
    .option('--app <path>', 'App 路徑 (.app / .apk)')
    .option('--device <name>', '裝置名稱')
    .option('--platform-version <version>', '平台版本')
    .option('--bundle-id <id>', 'iOS Bundle ID')
    .option('--app-package <pkg>', 'Android Package Name')
    .option('--app-activity <activity>', 'Android Launch Activity')
    .option('--appium-host <host>', 'Appium Server Host', 'localhost')
    .option('--appium-port <port>', 'Appium Server Port', '4723')
    .action(async (options) => {
      const cwd = process.cwd();
      const agenteyeDir = join(cwd, '.agenteye');
      const platform = options.platform as 'web' | 'ios' | 'android';

      const config: AgentEyeConfig = {
        ...DEFAULT_CONFIG,
        platform,
        headed: options.headed || false,
        timeout: parseInt(options.timeout, 10),
        parallel: parseInt(options.parallel, 10),
        outputDir: agenteyeDir,
      };

      // Add mobile config if platform is not web
      if (platform !== 'web') {
        config.mobile = {
          appPath: options.app,
          deviceName: options.device,
          platformVersion: options.platformVersion,
          bundleId: options.bundleId,
          appPackage: options.appPackage,
          appActivity: options.appActivity,
          appiumHost: options.appiumHost,
          appiumPort: parseInt(options.appiumPort, 10),
        };
      }

      const planner = new Planner();
      const reporter = new Reporter();

      if (options.script) {
        const scriptPath = options.script;
        if (!existsSync(scriptPath)) {
          output.fail(`找不到腳本: ${scriptPath}`);
          process.exit(1);
        }

        const yamlContent = await readFile(scriptPath, 'utf-8');
        const { parse } = await import('yaml');
        const scenario = parse(yamlContent);

        const platformLabel = platform === 'web' ? '' : ` [${platform.toUpperCase()}]`;
        output.step('rocket', `執行腳本: ${scriptPath}${platformLabel}`);

        const startTime = Date.now();
        const runner = new Runner(config);
        const result = await runner.runScript(scenario);
        const durationMs = Date.now() - startTime;

        const report = reporter.generateReport(
          scenario.name || scriptPath,
          [result],
          config,
          durationMs,
        );

        const reportPath = await reporter.writeReport(report, agenteyeDir);
        printResults([result], reportPath, report.test_run_id);
        return;
      }

      // Plan mode
      const planPath =
        options.plan || join(agenteyeDir, 'plans', 'agenteye-plan.yaml');

      if (!existsSync(planPath)) {
        output.fail(`找不到測試計畫: ${planPath}`);
        output.info('  請先執行 agenteye plan <url> 生成測試計畫');
        process.exit(1);
      }

      const yamlContent = await readFile(planPath, 'utf-8');
      const plan = planner.fromYaml(yamlContent);

      // Override platform from CLI if specified
      if (platform !== 'web') {
        plan.platform = platform;
      }

      const activePages = plan.pages.filter((p) => !p.skip);
      const totalScenarios = activePages.reduce(
        (sum, p) => sum + p.scenarios.length,
        0,
      );

      const platformLabel = platform === 'web' ? '' : ` [${platform.toUpperCase()}]`;
      output.step(
        'rocket',
        `開始測試 (${activePages.length} 頁面, ${totalScenarios} 情境)${platformLabel}`,
      );

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

      const reportPath = await reporter.writeReport(report, agenteyeDir);
      printResults(results, reportPath, report.test_run_id);
    });
}

function printResults(
  results: Array<{ test_name: string; status: string; duration_ms: number; page_url: string }>,
  reportPath: string,
  runId: string,
): void {
  output.info('');

  for (const result of results) {
    const duration = (result.duration_ms / 1000).toFixed(1);
    const status = result.status;

    if (status === 'passed') {
      output.success(`${result.test_name} (${duration}s)`);
    } else if (status === 'failed') {
      output.fail(`${result.test_name} (${duration}s)`);
    } else if (status === 'warning') {
      output.warning(`${result.test_name} (${duration}s)`);
    } else {
      output.step('skip', `${result.test_name} — skipped`);
    }
  }

  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const warnings = results.filter((r) => r.status === 'warning').length;

  output.summary(passed, failed, warnings);
  output.info('');
  output.step('report', `報告: ${reportPath}`);
  output.step('camera', `截圖: .agenteye/reports/${runId}/screenshots/`);
  output.info('');
}
