import { loadSession } from '@claudenomics/auth';
import { CliError } from './errors.js';
import { styles } from './styles.js';
import { text } from './text.js';

const notSignedIn = (): CliError =>
  new CliError(text.session.notSignedIn(styles.cmd('claudenomics login')));

export async function requireAuth(): Promise<void> {
  const session = await loadSession();
  if (!session) throw notSignedIn();
}

export function unauthorizedError(): CliError {
  return notSignedIn();
}
