# Audit remediation test evidence — 2026-11-10

Environment: repository working tree, Node v24.18.0, Python 3.12. Local unit/static validation; actual provider and PostgreSQL integration are not certified by this record. No production payments initiated.

## Before remediation

- Build succeeded, but instantiating the configured Nest ValidationPipe failed because class-validator/class-transformer were missing.
- Default Node execution reported 23 file-level passes; explicit non-isolated execution reported 424 actual tests passing.
- Python discovery ran 214 tests with 20 failures: wrapper assertions expected nested pass counts and received file-level counts. The complete wrapper/count matrix is in [audit remediation](REFERENCE-remediation.md).
- npm used OR fallback, potentially allowing one suite to conceal another suite's failure.

## Changes and verification

- Shared `scripts/run-node-tests.js` selects explicit TAP and non-isolated execution when supported. It rejects unsuccessful subprocesses, empty/file-only coverage and failed/skipped/cancelled/todo cases.
- All Python wrappers invoke that same runner. Original expected per-suite counts remain enforced with anchored summary assertions.
- npm now requires build AND Node AND Python. CI uses the same runner and discovers all test files.
- Negative regressions deliberately fail an assertion, skip a case and execute an empty file; each must return nonzero. A nested passing fixture proves actual subtests execute.
- API workspace now declares locked class-validator/class-transformer dependencies. Production ValidationPipe construction smoke passes. Full live application startup remains pending in EPIC-026.
- Initial restricted-sandbox attempts blocked Node subprocesses with EPERM. The authoritative successful reruns use approved subprocess-enabled execution; environmental blocks were not reported as business-test passes.

## Final executed results

| Command / check | Actual result |
| --- | --- |
| `npm run ci` | All 8 local gates passed; exit 0 |
| Shared Node runner | 424 tests, 424 passed, 0 failed/skipped/cancelled/todo |
| Python discovery in CI | 218 tests, all passed; includes the 20 formerly failing wrappers |
| TypeScript build | Passed |
| Production ValidationPipe construction | Passed |
| Harness negative fixtures | Assertion failure, skipped suite and empty suite correctly rejected |
| Dashboard regression | Original completed identities preserved; both generated URLs match source |

Stored local logs: [full CI output](../verification/2026-11-10/ci.log), [Node TAP output](../verification/2026-11-10/node-tests.log). Deliberately mocked negative-path tests can emit service error logs while assertions pass; these do not claim real provider execution.

The first final CI attempt caught one malformed documentation link to a temporary audit log. The link was replaced with a textual provenance reference, then all eight gates passed. This failure was documentation-only and did not require changing business assertions.

## Pending real integration evidence

EPIC-026–036 remain open for actual application HTTP boot, database migration/concurrency/RLS, canonical routes and permissions, real Razorpay Test orders/capture/refunds, SMS, Socket.IO, BullMQ/Redis, measured load, backup restore and merchant policy approval. Mocked unit success does not close these acceptance gates.
