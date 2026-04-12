import { spawn } from 'node:child_process';

export function openBrowser(url: string): boolean {
  const [cmd, ...args] =
    process.platform === 'darwin' ? ['open', url]
    : process.platform === 'win32' ? ['cmd', '/c', 'start', '""', url]
    : ['xdg-open', url];
  try {
    spawn(cmd!, args, { stdio: 'ignore', detached: true }).unref();
    return true;
  } catch {
    return false;
  }
}
