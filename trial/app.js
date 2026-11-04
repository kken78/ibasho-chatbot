// ===== 居場所さがし 完全版試作 =====
// Decidim の iframe コンポーネントに全画面で入る前提。画面の切り替えは # で行い、親ページ（Decidim）は動かさない。
// データは data.js（Decidim の提案から scripts/sync_from_decidim.py で生成。現行の52件）。開く日・対象年代はまだデータにないため、その機能は出さない。
(function () {
'use strict';

const CFG = window.IBASHO_CONFIG || {};
const LINK = { site: '', idea: '', feedback: '', apply: '' }; // Decidim側のページ（埋め込み元から決める）
const view = document.getElementById('view');
const DESKTOP = window.matchMedia('(min-width: 900px)');

// ---------- 分類（現行データの種別から仮に対応づけ）----------
const KINDS = {
  play:  { label: 'あそぶ', ruby: 'あそぶ', color: '#3a8f4b' },
  study: { label: '勉強する・本を読む', ruby: '{勉強|べんきょう}する・{本|ほん}を{読|よ}む', color: '#2e68ad' },
  calm:  { label: 'ほっとする・話せる', ruby: 'ほっとする・{話|はな}せる', color: '#8a5bb0' },
  learn: { label: '学校以外で学ぶ', ruby: '{学校|がっこう}{以外|いがい}で{学|まな}ぶ', color: '#b0457a' },
  food:  { label: 'ごはんを食べる', ruby: 'ごはんを{食|た}べる', color: '#c9671a' },
};
const CAT_TO_KIND = {
  '児童館': 'play', 'プレーパーク': 'play', 'きぬたまあそび村': 'play',
  '図書館': 'study',
  '青少年交流センター': 'calm', '子どもの居場所': 'calm', '子育て支援': 'calm',
};
const AREAS = ['世田谷地域', '北沢地域', '玉川地域', '砧地域', '烏山地域'];

// data.js は const PLACES を宣言する（window には載らない）
// eslint-disable-next-line no-undef
const PLACES_V = (typeof PLACES !== 'undefined' ? PLACES : []).map(p => ({
  ...p,
  name: String(p.name).replace(/^[^\p{L}\p{N}]+/u, '').trim(),
  kind: (p.kind && KINDS[p.kind]) ? p.kind : (CAT_TO_KIND[p.cat] || 'calm'),
  teen: (p.tags || []).includes('中高生'),
  shortAddr: String(p.addr || '').replace(/^東京都世田谷区/, ''),
}));
const byId = id => PLACES_V.find(p => p.id === Number(id));
const countKind = k => PLACES_V.filter(p => p.kind === k).length;

// ---------- 小さな道具 ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 固定の文言だけに使う：{漢字|かな} → <ruby>
const R = s => esc(s).replace(/\{([^|}]+)\|([^}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>');
const safeUrl = u => /^https:\/\//.test(String(u || '')) ? String(u) : '';
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できない環境では無視 */ } },
};
function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = text; t.setAttribute('role', 'status');
  document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
}
function distance(a, b) {
  const r = Math.PI / 180, R0 = 6371000;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R0 * Math.asin(Math.sqrt(h));
}
const fmtDist = m => m < 950 ? `約${Math.max(100, Math.round(m / 100) * 100)}m` : `約${(m / 1000).toFixed(1)}km`;

// ---------- 状態 ----------
const state = {
  loc: null,
  saved: new Set(store.get('ibasho.saved', [])),
  filter: { kind: '', area: '', teen: false, saved: false, q: '', sort: 'name', ids: null },
  furigana: store.get('ibasho.furigana', false),
};
function toggleSave(id) {
  if (state.saved.has(id)) { state.saved.delete(id); toast('ほぞんをやめたよ'); }
  else { state.saved.add(id); toast('ほぞんしたよ'); }
  store.set('ibasho.saved', [...state.saved]);
}
function locate() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { toast('この端末では位置が使えません'); return resolve(null); }
    navigator.geolocation.getCurrentPosition(
      pos => { state.loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }; resolve(state.loc); },
      () => { toast('位置が使えませんでした'); resolve(null); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  });
}
const distOf = p => (state.loc && p.lat) ? distance(state.loc, p) : null;

