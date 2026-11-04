# 試作：居場所さがし 完全版（Decidim 0.32 の iframe コンポーネントに全画面で入れる版）

公開URL：https://kken78.github.io/ibasho-chatbot/trial/
Decidim側：検証用の Decidim 0.32 の取り組み（URLはリポジトリに書かない）

- ルート（/）の現行プロトタイプとは別物
- データ：Decidim の提案コンポーネント（メニュー非表示）に現行の52件を登録し、`scripts/sync_from_decidim.py` で GraphQL（ログインなし）から `data.js`・`places.json` を生成
  - `python3 trial/scripts/sync_from_decidim.py --api https://（DecidimのURL）/api --component （提案コンポーネントのID）`
  - 分類・地域・種別・特徴はタクソノミー（[検証]居場所の分類／地域／施設の種別／特徴）。案内URL・名称・施設IDは本文に記載
- 画面：トップ／チャット／一覧／地図／詳細／アイデア箱／相談。横幅900px以上は一覧と地図の2列
- ふりがな切り替え、現在地（近い順・距離）、ほぞん（端末内）、シェア
- 開く日・対象年代はデータにないため、その機能（次にひらく日、いつで絞り込み）は未実装
- Decidim側のページ（アイデア箱・感想・掲載のお申し込みのアンケート）へのリンクは、埋め込み元のオリジン（`config.js` に SHA-256 で許可リスト）と iframe の src のクエリから組み立て、枠の外で開く
  - iframe の src の例：`https://kken78.github.io/ibasho-chatbot/trial/?space=processes/（スラッグ）&idea=（コンポーネントID）/（アンケートID）&feedback=…&apply=…`
  - Decidimのドメインはリポジトリに書かない
- `dev/embed-test/`：Awesome「カスタムスタイル」用CSS（awesome-scoped.css）と iframe のコード
- GitHub Pages ではレスポンスヘッダー（frame-ancestors）を設定できないため、埋め込み元の制限は本番の置き場所（Vercel等）で行う
