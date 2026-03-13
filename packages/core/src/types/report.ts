import type { AgentEyeConfig } from './config.js';
import type { ConsoleError, NetworkError } from './errors.js';

export interface TestRunReport {
  test_run_id: string;
  timestamp: string;
  target: string;
  platform?: 'web' | 'ios' | 'android';
  device?: string;
  config: AgentEyeConfig;
  summary: TestSummary;
  results: TestResult[];
}

export interface TestSummary {
  total_tests: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
  duration_ms: number;
}

export interface TestResult {
  test_name: string;
  page_url: string;
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  duration_ms: number;
  steps: StepResult[];
}

export interface StepResult {
  step: string;
  status: 'passed' | 'failed' | 'warning';
  screenshot_full?: string;
  screenshot_element?: string;
  dom_snapshot?: string;
  console_errors: ConsoleError[];
  network_errors: NetworkError[];
  description?: string;
  severity?: 'critical' | 'warning' | 'info';
  reproduction_steps?: string[];
}
