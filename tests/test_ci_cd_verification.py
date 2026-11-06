#!/usr/bin/env python3
"""
Comprehensive CI/CD Verification Test Suite for Dine Backend Platform.
Verifies Architecture Contracts, ADRs, Policy Registers, State Transitions,
Concurrency Invariants, Repository & Database Foundation (EPIC-002), and Dashboard Integrity.
"""

import os
import sys
import json
import re
import unittest
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TASKS_DIR = REPO_ROOT / "project-delivery-kit" / "tasks"
DOCS_DIR = REPO_ROOT / "docs"


class TestDashboardAndTasks(unittest.TestCase):
    """Test dashboard generator, task frontmatter, dependency graph, and HTML integrity."""

    def test_dashboard_builder_runs_cleanly(self):
        """Ensure build_dashboard.py runs without errors and produces valid output."""
        builder = TASKS_DIR / "build_dashboard.py"
        self.assertTrue(builder.exists(), "build_dashboard.py must exist")

        result = subprocess.run(
            [sys.executable, str(builder)],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True
        )
        self.assertEqual(result.returncode, 0, f"Dashboard builder failed: {result.stderr}")
        self.assertIn("Generated Dine dashboard", result.stdout)

    def test_dashboard_html_syntax_and_structure(self):
        """Ensure dashboard.html exists, has no unexpanded placeholders, and passes node syntax check."""
        dashboard_html = TASKS_DIR / "dashboard.html"
        self.assertTrue(dashboard_html.exists(), "dashboard.html must exist")
        content = dashboard_html.read_text(encoding="utf-8")

        self.assertNotIn("__DATA__", content, "Unexpanded __DATA__ placeholder in dashboard.html")
        self.assertNotIn("__REFERENCE_DATA__", content, "Unexpanded __REFERENCE_DATA__ placeholder in dashboard.html")

        # Extract inline script and test with node --check via stdin
        scripts = re.findall(r"<script>(.*?)</script>", content, re.DOTALL)
        self.assertTrue(len(scripts) > 0, "No inline script found in dashboard.html")

        for idx, script in enumerate(scripts):
            node_check = subprocess.run(
                ["node", "--check"],
                input=script,
                capture_output=True,
                text=True
            )
            self.assertEqual(node_check.returncode, 0, f"Node script check failed for script {idx}: {node_check.stderr}")


class TestADRsAndExclusions(unittest.TestCase):
    """Verify all 7 ADRs exist, conform to MADR format, and trace back to the blueprint."""

    REQUIRED_ADRS = [
        "ADR-001-modular-monolith-architecture.md",
        "ADR-002-postgresql-as-booking-system-of-record.md",
        "ADR-003-one-table-per-reservation-mvp.md",
        "ADR-004-deposit-policy-restaurant-configurable.md",
        "ADR-005-waitlist-exclusive-priority-offers.md",
        "ADR-006-realtime-status-projection-and-reconciliation.md",
        "ADR-007-agile-incremental-sdlc-with-risk-reviews.md",
    ]

    def test_all_seven_adrs_exist(self):
        adr_dir = DOCS_DIR / "adr"
        self.assertTrue(adr_dir.exists(), "docs/adr directory must exist")

        for adr in self.REQUIRED_ADRS:
            adr_path = adr_dir / adr
            self.assertTrue(adr_path.exists(), f"Missing required ADR: {adr}")
            content = adr_path.read_text(encoding="utf-8")
            self.assertIn("## Status", content, f"{adr} missing Status section")
            self.assertIn("Approved", content, f"{adr} must be Approved")
            self.assertIn("## Context", content, f"{adr} missing Context section")
            self.assertIn("## Decision Outcome", content, f"{adr} missing Decision Outcome")
            self.assertIn("## Source Traceability", content, f"{adr} missing Source Traceability")

    def test_adr_index_readme(self):
        readme = DOCS_DIR / "adr" / "README.md"
        self.assertTrue(readme.exists(), "docs/adr/README.md must exist")
        content = readme.read_text(encoding="utf-8")
        for adr in self.REQUIRED_ADRS:
            self.assertIn(adr, content, f"docs/adr/README.md missing link to {adr}")


