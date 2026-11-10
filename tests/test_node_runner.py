"""The shared runner must reject false-green and incomplete execution."""
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

class NodeRunnerRegression(unittest.TestCase):
    def run_fixture(self, source):
        # Within repository so fixtures resolve node built-ins with the same runtime.
        with tempfile.NamedTemporaryFile(mode='w', suffix='.test.cjs', dir=ROOT / 'tests') as f:
            f.write(source)
            f.flush()
            return subprocess.run(['node', 'scripts/run-node-tests.js', f.name],
                                  cwd=ROOT, text=True, capture_output=True)

    def test_assertion_failure_propagates(self):
        result = self.run_fixture("const t=require('node:test'); t('fails',()=>{throw Error('intentional regression fixture')});")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('intentional regression fixture', result.stdout)

    def test_skipped_and_empty_suites_are_rejected(self):
        for source in ("const t=require('node:test'); t.skip('skipped',()=>{});", ''):
            with self.subTest(source=source):
                self.assertNotEqual(self.run_fixture(source).returncode, 0)

    def test_nested_cases_are_executed_and_reported(self):
        result = self.run_fixture("const t=require('node:test'); t('parent',async t=>{await t.test('child',()=>{});});")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('# tests 2', result.stdout)
        self.assertIn('# pass 2', result.stdout)

    def test_production_validation_pipe_dependencies_load(self):
        result = subprocess.run(['node', '-e', "const {ValidationPipe}=require('@nestjs/common'); new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}); console.log('ValidationPipe boot smoke passed');"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('ValidationPipe boot smoke passed', result.stdout)
