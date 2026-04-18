const LOGO_SVG = `<svg width="24" height="24" viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="15" aria-hidden="true"><circle cx="100" cy="100" r="92.5" transform="matrix(-1 0 0 1 200 0)"/><line y1="-7.5" x2="190.158" y2="-7.5" transform="matrix(-1 0 0 1 195 107)"/><line x1="173.825" y1="159.321" x2="12.6494" y2="100.658"/><line x1="175.026" y1="39.5204" x2="12.6801" y2="98.6095"/></svg>`;

const STYLES = `
  :root { color-scheme: dark; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: #000;
    color: #fff;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
    min-height: 100svh;
    display: flex;
    flex-direction: column;
  }
  nav { height: 72px; display: flex; align-items: center; padding: 0 24px; }
  .logo {
    display: inline-flex; align-items: center; gap: 8px;
    font-weight: 700; font-size: 20px;
    color: #fff; text-decoration: none;
    border-radius: 6px;
  }
  .logo:focus-visible { outline: 2px solid #14f195; outline-offset: 4px; }
  main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 20px 64px;
  }
  .column { width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 40px; }
  .hero { display: flex; flex-direction: column; gap: 20px; }
  h1 {
    margin: 0;
    font-size: 48px;
    line-height: 1.05;
    letter-spacing: -0.02em;
    font-weight: 600;
    text-wrap: balance;
  }
  .subtitle {
    margin: 0;
    font-size: 24px;
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.6);
    font-weight: 500;
    text-wrap: pretty;
  }
  .hint {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.6);
  }
  .mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; color: #14f195; }
  .danger { color: #ff5d5d; }
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#000000">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<nav>
  <a class="logo" href="https://claudenomics.xyz" target="_blank" rel="noopener noreferrer" aria-label="claudenomics home">
    ${LOGO_SVG}<span translate="no">claudenomics</span>
  </a>
</nav>
<main>
  <div class="column">
    ${body}
  </div>
</main>
</body>
</html>`;
}

export function renderSuccess(): string {
  const body = `
    <div class="hero">
      <h1>signed in</h1>
      <p class="subtitle">You can close this tab and return to your terminal.</p>
    </div>`;
  return shell('signed in — claudenomics', body);
}

export function renderError(reason: string): string {
  const safe = escapeHtml(reason);
  const body = `
    <div class="hero">
      <h1>could not sign in</h1>
      <p class="subtitle"><span class="danger">${safe}</span></p>
    </div>
    <p class="hint">Close this tab and re-run <span class="mono" translate="no">claudenomics login</span> in your terminal.</p>`;
  return shell('sign-in failed — claudenomics', body);
}
