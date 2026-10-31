"""Build a read-only demo using bundled sample data, without personal configuration."""
from pathlib import Path
import runpy

root = Path(__file__).resolve().parent.parent
module = runpy.run_path(str(root / "build_dashboard.py"))
settings = module["main"].__globals__
settings.update(SRC=str(root / "sample" / "feishu_records.ndjson"),
                ACTIONS=[], FEISHU_URL="https://example.com", CLOUD_CONFIG={})
module["main"]()
