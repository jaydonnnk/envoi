#!/usr/bin/env python3
"""S34 offline guard proof. No build, server, model call or other source run may overlap this process."""
import hashlib
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
TEST = 'tests/unit/assistant.test.ts'
BRANCH = 'envoi/slice-34-menu-advice'
ENV = dict(os.environ)
ENV['PATH'] = f"{Path.home()}/.local/node/bin:{Path.home()}/.local/bin:{ENV.get('PATH', '')}"
ENV['TEST_DATABASE_URL'] = 'postgres://postgres@127.0.0.1:5432/postgres'
for key in ('DATABASE_URL', 'MIGRATION_DATABASE_URL', 'MAINTENANCE_DATABASE_URL', 'OPENAI_API_KEY'):
    ENV.pop(key, None)


def branch_check():
    branch = subprocess.check_output(['git', 'branch', '--show-current'], cwd=ROOT, text=True).strip()
    assert branch == BRANCH, 'wrong branch; no edit authorized here'


def run_test(name):
    command = ['npx', 'vitest', 'run', '--config', 'config/vitest.config.ts', '--project', 'unit', TEST, '--testNamePattern', '^.*' + re.escape(name) + '$']
    result = subprocess.run(command, cwd=ROOT, env=ENV, capture_output=True, text=True)
    return result.returncode, result.stdout + result.stderr, command


ANSI = re.compile(r'\x1b\[[0-9;]*m')


def evidence(output):
    """The failing assertion and the source frame it failed at, with ANSI colour stripped.

    Vitest colours the word AssertionError, so a needle carrying its colon never matches the raw
    bytes; stripping first is what makes the two comparable.
    """
    plain = ANSI.sub('', output)
    assertion = next((line.strip() for line in plain.splitlines() if 'AssertionError' in line), '')
    frame = next((line.strip() for line in plain.splitlines() if re.search(re.escape(TEST) + r':\d+:\d+', line)), '')
    return assertion, frame


def main():
    definitions = json.loads((HERE / 's34-mutation-defs.json').read_text())
    targets = {ROOT / row['file'] for row in definitions}
    originals = {path: path.read_bytes() for path in targets}
    results = []
    try:
        for mutation in definitions:
            target = ROOT / mutation['file']
            original = originals[target]
            source = original.decode()
            assert source.count(mutation['find']) == 1, mutation['id'] + ': mutation target drift'
            branch_check()
            target.write_text(source.replace(mutation['find'], mutation['replace'], 1))
            log = Path('/tmp') / f"s34-mut-{mutation['id']}-red.log"
            try:
                red, output, command = run_test(mutation['test'])
                log.write_text(output)
                assertion, frame = evidence(output)
            finally:
                branch_check()
                target.write_bytes(original)
            restored = target.read_bytes() == original
            green, green_output, _ = run_test(mutation['test'])
            proved = red != 0 and bool(assertion) and bool(frame) and mutation['test'] in output and restored and green == 0
            results.append({'id': mutation['id'], 'branch': mutation['branch'], 'file': str(target.relative_to(ROOT)), 'test': mutation['test'], 'find': mutation['find'], 'replace': mutation['replace'], 'redCommand': command, 'redExit': red, 'assertion': assertion, 'failedAt': frame, 'redLog': str(log), 'restoredByteIdentical': restored, 'greenExit': green, 'proved': proved})
            print(f"{mutation['id']}: proved={proved} redExit={red} failedAt={frame}", flush=True)
            if not proved:
                print(output[-2500:] + green_output[-1500:])
                break
    finally:
        for target, original in originals.items():
            if target.read_bytes() != original:
                branch_check()
                target.write_bytes(original)
        branch_check()
        (HERE / 's34-mutations.json').write_text(json.dumps({
            'label': 'S34 FIXTURE budget-guard and advice-rule mutations; no real model, DB, build or server',
            'ranAt': datetime.now(timezone.utc).isoformat(),
            'filesSha256': {str(path.relative_to(ROOT)): hashlib.sha256(data).hexdigest() for path, data in sorted(originals.items())},
            'allRestoredByteIdentical': all(path.read_bytes() == data for path, data in originals.items()),
            'mutations': results,
        }, indent=2) + '\n')
    assert len(results) == len(definitions) and all(row['proved'] for row in results), 'mutation proof incomplete'
    print(json.dumps({'proved': len(results), 'allRestoredByteIdentical': True}))


if __name__ == '__main__':
    main()
