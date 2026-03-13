import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '@agenteye/core';
import { stringify } from 'yaml';
import * as output from '../utils/output.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('初始化 AgentEye 設定')
    .action(async () => {
      const cwd = process.cwd();
      const agenteyeDir = join(cwd, '.agenteye');

      if (existsSync(agenteyeDir)) {
        output.warning('.agenteye 目錄已存在');
        return;
      }

      await mkdir(join(agenteyeDir, 'plans'), { recursive: true });
      await mkdir(join(agenteyeDir, 'reports'), { recursive: true });
      await mkdir(join(agenteyeDir, 'scripts'), { recursive: true });

      const configContent = stringify(DEFAULT_CONFIG);
      await writeFile(
        join(agenteyeDir, 'config.yaml'),
        `# AgentEye 設定檔\n${configContent}`,
        'utf-8',
      );

      output.success('AgentEye 初始化完成！');
      output.step('folder', `設定目錄: ${agenteyeDir}`);
      output.info('');
      output.step('bulb', '下一步：');
      output.info('  agenteye plan <url>  — 生成測試計畫');
      output.info('  agenteye run         — 執行測試');
    });
}
