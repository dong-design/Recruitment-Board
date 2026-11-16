"""Install only the sidebar presentation into an existing PRIVATE board HTML.

Preserves all other HTML bytes and files. No data reads from external services,
no regeneration, no credentials/state writes. Run against the deployed HTML.
"""
from pathlib import Path
import argparse
import re

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--html', type=Path, default=root / 'dashboard/index.html')
args = parser.parse_args()
target = args.html.resolve()
before = target.read_bytes().decode('utf-8')

def strip_assets(html):
    for tag, ident in [('style', 'recruit-sidebar-style'), ('script', 'recruit-sidebar-script')]:
        html = re.sub(r'<' + tag + r' id="' + ident + r'">.*?</' + tag + r'>', '', html, flags=re.S)
    return html

base = strip_assets(before)
for required in ['const DATA = ', 'searchRoot', 'renderSyncCenter', 'board-account', '</head>', '</body>']:
    if required not in base:
        raise RuntimeError('Incompatible HTML: missing ' + required + '; nothing written')
if "sidebar-layout" in base:
    raise RuntimeError('Unmarked sidebar assets already exist; nothing written')
after = base
for name, tag, ident, end in [
    ('sidebar.css', 'style', 'recruit-sidebar-style', '</head>'),
    ('sidebar.js', 'script', 'recruit-sidebar-script', '</body>'),
]:
    asset = (root / 'dashboard' / name).read_text(encoding='utf-8')
    after = after.replace(end, f'<{tag} id="{ident}">{asset}</{tag}>' + end, 1)
assert strip_assets(after) == base
snapshot = re.compile(r'^const DATA = (.*);\r?$', re.M)
assert snapshot.search(before) and snapshot.search(before).group(1) == snapshot.search(after).group(1)
if after == before:
    print('Sidebar already current; no files changed.')
else:
    backup = target.with_name('.index.before-sidebar.html')
    if not backup.exists():
        backup.write_bytes(target.read_bytes())
    temp = target.with_name('.index.sidebar.tmp')
    temp.write_bytes(after.encode('utf-8'))
    temp.replace(target)
    print('Sidebar installed. All original HTML outside sidebar assets preserved exactly.')
