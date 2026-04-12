export class CliError extends Error {
  constructor(message: string, readonly exitCode: number = 1) {
    super(message);
    this.name = 'CliError';
  }
}

export class BinaryNotFoundError extends CliError {
  constructor(binary: string) {
    super(`Could not find '${binary}' on PATH. Install it first, then retry.`, 127);
    this.name = 'BinaryNotFoundError';
  }
}
