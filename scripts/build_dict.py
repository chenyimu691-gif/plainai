# -*- coding: utf-8 -*-
"""生成插件词库：整合 embodiedterms 数据 + 自有词库。

输入: embodiedterms_zh.json（源站 2926 条，见 README 的数据来源说明）
输出: lib/dictionary/terms-embodiedterms.ts
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "embodiedterms_zh.json"
OUT = ROOT / "lib" / "dictionary" / "terms-embodiedterms.ts"

CATEGORY_MAP = {
    "concept": "general", "industry": "general", "company": "general",
    "robot": "robotics", "hardware": "robotics", "mechanics": "robotics",
    "control": "robotics", "perception": "robotics", "software": "robotics",
    "sim": "aiml", "data": "aiml", "training": "aiml",
    "model": "aiml", "named_model": "aiml",
}


def esc(s: str) -> str:
    """转义成 TS 单引号字符串。"""
    return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "")


def main():
    data = json.loads(SRC.read_text(encoding="utf-8"))
    terms = data["terms"]
    as_of = data.get("today", "")

    lines = [
        "// 本文件由脚本生成，勿手改",
        "// 数据来源：embodiedterms.com（具身智能新手名词表）",
        "// 许可：CC BY-NC 4.0（署名 — 非商业性使用）",
        "// 署名：术语解释数据来自 https://embodiedterms.com",
        f"// 数据截至：{as_of}",
        "import type { DictEntry } from './types';",
        "",
        "export const embodiedtermsTerms: DictEntry[] = [",
    ]

    count = 0
    for t in terms:
        name = (t.get("name") or "").strip()
        one_liner = (t.get("one_liner") or "").strip()
        if not name or not one_liner:
            continue
        cat = CATEGORY_MAP.get(t.get("category", ""), "general")

        # 别名合并
        aka, seen = [], {name}
        for key in ("aliases", "alt", "abbr"):
            v = t.get(key)
            vals = v if isinstance(v, list) else ([v] if v else [])
            for x in vals:
                x = (x or "").strip()
                if x and x not in seen:
                    seen.add(x)
                    aka.append(x)

        parts = [
            f"  {{ term: '{esc(name)}', category: '{cat}', plain: '{esc(one_liner)}'"
        ]
        if aka:
            parts.append(f", aka: [{', '.join(chr(39) + esc(a) + chr(39) for a in aka)}]")
        parts.append(" },")
        lines.append("".join(parts))
        count += 1

    lines.append("];")
    lines.append("")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"生成 {count} 条 -> {OUT.relative_to(ROOT)}")
    print(f"文件大小: {OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
