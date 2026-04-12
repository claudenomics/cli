const COMMON_ALLOW = new Set<string>([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'TERM',
  'TERMINFO',
  'TZ',
  'TMPDIR',
  'TEMP',
  'TMP',
  'PWD',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMFILES',
  'PROGRAMDATA',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT',
]);

const COMMON_ALLOW_PREFIXES = ['LC_', 'XDG_'];


export function buildChildEnv(
  base: NodeJS.ProcessEnv,
  vendorAllow: readonly string[],
  overrides: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  const allow = new Set<string>([...COMMON_ALLOW, ...vendorAllow]);
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) continue;
    if (allow.has(k) || COMMON_ALLOW_PREFIXES.some((p) => k.startsWith(p))) out[k] = v;
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
