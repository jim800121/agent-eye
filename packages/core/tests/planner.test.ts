import { describe, it, expect } from 'vitest';
import { Planner } from '../src/planner/planner.js';
import type { CrawledPage } from '../src/crawler/crawler.js';

describe('Planner', () => {
  const planner = new Planner();

  const mockPages: CrawledPage[] = [
    {
      url: 'https://example.com',
      title: '首頁',
      status: 200,
      elements: [],
      links: ['https://example.com/login'],
    },
    {
      url: 'https://example.com/login',
      title: '登入',
      status: 200,
      elements: [
        { selector: '#email', type: 'input', name: 'email', text: 'Email' },
        { selector: '#password', type: 'input', name: 'password' },
        { selector: '#login-btn', type: 'button', text: '登入' },
      ],
      links: [],
    },
  ];

  it('should generate a test plan from crawled pages', () => {
    const plan = planner.generatePlan(mockPages, 'https://example.com');

    expect(plan.target).toBe('https://example.com');
    expect(plan.pages).toHaveLength(2);
    expect(plan.version).toBe('1.0');
    expect(plan.generated_at).toBeDefined();
  });

  it('should generate load check scenario for every page', () => {
    const plan = planner.generatePlan(mockPages, 'https://example.com');

    for (const page of plan.pages) {
      const loadCheck = page.scenarios.find((s) =>
        s.name.includes('頁面載入檢查'),
      );
      expect(loadCheck).toBeDefined();
    }
  });

  it('should generate form test scenarios for pages with inputs', () => {
    const plan = planner.generatePlan(mockPages, 'https://example.com');

    const loginPage = plan.pages.find((p) => p.url.includes('login'));
    expect(loginPage).toBeDefined();

    const formTest = loginPage!.scenarios.find((s) =>
      s.name.includes('表單提交測試'),
    );
    expect(formTest).toBeDefined();
    // Should have steps: navigate + fill email + fill password + click + expect
    expect(formTest!.steps.length).toBeGreaterThanOrEqual(4);
  });

  it('should generate empty form test for pages with forms', () => {
    const plan = planner.generatePlan(mockPages, 'https://example.com');

    const loginPage = plan.pages.find((p) => p.url.includes('login'));
    const emptyTest = loginPage!.scenarios.find((s) =>
      s.name.includes('空白表單提交'),
    );
    expect(emptyTest).toBeDefined();
  });

  it('should not generate form tests for pages without inputs', () => {
    const plan = planner.generatePlan(mockPages, 'https://example.com');

    const homePage = plan.pages.find((p) => p.url === 'https://example.com');
    // Only load check, no form tests
    expect(homePage!.scenarios).toHaveLength(1);
  });

  it('should convert plan to YAML and back', () => {
    const plan = planner.generatePlan(mockPages, 'https://example.com');
    const yaml = planner.toYaml(plan);
    const parsed = planner.fromYaml(yaml);

    expect(parsed.target).toBe(plan.target);
    expect(parsed.pages).toHaveLength(plan.pages.length);
  });

  it('should generate appropriate test values for email fields', () => {
    const plan = planner.generatePlan(mockPages, 'https://example.com');
    const loginPage = plan.pages.find((p) => p.url.includes('login'));
    const formTest = loginPage!.scenarios.find((s) =>
      s.name.includes('表單提交測試'),
    );

    // The planner uses element.text || element.name as label
    // The email element has text: 'Email', so the step should mention 'Email'
    const emailStep = formTest!.steps.find(
      (s) => s.step && (s.step.includes('Email') || s.step.includes('email')),
    );
    expect(emailStep).toBeDefined();
    expect(emailStep!.step).toContain('test@example.com');
  });
});
