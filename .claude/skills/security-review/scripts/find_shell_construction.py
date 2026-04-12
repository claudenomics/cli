#!/usr/bin/env python3
"""Find shell-execution sites and flag any whose arguments may derive from
LLM/agent output. Heuristic: look for exec/spawn/system/backtick sinks and
report the surrounding 5 lines so the reviewer can trace taint.

Usage: find_shell_construction.py <path>
"""
import os
import re
import sys

SKIP_DIRS = {'.git', 'node_modules', 'target', 'dist', 'build', '.next', 'out',
             'venv', '.venv', '__pycache__'}
ALLOW_EXT = {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go'}

# (label, regex, base_severity)
SINKS = [
    # Node.js
    ('node:exec',          re.compile(r'\bchild_process\.(?:exec|execSync)\s*\('),                 'high'),
    ('node:exec-import',   re.compile(r'(?<!\w)(?:exec|execSync)\s*\('),                            'medium'),
    ('node:spawn-shell',   re.compile(r'\bspawn(?:Sync)?\s*\([^)]*shell\s*:\s*true'),               'high'),
    ('node:eval',          re.compile(r'(?<!\w)eval\s*\('),                                         'high'),
    ('node:Function-ctor', re.compile(r'\bnew\s+Function\s*\('),                                    'high'),
    ('node:vm-run',        re.compile(r'\bvm\.(?:runIn[A-Za-z]*Context|Script)\s*\('),              'medium'),
    # Python
    ('py:os.system',       re.compile(r'\bos\.system\s*\('),                                        'high'),
    ('py:popen',           re.compile(r'\bos\.popen\s*\('),                                         'high'),
    ('py:subprocess-shell',re.compile(r'\bsubprocess\.(?:run|call|check_call|check_output|Popen)\s*\([^)]*shell\s*=\s*True'), 'high'),
    ('py:eval',            re.compile(r'(?<!\w)eval\s*\('),                                         'high'),
    ('py:exec',            re.compile(r'(?<!\w)exec\s*\('),                                         'high'),
    # Rust
    ('rust:command-sh',    re.compile(r'Command::new\s*\(\s*"(?:sh|bash|zsh|cmd|powershell)"'),     'high'),
    ('rust:command',       re.compile(r'\bCommand::new\s*\('),                                      'medium'),
    # Go
    ('go:exec-command-sh', re.compile(r'\bexec\.Command\s*\(\s*"(?:sh|bash|zsh|cmd|powershell)"'),  'high'),
    ('go:exec-command',    re.compile(r'\bexec\.Command\s*\('),                                     'medium'),
    # Generic
    ('generic:backtick',   re.compile(r'`[^`\n]*\$\{[^}]+\}[^`\n]*`'),                              'low'),
]

# Heuristic taint markers — any of these in the surrounding context means
# argv may come from model output.
TAINT_MARKERS = re.compile(
    r'\b(?:'
    r'tool[_-]?call|toolCall|tool_use|toolUse|'
    r'assistant|model|llm|completion|response|message|content|'
    r'agent|claude|anthropic|openai|gpt|codex|'
    r'ai\.|model\.|messages\['
    r')\b',
    re.IGNORECASE,
)
# Markers suggesting argv comes from network input.
NETWORK_MARKERS = re.compile(
    r'\b(?:fetch|axios|requests|reqwest|http\.get|http\.request|response\.body|res\.body)\b',
    re.IGNORECASE,
)


def walk(root):
    for dp, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if os.path.splitext(f)[1].lower() in ALLOW_EXT:
                yield os.path.join(dp, f)


def scan_file(path):
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as fh:
            lines = fh.readlines()
    except OSError:
        return
    n = len(lines)
    for i, line in enumerate(lines):
        for label, pat, base_sev in SINKS:
            if pat.search(line):
                lo = max(0, i - 5)
                hi = min(n, i + 6)
                ctx = ''.join(lines[lo:hi])
                tainted = bool(TAINT_MARKERS.search(ctx))
                networked = bool(NETWORK_MARKERS.search(ctx))
                sev = base_sev
                if tainted and base_sev != 'low':
                    sev = 'CRITICAL-IF-CONFIRMED'
                elif networked and base_sev != 'low':
                    sev = 'high-network-input'
                yield {
                    'file': path,
                    'line': i + 1,
                    'label': label,
                    'severity_hint': sev,
                    'tainted_context': tainted,
                    'networked_context': networked,
                    'context': ctx.rstrip('\n'),
                }


def main():
    if len(sys.argv) != 2:
        print("Usage: find_shell_construction.py <path>", file=sys.stderr)
        sys.exit(2)
    root = sys.argv[1]
    findings = []
    for path in walk(root):
        for f in scan_file(path):
            findings.append(f)
    sev_order = {
        'CRITICAL-IF-CONFIRMED': 0,
        'high-network-input': 1,
        'high': 2,
        'medium': 3,
        'low': 4,
    }
    findings.sort(key=lambda x: (sev_order.get(x['severity_hint'], 9), x['file'], x['line']))
    for f in findings:
        print(f"--- {f['severity_hint']}  {f['label']}  {f['file']}:{f['line']}  "
              f"tainted={f['tainted_context']} networked={f['networked_context']}")
        for ctxline in f['context'].split('\n'):
            print(f"    {ctxline}")
    print()
    print(f"# {len(findings)} sink(s) found. Review tainted=True entries first.")


if __name__ == '__main__':
    main()
