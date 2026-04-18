import { text } from './text.js';

export class CliError extends Error {
  constructor(message: string, readonly exitCode: number = 1) {
    super(message);
    this.name = 'CliError';
  }
}

export class BinaryNotFoundError extends CliError {
  constructor(binary: string) {
    super(text.errors.binaryNotFound(binary), 127);
    this.name = 'BinaryNotFoundError';
  }
}