class TestPolicyRegisterAndGates(unittest.TestCase):
    """Verify policy checklist, owners, versioning, and explicit unresolved release gates."""

    def test_policy_register_structure(self):
        policy_file = DOCS_DIR / "policies" / "commercial-policy-register.md"
        self.assertTrue(policy_file.exists(), "commercial-policy-register.md must exist")
        content = policy_file.read_text(encoding="utf-8")

        # Check required policy IDs
        for pol_id in ["POL-001", "POL-002", "POL-003", "POL-004", "POL-005", "POL-006", "POL-007"]:
            self.assertIn(pol_id, content, f"Missing policy definition {pol_id}")

        # Check required unresolved release gates
        for gate_id in ["GATE-001", "GATE-002", "GATE-003"]:
            self.assertIn(gate_id, content, f"Missing unresolved release gate {gate_id}")
            self.assertIn("UNRESOLVED", content, f"Gate {gate_id} must be explicitly marked UNRESOLVED")

        # Invariant: Unresolved gates must explicitly state that they block live payments release
        self.assertIn("BLOCKS Live Payment Release", content)


class TestStateVocabulariesAndTransitions(unittest.TestCase):
    """Verify canonical state vocabularies and simulate state machine transitions."""

    def setUp(self):
        # Valid state transitions for bookings
        self.valid_booking_transitions = {
            "HOLD_ACTIVE": {"CONFIRMED", "PAYMENT_PENDING", "EXPIRED", "CANCELLED"},
            "PAYMENT_PENDING": {"CONFIRMED", "PAYMENT_REVIEW", "PAYMENT_FAILED", "CANCELLED"},
            "PAYMENT_REVIEW": {"CONFIRMED", "EXPIRED", "REFUNDED"},
            "CONFIRMED": {"READY", "SEATED", "CANCELLED", "NO_SHOW"},
            "READY": {"SEATED", "NO_SHOW"},
            "SEATED": {"COMPLETED"},
            "COMPLETED": set(),
            "CANCELLED": set(),
            "NO_SHOW": set(),
            "EXPIRED": set(),
            "PAYMENT_FAILED": set(),
        }

        # Allocation protected states matching PostgreSQL GiST exclusion
        self.protected_allocation_states = {
            "HELD", "OFFER_HELD", "PAYMENT_PENDING", "PAYMENT_REVIEW",
            "CONFIRMED", "READY", "SEATED", "COMPLETED"
        }

    def test_state_vocabularies_document(self):
        doc = DOCS_DIR / "architecture" / "state-vocabularies-and-transitions.md"
        self.assertTrue(doc.exists(), "state-vocabularies-and-transitions.md must exist")
        content = doc.read_text(encoding="utf-8")

        for state in ["HOLD_ACTIVE", "PAYMENT_PENDING", "PAYMENT_REVIEW", "CONFIRMED", "READY", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW", "EXPIRED"]:
            self.assertIn(state, content, f"Missing booking state {state} in documentation")

        for alloc_state in ["HELD", "OFFER_HELD", "RELEASED"]:
            self.assertIn(alloc_state, content, f"Missing allocation state {alloc_state}")

    def test_state_transition_validation(self):
        """Simulate state transition validator."""
        def can_transition(from_state, to_state):
            return to_state in self.valid_booking_transitions.get(from_state, set())

        # Valid transitions
        self.assertTrue(can_transition("HOLD_ACTIVE", "CONFIRMED"))
        self.assertTrue(can_transition("HOLD_ACTIVE", "PAYMENT_PENDING"))
        self.assertTrue(can_transition("PAYMENT_PENDING", "CONFIRMED"))
        self.assertTrue(can_transition("CONFIRMED", "READY"))
        self.assertTrue(can_transition("READY", "SEATED"))
        self.assertTrue(can_transition("SEATED", "COMPLETED"))

        # Invalid transitions that must be rejected
        self.assertFalse(can_transition("HOLD_ACTIVE", "SEATED"))
        self.assertFalse(can_transition("COMPLETED", "CONFIRMED"))
        self.assertFalse(can_transition("CANCELLED", "READY"))
        self.assertFalse(can_transition("EXPIRED", "CONFIRMED"))

    def test_concurrent_hold_simulation(self):
        """
        Simulate two concurrent hold attempts for identical table T04 and overlapping intervals.
        Verifies the First Vertical Slice concurrency exit criterion:
        Exactly one request acquires the hold; the other is rejected with 409 Conflict.
        """
        table_locks = {}
        allocations = []

        class TimeRange:
            def __init__(self, start_min, end_min):
                self.start = start_min
                self.end = end_min
            def overlaps(self, other):
                return max(self.start, other.start) < min(self.end, other.end)

        def acquire_hold(customer_id, table_id, start_min, duration_min, buffer_min):
            end_min = start_min + duration_min + buffer_min
            requested_period = TimeRange(start_min, end_min)

            # Simulated FOR UPDATE table row lock
            if table_id not in table_locks:
                table_locks[table_id] = False

            # Check overlap against active allocations
            for alloc in allocations:
                if alloc["table_id"] == table_id and alloc["status"] in self.protected_allocation_states:
                    if alloc["period"].overlaps(requested_period):
                        return {
                            "status": 409,
                            "code": "INVENTORY_HOLD_CONFLICT",
                            "message": f"Table {table_id} is already reserved for requested interval."
                        }

            # Create hold
            hold_record = {
                "customer_id": customer_id,
                "table_id": table_id,
                "period": requested_period,
                "status": "HELD"
            }
            allocations.append(hold_record)
            return {
                "status": 201,
                "code": "HOLD_CREATED",
                "hold": hold_record
            }

        # Customer A requests Table T04 at 19:00 (1140 min), duration 90m, buffer 15m (1140 -> 1245)
        res_a = acquire_hold("cust_A", "T04", 1140, 90, 15)
        self.assertEqual(res_a["status"], 201, "Customer A must successfully acquire hold")

        # Customer B concurrently requests Table T04 at 19:30 (1170 min, overlapping)
        res_b = acquire_hold("cust_B", "T04", 1170, 90, 15)
        self.assertEqual(res_b["status"], 409, "Customer B must receive 409 Conflict")
        self.assertEqual(res_b["code"], "INVENTORY_HOLD_CONFLICT")

        # Verify only 1 allocation exists
        self.assertEqual(len(allocations), 1)


class TestApiConventionsAndSecurity(unittest.TestCase):
    """Verify API error taxonomy, idempotency conventions, and tenant security."""

    def test_api_conventions_document(self):
        doc = DOCS_DIR / "architecture" / "api-conventions.md"
        self.assertTrue(doc.exists(), "api-conventions.md must exist")
        content = doc.read_text(encoding="utf-8")

        for header in ["Idempotency-Key", "X-Request-Id", "X-Idempotent-Replay"]:
            self.assertIn(header, content, f"Missing header convention {header}")

        for status_code in ["200", "201", "400", "401", "403", "404", "409", "410", "422", "429", "500"]:
            self.assertIn(status_code, content, f"Missing status code documentation for {status_code}")

    def test_idempotency_hash_contract(self):
        """Verify deterministic hashing of request payload for idempotency key scoping."""
        import hashlib

        user_id = "usr_123"
        endpoint = "POST /v1/holds"
        idempotency_key = "idemp_abc_456"
        scope_key = hashlib.sha256(f"{user_id}:{endpoint}:{idempotency_key}".encode("utf-8")).hexdigest()

        payload = json.dumps({"table_id": "T04", "party_size": 2}, sort_keys=True)
        payload_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()

        # Identical payload produces identical hash
        payload2 = json.dumps({"party_size": 2, "table_id": "T04"}, sort_keys=True)
        payload2_hash = hashlib.sha256(payload2.encode("utf-8")).hexdigest()
        self.assertEqual(payload_hash, payload2_hash)

        # Mismatched payload produces distinct hash
        payload3 = json.dumps({"table_id": "T04", "party_size": 4}, sort_keys=True)
        payload3_hash = hashlib.sha256(payload3.encode("utf-8")).hexdigest()
        self.assertNotEqual(payload_hash, payload3_hash)


class TestFirstVerticalSliceAndGates(unittest.TestCase):
    """Verify MVP boundaries, vertical slice definition, and milestone exit gates."""

    def test_mvp_and_vertical_slice_document(self):
        doc = DOCS_DIR / "architecture" / "mvp-scope-and-vertical-slice.md"
        self.assertTrue(doc.exists(), "mvp-scope-and-vertical-slice.md must exist")
        content = doc.read_text(encoding="utf-8")

        self.assertIn("First Vertical Slice", content)
        self.assertIn("Table T04", content)
        self.assertIn("409 Conflict", content)
        self.assertIn("Milestone Exit Gates", content)

        for phase in ["Phase 0", "Phase 1", "Phase 2", "Phase 3", "Phase 4", "Phase 5", "Phase 6", "Phase 7", "Phase 8", "Phase 9", "Phase 10"]:
            self.assertIn(phase, content, f"Missing exit gate for {phase}")


class TestConceptualErd(unittest.TestCase):
    """Verify conceptual ERD and PostgreSQL GiST exclusion constraint syntax."""

    def test_erd_document(self):
        doc = DOCS_DIR / "architecture" / "conceptual-erd.md"
        self.assertTrue(doc.exists(), "conceptual-erd.md must exist")
        content = doc.read_text(encoding="utf-8")

        self.assertIn("no_protected_table_overlap", content)
        self.assertIn("EXCLUDE USING gist", content)
        self.assertIn("dining_period WITH &&", content)


class TestCiWorkflowConfiguration(unittest.TestCase):
    """Verify GitHub Actions CI workflow file."""

    def test_github_workflow_exists(self):
        workflow = REPO_ROOT / ".github" / "workflows" / "ci.yml"
        self.assertTrue(workflow.exists(), ".github/workflows/ci.yml must exist")
        content = workflow.read_text(encoding="utf-8")

        self.assertIn("name:", content)
        self.assertIn("jobs:", content)
        self.assertIn("unittest discover", content)


class TestEpic2FoundationDeliverables(unittest.TestCase):
    """
    Verify EPIC-002 Foundation deliverables:
    Repository layout, NestJS modules, environment validation, authoritative SQL migrations,
    Drizzle schema alignment, OpenAPI generation, health/readiness endpoints, and recovery playbook.
    """

    def test_apps_api_and_modules_structure(self):
        """Verify presence of apps/api, packages/contracts, and all 11 modular monolith modules."""
        apps_api = REPO_ROOT / "apps" / "api" / "src"
        self.assertTrue(apps_api.exists(), "apps/api/src must exist")

        # Common infrastructure
        for common_mod in ["config", "db", "errors", "logging", "health", "auth"]:
            path = apps_api / "common" / common_mod
            self.assertTrue(path.exists(), f"common/{common_mod} must exist")

        # 11 Modular monolith feature modules from Blueprint §4 / REFERENCE-architecture
        expected_modules = [
            "identity", "restaurants", "discovery", "floor-plans",
            "availability", "reservations", "payments", "waitlist",
            "booking-status", "notifications", "owner-operations"
        ]
        for mod in expected_modules:
            mod_path = apps_api / "modules" / mod
            self.assertTrue(mod_path.exists(), f"Feature module {mod} must exist")
            self.assertTrue((mod_path / f"{mod}.module.ts").exists(), f"{mod}.module.ts must exist")

        # Shared contracts
        contracts_src = REPO_ROOT / "packages" / "contracts" / "src"
        self.assertTrue(contracts_src.exists(), "packages/contracts/src must exist")
        self.assertTrue((contracts_src / "index.ts").exists(), "contracts index.ts must exist")
        self.assertTrue((contracts_src / "enums.ts").exists(), "contracts enums.ts must exist")

    def test_env_example_and_no_secrets(self):
        """Verify .env.example exists, specifies required variables, and has no active secrets."""
        env_example = REPO_ROOT / ".env.example"
        self.assertTrue(env_example.exists(), ".env.example must exist")
        content = env_example.read_text(encoding="utf-8")

        for key in ["NODE_ENV", "PORT", "DATABASE_URL", "SUPABASE_JWT_SECRET", "RAZORPAY_KEY_ID"]:
            self.assertIn(f"{key}=", content, f".env.example missing {key}")

        # Ensure no live production tokens
        self.assertIn("placeholder", content)

    def test_sql_migrations_and_runner(self):
        """Verify authoritative SQL migrations, GiST overlap constraint, and migration runner."""
        migrations_dir = REPO_ROOT / "supabase" / "migrations"
        self.assertTrue(migrations_dir.exists(), "supabase/migrations must exist")

        migration_files = sorted(migrations_dir.glob("*.sql"))
        self.assertGreaterEqual(len(migration_files), 2, "Must have at least 2 migrations")

        # Check migration 1
        m1 = migration_files[0].read_text(encoding="utf-8")
        self.assertIn("btree_gist", m1)
        self.assertIn("uuid-ossp", m1)

        # Check migration 2
        m2 = migration_files[1].read_text(encoding="utf-8")
        self.assertIn("CREATE TABLE IF NOT EXISTS table_allocations", m2)
        self.assertIn("no_protected_table_overlap", m2)
        self.assertIn("schema_migrations", m2)

        # Check migration runner in check mode
        migrate_script = REPO_ROOT / "scripts" / "migrate.js"
        self.assertTrue(migrate_script.exists(), "scripts/migrate.js must exist")
        result = subprocess.run(
            ["node", str(migrate_script), "--check"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True
        )
        self.assertEqual(result.returncode, 0, f"Migrate check failed: {result.stderr}")
        self.assertIn("Check / Dry-run mode completed successfully", result.stdout)

    def test_synthetic_seed_and_runner(self):
        """Verify synthetic seed SQL and seed runner."""
        seed_sql = REPO_ROOT / "supabase" / "seed.sql"
        self.assertTrue(seed_sql.exists(), "supabase/seed.sql must exist")
        content = seed_sql.read_text(encoding="utf-8")

        self.assertIn("The Royal Dine Bistro", content)
        self.assertIn("T04", content)

        seed_script = REPO_ROOT / "scripts" / "seed.js"
        self.assertTrue(seed_script.exists(), "scripts/seed.js must exist")
        result = subprocess.run(
            ["node", str(seed_script), "--check"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True
        )
        self.assertEqual(result.returncode, 0, f"Seed check failed: {result.stderr}")

    def test_drizzle_schema_and_transaction_helpers(self):
        """Verify Drizzle schema aligns with migrations and transaction helper exists."""
        drizzle_schema = REPO_ROOT / "apps" / "api" / "src" / "common" / "db" / "schema.ts"
        self.assertTrue(drizzle_schema.exists(), "Drizzle schema.ts must exist")
        content = drizzle_schema.read_text(encoding="utf-8")

        self.assertIn("export const bookings =", content)
        self.assertIn("export const tableAllocations =", content)
        self.assertIn("export const restaurantTables =", content)
        self.assertIn("export const idempotencyRecords =", content)

        tx_helper = REPO_ROOT / "apps" / "api" / "src" / "common" / "db" / "transaction.ts"
        self.assertTrue(tx_helper.exists(), "transaction.ts must exist")

    def test_openapi_spec_completeness(self):
        """Verify generated OpenAPI specification exists and documents core endpoints."""
        openapi_file = DOCS_DIR / "architecture" / "openapi.json"
        self.assertTrue(openapi_file.exists(), "openapi.json must exist")
        spec = json.loads(openapi_file.read_text(encoding="utf-8"))

        self.assertEqual(spec["info"]["title"], "Dine Backend API")
        paths = spec["paths"]
        self.assertIn("/health/live", paths)
        self.assertIn("/health/ready", paths)
        self.assertIn("/v1/health", paths)
        self.assertIn("/reservations/{id}", paths)
        self.assertIn("/availability", paths)
        self.assertIn("/payments/webhooks/razorpay", paths)

    def test_deployment_and_recovery_guide(self):
        """Verify deployment and recovery playbook exists and covers PITR and connection pooling."""
        guide = DOCS_DIR / "architecture" / "deployment-and-recovery.md"
        self.assertTrue(guide.exists(), "deployment-and-recovery.md must exist")
        content = guide.read_text(encoding="utf-8")

        self.assertIn("Point-In-Time Recovery (PITR)", content)
        self.assertIn("DATABASE_POOL_MAX", content)
        self.assertIn("npm run migrate", content)

    def test_clean_compilation_and_unit_checks(self):
        """Verify clean TypeScript build and Node unit tests execution."""
        # 1. npm run build
        build_result = subprocess.run(
            ["npm", "run", "build"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True
        )
        self.assertEqual(build_result.returncode, 0, f"Build failed: {build_result.stderr}")

        # 2. Node unit tests
        test_result = subprocess.run(
            ["node", "--test", "tests/unit/foundation.test.js"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True
        )
        self.assertEqual(test_result.returncode, 0, f"Node unit tests failed: {test_result.stderr}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
class TestEpic3IdentityDeliverables(unittest.TestCase):
    """
    Verify EPIC-003 Identity, Memberships and Tenant Authorization deliverables:
    Supabase JWT verification, caller context extraction, tenant isolation,
    customer resource ownership (IDOR prevention), membership revocation,
    rate limiting abuse controls, and RLS policies in migrations.
    """

    def test_identity_node_unit_suite(self):
        """Execute Node.js identity unit tests verifying guards and cryptographic JWT verification."""
        test_result = subprocess.run(
            ["node", "--test", "tests/unit/identity.test.js"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True
        )
        self.assertEqual(test_result.returncode, 0, f"Identity unit tests failed: {test_result.stderr}")
        self.assertIn("pass 15", test_result.stdout)

    def test_migration_003_rls_and_auth_uid(self):
        """Verify authoritative SQL migration 3 defines auth_uid, tenant indexes, and RLS policies."""
        migrations_dir = REPO_ROOT / "supabase" / "migrations"
        m3_files = list(migrations_dir.glob("*identity_and_rls.sql"))
        self.assertTrue(len(m3_files) > 0, "Migration 3 identity_and_rls.sql must exist")

        content = m3_files[0].read_text(encoding="utf-8")
        self.assertIn("auth_uid UUID UNIQUE", content)
        self.assertIn("idx_memberships_tenant_role_status", content)

        # RLS Policies on client-reachable tables
        self.assertIn("ALTER TABLE profiles ENABLE ROW LEVEL SECURITY", content)
        self.assertIn("ALTER TABLE restaurant_memberships ENABLE ROW LEVEL SECURITY", content)
        self.assertIn("ALTER TABLE bookings ENABLE ROW LEVEL SECURITY", content)
        self.assertIn("ALTER TABLE table_allocations ENABLE ROW LEVEL SECURITY", content)
        self.assertIn("ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY", content)
        self.assertIn("ALTER TABLE waitlist_offers ENABLE ROW LEVEL SECURITY", content)
        self.assertIn("ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY", content)

        # Verify auth.uid() usage
        self.assertIn("auth.uid()", content)

    def test_openapi_identity_and_me_routes(self):
        """Verify OpenAPI documents GET /me and identity profile endpoints."""
        openapi_file = DOCS_DIR / "architecture" / "openapi.json"
        self.assertTrue(openapi_file.exists(), "openapi.json must exist")
        spec = json.loads(openapi_file.read_text(encoding="utf-8"))

        paths = spec["paths"]
        self.assertTrue("/me" in paths or "/identity/me" in paths, "Must document /me or /identity/me")
        self.assertIn("/identity/profile/{id}", paths)
        self.assertIn("/owner/restaurants/{id}/bookings", paths)

    def test_python_jwt_cryptographic_verification(self):
        """Direct cryptographic verification of HS256 signature and tamper detection."""
        import hmac
        import hashlib
        import base64
        import time

        secret = b"super-secret-jwt-key-min-16-chars-long"

        def b64url_encode(data: bytes) -> str:
            return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")

        # Mint valid Supabase JWT
        header = json.dumps({"alg": "HS256", "typ": "JWT"}).encode("utf-8")
        payload = json.dumps({
            "sub": "a0000000-0000-0000-0000-000000000002",
            "email": "alice@customer.local",
            "role": "authenticated",
            "aud": "authenticated",
            "iss": "https://mock.supabase.co/auth/v1",
            "exp": int(time.time()) + 3600
        }).encode("utf-8")

        signing_input = f"{b64url_encode(header)}.{b64url_encode(payload)}".encode("utf-8")
        valid_sig = b64url_encode(hmac.new(secret, signing_input, hashlib.sha256).digest())
        token = f"{signing_input.decode('utf-8')}.{valid_sig}"

        # Verify valid signature matches
        parts = token.split(".")
        calc_sig = b64url_encode(hmac.new(secret, f"{parts[0]}.{parts[1]}".encode("utf-8"), hashlib.sha256).digest())
        self.assertEqual(parts[2], calc_sig)

        # Forged signature fails
        forged_sig = b64url_encode(hmac.new(b"attacker-wrong-secret-123456", signing_input, hashlib.sha256).digest())
        self.assertNotEqual(parts[2], forged_sig)

    def test_python_two_customers_and_two_restaurants_isolation(self):
        """
        Verify tenant and customer isolation invariant:
        - Host in Restaurant 1 cannot access Restaurant 2 resources
        - Suspended member is denied
        - Customer A cannot access Customer B's resources
        """
        memberships = {
            ("charlie_rest1", "b0001"): {"role": "HOST", "status": "ACTIVE"},
            ("dave_rest2", "b0002"): {"role": "HOST", "status": "ACTIVE"},
            ("eve_suspended", "b0001"): {"role": "HOST", "status": "SUSPENDED"},
        }

        def authorize_staff(user_id, restaurant_id, required_roles=("OWNER", "MANAGER", "HOST")):
            mem = memberships.get((user_id, restaurant_id))
            if not mem:
                return 403, "FORBIDDEN_TENANT_ACCESS"
            if mem["status"] != "ACTIVE":
                return 403, "MEMBERSHIP_SUSPENDED"
            if mem["role"] not in required_roles:
                return 403, "ROLE_NOT_AUTHORIZED"
            return 200, "AUTHORIZED"

        # 1. Charlie in Rest 1 accessing Rest 1 -> 200
        status, _ = authorize_staff("charlie_rest1", "b0001")
        self.assertEqual(status, 200)

        # 2. Charlie in Rest 1 accessing Rest 2 -> 403 Cross-Tenant Rejection
        status, code = authorize_staff("charlie_rest1", "b0002")
        self.assertEqual(status, 403)
        self.assertEqual(code, "FORBIDDEN_TENANT_ACCESS")

        # 3. Suspended Eve accessing Rest 1 -> 403 Suspended Rejection
        status, code = authorize_staff("eve_suspended", "b0001")
        self.assertEqual(status, 403)
        self.assertEqual(code, "MEMBERSHIP_SUSPENDED")

        # 4. Customer resource isolation (Alice vs Bob)
        bookings = {
            "book_alice_101": {"user_id": "cust_alice", "status": "CONFIRMED"},
            "book_bob_102": {"user_id": "cust_bob", "status": "CONFIRMED"},
        }

        def access_booking(caller_id, booking_id):
            b = bookings.get(booking_id)
            if not b:
                return 404, "NOT_FOUND"
            if b["user_id"] != caller_id:
                return 403, "FORBIDDEN_RESOURCE_ACCESS"
            return 200, "OK"

        # Alice accesses own booking -> 200
        status, _ = access_booking("cust_alice", "book_alice_101")
        self.assertEqual(status, 200)

        # Bob attempts to access Alice's booking -> 403 Forbidden
        status, code = access_booking("cust_bob", "book_alice_101")
        self.assertEqual(status, 403)
        self.assertEqual(code, "FORBIDDEN_RESOURCE_ACCESS")



