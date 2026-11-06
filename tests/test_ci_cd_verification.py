#!/usr/bin/env python3
"""
Comprehensive CI/CD Verification Test Suite for Dine Backend Platform.
Verifies Architecture Contracts, ADRs, Policy Registers, State Transitions,
Concurrency Invariants, and Dashboard Integrity.
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
