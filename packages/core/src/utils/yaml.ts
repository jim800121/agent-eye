import { stringify, parse } from 'yaml';
import type { TestPlan } from '../types/plan.js';

export function planToYaml(plan: TestPlan): string {
  return stringify(plan, { lineWidth: 0 });
}

export function yamlToPlan(content: string): TestPlan {
  return parse(content) as TestPlan;
}
