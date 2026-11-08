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
        if item['priority'] not in {'Must', 'Should', 'Future', 'Delivered'}:
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
        ('production-architecture', 'Production architecture', 'NestJS modules, PostgreSQL authority, Redis/BullMQ support and Razorpay boundary.', ['EPIC-001', 'EPIC-002', 'EPIC-013', 'EPIC-021', 'EPIC-024']),
        ('reservation-lifecycle', 'Final reservation lifecycle', 'Manual/automatic selection converge into one hold engine; FREE and DEPOSIT converge after verified confirmation.', ['EPIC-008', 'EPIC-009', 'EPIC-010', 'EPIC-011', 'EPIC-021']),
        ('production-erd', 'Production ERD', 'Physical tables, holds, reservations, payments and exclusive inventory claims remain distinct. See Database map for missing SQL controls.', ['EPIC-004', 'EPIC-006', 'EPIC-008', 'EPIC-009', 'EPIC-021']),
        ('realtime-sequence', 'Database-backed realtime sequence', 'Commit before publish; staff milestones and customer status recover from PostgreSQL-backed state.', ['EPIC-008', 'EPIC-009', 'EPIC-013', 'EPIC-014', 'EPIC-024']),
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
    # Both public filenames are aliases of the same active Markdown dataset.
    # A requirement update must never substitute a new identity for a completed epic.
    for filename in ('dashboard.html', 'dashboard-v2.html'):
        (ROOT / filename).write_text(page, encoding='utf-8')
    print(f'Generated Dine dashboard: {len(items)} epics, '
          f'{sum(x["tasks"] for x in items)} tasks, '
          f'{sum(x["acceptance_count"] for x in items)} acceptance checks, '
          f'{len(references)} reference guides, {len(diagrams)} embedded diagrams. Dependencies validated.')
    print(f'Both dashboards: {sum(item["status"] == "completed" for item in items)} completed, '
          f'{sum(item["status"] == "backlog" for item in items)} backlog; one shared source.')



if __name__ == '__main__':
    main()
