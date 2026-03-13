import type { CrawledPage } from '../crawler/crawler.js';
import type {
  TestPlan,
  PagePlan,
  ScenarioPlan,
  ElementInfo,
} from '../types/plan.js';
import { planToYaml, yamlToPlan } from '../utils/yaml.js';

export class Planner {
  generatePlan(pages: CrawledPage[], target: string): TestPlan {
    return {
      target,
      generated_at: new Date().toISOString(),
      version: '1.0',
      pages: pages.map((page) => this.generatePagePlan(page)),
    };
  }

  private generatePagePlan(page: CrawledPage): PagePlan {
    const scenarios = this.generateScenarios(page);
    return {
      url: page.url,
      title: page.title,
      skip: false,
      elements: page.elements,
      scenarios,
    };
  }

  private generateScenarios(page: CrawledPage): ScenarioPlan[] {
    const scenarios: ScenarioPlan[] = [];

    // 1. Page load check
    scenarios.push(this.generateLoadCheck(page));

    // 2. Form tests (if has input elements)
    const formInputs = page.elements.filter(
      (el) => el.type === 'input' || el.type === 'textarea' || el.type === 'select',
    );
    const buttons = page.elements.filter((el) => el.type === 'button');

    if (formInputs.length > 0 && buttons.length > 0) {
      scenarios.push(this.generateFormTest(page, formInputs, buttons));
      scenarios.push(this.generateEmptyFormTest(page, buttons));
    }

    return scenarios;
  }

  private generateLoadCheck(page: CrawledPage): ScenarioPlan {
    const path = new URL(page.url).pathname;
    return {
      name: `${page.title || path} — 頁面載入檢查`,
      description: '確認頁面正常載入，無 console 錯誤',
      steps: [
        { step: `打開 ${page.url}` },
        { expect: '頁面正常載入，無 console error' },
      ],
    };
  }

  private generateFormTest(
    page: CrawledPage,
    inputs: ElementInfo[],
    buttons: ElementInfo[],
  ): ScenarioPlan {
    const path = new URL(page.url).pathname;
    const steps: Array<{ step?: string; expect?: string }> = [];

    steps.push({ step: `打開 ${page.url}` });

    for (const input of inputs) {
      const label = input.text || input.name || input.selector;
      const testValue = this.generateTestValue(input);
      steps.push({ step: `在 ${label} 欄位輸入 ${testValue}` });
    }

    const submitBtn = buttons[0];
    const btnLabel = submitBtn.text || submitBtn.selector;
    steps.push({ step: `點擊 ${btnLabel}` });
    steps.push({ expect: '表單提交成功，無錯誤' });

    return {
      name: `${page.title || path} — 表單提交測試`,
      description: '測試表單填寫和提交',
      steps,
    };
  }

  private generateEmptyFormTest(
    page: CrawledPage,
    buttons: ElementInfo[],
  ): ScenarioPlan {
    const path = new URL(page.url).pathname;
    const submitBtn = buttons[0];
    const btnLabel = submitBtn.text || submitBtn.selector;

    return {
      name: `${page.title || path} — 空白表單提交測試`,
      description: '測試空白表單直接提交是否有驗證',
      steps: [
        { step: `打開 ${page.url}` },
        { step: `點擊 ${btnLabel}` },
        { expect: '顯示驗證錯誤訊息' },
      ],
    };
  }

  private generateTestValue(element: ElementInfo): string {
    const name = (element.name || element.selector).toLowerCase();
    if (name.includes('email') || name.includes('mail')) return 'test@example.com';
    if (name.includes('password') || name.includes('passwd')) return 'TestPassword123';
    if (name.includes('phone') || name.includes('tel')) return '0912345678';
    if (name.includes('name')) return 'Test User';
    if (name.includes('url') || name.includes('website')) return 'https://example.com';
    return 'test value';
  }

  toYaml(plan: TestPlan): string {
    return planToYaml(plan);
  }

  fromYaml(content: string): TestPlan {
    return yamlToPlan(content);
  }
}
