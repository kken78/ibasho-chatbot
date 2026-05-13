# 世田谷 居場所さがし（プロトタイプ）

世田谷区の「子ども・若者の居場所リスト（仮）」をもとにした、中高生向けの居場所提案チャットボット。

## ローカルで動かす

GitHub Pages前提の純粋な静的サイトなので、ローカルでは任意の静的サーバーで開けばOK。

```sh
cd setagaya-ibasho
python3 -m http.server 8080
# → http://localhost:8080
```

`file://` で直接開いてもほぼ動くが、一部ブラウザで地図タイル等が遮断される可能性があるためHTTPサーバー経由推奨。

## GitHub Pages へのデプロイ

1. このディレクトリをそのままリポジトリのルート（または `/docs`）にコミット
2. Settings → Pages で公開
3. Decidim へのiframe埋め込みURLは公開URLをそのまま指定

## ファイル構成

- `index.html` — UIシェル
- `styles.css` — スタイル
- `data.js` — 居場所データ（52件、CSVから生成）
- `app.js` — チャットフロー・マッチング・地図・シェア
- `places.json` — 同データのJSON版（参考）

## 機能

- 地域 → 気分 → 中高生優先 の3問でマッチング（スコアリング方式）
- Leaflet + OpenStreetMap で地図表示（APIキー不要）
- LINE / X / URLコピー のシェア（URLクエリ `?places=1,5,12` で結果を共有）

## データ更新

`places.json` を更新したら以下で `data.js` を再生成：

```sh
python3 -c "import json; open('data.js','w',encoding='utf-8').write('const PLACES = '+json.dumps(json.load(open('places.json',encoding='utf-8')),ensure_ascii=False)+';\n')"
```
