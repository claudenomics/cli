#!/usr/bin/env python3
"""List outbound URLs / hostnames present as string literals in source files.
Usage: list_network_egress.py <path>
"""
import os
import re
import sys
from collections import defaultdict

URL_RE = re.compile(rb'(?P<url>https?://[A-Za-z0-9._~:/?#@!$&\'()*+,;=%-]+)')
HOST_RE = re.compile(
    rb'["\'`](?P<host>(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})["\'`]',
    re.IGNORECASE,
)
SKIP_DIRS = {'.git', 'node_modules', 'target', 'dist', 'build', '.next', 'out',
             'venv', '.venv', '__pycache__'}
ALLOW_EXT = {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go',
             '.json', '.toml', '.yaml', '.yml'}
SKIP_TLDS = {'js', 'ts', 'py', 'rs', 'go', 'json', 'lock', 'md', 'sh',
             'toml', 'yml', 'yaml', 'min', 'd', 'map'}


def walk(root):
    for dp, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if os.path.splitext(f)[1].lower() in ALLOW_EXT:
                yield os.path.join(dp, f)


def main():
    if len(sys.argv) != 2:
        print("Usage: list_network_egress.py <path>", file=sys.stderr)
        sys.exit(2)
    root = sys.argv[1]
    urls = defaultdict(list)
    hosts = defaultdict(list)
    for path in walk(root):
        try:
            with open(path, 'rb') as fh:
                for lineno, line in enumerate(fh, 1):
                    for m in URL_RE.finditer(line):
                        u = m.group('url').decode('utf-8', 'replace').rstrip('.,);\'"`')
                        urls[u].append((path, lineno))
                    for m in HOST_RE.finditer(line):
                        h = m.group('host').decode('utf-8', 'replace').lower()
                        if '.' not in h:
                            continue
                        if h.rsplit('.', 1)[-1] in SKIP_TLDS:
                            continue
                        hosts[h].append((path, lineno))
        except (OSError, UnicodeDecodeError):
            continue

    print("# URL literals")
    for u in sorted(urls):
        for (p, l) in urls[u]:
            print(f"{u}\t{p}:{l}")
    print()
    print("# Hostname-shaped literals (review for false positives)")
    for h in sorted(hosts):
        for (p, l) in hosts[h]:
            print(f"{h}\t{p}:{l}")


if __name__ == '__main__':
    main()
