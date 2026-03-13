import type { IDriver, IDriverPage, DriverLaunchOptions } from '../driver/types.js';
import { createDriver } from '../driver/index.js';
import type { TestPlan, ScenarioPlan, StepPlan } from '../types/plan.js';
import type { TestResult, StepResult } from '../types/report.js';
import type { MobileConfig } from '../types/config.js';
import { Collector } from '../collector/collector.js';
import { Screenshotter } from '../screenshotter/screenshotter.js';
import { logger } from '../utils/logger.js';

export interface RunnerOptions {
  platform: 'web' | 'ios' | 'android';
  headed: boolean;
  timeout: number;
  parallel: number;
  outputDir: string;
  saveDomSnapshot: boolean;
  mobile?: MobileConfig;
}

interface ParsedAction {
  type:
    | 'navigate'
    | 'click'
    | 'fill'
    | 'select'
    | 'wait'
    | 'assert_url'
    | 'assert_text'
    | 'swipe'
    | 'long_press'
    | 'switch_context';
  target?: string;
  value?: string;
}

const STEP_PATTERNS: Array<{
  pattern: RegExp;
  type: ParsedAction['type'];
  extract: (match: RegExpMatchArray) => Partial<ParsedAction>;
}> = [
  {
    pattern: /^(打開|開啟|前往|navigate to|open)\s+(.+)$/i,
    type: 'navigate',
    extract: (m) => ({ target: m[2].trim() }),
  },
  {
    pattern: /^(在|於)\s*(.+?)\s*(欄位)?\s*(輸入|填入|type|enter|input)\s+(.+)$/i,
    type: 'fill',
    extract: (m) => ({ target: m[2].trim(), value: m[5].trim() }),
  },
  {
    pattern: /^(輸入|填入)\s+(.+?)\s*(到|至|in|into)\s+(.+)$/i,
    type: 'fill',
    extract: (m) => ({ target: m[4].trim(), value: m[2].trim() }),
  },
  {
    pattern: /^(點擊|按下|click|press|tap)\s+(.+)$/i,
    type: 'click',
    extract: (m) => ({ target: m[2].trim() }),
  },
  {
    pattern: /^(等待|wait)\s+(\d+)\s*(秒|s|ms)?$/i,
    type: 'wait',
    extract: (m) => ({
      value: m[3] === 'ms' ? m[2] : String(Number(m[2]) * 1000),
    }),
  },
  // Mobile-specific patterns
  {
    pattern: /^(swipe|滑動)\s+(up|down|left|right|上|下|左|右)$/i,
    type: 'swipe',
    extract: (m) => {
      const dirMap: Record<string, string> = { 上: 'up', 下: 'down', 左: 'left', 右: 'right' };
      return { target: dirMap[m[2]] || m[2].toLowerCase() };
    },
  },
  {
    pattern: /^(long press|長按)\s+(.+)$/i,
    type: 'long_press',
    extract: (m) => ({ target: m[2].trim() }),
  },
  {
    pattern: /^(switch to|切換到)\s+(native|webview|原生|網頁)$/i,
    type: 'switch_context',
    extract: (m) => {
      const ctx = m[2].toLowerCase();
      return {
        target: ctx === 'native' || ctx === '原生' ? 'NATIVE_APP' : 'WEBVIEW',
      };
    },
  },
];

const EXPECT_PATTERNS: Array<{
  pattern: RegExp;
  type: ParsedAction['type'];
  extract: (match: RegExpMatchArray) => Partial<ParsedAction>;
}> = [
  {
    pattern: /^(頁面導向|跳轉到|redirect to|navigate to|url is)\s+(.+)$/i,
    type: 'assert_url',
    extract: (m) => ({ target: m[2].trim() }),
  },
  {
    pattern: /^(顯示|出現|包含|show|display|contain)\s+(.+)$/i,
    type: 'assert_text',
    extract: (m) => ({ value: m[2].trim() }),
  },
];

export class Runner {
  private driver: IDriver | null = null;

  constructor(private options: RunnerOptions) {}

  private buildLaunchOptions(): DriverLaunchOptions {
    const opts: DriverLaunchOptions = {
      platform: this.options.platform,
      headless: !this.options.headed,
      timeout: this.options.timeout,
    };

    if (this.options.mobile) {
      const m = this.options.mobile;
      opts.appPath = m.appPath;
      opts.deviceName = m.deviceName;
      opts.platformVersion = m.platformVersion;
      opts.automationName = m.automationName;
      opts.bundleId = m.bundleId;
      opts.appPackage = m.appPackage;
      opts.appActivity = m.appActivity;
      opts.udid = m.udid;
      opts.appiumHost = m.appiumHost;
      opts.appiumPort = m.appiumPort;
    }

    return opts;
  }

