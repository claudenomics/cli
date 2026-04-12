import { Command } from 'commander';
import { run } from './runner.js';

export interface PassthroughSpec {
  name: string;
  vendor: string;
  binary: string;
  description?: string;
}

export function passthroughCommand(spec: PassthroughSpec): Command {
  return new Command(spec.name)
    .description(spec.description ?? `Run ${spec.binary} through the claudenomics proxy (all flags passthrough).`)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .helpOption(false)
    .argument('[args...]')
    .action(async (args: string[] | undefined) => {
      process.exit(await run(spec.vendor, spec.binary, args ?? []));
    });
}

export const BUILTIN_COMMANDS: PassthroughSpec[] = [
  { name: 'claude', vendor: 'anthropic', binary: 'claude' },
  { name: 'codex', vendor: 'openai', binary: 'codex' },
];
