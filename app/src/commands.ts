import { Command as ProgramCommand } from 'commander';
import { run } from './runner.js';
import { text } from './text.js';
import { runUpdateCheck } from './update-check.js';

export type CommandSource = 'builtin' | 'plugin' | 'env';

export interface CommandBase {
  name: string;
  source: CommandSource;
  description?: string;
  load(): Promise<void>;
}

export interface PassthroughCommand extends CommandBase {
  type: 'passthrough';
  vendor: string;
  binary: string;
}

export type Command = PassthroughCommand;

export function passthroughCommand(cmd: PassthroughCommand): ProgramCommand {
  return new ProgramCommand(cmd.name)
    .description(cmd.description ?? text.help.passthrough(cmd.binary))
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .helpOption(false)
    .argument('[args...]')
    .action(async (args: string[] | undefined) => {
      await cmd.load();
      await runUpdateCheck();
      process.exit(await run(cmd.vendor, cmd.binary, args ?? []));
    });
}

const noop = async (): Promise<void> => {};

export const BUILTIN_COMMANDS: Command[] = [
  {
    type: 'passthrough',
    source: 'builtin',
    name: 'claude',
    vendor: 'anthropic',
    binary: 'claude',
    load: noop,
  },
  {
    type: 'passthrough',
    source: 'builtin',
    name: 'codex',
    vendor: 'openai',
    binary: 'codex',
    load: noop,
  },
];
