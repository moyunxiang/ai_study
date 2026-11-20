#!/usr/bin/env python3
"""把节点登记表切成阶段B的任务片。

  python3 scripts/slices.py plan            重新切片并写入 data/_slices.json，打印总览
  python3 scripts/slices.py list            列出所有片及完成度
  python3 scripts/slices.py show <片名>     打印这一片的节点（id | date | tier | kind | title | full | parents | 状态）
  python3 scripts/slices.py todo            只列出还有未写节点的片名

切法：每条分支先切“主干+重要”（tier 1、2），再切“延伸”（tier 3），各自按时间排序后分块。
tier 1 按 2 份工作量计，tier 2 按 1 份，每片约 22 份；tier 3 每片约 34 个。
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SLICES = DATA / "_slices.json"
CORE_BUDGET, EXT_SIZE = 22, 34


def load_nodes():
    tracks = [t["key"] for t in json.loads((DATA / "tracks.json").read_text(encoding="utf-8"))]
    nodes = []
    for p in sorted((DATA / "skeleton").glob("*.txt")):
        if p.name.startswith("_"):
            continue
        track = p.name.split(".")[0]
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            f = [x.strip() for x in line.split("|")]
            if len(f) == 7:
                nodes.append(dict(id=f[0], date=f[1], tier=int(f[2]), kind=f[3], title=f[4], full=f[5], parents=f[6], track=track))
    extra = DATA / "skeleton" / "_parents.txt"
    if extra.exists():
        by = {n["id"]: n for n in nodes}
        for line in extra.read_text(encoding="utf-8").splitlines():
            if "<-" in line and not line.startswith("#"):
                c, _, ps = line.partition("<-")
                if c.strip() in by:
                    n = by[c.strip()]
                    n["parents"] = ", ".join(x for x in [n["parents"], ps.strip()] if x)
    return tracks, nodes


def done(n):
    return (DATA / "content" / n["track"] / f"{n['id']}.json").exists()


def chunk(track, mine, start_core=0, start_ext=0):
    out = []
    core = [n for n in mine if n["tier"] <= 2]
    ext = [n for n in mine if n["tier"] == 3]
    chunks, cur, load = [], [], 0
    for n in core:
        w = 2 if n["tier"] == 1 else 1
        if cur and load + w > CORE_BUDGET:
            chunks.append(cur)
            cur, load = [], 0
        cur.append(n["id"])
        load += w
    if cur:
        chunks.append(cur)
    if len(chunks) > 1 and len(chunks[-1]) < 7:      # 尾巴太短就并入前一片
        tail = chunks.pop()
        chunks[-1] = chunks[-1] + tail
    for i, c in enumerate(chunks, 1):
        out.append({"name": f"{track}-core-{start_core + i}", "track": track, "group": "core", "ids": c})
    k = max(1, round(len(ext) / EXT_SIZE)) if ext else 0
    for i in range(k):
        c = [n["id"] for n in ext[i * len(ext) // k:(i + 1) * len(ext) // k]]
        out.append({"name": f"{track}-ext-{start_ext + i + 1}", "track": track, "group": "ext", "ids": c})
    return out


def plan():
    """增量切片：已有的片保持不动（可能已经派发），只把还没分配的节点切成新片追加在后面。"""
    tracks, nodes = load_nodes()
    known = {n["id"] for n in nodes}
    old = json.loads(SLICES.read_text(encoding="utf-8")) if SLICES.exists() else []
    for s in old:
        s["ids"] = [i for i in s["ids"] if i in known]        # 登记表里被删掉的id
    old = [s for s in old if s["ids"]]
    assigned = {i for s in old for i in s["ids"]}
    out = list(old)
    for t in tracks:
        mine = sorted((n for n in nodes if n["track"] == t and n["id"] not in assigned),
                      key=lambda n: (n["date"] if len(n["date"]) == 7 else n["date"] + "-00"))
        if not mine:
            continue
        nc = max([int(s["name"].rsplit("-", 1)[1]) for s in old if s["track"] == t and s["group"] == "core"], default=0)
        ne = max([int(s["name"].rsplit("-", 1)[1]) for s in old if s["track"] == t and s["group"] == "ext"], default=0)
        out += chunk(t, mine, nc, ne)
    SLICES.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    return out


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "list"
    _, nodes = load_nodes()
    by = {n["id"]: n for n in nodes}
    slices = plan() if cmd == "plan" else json.loads(SLICES.read_text(encoding="utf-8"))
    if cmd in ("plan", "list", "todo"):
        tot = dn = 0
        for s in slices:
            s["ids"] = [i for i in s["ids"] if i in by]
            if not s["ids"]:
                continue
            d = sum(done(by[i]) for i in s["ids"])
            tot += len(s["ids"])
            dn += d
            if cmd == "todo":
                if d < len(s["ids"]):
                    print(s["name"])
            else:
                print(f"{s['name']:18s} {d:3d}/{len(s['ids']):3d}  {by[s['ids'][0]]['date']} → {by[s['ids'][-1]]['date']}")
        if cmd != "todo":
            print(f"\n共 {len(slices)} 片（core {sum(s['group'] == 'core' for s in slices)} / ext {sum(s['group'] == 'ext' for s in slices)}），节点 {tot}，已写 {dn}")
    elif cmd == "show":
        s = next((x for x in slices if x["name"] == sys.argv[2]), None)
        if not s:
            sys.exit(f"没有这个片：{sys.argv[2]}")
        print(f"# {s['name']}：分支 {s['track']}，{len(s['ids'])} 个节点。输出到 data/content/{s['track']}/<id>.json")
        print("# id | date | tier | kind | title | full | parents | 状态")
        for i in s["ids"]:
            if i not in by:
                continue
            n = by[i]
            print(" | ".join([n["id"], n["date"], str(n["tier"]), n["kind"], n["title"], n["full"], n["parents"], "已写，跳过" if done(n) else "待写"]))


if __name__ == "__main__":
    main()
