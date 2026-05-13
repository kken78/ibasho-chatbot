// ===== 居場所さがし チャットボット =====
// 中高生向け・選択式・GitHub Pages静的配信前提

const chatEl = document.getElementById('chat');
const choicesEl = document.getElementById('choices');

const state = {
  area: null,      // 地域フィルタ (null = どこでも)
  mood: null,      // 気分カテゴリ
  needTeen: false, // 中高生向け優先
};

// ===== 質問フロー定義 =====
const MOODS = {
  quiet:   { label: '📚 静かに過ごしたい・勉強したい', tags: ['本', '読書', '自習', '学習'], cats: ['図書館'] },
  active:  { label: '🌳 体を動かしたい・外で遊びたい', tags: ['外遊び', '自然'], cats: ['プレーパーク', 'きぬたまあそび村'] },
  hangout: { label: '🧸 友達とゆっくり過ごしたい',     tags: ['居場所'], cats: ['児童館', '青少年交流センター', '子どもの居場所'] },
  read:    { label: '📖 本を読みたい',                 tags: ['本', '読書'], cats: ['図書館'] },
  music:   { label: '🎵 音楽・自由に表現したい',       tags: ['音楽'], cats: ['青少年交流センター'] },
  any:     { label: '✨ おまかせで提案して',           tags: [], cats: [] },
};

const AREAS = ['世田谷地域', '北沢地域', '玉川地域', '砧地域', '烏山地域'];

