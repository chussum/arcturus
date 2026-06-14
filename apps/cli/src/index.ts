#!/usr/bin/env bun
import { Command } from 'commander';
import { registerAppsCommand } from './commands/apps';
import { registerDeployCommand } from './commands/deploy';
import { registerDestroyCommand } from './commands/destroy';
import { registerEnvCommand } from './commands/env';
import { registerLoginCommand } from './commands/login';
import { registerLogsCommand } from './commands/logs';
import { registerDeploymentsCommand, registerRollbackCommand } from './commands/releases';

const program = new Command()
  .name('arcturus')
  .description('Deploy apps to your team server')
  .version('0.1.0');

registerLoginCommand(program);
registerDeployCommand(program);
registerAppsCommand(program);
registerDeploymentsCommand(program);
registerRollbackCommand(program);
registerEnvCommand(program);
registerLogsCommand(program);
registerDestroyCommand(program);

program.parseAsync().catch((error: Error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
