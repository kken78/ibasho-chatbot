// ===== 設定（環境ごとに変える値）=====
// Decidim のドメインはここに書かない。リンク先は埋め込み元（親ページ）のオリジンと、
// iframe の src に付けたクエリ（space・idea・feedback・apply）から組み立てる（app.js の resolveParent）。
window.IBASHO_CONFIG = {
  // 埋め込みを許可するオリジン（"https://…" の SHA-256。16進）
  //   python3 -c "import hashlib,sys;print(hashlib.sha256(sys.argv[1].encode()).hexdigest())" https://（ドメイン）
  parentOriginHashes: [
    'e845492c94f66cc6cfe310b333e062dfd5dc334c31a7ae07ea9b79257e15de06', // 検証環境
    '445445e2322a4d99672844b429aba6d5de3ab9367f92c2247915729382317452', // 子ども・若者のページ
  ],
  // シェア用の単独URL。空なら現在のURLを使う
  appUrl: 'https://kken78.github.io/ibasho-chatbot/trial/',
  // 相談窓口（区が指定する。空なら［　］の仮表示）
  helpLines: [],
};
