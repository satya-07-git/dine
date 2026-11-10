"""Integration and configuration tests for EPIC-026: Runtime boot dependencies and production configuration."""

import json
from pathlib import Path
import subprocess
import sys
import unittest

REPO_ROOT = Path(__file__).resolve().parents[1]


class TestEpic26RuntimeBootAndConfiguration(unittest.TestCase):
    """Verifies all tasks and acceptance criteria for EPIC-026."""

    def test_validation_pipe_constructs_successfully_ac1(self):
        """Verify AC 1: ValidationPipe constructs successfully after clean dependency installation."""
        code = """
        const { ValidationPipe } = require('@nestjs/common');
        const pipe = new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        });
        if (!pipe) throw new Error('ValidationPipe failed to instantiate');
        console.log('ValidationPipe constructed successfully');
        """
        res = subprocess.run(
            ['node', '-e', code],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0, f"ValidationPipe construction failed: {res.stderr}")
        self.assertIn("ValidationPipe constructed successfully", res.stdout)

    def test_http_liveness_and_readiness_probes_ac2(self):
        """Verify AC 2: HTTP liveness (200) and readiness (200 up / 503 down) probes reflect actual dependency status."""
        code = """
        const { NestFactory } = require('@nestjs/core');
        const { AppModule } = require('./apps/api/dist/app.module');
        const http = require('http');

        function fetch(url) {
          return new Promise((resolve, reject) => {
            http.get(url, (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
            }).on('error', reject);
          });
        }

        async function run() {
          const app = await NestFactory.create(AppModule, { logger: false });
          await app.listen(3091);
          try {
            const live = await fetch('http://localhost:3091/health/live');
            const ready = await fetch('http://localhost:3091/health/ready');
            console.log(JSON.stringify({
              liveStatus: live.status,
              liveBody: live.body,
              readyStatus: ready.status,
              readyBody: ready.body,
            }));
          } finally {
            await app.close();
          }
        }
        run().catch(err => {
          console.error(err);
          process.exit(1);
        });
        """
        env = {
            "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/dine_dev",
            "SUPABASE_JWT_SECRET": "development-mock-jwt-secret-do-not-use-in-production-32chars",
            "NODE_ENV": "development",
            "PATH": subprocess.os.environ.get("PATH", ""),
        }
        res = subprocess.run(
            ['node', '-e', code],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            env=env,
        )
        self.assertEqual(res.returncode, 0, f"Nest boot probe failed: {res.stderr}\n{res.stdout}")
        data = json.loads(res.stdout.strip().splitlines()[-1])
        self.assertEqual(data["liveStatus"], 200)
        self.assertEqual(data["liveBody"]["status"], "ok")
        self.assertEqual(data["readyStatus"], 200)
        self.assertEqual(data["readyBody"]["status"], "ok")
        self.assertEqual(data["readyBody"]["dependencies"]["database"]["status"], "up")

    def test_http_readiness_probe_returns_503_when_database_down_ac2(self):
        """Verify AC 2: Readiness probe returns 503 degraded when database connection fails."""
        code = """
        const { NestFactory } = require('@nestjs/core');
        const { AppModule } = require('./apps/api/dist/app.module');
        const http = require('http');

        function fetch(url) {
          return new Promise((resolve, reject) => {
            http.get(url, (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
            }).on('error', reject);
          });
        }

        async function run() {
          const app = await NestFactory.create(AppModule, { logger: false });
          await app.listen(3092);
          try {
            const live = await fetch('http://localhost:3092/health/live');
            const ready = await fetch('http://localhost:3092/health/ready');
            console.log(JSON.stringify({
              liveStatus: live.status,
              readyStatus: ready.status,
              readyBody: ready.body,
            }));
          } finally {
            await app.close();
          }
        }
        run().catch(err => {
          console.error(err);
          process.exit(1);
        });
        """
        # Point to non-existent postgres port
        env = {
            "DATABASE_URL": "postgresql://postgres:postgres@localhost:5439/dine_dev",
            "SUPABASE_JWT_SECRET": "development-mock-jwt-secret-do-not-use-in-production-32chars",
            "NODE_ENV": "development",
            "PATH": subprocess.os.environ.get("PATH", ""),
        }
        res = subprocess.run(
            ['node', '-e', code],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            env=env,
        )
        self.assertEqual(res.returncode, 0, f"Readiness degradation check failed: {res.stderr}\n{res.stdout}")
        data = json.loads(res.stdout.strip().splitlines()[-1])
        self.assertEqual(data["liveStatus"], 200, "Liveness must stay 200 even when database is down")
        self.assertEqual(data["readyStatus"], 503, "Readiness must return 503 Service Unavailable when DB is down")
        self.assertEqual(data["readyBody"]["status"], "degraded")
        self.assertEqual(data["readyBody"]["dependencies"]["database"]["status"], "down")

    def test_missing_production_credentials_fail_closed_without_printing_secrets_ac3(self):
        """Verify AC 3: Missing production credentials fail closed with sanitized error details, no leaked secrets."""
        code = """
        const { validateEnv } = require('./apps/api/dist/common/config/env.validation');
        const secretValue = 'super-secret-password-xyz-do-not-leak';
        try {
          validateEnv({
            NODE_ENV: 'production',
            DATABASE_URL: `postgresql://user:${secretValue}@localhost:5432/dine_prod`,
            SUPABASE_JWT_SECRET: 'short',
          });
          console.log('UNEXPECTED_SUCCESS');
        } catch (err) {
          console.log('CAUGHT_ERROR');
          console.log(err.message);
          if (err.message.includes(secretValue)) {
            console.error('LEAKED_SECRET_IN_ERROR');
            process.exit(2);
          }
        }
        """
        res = subprocess.run(
            ['node', '-e', code],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0, f"Secret leakage or unexpected failure: {res.stderr}")
        self.assertIn("CAUGHT_ERROR", res.stdout)
        self.assertNotIn("UNEXPECTED_SUCCESS", res.stdout)
        self.assertNotIn("super-secret-password-xyz-do-not-leak", res.stdout)
        self.assertIn("sensitive", res.stdout)

    def test_no_production_mode_silently_selects_mock_adapters_ac4(self):
        """Verify AC 4: Production mode rejects mock financial, mock OTP, or in-memory job adapters."""
        code = """
        const { validateEnv } = require('./apps/api/dist/common/config/env.validation');
        const cases = [
          { PAYMENT_PROVIDER_MODE: 'mock' },
          { OTP_PROVIDER_MODE: 'mock' },
          { JOB_RUNNER_MODE: 'in_memory' },
          { JOB_RUNNER_MODE: 'mock' },
        ];

        let rejectedCount = 0;
        for (const badCase of cases) {
          try {
            validateEnv({
              NODE_ENV: 'production',
              DATABASE_URL: 'postgresql://prod_user:prod_pass@db.internal:5432/dine_prod',
              SUPABASE_URL: 'https://auth.internal.dine.app',
              SUPABASE_JWT_SECRET: 'production-verified-jwt-secret-at-least-32-chars-long',
              RAZORPAY_KEY_ID: 'rzp_live_real_key_123',
              RAZORPAY_KEY_SECRET: 'rzp_live_real_secret_456',
              RAZORPAY_WEBHOOK_SECRET: 'rzp_live_real_webhook_789',
              REDIS_URL: 'redis://redis.internal:6379',
              CORS_ORIGINS: 'https://dine.app',
              PAYMENT_PROVIDER_MODE: 'razorpay_live',
              OTP_PROVIDER_MODE: 'twilio',
              JOB_RUNNER_MODE: 'bullmq_redis',
              ...badCase,
            });
          } catch (err) {
            rejectedCount++;
          }
        }
        console.log(`REJECTED_${rejectedCount}_CASES`);
        """
        res = subprocess.run(
            ['node', '-e', code],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0, f"Mock adapter rejection test failed: {res.stderr}")
        self.assertIn("REJECTED_4_CASES", res.stdout)

    def test_sigterm_and_shutdown_hooks_governance_ac5(self):
        """Verify AC 5: Graceful shutdown hook terminates pool and drains cleanly."""
        code = """
        const { NestFactory } = require('@nestjs/core');
        const { AppModule } = require('./apps/api/dist/app.module');
        const { DatabaseService } = require('./apps/api/dist/common/db/database.service');

        async function run() {
          const app = await NestFactory.create(AppModule, { logger: false });
          app.enableShutdownHooks();
          await app.listen(3093);

          const dbService = app.get(DatabaseService);
          const pool = dbService.getPool();

          // Trigger graceful shutdown
          await app.close();

          // Pool must be ended after app.close()
          if (pool.ended) {
            console.log('POOL_DRAINED_CLEANLY');
          } else {
            console.error('POOL_NOT_ENDED');
            process.exit(1);
          }
        }
        run().catch(e => {
          console.error(e);
          process.exit(1);
        });
        """
        env = {
            "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/dine_dev",
            "SUPABASE_JWT_SECRET": "development-mock-jwt-secret-do-not-use-in-production-32chars",
            "NODE_ENV": "development",
            "PATH": subprocess.os.environ.get("PATH", ""),
        }
        res = subprocess.run(
            ['node', '-e', code],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            env=env,
        )
        self.assertEqual(res.returncode, 0, f"Shutdown hook test failed: {res.stderr}\n{res.stdout}")
        self.assertIn("POOL_DRAINED_CLEANLY", res.stdout)

    def test_docker_compose_and_deployment_governance_t05_t06(self):
        """Verify Tasks T05 & T06: docker-compose defines redis service and documentation specifies boot order."""
        compose_file = REPO_ROOT / "docker-compose.yml"
        self.assertTrue(compose_file.exists())
        compose_content = compose_file.read_text()
        self.assertIn("redis:", compose_content)
        self.assertIn("6379:6379", compose_content)
        self.assertIn("redis-cli", compose_content)

        doc_file = REPO_ROOT / "docs" / "architecture" / "deployment-and-recovery.md"
        self.assertTrue(doc_file.exists())
        doc_content = doc_file.read_text()
        self.assertIn("Node.js Runtime Support Matrix", doc_content)
        self.assertIn("Migration-Before-Start Deployment Ordering", doc_content)
        self.assertIn("Graceful Shutdown & Connection Draining", doc_content)


if __name__ == "__main__":
    unittest.main()
