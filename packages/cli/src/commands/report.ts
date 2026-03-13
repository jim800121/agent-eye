import type { Command } from 'commander';
import { join } from 'node:path';
import { Reporter } from '@agenteye/core';
import * as output from '../utils/output.js';

export function registerReportCommand(program: Command): void {
  program
    .command('report [run_id]')
    .description('查看測試報告')
    .option('--latest', '查看最新報告')
    .option('--format <format>', '輸出格式 (json|summary)', 'summary')
    .option('--list', '列出所有測試紀錄')
    .action(async (runId: string | undefined, options) => {
      const cwd = process.cwd();
      const agenteyeDir = join(cwd, '.agenteye');
      const reporter = new Reporter();

      if (options.list) {
        const runs = await reporter.listRuns(agenteyeDir, 20);
        if (runs.length === 0) {
          output.info('目前沒有測試紀錄');
          return;
        }
        output.info('測試紀錄：');
        for (const run of runs) {
          output.info(`  ${run.run_id}`);
        }
        return;
      }

      try {
        let report;

        if (runId) {
          const reportPath = join(
            agenteyeDir,
            'reports',
            runId,
            'report.json',
          );
          report = await reporter.readReport(reportPath);
        } else {
          report = await reporter.getLatestReport(agenteyeDir);
        }

        if (!report) {
          output.info('找不到測試報告');
          output.info('  請先執行 agenteye run');
          return;
        }

        if (options.format === 'json') {
          console.log(JSON.stringify(report, null, 2));
          return;
        }

        // Summary format
        output.info('');
        output.info(`  Run ID: ${report.test_run_id}`);
        output.info(`  目標: ${report.target}`);
        output.info(`  時間: ${report.timestamp}`);
        output.info(`  耗時: ${(report.summary.duration_ms / 1000).toFixed(1)}s`);
        output.info('');

        for (const result of report.results) {
          const duration = (result.duration_ms / 1000).toFixed(1);
          if (result.status === 'passed') {
            output.success(`${result.test_name} (${duration}s)`);
          } else if (result.status === 'failed') {
            output.fail(`${result.test_name} (${duration}s)`);
            for (const step of result.steps) {
              if (step.status === 'failed' && step.description) {
                output.info(`      ${step.description}`);
              }
            }
          } else if (result.status === 'warning') {
            output.warning(`${result.test_name} (${duration}s)`);
          }
        }

        output.summary(
          report.summary.passed,
          report.summary.failed,
          report.summary.warnings,
        );
      } catch (error) {
        output.fail(
          `讀取報告失敗: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
}
