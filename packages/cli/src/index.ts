import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerPlanCommand } from './commands/plan.js';
import { registerRunCommand } from './commands/run.js';
import { registerReportCommand } from './commands/report.js';
import * as output from './utils/output.js';

const program = new Command();

program
  .name('agenteye')
  .description('AgentEye — AI Agent 的眼睛，自動化 UI 測試框架')
  .version('0.1.0')
  .hook('preAction', () => {
    output.banner();
  });

registerInitCommand(program);
registerPlanCommand(program);
registerRunCommand(program);
registerReportCommand(program);

program.parse();
