"""Build Dine's standalone offline delivery console. Python standard library only."""
from pathlib import Path
import json
import re
import base64

ROOT = Path(__file__).resolve().parent
STATUSES = {'backlog', 'ready', 'in_progress', 'blocked', 'completed'}


def read(path):
    raw = path.read_text(encoding='utf-8')
    if not raw.startswith('---\n') or '\n---\n' not in raw[4:]:
        raise ValueError(f'{path.name}: missing frontmatter')
    header, body = raw[4:].split('\n---\n', 1)
    meta = {}
    for line in header.splitlines():
        if not line.strip():
            continue
        key, value = line.split(':', 1)
        if key in meta:
            raise ValueError(f'{path.name}: duplicate metadata key {key}')
        meta[key] = json.loads(value.strip())
    meta.update(body=body.strip(), path=path.name)
    meta['tasks'] = len(re.findall(r'^- \[[ x]\] T\d+ ', body, re.M))
    acceptance = re.search(r'^## Acceptance criteria\n(.*?)(?=^## |\Z)', body, re.M | re.S)
    meta['acceptance_count'] = len(re.findall(r'^- \[[ x]\] ', acceptance[1], re.M)) if acceptance else 0
    return meta


def validate(items):
    ids = [item['id'] for item in items]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate epic ID')
    known = set(ids)
    for item in items:
        for key in ('title', 'summary', 'phase', 'assignee', 'risk', 'prd_requirements', 'depends_on', 'priority', 'baseline'):
            if key not in item:
                raise ValueError(f'{item["id"]}: missing {key}')
        if item.get('status') not in STATUSES or item.get('type') != 'epic':
            raise ValueError(f'{item["id"]}: invalid type/status')
        if item['priority'] not in {'Must', 'Should', 'Future'}:
            raise ValueError(f'{item["id"]}: invalid scope classification')
        if not isinstance(item['depends_on'], list) or not isinstance(item['prd_requirements'], list):
            raise ValueError(f'{item["id"]}: dependencies and source references must be lists')
        missing = set(item['depends_on']) - known
        if missing:
            raise ValueError(f'{item["id"]}: unknown dependencies {sorted(missing)}')
        task_ids = re.findall(r'^- \[[ x]\] (T\d+) ', item['body'], re.M)
        if len(task_ids) != len(set(task_ids)):
            raise ValueError(f'{item["id"]}: duplicate task IDs')
    graph = {item['id']: item['depends_on'] for item in items}
    visited, active = set(), set()

    def visit(node):
        if node in active:
            raise ValueError(f'Dependency cycle at {node}')
        if node in visited:
            return
        active.add(node)
        for dependency in graph[node]:
            visit(dependency)
        active.remove(node)
        visited.add(node)

    for node in graph:
        visit(node)


def embedded_json(value):
    # Prevent document text from closing the script element or creating HTML.
    return json.dumps(value, ensure_ascii=False).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')


