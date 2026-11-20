#!/usr/bin/env python3
"""阶段B派发队列：列出还没派出去的片（先 core 后 ext；robot/llm/agent 优先；sci 暂缓）。
  python3 scripts/queue.py [N]        打印接下来 N 个待派发的片
  python3 scripts/queue.py mark a b   记为已派发
"""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
L = ROOT / "data" / "_launched.txt"
launched = set(L.read_text().split()) if L.exists() else set()
if len(sys.argv) > 1 and sys.argv[1] == "mark":
    launched |= set(sys.argv[2:]); L.write_text("\n".join(sorted(launched)) + "\n"); print("已派发", len(launched)); sys.exit()
pri = ["robot", "llm", "agent", "dl", "nlp", "vision", "gen", "mm", "rl", "hw", "speech", "sys", "data", "safety", "biz"]
sl = [s for s in json.loads((ROOT / "data" / "_slices.json").read_text()) if s["track"] != "sci" and s["name"] not in launched]
sl.sort(key=lambda s: (s["group"] != "core", pri.index(s["track"]), s["name"]))
n = int(sys.argv[1]) if len(sys.argv) > 1 else 10
print(f"待派发 {len(sl)}：", " ".join(s["name"] for s in sl[:n]))
