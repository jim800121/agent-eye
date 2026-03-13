export interface AppConfig {
  path?: string;
  bundleId?: string;
  appPackage?: string;
  appActivity?: string;
}

export interface TestPlan {
  target: string;
  generated_at: string;
  version: string;
  platform?: 'web' | 'ios' | 'android';
  app?: AppConfig;
  pages: PagePlan[];
}

export interface PagePlan {
  url: string;
  title?: string;
  skip: boolean;
  skip_reason?: string;
  elements: ElementInfo[];
  scenarios: ScenarioPlan[];
}

export interface ElementInfo {
  selector: string;
  type: 'input' | 'button' | 'link' | 'select' | 'textarea' | 'form';
  text?: string;
  name?: string;
  test?: string;
}

export interface ScenarioPlan {
  name: string;
  description?: string;
  steps: StepPlan[];
}

export interface StepPlan {
  /** 動作描述（自然語言） */
  step?: string;
  /** 預期結果 */
  expect?: string;
}
