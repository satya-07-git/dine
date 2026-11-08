"""Build Dine's standalone offline delivery console. Python standard library only."""
from pathlib import Path
import json
import re

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
        for key in ('title', 'summary', 'phase', 'assignee', 'risk', 'prd_requirements', 'depends_on'):
            if key not in item:
                raise ValueError(f'{item["id"]}: missing {key}')
        if item.get('status') not in STATUSES or item.get('type') != 'epic':
            raise ValueError(f'{item["id"]}: invalid type/status')
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
    if template.count('__DATA__') != 1 or template.count('__REFERENCE_DATA__') != 1:
        raise ValueError('Template must contain each data placeholder exactly once')
    page = template.replace('__DATA__', embedded_json(items)).replace('__REFERENCE_DATA__', embedded_json(references))
    (ROOT / 'dashboard.html').write_text(page, encoding='utf-8')
    print(f'Generated Dine dashboard: {len(items)} epics, '
          f'{sum(x["tasks"] for x in items)} tasks, '
          f'{sum(x["acceptance_count"] for x in items)} acceptance checks, '
          f'{len(references)} reference guides. Dependencies validated.')


if __name__ == '__main__':
    main()
