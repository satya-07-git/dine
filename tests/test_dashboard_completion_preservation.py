"""Regression: a new requirements plan must not erase completed epic identities."""
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
TASKS = ROOT / 'project-delivery-kit/tasks'
ARCHIVE = ROOT / 'project-delivery-kit/archive/pre-prd-v2-2026-11-08'


def metadata(path):
    header = path.read_text().split('\n---\n', 1)[0][4:]
    return {k: json.loads(v.strip()) for k, v in
            (line.split(':', 1) for line in header.strip().splitlines())}


def embedded(path):
    return json.loads(re.search(r'const data=(.*?);\nconst references=',
                                path.read_text(), re.S)[1])


class CompletionPreservation(unittest.TestCase):
    def test_original_completed_identities_remain_active(self):
        active = {metadata(p)['id']: (metadata(p), p)
                  for p in TASKS.glob('EPIC-*.md')}
        for original in ARCHIVE.glob('EPIC-*.md'):
            expected = metadata(original)
            actual, path = active[expected['id']]
            self.assertEqual(actual['title'], expected['title'])
            self.assertEqual(actual['status'], 'completed')
            original_report = original.read_text().split('## Completion report', 1)[1]
            self.assertIn(original_report.strip(), path.read_text())

    def test_both_urls_preserve_completions_after_rebuild(self):
        subprocess.run([sys.executable, str(TASKS / 'build_dashboard.py')],
                       cwd=ROOT, check=True, capture_output=True)
        main, v2 = TASKS / 'dashboard.html', TASKS / 'dashboard-v2.html'
        self.assertEqual(main.read_bytes(), v2.read_bytes())
        rows = embedded(v2)
        completed = {x['id'] for x in rows if x['status'] == 'completed'}
        self.assertTrue({f'EPIC-{n:03}' for n in range(1, 25)} <= completed)
        self.assertEqual(len(rows), len(list(TASKS.glob('EPIC-*.md'))))
        self.assertGreater(len(rows), 24)
        for row in rows:
            self.assertEqual(row['status'], metadata(TASKS / row['path'])['status'])
            self.assertTrue((TASKS / row['path']).is_file())
        before = main.read_bytes()
        subprocess.run([sys.executable, str(TASKS / 'build_dashboard.py')],
                       cwd=ROOT, check=True, capture_output=True)
        self.assertEqual(before, main.read_bytes())
