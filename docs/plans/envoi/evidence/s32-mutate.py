#!/usr/bin/env python3
"""S32 offline guard proof. No build, server or other source run may overlap this process."""
import hashlib
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
SOURCE = HERE / 's32-language-eval.mts'
TEST = 'tests/unit/s32-language-eval.test.ts'
BRANCH = 'envoi/slice-32-language-eval'
ENV = dict(os.environ)
ENV['PATH'] = f"{Path.home()}/.local/node/bin:{Path.home()}/.local/bin:{ENV.get('PATH', '')}"
for key in ('DATABASE_URL', 'MIGRATION_DATABASE_URL', 'MAINTENANCE_DATABASE_URL', 'OPENAI_API_KEY'):
    ENV.pop(key, None)


def branch_check():
    branch = subprocess.check_output(['git', 'branch', '--show-current'], cwd=ROOT, text=True).strip()
    print(branch, flush=True)
    assert branch == BRANCH, 'wrong branch; no edit authorized here'


def run_test(name, test_file=TEST):
    command = ['npx', 'vitest', 'run', '--config', 'config/vitest.config.ts', '--project', 'unit', test_file, '--testNamePattern', '^.*' + re.escape(name) + '$']
    result = subprocess.run(command, cwd=ROOT, env=ENV, capture_output=True, text=True)
    return result.returncode, result.stdout + result.stderr, command


def main():
    definitions = json.loads((HERE / 's32-mutation-defs.json').read_text())
    targets = {ROOT / row.get('file', str(SOURCE.relative_to(ROOT))) for row in definitions}
    originals = {path: path.read_bytes() for path in targets}
    digest = hashlib.sha256(originals[SOURCE]).hexdigest()
    results = []
    try:
        for mutation in definitions:
            target = ROOT / mutation.get('file', str(SOURCE.relative_to(ROOT)))
            original = originals[target]
            source = original.decode()
            assert source.count(mutation['find']) == 1, mutation['id'] + ': mutation target drift'
            branch_check()
            target.write_text(source.replace(mutation['find'], mutation['replace'], 1))
            try:
                red, output, command = run_test(mutation['test'], mutation.get('testFile', TEST))
                assertion = next((line for line in output.splitlines() if 'AssertionError:' in line), '')
            finally:
                branch_check()
                target.write_bytes(original)
            restored = target.read_bytes() == original
            green, green_output, _ = run_test(mutation['test'], mutation.get('testFile', TEST))
            proved = red != 0 and bool(assertion) and mutation['test'] in output and restored and green == 0
            results.append({'id': mutation['id'], 'file': str(target.relative_to(ROOT)), 'test': mutation['test'], 'redCommand': command, 'redExit': red, 'assertion': assertion, 'restoredByteIdentical': restored, 'greenExit': green, 'proved': proved})
            print(f"{mutation['id']}: proved={proved}", flush=True)
            if not proved:
                print(output[-2000:] + green_output[-1500:])
                break
    finally:
        for target, original in originals.items():
            if target.read_bytes() != original:
                branch_check()
                target.write_bytes(original)
        branch_check()
        (HERE / 's32-mutations.json').write_text(json.dumps({'label': 'S32 FIXTURE scoring, spend-boundary and narrowed-copy mutations; no real model, DB, build or server', 'ranAt': datetime.now(timezone.utc).isoformat(), 'sourceSha256': digest, 'filesSha256': {str(path.relative_to(ROOT)): hashlib.sha256(data).hexdigest() for path, data in originals.items()}, 'allRestoredByteIdentical': all(path.read_bytes() == data for path, data in originals.items()), 'mutations': results}, indent=2) + '\n')
    assert len(results) == len(definitions) and all(row['proved'] for row in results), 'mutation proof incomplete'


if __name__ == '__main__':
    main()
