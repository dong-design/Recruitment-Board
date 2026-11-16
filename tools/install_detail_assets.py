"""Install only the detail presentation into an existing PRIVATE board HTML.

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
    for tag, ident in [('style', 'recruit-detail-style'), ('script', 'recruit-detail-script')]:
        html = re.sub(r'<' + tag + r' id="' + ident + r'">.*?</' + tag + r'>', '', html, flags=re.S)
    return html

base = strip_assets(before)
for required in ['const DATA = ', 'searchRoot', 'renderSyncCenter', 'ScheduleFields', 'renderJobTimeline', '</head>', '</body>']:
    if required not in base:
        raise RuntimeError('Incompatible HTML: missing ' + required + '; nothing written')
if "job-detail-mode" in base:
    raise RuntimeError('Unmarked detail assets already exist; nothing written')
after = base
for name, tag, ident, end in [
    ('detail-dialog.css', 'style', 'recruit-detail-style', '</head>'),
    ('detail-dialog.js', 'script', 'recruit-detail-script', '</body>'),
]:
    asset = (root / 'dashboard' / name).read_text(encoding='utf-8')
    after = after.replace(end, f'<{tag} id="{ident}">{asset}</{tag}>' + end, 1)
assert strip_assets(after) == base
snapshot = re.compile(r'^const DATA = (.*);\r?$', re.M)
assert snapshot.search(before) and snapshot.search(before).group(1) == snapshot.search(after).group(1)
if after == before:
    print('Detail dialog already current; no files changed.')
else:
    backup = target.with_name('.index.before-detail.html')
    if not backup.exists():
        backup.write_bytes(target.read_bytes())
    temp = target.with_name('.index.detail.tmp')
    temp.write_bytes(after.encode('utf-8'))
    temp.replace(target)
    print('Detail dialog installed. All original HTML outside detail assets preserved exactly.')
