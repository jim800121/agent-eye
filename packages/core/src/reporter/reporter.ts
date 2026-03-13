import type { AgentEyeConfig } from '../types/config.js';
import type {
  TestRunReport,
  TestSummary,
  TestResult,
} from '../types/report.js';
import { writeJson, readJson, listDirs } from '../utils/file.js';
import { join } from 'node:path';

export class Reporter {
  generateReport(
    target: string,
    results: TestResult[],
    config: AgentEyeConfig,
    durationMs: number,
  ): TestRunReport {
    return {
      test_run_id: this.generateRunId(),
      timestamp: new Date().toISOString(),
      target,
      config,
      summary: this.calculateSummary(results, durationMs),
      results,
    };
  }

  async writeReport(
    report: TestRunReport,
    outputDir: string,
  ): Promise<string> {
    const reportDir = join(outputDir, 'reports', report.test_run_id);
    const reportPath = join(reportDir, 'report.json');
    await writeJson(reportPath, report);
    return reportPath;
  }

  async readReport(reportPath: string): Promise<TestRunReport> {
    return readJson<TestRunReport>(reportPath);
  }

  async getLatestReport(outputDir: string): Promise<TestRunReport | null> {
    const reportsDir = join(outputDir, 'reports');
    const runs = await listDirs(reportsDir);
    if (runs.length === 0) return null;

    const latestRunDir = join(reportsDir, runs[0]);
    const reportPath = join(latestRunDir, 'report.json');
    return this.readReport(reportPath);
  }

  async listRuns(
    outputDir: string,
    limit = 10,
  ): Promise<Array<{ run_id: string; path: string }>> {
    const reportsDir = join(outputDir, 'reports');
    const runs = await listDirs(reportsDir);
    return runs.slice(0, limit).map((run) => ({
      run_id: run,
      path: join(reportsDir, run, 'report.json'),
    }));
  }

  private generateRunId(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const time = now.toISOString().slice(11, 19).replace(/:/g, '');
    const rand = Math.random().toString(36).slice(2, 6);
    return `run_${date}_${time}_${rand}`;
  }

  private calculateSummary(
    results: TestResult[],
    durationMs: number,
  ): TestSummary {
    return {
      total_tests: results.length,
      passed: results.filter((r) => r.status === 'passed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      warnings: results.filter((r) => r.status === 'warning').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      duration_ms: durationMs,
    };
  }
}
