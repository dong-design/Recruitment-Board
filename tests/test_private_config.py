import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

def builder():
    spec = importlib.util.spec_from_file_location('clean_builder', ROOT/'build_dashboard.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class PrivateConfigTests(unittest.TestCase):
    def test_import_uses_demo_without_personal_settings(self):
        module = builder()
        self.assertEqual(module.ACTIONS, [])
        self.assertEqual(module.CLOUD_CONFIG, {})
        self.assertEqual(module.FEISHU_URL, '')
        self.assertEqual(Path(module.SRC), ROOT/'sample/feishu_records.ndjson')

    def test_local_settings_and_actions_only_load_explicitly(self):
        module = builder()
        with tempfile.TemporaryDirectory() as folder:
            module.BASE_DIR = folder
            Path(folder, 'config.json').write_text(json.dumps({
                'source':'records.ndjson', 'feishuUrl':'https://example.com',
                'cloud': {'endpoint':'https://example.com', 'app_secret':'test-only-secret'}
            }), encoding='utf-8')
            Path(folder, 'actions.json').write_text(json.dumps([
                {'name':'Example', 'datetime':'2027-01-01T09:00', 'tip':'Example task'}
            ]), encoding='utf-8')
            module.load_local_config()
            self.assertEqual(module.SRC, str(Path(folder, 'records.ndjson')))
            self.assertEqual(module.CLOUD_CONFIG, {'endpoint':'https://example.com'})
            self.assertEqual(module.ACTIONS, [('Example','2027-01-01T09:00','Example task')])

if __name__ == '__main__':
    unittest.main()