def main():
    items = [read(path) for path in sorted(ROOT.glob('EPIC-*.md'))]
    if not items:
        raise ValueError('No epic source files found')
    validate(items)
    references = [read(path) for path in sorted(ROOT.glob('REFERENCE-*.md'))]
    ref_ids = [ref['id'] for ref in references]
    if len(ref_ids) != len(set(ref_ids)):
        raise ValueError('Duplicate reference ID')
    template = (ROOT / 'dashboard-template.html').read_text(encoding='utf-8')
    if any(template.count(key) != 1 for key in ('__DATA__', '__REFERENCE_DATA__', '__DIAGRAM_DATA__')):
        raise ValueError('Template must contain each data placeholder exactly once')
    diagram_specs = [
        ('production-architecture', 'Production architecture', 'NestJS modules, PostgreSQL authority, Redis/BullMQ support and Razorpay boundary.', ['EPIC-001', 'EPIC-002', 'EPIC-016', 'EPIC-017', 'EPIC-020']),
        ('reservation-lifecycle', 'Final reservation lifecycle', 'Manual/automatic selection converge into one hold engine; FREE and DEPOSIT converge after verified confirmation.', ['EPIC-010', 'EPIC-011', 'EPIC-012', 'EPIC-013', 'EPIC-014']),
        ('production-erd', 'Production ERD', 'Physical tables, holds, reservations, payments and exclusive inventory claims remain distinct. See Database map for missing SQL controls.', ['EPIC-005', 'EPIC-006', 'EPIC-008', 'EPIC-012', 'EPIC-013']),
        ('realtime-sequence', 'Database-backed realtime sequence', 'Commit before publish; staff milestones and customer status recover from PostgreSQL-backed state.', ['EPIC-010', 'EPIC-012', 'EPIC-015', 'EPIC-016', 'EPIC-017']),
    ]
    diagrams = []
    for diagram_id, title, caption, epic_ids in diagram_specs:
        path = ROOT / 'assets' / f'{diagram_id}.png'
        if not path.is_file() or not set(epic_ids) <= {item['id'] for item in items}:
            raise ValueError(f'Invalid diagram asset or linked epics: {diagram_id}')
        diagrams.append(dict(id=diagram_id, title=title, caption=caption, epics=epic_ids,
                             path=f'assets/{diagram_id}.png',
                             src='data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode('ascii')))
    page = template.replace('__DATA__', embedded_json(items)).replace('__REFERENCE_DATA__', embedded_json(references)).replace('__DIAGRAM_DATA__', embedded_json(diagrams))
    # Keep the new decomposition separate from the completed delivery baseline.
    # Numeric IDs were reused for different v2 work, so status cannot safely be
    # copied by number between these two plans.
    (ROOT / 'dashboard-v2.html').write_text(page, encoding='utf-8')
    archive = ROOT.parent / 'archive' / 'pre-prd-v2-2026-11-08'
    completed_items = [read(path) for path in sorted(archive.glob('EPIC-*.md'))]
    if not completed_items:
        raise ValueError('Completed delivery baseline is missing')
    completed_references = [read(path) for path in sorted(archive.glob('REFERENCE-*.md'))]
    for entry in completed_items + completed_references:
        entry['path'] = '../archive/pre-prd-v2-2026-11-08/' + entry['path']
    completed_template = (archive / 'dashboard-template.html').read_text(encoding='utf-8')
    completed_template = completed_template.replace(
        '<div class="notice"><strong>Backend blueprint · Prove atomic holds before payments</strong><span id="planNotice"></span> Product frontend is deferred. All implementation remains planned; no backend completion is claimed.</div>',
        '<div class="notice"><strong>Completed delivery baseline · Previous completion records preserved</strong>'
        'These are the original completed epics, with their original IDs, checklists and completion reports. '
        '<a href="dashboard-v2.html">Open finalized PRD v2 plan and diagrams ↗</a>. '
        'The v2 decomposition is a separate plan; it does not reset this completed work.</div>')
    completed_template = completed_template.replace('Dine · Backend Delivery Console', 'Dine · Completed Backend Delivery')
    completed_template = completed_template.replace('Blueprint v1.0 · Epic delivery console', 'Completed delivery baseline · 20 epics')
    completed_template = completed_template.replace('Blueprint v1.0 · Backend only', 'Completed baseline · Backend only')
    completed_template = completed_template.replace('Dine backend epics', 'Completed backend epics')
    completed_page = completed_template.replace('__DATA__', embedded_json(completed_items)).replace('__REFERENCE_DATA__', embedded_json(completed_references))
    (ROOT / 'dashboard.html').write_text(completed_page, encoding='utf-8')
    print(f'Generated Dine dashboard: {len(items)} epics, '
          f'{sum(x["tasks"] for x in items)} tasks, '
          f'{sum(x["acceptance_count"] for x in items)} acceptance checks, '
          f'{len(references)} reference guides, {len(diagrams)} embedded diagrams. Dependencies validated.')
    print(f'Default dashboard restored: {sum(item["status"] == "completed" for item in completed_items)} completed '
          f'of {len(completed_items)} original epics. V2 plan: dashboard-v2.html.')


if __name__ == '__main__':
    main()