// ---------- 枠の外（Decidim）へのリンク ----------
function outerLink(url, label, cls) {
  const u = safeUrl(url);
  return u ? `<a class="${cls}" href="${esc(u)}" target="_top">${label}</a>`
           : `<a class="${cls}" aria-disabled="true" title="URLが未設定です">${label}</a>`;
}

// ---------- 共通部品 ----------
const SAVE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>';
function cardHtml(p, opts = {}) {
  const d = distOf(p);
  const meta = [p.cat, p.teen ? '中高生も' : ''].filter(Boolean).join('・');
  return `<div class="card${opts.active ? ' active' : ''}" data-id="${p.id}">
    <a class="body" href="#/place/${p.id}">
      <span class="row"><span class="chip ${p.kind}">${esc(KINDS[p.kind].label)}</span>${esc(meta)}</span>
      <span class="name">${esc(p.name)}</span>
      <span class="addr">${esc(p.shortAddr)}${d != null ? '・' + fmtDist(d) : ''}</span>
    </a>
    <button type="button" class="save-btn" data-save="${p.id}" aria-label="ほぞんする" aria-pressed="${state.saved.has(p.id)}">${SAVE_ICON}</button>
  </div>`;
}
function bindSaveButtons(root) {
  root.querySelectorAll('[data-save]').forEach(b => b.onclick = () => {
    const id = Number(b.dataset.save); toggleSave(id);
    b.setAttribute('aria-pressed', state.saved.has(id));
  });
}

