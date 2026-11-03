// 價格表的整理規則（不碰畫面，方便測試）

// 試算表第一列的欄位名稱 → 程式裡的名稱；同一欄可以有好幾種寫法
const HEADER_ALIASES = {
  category: ['分類', '類別', '系列'],
  name: ['品名', '名稱', '商品', '品項', '酒名'],
  abv: ['度數', '酒精度'],
  volume: ['容量', '規格'],
  price: ['單瓶價', '單價', '價格', '售價', '報價'],
  casePrice: ['整箱價', '箱價'],
  perCase: ['每箱瓶數', '每箱', '箱入數'],
  status: ['狀態', '庫存'],
  note: ['備註', '說明'],
  prevPrice: ['前次價格', '上次價格', '前次單瓶價', '原價'],
  tag: ['標籤', '標記'],
};

// 狀態 → 顯示樣式；「下架」「隱藏」的品項不顯示
const STATUS_KIND = {
  現貨: 'in', 有貨: 'in',
  少量: 'low', 剩少量: 'low', 數量有限: 'low',
  缺貨: 'out', 售完: 'out', 完售: 'out', 停售: 'out', 補貨中: 'out',
  預購: 'pre', 預訂: 'pre', 接受預訂: 'pre',
};
const HIDDEN_STATUS = new Set(['下架', '隱藏', '不顯示']);

function normHeader(h) {
  return String(h ?? '')
    .replace(/[（(].*?[)）]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function findColumns(header) {
  const cols = {};
  header.forEach((h, idx) => {
    const key = normHeader(h);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (cols[field] === undefined && aliases.includes(key)) cols[field] = idx;
    }
  });
  return cols;
}

// "NT$1,200" → 1200；"洽詢"、空白 → null
export function parsePrice(value) {
  const s = String(value ?? '').replace(/[,，\s]/g, '');
  const m = s.match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Math.round(Number(m[0]));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// "58" / "58%" / "58.0" → "58度"；其他文字原樣保留
export function formatAbv(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(?:%|度)?$/);
  if (!m) return s;
  return `${Number(m[1])}度`;
}

// "600" → "600ml"；"600ml"、"0.75L"、"600ml×2" 原樣保留
export function formatVolume(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return /^\d+(?:\.\d+)?$/.test(s) ? `${s}ml` : s;
}

export function formatPrice(n) {
  return Number(n).toLocaleString('en-US');
}

export function statusKind(status) {
  return STATUS_KIND[status] || 'other';
}

// CSV 的列 → 品項清單。找不到「品名」欄就回傳空陣列
export function rowsToItems(rows) {
  const headerIdx = rows.findIndex(r => findColumns(r).name !== undefined);
  if (headerIdx < 0) return [];
  const cols = findColumns(rows[headerIdx]);
  const get = (row, field) => (cols[field] === undefined ? '' : String(row[cols[field]] ?? '').trim());

  const items = [];
  let lastCategory = '';
  for (const row of rows.slice(headerIdx + 1)) {
    const name = get(row, 'name');
    if (!name) continue;
    const status = get(row, 'status') || '現貨';
    if (HIDDEN_STATUS.has(status)) continue;
    // 分類空白時沿用上一列，方便在試算表裡只寫一次
    const category = get(row, 'category') || lastCategory || '其他';
    lastCategory = category;
    const price = parsePrice(get(row, 'price'));
    const prevPrice = parsePrice(get(row, 'prevPrice'));
    items.push({
      id: items.length,
      category,
      name,
      abv: formatAbv(get(row, 'abv')),
      volume: formatVolume(get(row, 'volume')),
      price,
      casePrice: parsePrice(get(row, 'casePrice')),
      perCase: parsePrice(get(row, 'perCase')),
      status,
      statusKind: statusKind(status),
      note: get(row, 'note'),
      tag: get(row, 'tag'),
      prevPrice,
      change: price !== null && prevPrice !== null ? price - prevPrice : 0,
    });
  }
  return items;
}

// 分類（照第一次出現的順序）
export function categoriesOf(items) {
  return [...new Set(items.map(i => i.category))];
}

// 搜尋：空白分開的每個詞都要符合
export function matchesQuery(item, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [item.category, item.name, item.abv, item.volume, item.status, item.note, item.tag]
    .join(' ')
    .toLowerCase();
  return words.every(w => hay.includes(w));
}

// Google 試算表連結 → 可以直接讀取的 CSV 網址；看不懂的連結回傳 null
// 支援：共用連結（…/d/<ID>/edit…）、發布到網路連結（…/d/e/<ID>/pub…）、其他 .csv 網址
export function sheetCsvUrl(link) {
  const url = String(link ?? '').trim();
  if (!url) return null;
  const gid = (url.match(/[#&?]gid=(\d+)/) || [])[1];

  const published = url.match(/docs\.google\.com\/spreadsheets\/d\/e\/([\w-]+)/);
  if (published) {
    if (/[?&]output=csv/.test(url)) return url;
    const base = `https://docs.google.com/spreadsheets/d/e/${published[1]}/pub?`;
    return base + (gid ? `gid=${gid}&single=true&` : '') + 'output=csv';
  }

  const shared = url.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
  if (shared) {
    const base = `https://docs.google.com/spreadsheets/d/${shared[1]}/gviz/tq?tqx=out:csv&headers=1`;
    return base + (gid ? `&gid=${gid}` : '');
  }

  return /^https?:\/\//.test(url) ? url : null;
}
