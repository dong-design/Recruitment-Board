import importlib.util
import json
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('builder', pathlib.Path(__file__).resolve().parents[1] / 'build_dashboard.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class GeneratorTests(unittest.TestCase):
    def test_script_boundary_and_roundtrip(self):
        data = {'note': '</script><script>alert(1)</script>&\u2028\u2029', 'name': '中文'}
        encoded = builder.script_json(data)
        self.assertNotIn('<', encoded)
        self.assertNotIn('&', encoded)
        self.assertNotIn('\u2028', encoded)
        self.assertEqual(json.loads(encoded), data)

if __name__ == '__main__':
    unittest.main()