// ---------- ルーティング ----------
function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, query] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  return { page: parts[0] || 'top', arg: parts[1], q: new URLSearchParams(query || '') };
}
let currentMap = null;
function route() {
  if (currentMap) { currentMap.remove(); currentMap = null; }
  const { page, arg, q } = parseHash();
  view.className = '';
  if (q.get('kind') !== null) { Object.assign(state.filter, { kind: q.get('kind'), ids: null }); }
  if (q.get('sort') === 'near') state.filter.sort = 'near';
  const desk = DESKTOP.matches;
  if (page === 'chat') renderChat();
  else if (page === 'list' || page === 'map') (desk ? renderSplit() : page === 'list' ? renderList() : renderMap());
  else if (page === 'place') renderDetail(arg);
  else if (page === 'idea') renderIdea();
  else if (page === 'help') renderHelp();
  else renderTop();
  const tab = page === 'place' ? 'list' : page;
  document.querySelectorAll('.tabbar [data-tab]').forEach(a => a.toggleAttribute('aria-current', a.dataset.tab === tab));
  document.querySelectorAll('.tabbar [aria-current]').forEach(a => a.setAttribute('aria-current', 'page'));
  document.querySelectorAll('.desk-nav [data-nav]').forEach(a => {
    const on = a.dataset.nav === (page === 'map' ? 'list' : page);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (page !== 'chat') view.scrollTop = 0;
}
window.addEventListener('hashchange', route);
DESKTOP.addEventListener('change', route);

// ---------- ① トップ ----------
function renderTop() {
  view.innerHTML = `<div class="wrap">
    <section class="hero">
      <h1>${R('{世田谷|せたがや}で、きみの{居場所|いばしょ}をさがそう')}</h1>
      <p>${R('{児童館|じどうかん}、{図書館|としょかん}、プレーパークなど。{行|い}ってみたい{場所|ばしょ}が{見|み}つかるよ。')}</p>
    </section>
    <div class="entry">
      <a class="main" href="#/chat"><span><b>${R('チャットでさがす')}</b><small>${R('3つの{質問|しつもん}にこたえるだけ')}</small></span>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" aria-hidden="true"><path d="M21 12a8 8 0 01-11.6 7.1L4 21l1.9-5.4A8 8 0 1121 12z"/></svg></a>
      <div class="two">
        <a class="sub" href="#/list?kind="><b>${R('{一覧|いちらん}で{見|み}る')}</b><small>しぼりこみ・検索</small></a>
        <a class="sub" href="#/map?kind="><b>${R('{地図|ちず}で{見|み}る')}</b><small>近くをさがす</small></a>
      </div>
    </div>
    <section class="section">
      <h2>${R('したいことからさがす')}</h2>
      <div class="kinds">${Object.entries(KINDS).map(([k, v]) => {
        const n = countKind(k);
        return `<a class="kind-tile ${k}${n ? '' : ' empty'}" href="#/list?kind=${k}"><span class="k-label">${R(v.ruby)}</span><span>${n ? n : 'これから'}</span></a>`;
      }).join('')}</div>
    </section>
    <section class="section">
      <h2>${R('{近|ちか}くの{居場所|いばしょ}')}</h2>
      <button type="button" class="near-btn" id="near">今いる場所から見る</button>
      <p class="small muted" style="margin:6px 0 0">位置は、この端末の中だけで使います。送られません。</p>
    </section>
    <section class="section">
      <a class="banner idea" href="#/idea"><b>${R('{居場所|いばしょ}のアイデア{箱|ばこ}')}</b><span>${R('「こんな{場所|ばしょ}があったらいいな」を{区|く}に{送|おく}ろう')}</span></a>
      <a class="banner help" href="#/help"><b>${R('つらいとき・{相談|そうだん}したいとき')}</b><span>${R('{話|はなし}を{聞|き}いてくれる{窓口|まどぐち}があるよ')}</span></a>
    </section>
    <footer class="app-footer">
      ${outerLink(LINK.apply, '居場所を運営している方へ（掲載のお申し込み）', '')}
      ${outerLink(LINK.site, '子ども・若者のページへ', '')}
      <span>情報：世田谷区（試作のため、現行の52件を表示しています）。最新の状況は各施設にお問い合わせください。</span>
    </footer>
  </div>`;
  view.querySelector('#near').onclick = async () => {
    const loc = await locate();
    if (loc) { state.filter.sort = 'near'; state.filter.kind = ''; location.hash = '#/list?sort=near'; }
  };
}

// ---------- ② チャット ----------
const chat = { log: [], choices: null, ans: {}, started: false };
const say = (text, who = 'bot') => chat.log.push({ type: 'msg', who, text });
function ask(items) { chat.choices = items; drawChat(); }
const AGES = [
  { label: '小学生', teen: false }, { label: '中学生', teen: true }, { label: '高校生', teen: true },
  { label: 'それより上', teen: true }, { label: '大人（保護者・支援者）', teen: false },
];
function renderChat() {
  if (!chat.started) {
    chat.started = true;
    say('こんにちは！世田谷の{居場所|いばしょ}さがしを{手伝|てつだ}うよ。\nきみは？');
    return ask(AGES.map(a => ({ label: a.label, onClick: () => { chat.ans.age = a; askKind(); } })));
  }
  drawChat();
}
function drawChat() {
  if (parseHash().page !== 'chat') return;
  view.innerHTML = `<div class="wrap">
    <div class="chat-tools"><button type="button" class="text-btn" id="restart">やり直す</button></div>
    <div class="chat">${chat.log.map(item => item.type === 'msg'
      ? `<div class="msg ${item.who}">${item.who === 'bot' ? R(item.text) : esc(item.text)}</div>`
      : `<div style="display:flex;flex-direction:column;gap:8px">${item.ids.map(id => cardHtml(byId(id))).join('')}</div>`).join('')}</div>
    <div class="choices"></div></div>`;
  const box = view.querySelector('.choices');
  (chat.choices || []).forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice-btn' + (c.secondary ? ' secondary' : '') + (c.zero ? ' zero' : '');
    b.textContent = c.label;
    b.onclick = () => { if (!c.silent) say(c.label, 'user'); chat.choices = null; c.onClick(); };
    box.appendChild(b);
  });
  view.querySelector('#restart').onclick = () => { Object.assign(chat, { log: [], choices: null, ans: {}, started: false }); renderChat(); };
  bindSaveButtons(view);
  view.scrollTop = view.scrollHeight;
}
function askKind(again) {
  if (!again) say('なにをしたい？');
  ask([...Object.entries(KINDS).map(([k, v]) => {
    const n = countKind(k);
    return { label: n ? v.label : `${v.label}（これから）`, zero: !n, onClick: () => {
      if (!n) { say('ごめんね、まだ{載|の}っていないんだ。ほかを{選|えら}んでみて。'); return askKind(true); }
      chat.ans.kind = k; askWhere();
    } };
  }), { label: 'なんでもいい', secondary: true, onClick: () => { chat.ans.kind = ''; askWhere(); } }]);
}
function askWhere() {
  say('どのあたり？');
  ask([
    { label: '今いる場所の近く', onClick: async () => {
      const loc = await locate();
      if (!loc) say('{位置|いち}が{使|つか}えなかったので、{区|く}{全体|ぜんたい}からさがすね。');
      chat.ans.area = ''; chat.ans.near = !!loc; showResult();
    } },
    ...AREAS.map(a => ({ label: a, onClick: () => { chat.ans.area = a; chat.ans.near = false; showResult(); } })),
    { label: 'どこでもいい', secondary: true, onClick: () => { chat.ans.area = ''; chat.ans.near = false; showResult(); } },
  ]);
}
function showResult() {
  const { kind, area, age, near } = chat.ans;
  let list = PLACES_V.filter(p => (!kind || p.kind === kind) && (!area || p.area === area));
  const score = p => (age && age.teen && p.teen ? 3 : 0) + (p.cat === '青少年交流センター' && age && age.teen ? 2 : 0);
  if (near && state.loc) list.sort((a, b) => distOf(a) - distOf(b));
  else list.sort((a, b) => score(b) - score(a));
  const top = list.slice(0, 5);
  if (!top.length) {
    say('ぴったりの{場所|ばしょ}が{見|み}つからなかった…{地域|ちいき}を{変|か}えてみる？');
    return ask([{ label: '地域を変える', onClick: askWhere }]);
  }
  say(`${list.length}か{所|しょ}{見|み}つかったよ。${list.length > 5 ? '{近|ちか}い{順|じゅん}・おすすめ{順|じゅん}に5つ{出|だ}すね。' : ''}`);
  chat.log.push({ type: 'cards', ids: top.map(p => p.id) });
  const ids = list.map(p => p.id);
  ask([
    { label: '地図で見る', silent: true, onClick: () => { Object.assign(state.filter, { ids, kind: '', area: '' }); location.hash = '#/map'; } },
    { label: `${list.length}件すべて一覧で見る`, silent: true, onClick: () => { Object.assign(state.filter, { ids, kind: '', area: '' }); location.hash = '#/list'; } },
    { label: 'ちがう条件でさがす', secondary: true, onClick: () => { chat.ans = {}; askKind(); } },
  ]);
}

