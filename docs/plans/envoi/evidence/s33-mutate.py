#!/usr/bin/env python3
"""S33 offline guard proof. FIXTURE only: OpenAI and Envoi are faked at their boundaries. No model, payment or deployment."""
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
BRANCH = 'envoi/slice-33-scan-to-ask'
ENV = dict(os.environ)
ENV['PATH'] = f"{Path.home()}/.local/node/bin:{Path.home()}/.local/bin:{ENV.get('PATH', '')}"
for key in ('DATABASE_URL', 'MIGRATION_DATABASE_URL', 'MAINTENANCE_DATABASE_URL', 'OPENAI_API_KEY'):
    ENV.pop(key, None)


def branch_check():
    branch = subprocess.check_output(['git', 'branch', '--show-current'], cwd=ROOT, text=True).strip()
    assert branch == BRANCH, f'wrong branch {branch}; no edit authorized here'


def run_test(row):
    command = ['npx', 'vitest', 'run', '--config', 'config/vitest.config.ts', '--project', row['project'], row['testFile'], '--testNamePattern', '^.*' + re.escape(row['test']) + '$']
    result = subprocess.run(command, cwd=ROOT, env=ENV, capture_output=True, text=True)
    return result.returncode, result.stdout + result.stderr, command


def main():
    definitions = json.loads((HERE / 's33-mutation-defs.json').read_text())
    results = []
    for row in definitions:
        target = ROOT / row['file']
        original = target.read_bytes()
        source = original.decode()
        assert source.count(row['find']) == 1, row['id'] + ': mutation target drift'
        branch_check()
        target.write_text(source.replace(row['find'], row['replace'], 1))
        try:
            red, output, command = run_test(row)
        finally:
            target.write_bytes(original)
        failure = next((line.strip() for line in output.splitlines() if re.search(r'(AssertionError|PostgresError|Error):', line)), '')
        restored = target.read_bytes() == original
        green, green_output, _ = run_test(row)
        proved = red != 0 and bool(failure) and row['test'] in output and restored and green == 0
        results.append({'id': row['id'], 'file': row['file'], 'test': row['test'], 'redExit': red, 'failure': failure, 'restoredByteIdentical': restored, 'greenExit': green, 'proved': proved})
        print(f"{row['id']}: proved={proved} {failure[:140]}", flush=True)
        if not proved:
            print(output[-1500:] + green_output[-800:])
    (HERE / 's33-mutations.json').write_text(json.dumps({'label': 'FIXTURE offline guard proof', 'at': datetime.now(timezone.utc).isoformat(), 'allProved': all(r['proved'] for r in results), 'results': results}, indent=1) + '\n')
    raise SystemExit(0 if all(r['proved'] for r in results) else 1)


main()