  async runPlan(plan: TestPlan): Promise<TestResult[]> {
    this.driver = await createDriver(this.buildLaunchOptions());
    const results: TestResult[] = [];

    const activePages = plan.pages.filter((p) => !p.skip);

    for (const pagePlan of activePages) {
      for (const scenario of pagePlan.scenarios) {
        const result = await this.runScenario(scenario, pagePlan.url);
        results.push(result);
      }
    }

    await this.close();
    return results;
  }

  async runScript(scenario: ScenarioPlan, baseUrl?: string): Promise<TestResult> {
    this.driver = await createDriver(this.buildLaunchOptions());
    const result = await this.runScenario(scenario, baseUrl || '');
    await this.close();
    return result;
  }

  private async runScenario(
    scenario: ScenarioPlan,
    pageUrl: string,
  ): Promise<TestResult> {
    const startTime = Date.now();
    const context = await this.driver!.newContext();
    const page = await context.newPage();
    const collector = new Collector();
    const screenshotter = new Screenshotter(this.options.outputDir);

    collector.attach(page);

    const stepResults: StepResult[] = [];
    let overallStatus: TestResult['status'] = 'passed';
    let stepIndex = 0;

    for (const stepPlan of scenario.steps) {
      stepIndex++;
      const stepName = `${scenario.name}_step${stepIndex}`;

      if (stepPlan.step) {
        const result = await this.executeStep(
          page, stepPlan, collector, screenshotter, stepName, pageUrl,
        );
        stepResults.push(result);
        if (result.status === 'failed') overallStatus = 'failed';
        else if (result.status === 'warning' && overallStatus !== 'failed')
          overallStatus = 'warning';
      }

      if (stepPlan.expect) {
        const result = await this.executeExpect(
          page, stepPlan, collector, screenshotter, stepName, pageUrl,
        );
        stepResults.push(result);
        if (result.status === 'failed') overallStatus = 'failed';
        else if (result.status === 'warning' && overallStatus !== 'failed')
          overallStatus = 'warning';
      }
    }

    const consoleErrors = collector.getConsoleErrors();
    if (consoleErrors.some((e) => e.level === 'error') && overallStatus === 'passed') {
      overallStatus = 'warning';
    }

    await context.close();

    return {
      test_name: scenario.name,
      page_url: pageUrl,
      status: overallStatus,
      duration_ms: Date.now() - startTime,
      steps: stepResults,
    };
  }

  private async executeStep(
    page: IDriverPage,
    stepPlan: StepPlan,
    collector: Collector,
    screenshotter: Screenshotter,
    stepName: string,
    pageUrl: string,
  ): Promise<StepResult> {
    const stepText = stepPlan.step!;
    const action = this.parseStep(stepText);

    const result: StepResult = {
      step: stepText,
      status: 'passed',
      console_errors: [],
      network_errors: [],
    };

    try {
      collector.reset();

      switch (action.type) {
        case 'navigate':
          await page.goto(action.target!, {
            timeout: this.options.timeout,
            waitUntil: 'domcontentloaded',
          });
          break;

        case 'click':
          await this.performClick(page, action.target!);
          break;

        case 'fill':
          await this.performFill(page, action.target!, action.value!);
          break;

        case 'wait':
          await page.waitForTimeout(Number(action.value));
          break;

        case 'swipe':
          if (page.swipe) {
            await page.swipe(action.target as 'up' | 'down' | 'left' | 'right');
          } else {
            logger.warn('swipe 操作僅支援 Mobile 平台');
          }
          break;

        case 'long_press':
          if (page.longPress) {
            await page.longPress(action.target!);
          } else {
            logger.warn('long press 操作僅支援 Mobile 平台');
          }
          break;

        case 'switch_context':
          if (page.switchContext) {
            if (action.target === 'WEBVIEW') {
              const contexts = await page.getContexts?.() || [];
              const webview = contexts.find((c) => c.startsWith('WEBVIEW'));
              if (webview) {
                await page.switchContext(webview);
              } else {
                throw new Error('找不到 WEBVIEW context');
              }
            } else {
              await page.switchContext('NATIVE_APP');
            }
          } else {
            logger.warn('context 切換僅支援 Mobile 平台');
          }
          break;

        default:
          logger.warn(`無法解析步驟: ${stepText}`);
      }

      await page.waitForTimeout(500);

      result.console_errors = collector.getConsoleErrors();
      result.network_errors = collector.getNetworkErrors();

      if (result.console_errors.some((e) => e.level === 'error')) {
        result.status = 'warning';
        result.severity = 'warning';
        result.description = '步驟執行成功但有 console 錯誤';
        result.screenshot_full = await screenshotter.captureFullPage(page, stepName);
        if (this.options.saveDomSnapshot) {
          result.dom_snapshot = await screenshotter.captureDom(page, stepName);
        }
      }
    } catch (error) {
      result.status = 'failed';
      result.severity = 'critical';
      result.description = `步驟執行失敗: ${error instanceof Error ? error.message : String(error)}`;
      result.console_errors = collector.getConsoleErrors();
      result.network_errors = collector.getNetworkErrors();
      result.reproduction_steps = this.buildReproductionSteps(pageUrl, stepText);

      try {
        result.screenshot_full = await screenshotter.captureFullPage(page, stepName);
        if (this.options.saveDomSnapshot) {
          result.dom_snapshot = await screenshotter.captureDom(page, stepName);
        }
      } catch {
        // Page might be in a bad state
      }
    }

    return result;
  }