// ---------- ③ 一覧 / ④ 地図 ----------
function filtered() {
  const f = state.filter;
  let list = PLACES_V.filter(p =>
    (!f.ids || f.ids.includes(p.id)) && (!f.kind || p.kind === f.kind) && (!f.area || p.area === f.area) &&
    (!f.teen || p.teen) && (!f.saved || state.saved.has(p.id)) &&
    (!f.q || (p.name + p.addr + p.cat).includes(f.q)));
  if (f.sort === 'near' && state.loc) list.sort((a, b) => distOf(a) - distOf(b));
  else list.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  return list;
}
function filtersHtml(withSearch) {
  const f = state.filter;
  return `<div class="filters">
    ${withSearch ? `<label class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f6463" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
      <input type="search" id="q" aria-label="名前・場所でさがす" placeholder="名前・場所でさがす" value="${esc(f.q)}"></label>` : ''}
    <div class="chips">
      ${f.ids ? `<button type="button" class="f-chip" aria-pressed="true" data-clear-ids>さがした結果 ×</button>` : ''}
      ${Object.entries(KINDS).map(([k, v]) => `<button type="button" class="f-chip k-${k}" data-kind="${k}" aria-pressed="${f.kind === k}">${esc(v.label)}${countKind(k) ? '' : '（これから）'}</button>`).join('')}
      <button type="button" class="f-chip" data-teen aria-pressed="${f.teen}">中高生向け</button>
      <button type="button" class="f-chip" data-saved aria-pressed="${f.saved}">ほぞんした場所</button>
    </div>
    <div class="selects">
      <select id="area" aria-label="地域"><option value="">地域：すべて</option>${AREAS.map(a => `<option ${f.area === a ? 'selected' : ''}>${a}</option>`).join('')}</select>
      <span><b id="count"></b>件</span>
      <select id="sort" aria-label="ならび順"><option value="name" ${f.sort === 'name' ? 'selected' : ''}>名前順</option><option value="near" ${f.sort === 'near' ? 'selected' : ''}>近い順</option></select>
    </div>
  </div>`;
}
function bindFilters(root, rerender) {
  const f = state.filter;
  root.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { f.kind = f.kind === b.dataset.kind ? '' : b.dataset.kind; rerender(); });
  const t = root.querySelector('[data-teen]'); if (t) t.onclick = () => { f.teen = !f.teen; rerender(); };
  const s = root.querySelector('[data-saved]'); if (s) s.onclick = () => { f.saved = !f.saved; rerender(); };
  const c = root.querySelector('[data-clear-ids]'); if (c) c.onclick = () => { f.ids = null; rerender(); };
  root.querySelector('#area').onchange = e => { f.area = e.target.value; rerender(); };
  root.querySelector('#sort').onchange = async e => {
    if (e.target.value === 'near' && !state.loc && !(await locate())) { e.target.value = 'name'; return; }
    f.sort = e.target.value; rerender();
  };
  const q = root.querySelector('#q');
  if (q) q.oninput = () => { f.q = q.value.trim(); drawListItems(root); };
}
function drawListItems(root, activeId) {
  const list = filtered();
  root.querySelector('#count').textContent = list.length;
  const box = root.querySelector('.list');
  box.innerHTML = list.length ? list.map(p => cardHtml(p, { active: p.id === activeId })).join('')
    : `<p class="empty-note">${state.filter.kind && !countKind(state.filter.kind) ? 'この分類の居場所は、これから載せる予定です。' : '条件に合う居場所がありません。条件をゆるめてみてね。'}</p>`;
  bindSaveButtons(box);
  return list;
}
function renderList() {
  view.className = 'fixed';
  view.innerHTML = `${filtersHtml(true)}<div class="list" style="flex:1;min-height:0;overflow-y:auto"></div>`;
  bindFilters(view, renderList);
  drawListItems(view);
}
function pinIcon(kind, on) {
  const s = on ? 32 : 22;
  return L.divIcon({ className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2],
    html: `<div class="pin${on ? ' on' : ''}" style="width:${s}px;height:${s}px;background:${KINDS[kind].color}"></div>` });
}
function gsiLayer() {
  return L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>', maxZoom: 18 });
}
function buildMap(wrap, list, onPick) {
  const el = wrap.querySelector('.map-canvas');
  const map = L.map(el, { zoomControl: true });
  gsiLayer().addTo(map);
  const markers = new Map();
  list.filter(p => p.lat && p.lng).forEach(p => {
    const m = L.marker([p.lat, p.lng], { icon: pinIcon(p.kind), title: p.name, alt: p.name }).addTo(map);
    m.on('click', () => onPick(p.id));
    markers.set(p.id, m);
  });
  if (state.loc) L.marker([state.loc.lat, state.loc.lng], { icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [16, 16] }), interactive: false }).addTo(map);
  const bounds = markers.size ? L.featureGroup([...markers.values()]).getBounds().pad(0.15) : null;
  const fit = () => bounds ? map.fitBounds(bounds) : map.setView([35.6466, 139.6532], 13);
  fit();
  setTimeout(() => { map.invalidateSize(); fit(); }, 60);
  const api = {
    map, markers,
    select(id) {
      markers.forEach((m, mid) => m.setIcon(pinIcon(byId(mid).kind, mid === id)));
      const m = markers.get(id); if (m) map.panTo(m.getLatLng());
    },
  };
  wrap.querySelector('[data-me]').onclick = async () => {
    const loc = await locate();
    if (loc) { map.setView([loc.lat, loc.lng], 15); L.marker([loc.lat, loc.lng], { icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [16, 16] }), interactive: false }).addTo(map); }
  };
  return api;
}
function mapWrapHtml(withListBtn) {
  return `<div class="map-wrap"><div class="map-canvas" role="region" aria-label="地図"></div>
    <div class="map-tools">
      <button type="button" data-me aria-label="今いる場所へ"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></button>
      ${withListBtn ? '<a href="#/list">一覧</a>' : ''}
    </div>
    <div class="map-card" hidden></div></div>`;
}
function renderMap() {
  view.className = 'fixed';
  view.innerHTML = filtersHtml(false) + mapWrapHtml(true);
  bindFilters(view, renderMap);
  view.querySelector('.filters .selects').style.display = 'none';
  const list = filtered();
  const card = view.querySelector('.map-card');
  const api = buildMap(view.querySelector('.map-wrap'), list, id => {
    api.select(id);
    card.hidden = false;
    card.innerHTML = cardHtml(byId(id)) + `<a class="go" href="#/place/${id}">くわしく見る</a>`;
    bindSaveButtons(card);
  });
  currentMap = api.map;
}
function renderSplit() {
  view.className = 'fixed';
  view.innerHTML = `<div class="split"><div class="side">${filtersHtml(true)}<div class="list"></div></div>${mapWrapHtml(false)}</div>`;
  bindFilters(view, renderSplit);
  const list = drawListItems(view);
  const api = buildMap(view.querySelector('.map-wrap'), list, id => {
    api.select(id);
    drawListItems(view, id);
    const el = view.querySelector(`.card[data-id="${id}"]`); if (el) el.scrollIntoView({ block: 'nearest' });
  });
  currentMap = api.map;
}

