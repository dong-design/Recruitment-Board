"""Check staged Git blobs before publishing. Never prints matched private values."""
import ast
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])

def inspect(path, data):
    errors = []
    if (path in ('config.json', 'actions.json', 'feishu_records.ndjson', 'dashboard/index.html')
        or re.search(r'(^|/)(\.env|\.feishu-app\.json|\.board-auth\.json|\.planner-state\.json.*|\.notifications\.json|\.planner-actions\.json)$', path)):
        errors.append('private/generated file')
    try:
        text = data.decode('utf-8-sig')
    except UnicodeDecodeError:
        return errors
    patterns = {
        'personal Feishu address': r'https://[a-z0-9]+\.feishu\.cn/base/[A-Za-z0-9]{10,}',
        'bound cloud deployment': r'https://[a-z0-9-]+\.app\.workbuddy\.host',
        'cloud client key': r'wbpk_[A-Za-z0-9_-]{20,}',
        'share access parameter': r'(?:sharecode|shareId)=[A-Za-z0-9]{8,}',
        'private email': r'[\w.+-]+@(?:qq|163|126)\.com',
    }
    for label, pattern in patterns.items():
        if re.search(pattern, text):
            errors.append(label)
    if path == 'build_dashboard.py':
        for node in ast.parse(text).body:
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'ACTIONS' for t in node.targets):
                if not isinstance(node.value, ast.List) or node.value.elts:
                    errors.append('hardcoded personal actions')
    if path == 'sample/feishu_records.ndjson':
        import json
        if any(not json.loads(line).get('record_id', '').startswith('recSample') for line in text.splitlines() if line.strip()):
            errors.append('non-example record in sample')
    return errors

def main():
    problems = []
    entries = git('ls-files', '--stage', '-z').decode().split('\0')
    for entry in filter(None, entries):
        meta, path = entry.split('\t', 1)
        sha = meta.split()[1]
        problems.extend((path, error) for error in inspect(path, git('cat-file', 'blob', sha)))
    for path, error in problems:
        print(f'{path}: {error}')
    print(f'Privacy check: {len(problems)} finding(s). Binary assets require visual review.')
    return bool(problems)

if __name__ == '__main__':
    sys.exit(main())
