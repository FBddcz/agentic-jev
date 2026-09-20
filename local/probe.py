"""Compare fresh and shared readout on a tiny fixed fixture (real weights)."""
import json
from serve import Scorer

state = {"query": "周末去公园露营，喜欢轻便自然的装备", "liked": [], "disliked": [], "candidates": [
    {"id": "tent", "name": "双人帐篷", "category": "庇护", "tags": ["轻便", "防风"]},
    {"id": "keyboard", "name": "机械键盘", "category": "输入", "tags": ["办公", "静音"]},
]}
scorer = Scorer(local_files_only=True, batch_size=4)
results = [scorer.score(state, mode) for mode in ["fresh", "shared"]]
print(json.dumps({"fixture": state, "results": results,
                  "note": "Two candidates, one run per path. A correctness/serving smoke test, not a speed benchmark."},
                 ensure_ascii=False, indent=2))