// ---------- ⑤ 詳細 ----------
function renderDetail(id) {
  const p = byId(id);
  if (!p) { view.innerHTML = '<div class="wrap detail"><p>見つかりませんでした。</p><a class="back" href="#/list">一覧へ</a></div>'; return; }
  const d = distOf(p);
  const url = safeUrl(p.url);
  view.innerHTML = `<div class="wrap detail">
    <a class="back" href="#/list" id="back">← もどる</a>
    <div><span class="chip ${p.kind}">${esc(KINDS[p.kind].label)}</span> <span class="small muted">${esc(p.cat)}</span></div>
    <h1>${esc(p.name)}</h1>
    <p class="lead">${esc(p.desc)}</p>
    <dl>
      <dt>いつ</dt><dd>${url ? '開いている日・時間は施設のページで確認してね' : '開いている日・時間は施設にお問い合わせください'}</dd>
      <dt>どこ</dt><dd>${esc(p.shortAddr)}（${esc(p.area)}）${d != null ? `<br><span class="small muted">今いる場所から${fmtDist(d)}</span>` : ''}</dd>
      <dt>だれが</dt><dd>${p.teen ? '子ども・中高生' : '子ども'}</dd>
      <dt>いくら</dt><dd>${(p.tags || []).includes('無料') ? '無料' : '施設にお問い合わせください'}</dd>
      ${url ? `<dt>案内</dt><dd><a href="${esc(url)}" target="_blank" rel="noopener">施設のページ ↗</a></dd>` : ''}
    </dl>
    <div class="mini" id="mini" role="img" aria-label="${esc(p.name)}の場所"></div>
    <div class="btn-row">
      <a class="btn outline" href="https://www.google.com/maps/dir/?api=1&amp;destination=${p.lat},${p.lng}" target="_blank" rel="noopener">行き方を調べる ↗</a>
      <button type="button" class="btn outline" id="save" aria-pressed="${state.saved.has(p.id)}">${state.saved.has(p.id) ? 'ほぞんずみ' : 'ほぞんする'}</button>
    </div>
    <button type="button" class="btn soft" id="share">この居場所をシェアする</button>
    <div class="divider">
      <h2>にた居場所</h2>
      <div style="display:flex;flex-direction:column;gap:8px">${PLACES_V.filter(x => x.kind === p.kind && x.area === p.area && x.id !== p.id).slice(0, 2).map(x => cardHtml(x)).join('') || '<span class="small muted">同じ地域にはまだありません</span>'}</div>
      <a href="#/chat" style="font-size:13.5px;font-weight:700">チャットでほかの場所をさがす</a>
    </div>
    <div class="divider">
      <span class="small muted">情報元：世田谷区。最新の状況は施設にお問い合わせください。</span>
      <div class="btn-row">${outerLink(LINK.feedback, '感想を送る', 'btn soft')}${outerLink(LINK.feedback, 'まちがいを教える', 'btn soft')}</div>
      <span class="small muted" style="text-align:center">送った内容は公開されません。区が確認します。</span>
    </div>
  </div>`;
  bindSaveButtons(view);
  view.querySelector('#back').onclick = e => { if (history.length > 1) { e.preventDefault(); history.back(); } };
  view.querySelector('#save').onclick = e => {
    toggleSave(p.id); e.target.setAttribute('aria-pressed', state.saved.has(p.id));
    e.target.textContent = state.saved.has(p.id) ? 'ほぞんずみ' : 'ほぞんする';
  };
  view.querySelector('#share').onclick = async () => {
    const base = safeUrl(CFG.appUrl) || (location.origin + location.pathname);
    const shareUrl = `${base}#/place/${p.id}`;
    try {
      if (navigator.share) await navigator.share({ title: p.name, text: `${p.name}（世田谷の居場所）`, url: shareUrl });
      else { await navigator.clipboard.writeText(shareUrl); toast('URLをコピーしたよ'); }
    } catch (e) { toast(shareUrl); }
  };
  if (p.lat && p.lng) {
    const m = L.map('mini', { zoomControl: false, dragging: false, scrollWheelZoom: false, touchZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false })
      .setView([p.lat, p.lng], 15);
    gsiLayer().addTo(m);
    L.marker([p.lat, p.lng], { icon: pinIcon(p.kind, true), interactive: false }).addTo(m);
    currentMap = m;
  }
}

