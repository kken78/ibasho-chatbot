// ===== 設定（環境ごとに変える値）=====
// Decidim のドメインはここに書かない。リンク先は埋め込み元（親ページ）のオリジンと、
// iframe の src に付けたクエリ（space・idea・feedback・apply）から組み立てる（app.js の resolveParent）。
window.IBASHO_CONFIG = {
  // シェア用の単独URL。空なら現在のURLを使う
  appUrl: 'https://kken78.github.io/ibasho-chatbot/trial/',
  // 相談窓口（区が指定する。空なら［　］の仮表示）
  helpLines: [],
};
