const icons = {
  success: '\u2705',
  fail: '\u274C',
  warning: '\u26A0\uFE0F',
  skip: '\u23ED\uFE0F',
  search: '\uD83D\uDD0D',
  rocket: '\uD83D\uDE80',
  report: '\uD83D\uDCCA',
  camera: '\uD83D\uDCF8',
  folder: '\uD83D\uDCC1',
  bulb: '\uD83D\uDCA1',
  clipboard: '\uD83D\uDCCB',
};

export function banner(): void {
  console.log('');
  console.log('  \u2588\u2588\u2588\u2588\u2588\u2588\u2588  AgentEye');
  console.log('  AI Agent \u7684\u773C\u775B \u2014 \u81EA\u52D5\u5316 UI \u6E2C\u8A66\u6846\u67B6');
  console.log('');
}

export function info(message: string): void {
  console.log(`  ${message}`);
}

export function success(message: string): void {
  console.log(`  ${icons.success} ${message}`);
}

export function fail(message: string): void {
  console.log(`  ${icons.fail} ${message}`);
}

export function warning(message: string): void {
  console.log(`  ${icons.warning}  ${message}`);
}

export function step(icon: keyof typeof icons, message: string): void {
  console.log(`  ${icons[icon]} ${message}`);
}

export function tree(items: string[], last = false): void {
  items.forEach((item, i) => {
    const isLast = i === items.length - 1;
    const prefix = isLast ? '\u2514\u2500\u2500' : '\u251C\u2500\u2500';
    console.log(`  ${prefix} ${item}`);
  });
}

export function summary(
  passed: number,
  failed: number,
  warnings: number,
): void {
  console.log('');
  const parts: string[] = [];
  if (passed > 0) parts.push(`${passed} passed`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (warnings > 0) parts.push(`${warnings} warnings`);
  console.log(`  ${icons.report} 結果：${parts.join(', ')}`);
}