// ===== UI helpers =====
function addMsg(text, who = 'bot') {
  const div = document.createElement('div');
  div.className = `msg ${who}`;
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

function setChoices(items) {
  choicesEl.innerHTML = '';
  items.forEach(({ label, onClick, secondary }) => {
    const b = document.createElement('button');
    b.className = 'choice-btn' + (secondary ? ' secondary' : '');
    b.textContent = label;
    b.onclick = () => {
      addMsg(label, 'user');
      choicesEl.innerHTML = '';
      onClick();
    };
    choicesEl.appendChild(b);
  });
}

// ===== フロー =====
function start() {
  // URLパラメータがあれば共有結果ビューへ
  const params = new URLSearchParams(location.search);
  const shared = params.get('places');
  if (shared) {
    const ids = shared.split(',').map(Number).filter(n => !isNaN(n));
    const places = ids.map(id => PLACES.find(p => p.id === id)).filter(Boolean);
    if (places.length) {
      addMsg('シェアされた居場所だよ🎁');
      showResults(places, /*fromShare*/ true);
      return;
    }
  }

  addMsg('こんにちは！世田谷の「居場所」さがしを手伝うよ🌱\nいくつか質問するから、気軽にこたえてね。');
  setTimeout(askArea, 400);
}

function askArea() {
  addMsg('まず、どのあたりで探したい？');
  setChoices([
    ...AREAS.map(a => ({ label: a, onClick: () => { state.area = a; askMood(); } })),
    { label: 'どこでもOK', onClick: () => { state.area = null; askMood(); }, secondary: true },
  ]);
}

function askMood() {
  addMsg('いまの気分は？');
  setChoices(Object.entries(MOODS).map(([key, m]) => ({
    label: m.label,
    onClick: () => { state.mood = key; askTeen(); },
  })));
}

function askTeen() {
  addMsg('中高生向けの場所を優先する？');
  setChoices([
    { label: '👍 うん、優先して', onClick: () => { state.needTeen = true; showMatches(); } },
    { label: '気にしない', onClick: () => { state.needTeen = false; showMatches(); }, secondary: true },
  ]);
}

// ===== マッチング =====
function scorePlace(p) {
  const mood = MOODS[state.mood];
  let score = 0;

  if (state.area && p.area === state.area) score += 3;
  if (state.area && p.area !== state.area) score -= 1;

  if (mood) {
    if (mood.cats.includes(p.cat)) score += 4;
    const tagHit = p.tags.filter(t => mood.tags.includes(t)).length;
    score += tagHit * 2;
  }
  if (state.needTeen && p.tags.includes('中高生')) score += 3;
  if (state.needTeen && p.cat === '青少年交流センター') score += 2;

  // おまかせの時は全体的に均等に
  if (state.mood === 'any') score += 1;

  return score;
}

function showMatches() {
  const ranked = PLACES
    .map(p => ({ p, s: scorePlace(p) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s);

  const top = ranked.slice(0, 5).map(x => x.p);

  if (top.length === 0) {
    addMsg('ぴったりの場所が見つからなかった…条件をゆるめてもう一度試してみる？');
    setChoices([{ label: '🔄 最初からやり直す', onClick: resetAll }]);
    return;
  }

  addMsg(`${top.length}か所えらんでみたよ！地図もチェックしてね🗺️`);
  showResults(top, false);
}

// ===== 結果表示 =====
function showResults(places, fromShare) {
  // カード
  places.forEach(p => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${escapeHtml(p.name)}</h3>
      <div class="meta">${escapeHtml(p.cat)} ・ ${escapeHtml(p.area)} ・ ${escapeHtml(p.addr)}</div>
      <div class="desc">${escapeHtml(p.desc)}</div>
      <div class="links">
        ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener">公式ページ↗</a>` : ''}
        <a href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">Googleマップで開く↗</a>
      </div>
    `;
    chatEl.appendChild(card);
  });

  // 地図
  const mapDiv = document.createElement('div');
  mapDiv.id = 'map';
  chatEl.appendChild(mapDiv);
  setTimeout(() => initMap(mapDiv, places), 50);

  // シェア&リセット
  const shareIds = places.map(p => p.id).join(',');
  const shareUrl = `${location.origin}${location.pathname}?places=${shareIds}`;
  const shareText = `世田谷の居場所、こんな場所どう？\n${places.map(p => '・' + p.name).join('\n')}\n`;

  const shareWrap = document.createElement('div');
  shareWrap.className = 'card';
  shareWrap.innerHTML = `
    <h3>このリストをシェア</h3>
    <div class="meta">友だちに教えたり、自分用にブックマークしてね</div>
    <div class="share-row">
      <button id="btn-line">LINEで送る</button>
      <button id="btn-x">Xでポスト</button>
      <button id="btn-copy">URLをコピー</button>
    </div>
  `;
  chatEl.appendChild(shareWrap);

  shareWrap.querySelector('#btn-line').onclick = () => {
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(shareText + shareUrl)}`, '_blank');
  };
  shareWrap.querySelector('#btn-x').onclick = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
  };
  shareWrap.querySelector('#btn-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      const btn = shareWrap.querySelector('#btn-copy');
      const orig = btn.textContent;
      btn.textContent = '✓ コピーしたよ';
      setTimeout(() => btn.textContent = orig, 1500);
    } catch (e) {
      prompt('このURLをコピーしてね:', shareUrl);
    }
  };

  chatEl.scrollTop = chatEl.scrollHeight;

  setChoices([
    { label: '🔄 もう一度さがす', onClick: resetAll },
    ...(fromShare ? [] : []),
  ]);
}

function initMap(div, places) {
  const valid = places.filter(p => p.lat && p.lng);
  if (valid.length === 0) return;
  const map = L.map(div, { scrollWheelZoom: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 18,
  }).addTo(map);
  const markers = valid.map(p => L.marker([p.lat, p.lng]).addTo(map).bindPopup(`<b>${escapeHtml(p.name)}</b><br>${escapeHtml(p.addr)}`));
  const group = L.featureGroup(markers);
  map.fitBounds(group.getBounds().pad(0.2));
  // flex親内でコンテナサイズ確定後にタイルを再描画
  setTimeout(() => map.invalidateSize(), 100);
}

function resetAll() {
  // URLクエリをクリア
  history.replaceState(null, '', location.pathname);
  state.area = null;
  state.mood = null;
  state.needTeen = false;
  chatEl.innerHTML = '';
  start();
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

start();
