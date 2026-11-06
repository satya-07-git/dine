#!/usr/bin/env bash
set -euo pipefail

# Dine CI/CD Automated Test Runner
echo "=========================================================="
echo " Starting Dine CI/CD Quality & Architecture Gates Pipeline"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

echo ""
echo "[GATE 1/8] Validating Dashboard and Dependency DAG..."
python3 project-delivery-kit/tasks/build_dashboard.py

echo ""
echo "[GATE 2/8] Verifying Inline Script Syntax in dashboard.html..."
python3 -c "
import re
from pathlib import Path
html = Path('project-delivery-kit/tasks/dashboard.html').read_text(encoding='utf-8')
scripts = re.findall(r'<script>(.*?)</script>', html, re.DOTALL)
print(scripts[0] if scripts else '')
" | node --check
echo ">> Inline JavaScript syntax verified."

echo ""
echo "[GATE 3/8] Building TypeScript Packages & NestJS Modular Monolith..."
npm run build
echo ">> TypeScript compilation succeeded."

echo ""
echo "[GATE 4/8] Running Node.js Unit Tests (Foundation, Identity, Policies, Discovery, Menus & Floor Plans)..."
node --test tests/unit/foundation.test.js tests/unit/identity.test.js tests/unit/restaurant-policy.test.js tests/unit/discovery-and-menu.test.js tests/unit/floor-plans.test.js
echo ">> Node.js unit tests passed."

echo ""
echo "[GATE 5/8] Validating Authoritative SQL Migrations & Synthetic Seed..."
node scripts/migrate.js --check
node scripts/seed.js --check
echo ">> Authoritative SQL migrations and seed verified."

echo ""
echo "[GATE 6/8] Exporting & Validating OpenAPI Specification..."
node scripts/export-openapi.js
echo ">> OpenAPI specification verified."

echo ""
echo "[GATE 7/8] Running Comprehensive Python Verification Test Suite..."
python3 -m unittest discover -s tests -p "test_*.py" -v

echo ""
echo "[GATE 8/8] Verifying Markdown Links Across Repository..."
python3 -c "
import re
from pathlib import Path

repo_root = Path('.')
md_files = list(repo_root.glob('docs/**/*.md')) + list(repo_root.glob('project-delivery-kit/tasks/*.md'))
broken = 0

for md_path in md_files:
    content = md_path.read_text(encoding='utf-8')
    # Find markdown links: [text](path)
    links = re.findall(r'\[([^\]]+)\]\(([^)]+)\)', content)
    for text, link in links:
        if link.startswith('http://') or link.startswith('https://') or link.startswith('#') or link.startswith('mailto:'):
            continue
        # Strip anchors
        target = link.split('#')[0]
        if not target:
            continue
        target_path = (md_path.parent / target).resolve()
        if not target_path.exists():
            print(f'Broken link in {md_path}: [{text}]({link}) -> {target_path}')
            broken += 1

if broken > 0:
    raise SystemExit(f'Found {broken} broken links')
else:
    print(f'>> All links across {len(md_files)} markdown files verified successfully.')
"

echo ""
echo "=========================================================="
echo " ALL 8 CI/CD GATES PASSED SUCCESSFULLY!"
echo "=========================================================="