  private async executeExpect(
    page: IDriverPage,
    stepPlan: StepPlan,
    collector: Collector,
    screenshotter: Screenshotter,
    stepName: string,
    pageUrl: string,
  ): Promise<StepResult> {
    const expectText = stepPlan.expect!;
    const action = this.parseExpect(expectText);

    const result: StepResult = {
      step: `[預期] ${expectText}`,
      status: 'passed',
      console_errors: [],
      network_errors: [],
    };

    try {
      switch (action.type) {
        case 'assert_url': {
          const currentUrl = page.url();
          const expected = action.target!;
          if (!currentUrl.includes(expected)) {
            throw new Error(`預期 URL 包含 "${expected}"，但實際為 "${currentUrl}"`);
          }
          break;
        }

        case 'assert_text': {
          const text = action.value!;
          const bodyText = await page.textContent('body');
          if (!bodyText?.includes(text)) {
            throw new Error(`預期頁面包含 "${text}"，但未找到`);
          }
          break;
        }

        default: {
          const errors = collector.getConsoleErrors().filter((e) => e.level === 'error');
          if (errors.length > 0) {
            result.status = 'warning';
            result.severity = 'warning';
            result.description = `頁面有 ${errors.length} 個 console 錯誤`;
            result.console_errors = errors;
          }
        }
      }
    } catch (error) {
      result.status = 'failed';
      result.severity = 'critical';
      result.description = error instanceof Error ? error.message : String(error);
      result.reproduction_steps = this.buildReproductionSteps(pageUrl, expectText);

      try {
        result.screenshot_full = await screenshotter.captureFullPage(page, `${stepName}_expect`);
        if (this.options.saveDomSnapshot) {
          result.dom_snapshot = await screenshotter.captureDom(page, `${stepName}_expect`);
        }
      } catch {
        // ignore
      }
    }

    return result;
  }

  private parseStep(text: string): ParsedAction {
    for (const { pattern, type, extract } of STEP_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        return { type, ...extract(match) } as ParsedAction;
      }
    }
    if (text.startsWith('http')) {
      return { type: 'navigate', target: text };
    }
    return { type: 'navigate', target: text };
  }

  private parseExpect(text: string): ParsedAction {
    for (const { pattern, type, extract } of EXPECT_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        return { type, ...extract(match) } as ParsedAction;
      }
    }
    return { type: 'assert_text', value: text };
  }

  private async performClick(page: IDriverPage, target: string): Promise<void> {
    try {
      await page.getByText(target, { exact: false }).first().click({
        timeout: this.options.timeout,
      });
    } catch {
      try {
        await page.getByRole('button', { name: target }).first().click({
          timeout: this.options.timeout,
        });
      } catch {
        await page.locator(target).first().click({
          timeout: this.options.timeout,
        });
      }
    }
  }

  private async performFill(page: IDriverPage, target: string, value: string): Promise<void> {
    try {
      await page.getByLabel(target, { exact: false }).first().fill(value);
    } catch {
      try {
        await page.getByPlaceholder(target, { exact: false }).first().fill(value);
      } catch {
        try {
          await page.locator(`[name="${target}"]`).first().fill(value);
        } catch {
          await page.locator(target).first().fill(value);
        }
      }
    }
  }

  private buildReproductionSteps(pageUrl: string, currentStep: string): string[] {
    const steps: string[] = [];
    if (pageUrl) steps.push(`打開 ${pageUrl}`);
    steps.push(currentStep);
    return steps;
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }
}
