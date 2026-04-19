import type { LoginPhase } from '@claudenomics/auth';

export const text = {
  brand: {
    url: 'claudenomics.xyz',
    help: 'claudenomics --help',
  },

  home: {
    tipPrefix: 'Pro tip: ',
    tips: [
      "It's always DNS",
      'Works on my machine',
      'Rewrite it in Rust',
      'YAML is a scam',
      'npm install, then wait',
      'Off by one, again',
      'Nothing is idempotent',
      "Regex works, don't touch it",
      'It was the semicolon',
      'Prod is staging we trust',
      'The cache is lying',
      'The types are lying',
      'Your generated tests are lying',
      'The linter was right',
      'Print debugging is debugging',
      'Merge now, apologize later',
      'Small PRs, small sins',
      'Delete it and see',
      'This is version one forever',
      'Your TODO is haunted',
      "Hallucinations are free, tokens aren't",
      'The model agrees with everything',
      `"You're absolutely right"`,
      'The model invented that API',
      "That function doesn't exist",
      'The diff looked right',
      'You accepted all',
      'The model apologized again',
      'Just one more prompt',
      'Reroll',
    ],
    notSignedIn: 'Not signed in',
    tokensLabel: 'tokens',
    commands: {
      login: { name: 'claudenomics login', desc: 'Sign in' },
      claude: { name: 'claudenomics claude', desc: 'Run claude' },
      codex: { name: 'claudenomics codex', desc: 'Run codex' },
      usage: { name: 'claudenomics usage', desc: 'Show token usage' },
      logout: { name: 'claudenomics logout', desc: 'Sign out' },
    },
  },

  help: {
    program: 'Transparent wrapper around claude-code and codex with token accounting.',
    verbose: 'Enable debug logging',
    noColor: 'Disable colored output',
    version: 'Show installed version',
    login: {
      summary: 'Sign in and create (or attach) your Solana wallet via Privy.',
      authUrlFlag: 'Override the default auth URL (dev only)',
    },
    whoami: 'Show your email, wallet, and session status.',
    logout: 'Revoke the session on the server and clear local state.',
    usage: 'Show your token usage from the backend (with model and provider breakdown).',
    usagePeriod: 'Period to summarize: day, week, month, or all (default all).',
    profile: 'Show a public profile with stats (defaults to yourself).',
    profilePeriod: 'Period to summarize: day, week, month, or all (default all).',
    leaderboard: 'Show the builders or squads leaderboard.',
    leaderboardView: 'View: builders or squads (default builders).',
    leaderboardPeriod: 'Period: day, week, month, or all (default all).',
    leaderboardLeague: 'Filter by league slug.',
    leaderboardSearch: 'Filter by handle or name.',
    leaderboardPage: 'Page number (default 1).',
    leaderboardPageSize: 'Entries per page, 1–100 (default 25).',
    status: 'Check session, enclave, backend reachability, and pending receipts.',
    update: 'Check npm for a newer version and print the upgrade command.',
    passthrough: (binary: string): string =>
      `Run ${binary} through the claudenomics proxy (all flags passthrough).`,
  },

  login: {
    phases: {
      opening: 'Opening browser…',
      awaiting: 'Waiting for sign-in…',
      verifying: 'Verifying…',
    } satisfies Record<LoginPhase, string>,
    failed: (msg: string): string => `Login failed: ${msg}`,
    next: 'Next:',
    nextCmd: 'claudenomics claude',
  },

  session: {
    notSignedIn: (cmd: string): string => `Not signed in — run ${cmd}`,
    signingOut: 'Signing out…',
    signedOut: 'Signed out',
    alreadySignedOut: 'Already signed out',
    noToken: (cmd: string): string => `Session has no token in keychain — run ${cmd}`,
    noTokenRelogin:
      'Session has no token in keychain — run `claudenomics login` again',
    enclaveSetNoSession:
      'CLAUDENOMICS_ENCLAVE_URL is set but no session — run `claudenomics login` first',
  },

  status: {
    loggedInAs: (id: string): string => `Logged in as ${id}`,
    sessionExpired: (cmd: string): string => `Session expired — run ${cmd}`,
    accessLine: (access: string, refresh: string): string =>
      `Access ${access} · refresh window ${refresh}`,
    accessExpired: 'expired (auto-refresh on next call)',
    enclaveNotSet: 'CLAUDENOMICS_ENCLAVE_URL not set',
    enclaveUnreachable: (err: string): string => `Enclave unreachable: ${err}`,
    enclaveReachable: (host: string, detail?: string): string =>
      `Enclave reachable (${host}${detail ? ` · ${detail}` : ''})`,
    apiUnreachable: (err: string): string => `API unreachable: ${err}`,
    apiReachable: (host: string): string => `API reachable (${host})`,
    pendingReceipts: 'Pending receipts:',
  },

  usage: {
    requestFailed: (code: string): string => `Usage request failed: ${code}`,
    tokensLabel: 'tokens',
    pending: (n: number): string => `${n} receipt${n === 1 ? '' : 's'} pending`,
    updated: (rel: string): string => `updated ${rel}`,
    justNow: 'just now',
    profileUrl: (handleOrWallet: string): string => `claudenomics.xyz/u/${handleOrWallet}`,
  },

  stats: {
    periodLabels: {
      day: 'today',
      week: 'this week',
      month: 'this month',
      all: 'all time',
    } satisfies Record<'day' | 'week' | 'month' | 'all', string>,
    inLabel: 'in',
    outLabel: 'out',
    receiptsLabel: 'receipts',
    sessionsLabel: 'sessions',
    byModel: 'by model',
    byProvider: 'by provider',
    empty: 'no activity yet',
    periodHint: 'tip: --period day | week | month | all',
    nextLeague: (slug: string, tokens: string): string =>
      `next: ${slug} in ${tokens} tokens`,
    rankLabel: (rank: number): string => `#${rank}`,
  },

  profile: {
    noTarget: (cmd: string): string => `No profile target — pass a handle or run ${cmd}`,
    notFound: (handle: string): string => `Profile not found: ${handle}`,
    requestFailed: (code: string): string => `Profile request failed: ${code}`,
  },

  leaderboard: {
    requestFailed: (code: string): string => `Leaderboard request failed: ${code}`,
    empty: 'no entries match',
    viewLabels: {
      builders: 'builders leaderboard',
      squads: 'squads leaderboard',
    } satisfies Record<'builders' | 'squads', string>,
    cols: {
      name: 'name',
      handle: 'handle',
      league: 'league',
      tokens: 'tokens',
      receipts: 'receipts',
      model: 'top model',
    },
    pageFooter: (page: number, totalPages: number, total: number): string =>
      `page ${page} of ${totalPages}  ·  ${total} total`,
  },

  whoami: {
    labels: {
      email: 'Email',
      wallet: 'Wallet',
      league: 'League',
      rank: 'Rank',
      tokens: 'Tokens',
      session: 'Session',
    },
    expiresIn: (rel: string): string => `expires in ${rel}`,
    expired: 'expired — run `claudenomics login`',
  },

  update: {
    timeout:
      'Update check timed out — proceeding (set CLAUDENOMICS_SKIP_UPDATE_CHECK=1 to silence)',
    deprecated: (current: string, reason: string): string =>
      `This version (${current}) is deprecated: ${reason}`,
    updateHint: (cmd: string): string => `Update: ${cmd}`,
    updateAvailable: (current: string, latest: string, cmd: string): string =>
      `Update available: ${current} → ${latest} (${cmd})`,
    override: 'Override: CLAUDENOMICS_SKIP_UPDATE_CHECK=1',
    refusing: 'Refusing to run deprecated version',
    unreachable: 'Could not reach npm registry',
    noLatest: 'npm registry returned no latest version',
    currentLatest: (current: string, latest: string): string =>
      `Current: ${current}\nLatest:  ${latest}`,
    runHint: (cmd: string): string => `Run: ${cmd}`,
    alreadyLatest: 'Already on latest',
  },

  errors: {
    binaryNotFound: (binary: string): string =>
      `Could not find '${binary}' on PATH. Install it first, then retry.`,
    unexpected: 'Unexpected error:',
  },
};
