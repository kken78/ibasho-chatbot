#!/usr/bin/env python3
"""Decidim（0.32）の提案コンポーネントから施設データを読み、アプリ用の公開データを作る。

ログインなしで GraphQL API を読む（取り組みと提案コンポーネントが公開されている前提）。
出力：trial/places.json（確認用）と trial/data.js（アプリが読む）

使い方：
  python3 trial/scripts/sync_from_decidim.py \
      --api https://（DecidimのURL）/api --component （提案コンポーネントのID）

0.32 で気をつけること
- 提案の一覧に全件数（totalCount）はない。pageInfo で50件ずつ読む
- 座標のない提案があると errors が返る（data の残りは返る）。errors があっても止めず、座標なしは除外して記録する
- 分類・地域・種別・特徴はタクソノミー。親（ルート）の名前で振り分ける
- 名称が短い施設は、Decidim の題名の最小文字数のため題名に地域を足している。本文の「名称：」を正とする
"""
import argparse
import html
import json
import re
import sys
import urllib.request
from pathlib import Path

QUERY = """
query($id: ID!, $after: String) {
  component(id: $id) {
    id
    ... on Proposals {
      proposals(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          title { translation(locale: "ja") }
          body { translation(locale: "ja") }
          address
          coordinates { latitude longitude }
          taxonomies { id name { translation(locale: "ja") } parent { id name { translation(locale: "ja") } } }
          withdrawn
          publishedAt
        }
      }
    }
  }
}
"""

# タクソノミーのルート名 → 出力の項目
ROOTS = {
    "[検証]居場所の分類": "kind_label",
    "[検証]居場所の地域": "area",
    "[検証]施設の種別": "cat",
    "[検証]居場所の特徴": "tags",
}
KIND_KEYS = {
    "あそぶ": "play", "勉強する・本を読む": "study", "ほっとする・話せる": "calm",
    "学校以外で学ぶ": "learn", "ごはんを食べる": "food",
}
ALLOWED_URL = re.compile(r"^https://")


def post(api, variables):
    req = urllib.request.Request(
        api, data=json.dumps({"query": QUERY, "variables": variables}).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "ibasho-sync/0.1"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def text_of(body_html):
    return [html.unescape(re.sub(r"<[^>]+>", "", p)).strip() for p in re.findall(r"<p>(.*?)</p>", body_html or "", re.S)]


def to_place(node, warnings):
    paras = text_of(node["body"]["translation"])
    meta = {k: v for k, v in (p.split("：", 1) for p in paras if "：" in p and p.split("：", 1)[0] in ("案内", "名称", "施設ID"))}
    desc = next((p for p in paras if p.split("：", 1)[0] not in ("案内", "名称", "施設ID")), "")
    coords = node.get("coordinates") or {}
    if not coords.get("latitude") or not coords.get("longitude"):
        warnings.append(f"座標なし：提案{node['id']}")
        return None
    out = {"kind_label": "", "area": "", "cat": "", "tags": []}
    for t in node.get("taxonomies") or []:
        root = (t.get("parent") or {}).get("name", {}).get("translation")
        key = ROOTS.get(root)
        if key == "tags":
            out["tags"].append(t["name"]["translation"])
        elif key:
            out[key] = t["name"]["translation"]
    url = meta.get("案内", "")
    if url and not ALLOWED_URL.match(url):
        warnings.append(f"https以外のURLを除外：提案{node['id']}")
        url = ""
    return {
        "id": int(node["id"]),
        "sourceId": meta.get("施設ID", ""),
        "name": meta.get("名称") or node["title"]["translation"],
        "desc": desc,
        "addr": node.get("address") or "",
        "cat": out["cat"],
        "area": out["area"],
        "kind": KIND_KEYS.get(out["kind_label"], ""),
        "tags": out["tags"],
        "lat": round(float(coords["latitude"]), 6),
        "lng": round(float(coords["longitude"]), 6),
        "url": url,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", required=True)
    ap.add_argument("--component", required=True)
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[1]))
    args = ap.parse_args()

    places, warnings, after = [], [], None
    while True:
        res = post(args.api, {"id": args.component, "after": after})
        for e in res.get("errors") or []:
            warnings.append("APIエラー：" + e.get("message", ""))
        comp = (res.get("data") or {}).get("component")
        if not comp:
            sys.exit("コンポーネントが読めません（非公開、またはIDの誤り）")
        conn = comp["proposals"]
        for n in conn["nodes"]:
            if n.get("withdrawn"):
                continue
            p = to_place(n, warnings)
            if p:
                places.append(p)
        if not conn["pageInfo"]["hasNextPage"]:
            break
        after = conn["pageInfo"]["endCursor"]

    places.sort(key=lambda p: p["sourceId"] or str(p["id"]))
    out = Path(args.out)
    (out / "places.json").write_text(json.dumps(places, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (out / "data.js").write_text("// Decidim から生成（scripts/sync_from_decidim.py）。手で直さない\nconst PLACES = "
                                 + json.dumps(places, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"{len(places)}件を書き出しました")
    for w in warnings:
        print("注意：" + w)


if __name__ == "__main__":
    main()
