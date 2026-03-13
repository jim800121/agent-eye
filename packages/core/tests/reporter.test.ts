import { describe, it, expect } from 'vitest';
import { Reporter } from '../src/reporter/reporter.js';
import { DEFAULT_CONFIG } from '../src/types/config.js';
import type { TestResult } from '../src/types/report.js';

describe('Reporter', () => {
  const reporter = new Reporter();

  const mockResults: TestResult[] = [
    {
      test_name: '首頁載入測試',
      page_url: 'https://example.com',
      status: 'passed',
      duration_ms: 1200,
      steps: [
        {
          step: '打開 https://example.com',
          status: 'passed',
          console_errors: [],
          network_errors: [],
        },
      ],
    },
    {
      test_name: '登入流程測試',
      page_url: 'https://example.com/login',
      status: 'failed',
      duration_ms: 3400,
      steps: [
        {
          step: '點擊登入按鈕',
          status: 'failed',
          description: 'API 回傳 500',
          severity: 'critical',
          console_errors: [
            {
              level: 'error',
              message: 'Uncaught TypeError',
              source: 'app.js:142',
            },
          ],
          network_errors: [
            {
              url: 'https://example.com/api/login',
              method: 'POST',
              status: 500,
            },
          ],
        },
      ],
    },
    {
      test_name: '註冊頁面載入',
      page_url: 'https://example.com/register',
      status: 'warning',
      duration_ms: 2100,
      steps: [
        {
          step: '打開註冊頁面',
          status: 'warning',
          console_errors: [
            { level: 'warning', message: 'Deprecation warning' },
          ],
          network_errors: [],
        },
      ],
    },
  ];

  it('should generate a report with correct summary', () => {
    const report = reporter.generateReport(
      'https://example.com',
      mockResults,
      DEFAULT_CONFIG,
      6700,
    );

    expect(report.summary.total_tests).toBe(3);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.failed).toBe(1);
    expect(report.summary.warnings).toBe(1);
    expect(report.summary.duration_ms).toBe(6700);
  });

  it('should generate a unique run ID', () => {
    const report1 = reporter.generateReport(
      'https://example.com',
      mockResults,
      DEFAULT_CONFIG,
      1000,
    );
    const report2 = reporter.generateReport(
      'https://example.com',
      mockResults,
      DEFAULT_CONFIG,
      1000,
    );

    expect(report1.test_run_id).not.toBe(report2.test_run_id);
    expect(report1.test_run_id).toMatch(/^run_\d{8}_\d{6}_/);
  });

  it('should include all results in the report', () => {
    const report = reporter.generateReport(
      'https://example.com',
      mockResults,
      DEFAULT_CONFIG,
      6700,
    );

    expect(report.results).toHaveLength(3);
    expect(report.results[0].test_name).toBe('首頁載入測試');
    expect(report.results[1].test_name).toBe('登入流程測試');
  });

  it('should include target and timestamp', () => {
    const report = reporter.generateReport(
      'https://example.com',
      mockResults,
      DEFAULT_CONFIG,
      6700,
    );

    expect(report.target).toBe('https://example.com');
    expect(report.timestamp).toBeDefined();
  });
});
