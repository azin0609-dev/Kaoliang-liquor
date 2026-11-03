// 進入點：讀取價格、畫出清單、搜尋分類、自動更新、分享、年齡確認
import { CONFIG } from './config.js';
import { parseCSV } from './csv.js';
import { rowsToItems, categoriesOf, matchesQuery, sheetCsvUrl, formatPrice } from './prices.js';

const $ = id => document.getElementById(id);
const AGE_KEY = 'yx-age-ok';
const CACHE_KEY = 'yx-prices-cache';
const ALL = '全部';

const state = {
  items: [],
  source: null,      // 'sheet' Google 試算表｜'local' 專案裡的 CSV｜'cache' 上次存的
  loadedAt: null,
  stale: false,      // true：這次沒讀到新的，顯示的是舊資料
  warn: '',
  loading: false,
  category: ALL,
  query: '',
};

// ---------- 小工具 ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* 無痕模式等情況存不了，沒關係 */ } },
};

const pad = n => String(n).padStart(2, '0');
function fmtTime(date) {
  if (!date) return '';
  const now = new Date();
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay ? `今天 ${hm}` : `${date.getMonth() + 1}/${date.getDate()} ${hm}`;
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

// ---------- 讀取價格 ----------
async function fetchItems(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = rowsToItems(parseCSV(await res.text()));
  if (!items.length) throw new Error('找不到品項：第一列要有「品名」欄位');
  return items;
}

function readCache() {
  try {
    const c = JSON.parse(storage.get(CACHE_KEY));
    if (c && Array.isArray(c.items) && c.items.length) return { items: c.items, at: new Date(c.at) };
  } catch { /* 壞掉的快取就不用 */ }
  return null;
}

async function load({ manual = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  setRefreshing(true);

  const sheet = sheetCsvUrl(CONFIG.sheetUrl);
  const localCsv = CONFIG.localCsv || 'data/prices.csv';
  try {
    const items = await fetchItems(sheet || localCsv);
    Object.assign(state, { items, source: sheet ? 'sheet' : 'local', loadedAt: new Date(), stale: false, warn: '' });
    storage.set(CACHE_KEY, JSON.stringify({ items, at: state.loadedAt.toISOString() }));
    if (manual) toast('已更新為最新價格');
  } catch (err) {
    console.warn('讀取價格失敗：', sheet || localCsv, err);
    await fallback(sheet, localCsv);
  } finally {
    state.loading = false;
    setRefreshing(false);
    render();
  }
}

// 讀不到最新價格時：先保留畫面上的、再用上次存的、最後才用專案裡的備份價格表
async function fallback(sheet, localCsv) {
  const behind = '暫時連不到最新報價';
  if (state.items.length) {
    state.stale = true;
    state.warn = `${behind}，目前顯示的是 ${fmtTime(state.loadedAt)} 的價格。`;
    return;
  }
  const cached = readCache();
  if (cached) {
    Object.assign(state, { items: cached.items, source: 'cache', loadedAt: cached.at, stale: true });
    state.warn = `${behind}，目前顯示的是 ${fmtTime(cached.at)} 的價格，請以私訊確認為準。`;
    return;
  }
  if (sheet) {
    try {
      const items = await fetchItems(localCsv);
      Object.assign(state, { items, source: 'local', loadedAt: new Date(), stale: true });
      state.warn = `${behind}，以下為備份價格，請以私訊確認為準。`;
      return;
    } catch (err) {
      console.warn('備份價格表也讀不到：', err);
    }
  }
  state.stale = true;
  state.warn = '價格表讀取失敗，請確認網路後按「重新整理」再試一次。';
}

function setRefreshing(on) {
  $('refresh-btn').classList.toggle('spinning', on);
  $('refresh-btn').disabled = on;
}

// ---------- 畫面 ----------
function renderStatus() {
  const el = $('status');
  if (!state.loadedAt) {
    el.textContent = state.loading ? '讀取價格中…' : '尚未取得價格';
    return;
  }
  const dot = state.stale ? 'stale' : 'live';
  const minutes = Number(CONFIG.refreshMinutes) || 5;
  el.innerHTML = state.stale
    ? `<span class="dot ${dot}"></span><span><b>${esc(fmtTime(state.loadedAt))}</b> 的報價</span>`
    : `<span class="dot ${dot}"></span><span><b>${esc(fmtTime(state.loadedAt))}</b> 已更新<span class="status-sub">每 ${minutes} 分鐘自動更新</span></span>`;
}

function renderChips() {
  const cats = categoriesOf(state.items);
  if (state.category !== ALL && !cats.includes(state.category)) state.category = ALL;
  const count = c => state.items.filter(i => c === ALL || i.category === c).length;
  $('chips').innerHTML = [ALL, ...cats].map(c => `
    <button type="button" class="chip" role="tab" data-cat="${esc(c)}" aria-selected="${c === state.category}">
      ${esc(c)}<span class="count">${count(c)}</span>
    </button>`).join('');
  $('chips').hidden = cats.length < 2;
}

function priceUnit(item) {
  return /盒/.test(item.name + item.category) ? '/盒' : '/瓶';
}

function itemHtml(item) {
  const specs = [item.abv, item.volume].filter(Boolean).map(s => `<span class="spec">${esc(s)}</span>`).join('');
  // 只有整箱價時，整箱價當主要價格
  const caseOnly = item.price === null && item.casePrice !== null;
  const price = item.price !== null || caseOnly
    ? `<div class="price"><span class="cur">$</span>${formatPrice(caseOnly ? item.casePrice : item.price)}<span class="unit">${caseOnly ? '/箱' : priceUnit(item)}</span></div>`
    : '<div class="price ask">請私訊詢價</div>';
  let change = '';
  if (item.change) {
    const up = item.change > 0;
    const amount = formatPrice(Math.abs(item.change));
    change = `<span class="change ${up ? 'up' : 'down'}" title="比上次${up ? '漲' : '降'} ${amount} 元">${up ? '▲' : '▼'} ${amount}</span>`;
  }
  const perCase = item.perCase ? ` ${item.perCase} 瓶` : '';
  const casePrice = item.casePrice !== null && !caseOnly ? `<div class="case">整箱${perCase} <b>$${formatPrice(item.casePrice)}</b></div>` : '';
  return `
    <li class="item${item.statusKind === 'out' ? ' is-out' : ''}">
      <div class="item-main">
        <h3 class="item-name">${esc(item.name)}</h3>
        <div class="specs">${item.tag ? `<span class="tag tag-hot">🔥 ${esc(item.tag)}</span>` : ''}${specs}<span class="tag tag-${item.statusKind}">${esc(item.status)}</span></div>
        ${item.note ? `<p class="item-note">${esc(item.note)}</p>` : ''}
      </div>
      <div class="item-price">${price}${change}${casePrice}</div>
    </li>`;
}

function renderList() {
  const list = $('list');
  list.setAttribute('aria-busy', String(state.loading && !state.items.length));
  if (!state.items.length) {
    list.innerHTML = state.loading
      ? '<div class="items">' + '<div class="skeleton"></div>'.repeat(4) + '</div>'
      : '<div class="empty">目前沒有可以顯示的價格。</div>';
    return;
  }
  const shown = state.items.filter(i =>
    (state.category === ALL || i.category === state.category) && matchesQuery(i, state.query));
  if (!shown.length) {
    list.innerHTML = `
      <div class="empty">
        找不到符合「${esc(state.query)}」的品項
        <div><button type="button" class="btn btn-ghost btn-small" id="clear-search">清除搜尋</button></div>
      </div>`;
    return;
  }
  list.innerHTML = categoriesOf(shown).map(cat => {
    const items = shown.filter(i => i.category === cat);
    return `
      <section class="group">
        <h2 class="group-title">${esc(cat)}<small>${items.length} 項</small></h2>
        <ul class="items">${items.map(itemHtml).join('')}</ul>
      </section>`;
  }).join('');
}

function renderWarn() {
  $('warn').textContent = state.warn;
  $('warn').hidden = !state.warn;
}

function render() {
  renderStatus();
  renderWarn();
  renderChips();
  renderList();
}

// ---------- 聯絡、分享、年齡確認 ----------
const PHONE_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
const CHAT_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 3C6.5 3 2 6.6 2 11c0 3.9 3.5 7.2 8.3 7.9.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5s6-3.5 8.2-6.1C21.5 14.2 22 12.7 22 11c0-4.4-4.5-8-10-8z"/></svg>';

function setupShipping() {
  const list = Array.isArray(CONFIG.shipping) ? CONFIG.shipping : [];
  $('ship-list').innerHTML = list.map(s => `
    <li><span>${esc(s.name)}　<small>${esc(s.time || '')}</small></span><b>每件 $${formatPrice(s.price)}</b></li>`).join('');
  $('ship-note').textContent = CONFIG.shippingNote || '';
  $('ship-note').hidden = !CONFIG.shippingNote;
  $('shipping').hidden = !list.length;
}

function setupContact() {
  const btns = [];
  const phone = String(CONFIG.phone || '').replace(/[^\d+]/g, '');
  if (phone) btns.push(`<a class="btn btn-primary" href="tel:${esc(phone)}">${PHONE_ICON}打電話</a>`);
  const line = String(CONFIG.lineUrl || '').trim();
  if (/^https:\/\//.test(line)) btns.push(`<a class="btn btn-line" href="${esc(line)}" target="_blank" rel="noopener">${CHAT_ICON}LINE 詢問</a>`);

  $('contact-btns').innerHTML = btns.join('');
  $('contact-btns').hidden = !btns.length;
  $('contact-note').textContent = CONFIG.contactNote || '';
  $('contact-note').hidden = !CONFIG.contactNote;
  $('contact').hidden = !btns.length && !CONFIG.contactNote;
  $('contact').style.position = btns.length ? '' : 'static';
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

async function share() {
  const url = location.origin + location.pathname;
  const data = { title: `${CONFIG.shopName}｜${CONFIG.title}`, text: `${CONFIG.shopName}的${CONFIG.title}，隨時都能看最新價格`, url };
  if (navigator.share) {
    try { await navigator.share(data); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  toast(await copyText(url) ? '已複製網址，可以貼給朋友了' : `網址：${url}`);
}

function setupAgeGate() {
  if (storage.get(AGE_KEY) === '1') return;
  const gate = $('age-gate');
  const behind = [document.querySelector('.masthead'), document.querySelector('main'), document.querySelector('.footer')];
  gate.hidden = false;
  document.body.classList.add('locked');
  behind.forEach(el => { el.inert = true; });
  $('age-yes').addEventListener('click', () => {
    storage.set(AGE_KEY, '1');
    gate.hidden = true;
    document.body.classList.remove('locked');
    behind.forEach(el => { el.inert = false; });
  });
  $('age-no').addEventListener('click', () => { $('age-msg').hidden = false; });
  $('age-yes').focus();
}

// ---------- 啟動 ----------
function applyConfig() {
  $('shop-name').textContent = CONFIG.shopName;
  $('page-title').textContent = CONFIG.title;
  document.title = `${CONFIG.shopName}｜${CONFIG.title}`;
  $('notice').textContent = CONFIG.notice || '';
  $('notice').hidden = !CONFIG.notice;
}

function bindEvents() {
  $('refresh-btn').addEventListener('click', () => load({ manual: true }));
  $('share-btn').addEventListener('click', share);
  $('search').addEventListener('input', e => { state.query = e.target.value; renderList(); });
  $('chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.category = chip.dataset.cat;
    renderChips();
    renderList();
  });
  $('list').addEventListener('click', e => {
    if (e.target.id !== 'clear-search') return;
    state.query = '';
    $('search').value = '';
    renderList();
    $('search').focus();
  });

  // 自動更新：頁面開著時定時重抓；切回這個頁面時，超過 1 分鐘沒更新就馬上重抓
  const minutes = Math.max(1, Number(CONFIG.refreshMinutes) || 5);
  setInterval(() => { if (document.visibilityState === 'visible') load(); }, minutes * 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (!state.loadedAt || Date.now() - state.loadedAt > 60_000)) load();
  });
}

applyConfig();
setupShipping();
setupContact();
setupAgeGate();
bindEvents();
render();
load();

// 除錯用：開發者工具輸入 app.state 可以看目前資料
window.app = { state, load, config: CONFIG };