// ---------- ⑥ アイデア箱 ----------
function renderIdea() {
  view.innerHTML = `<div class="wrap idea-box">
    <h1>${R('{居場所|いばしょ}のアイデア{箱|ばこ}')}</h1>
    <p>${R('「こんな{場所|ばしょ}があったらいいな」「ここがこうなったらいいな」を{区|く}に{送|おく}ってね。{名前|なまえ}や{住所|じゅうしょ}は{書|か}かないでね。')}</p>
    ${outerLink(LINK.idea, 'アイデアを送る', 'btn primary')}
    <p class="small muted">送ったアイデアは区が読んで、居場所づくりに使います。一つひとつに返事はしません。なやみの相談は<a href="#/help">相談の窓口</a>へ。</p>
    <div class="divider">
      <h2>みんなのアイデア</h2>
      <p class="small muted">区が紹介するアイデアを、これからここに載せる予定です。</p>
    </div>
  </div>`;
}

// ---------- ⑦ 相談 ----------
function renderHelp() {
  const lines = Array.isArray(CFG.helpLines) && CFG.helpLines.length ? CFG.helpLines : [
    { label: '電話で話す', name: '[窓口の名前]', hours: '[受付の時間]', tel: '' },
    { label: 'チャット・LINEで話す', name: '[窓口の名前]', hours: '[受付の時間]', url: '' },
    { label: '世田谷区の窓口', name: '[区の相談窓口の名前]', hours: '[場所・受付の時間]' },
  ];
  view.innerHTML = `<div class="help"><div class="wrap" style="display:flex;flex-direction:column;gap:14px;width:100%">
    <h1>${R('つらいとき・{相談|そうだん}したいとき')}</h1>
    <p>${R('{居場所|いばしょ}がなくてつらい、だれかに{話|はなし}を{聞|き}いてほしい。そんなときは、ここに{連絡|れんらく}してみてね。')}</p>
    ${lines.map(l => `<div class="help-card"><span class="label">${esc(l.label)}</span><span class="name">${esc(l.name)}</span><span class="small muted">${esc(l.hours)}</span>
      ${l.tel ? `<a class="btn primary" href="tel:${esc(l.tel)}">${esc(l.tel)} に電話する</a>` : ''}
      ${safeUrl(l.url) ? `<a class="btn outline" href="${esc(l.url)}" target="_blank" rel="noopener">窓口のページを開く ↗</a>` : ''}</div>`).join('')}
    <p class="small muted">すぐに危ないときは 110番 か 119番 へ。</p>
  </div></div>`;
}

// ---------- ふりがな ----------
const fBtn = document.getElementById('furigana');
function applyFurigana() {
  document.body.classList.toggle('furigana-on', state.furigana);
  fBtn.setAttribute('aria-pressed', state.furigana);
  fBtn.textContent = state.furigana ? 'ふりがな あり' : 'ふりがな';
}
fBtn.onclick = () => { state.furigana = !state.furigana; store.set('ibasho.furigana', state.furigana); applyFurigana(); };

// ---------- 埋め込み元（Decidim）からリンク先を決める ----------
// リポジトリにDecidimのドメインを書かないため、親ページ（referrer）のオリジンを使う。
// 許可するオリジンは config.js に SHA-256 で持つ。取り組みのパスやアンケートの番号は iframe の src のクエリで渡す
//   例：.../trial/?space=processes/（スラッグ）&idea=（コンポーネント）/（アンケート）&feedback=…&apply=…
async function sha256hex(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function resolveParent() {
  let ref;
  try { ref = new URL(document.referrer); } catch (e) { return null; }
  if (ref.protocol !== 'https:' || !window.crypto || !crypto.subtle) return null;
  if (!(CFG.parentOriginHashes || []).includes(await sha256hex(ref.origin))) return null;
  const q = new URLSearchParams(location.search);
  const lang = /^[a-z]{2}$/.test(q.get('lang') || '') ? q.get('lang') : 'ja';
  const space = q.get('space') || '';
  if (/^(processes|assemblies)\/[a-z0-9-]+$/.test(space)) {
    const base = `${ref.origin}/${lang}/${space}`;
    LINK.site = base;
    ['idea', 'feedback', 'apply'].forEach(k => {
      const v = q.get(k) || '';
      if (/^\d+\/\d+$/.test(v)) { const [c, sv] = v.split('/'); LINK[k] = `${base}/f/${c}/surveys/${sv}`; }
    });
  }
  return ref;
}

(async function init() {
  const ref = await resolveParent();
  // アイデア箱：Decidimのアンケートがあれば、メニューから直接そこへ（枠の外）
  if (LINK.idea) document.querySelectorAll('[data-tab="idea"], [data-nav="idea"]').forEach(a => { a.href = LINK.idea; a.target = '_top'; });
  // Decidim側のページのメニューから来たとき：親ページのURLの ?tab= で最初の画面を決める
  const tab = ref ? ref.searchParams.get('tab') : '';
  if (!location.hash && ['chat', 'list', 'map', 'help'].includes(tab)) history.replaceState(null, '', `#/${tab}`);
  applyFurigana();
  route();
})();
})();
