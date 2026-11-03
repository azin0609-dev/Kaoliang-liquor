// 自動檢查：CSV 解析、價格整理、試算表連結轉換
import { parseCSV } from '../js/csv.js';
import { rowsToItems, parsePrice, formatAbv, formatVolume, formatPrice, matchesQuery, categoriesOf, sheetCsvUrl } from '../js/prices.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (err) { results.push({ name, ok: false, err }); }
}
function eq(actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`得到 ${a}，應該是 ${e}`);
}

// ---------- CSV ----------
test('CSV：基本拆欄', () => eq(parseCSV('a,b\n1,2'), [['a', 'b'], ['1', '2']]));
test('CSV：去掉 BOM、Windows 換行', () => eq(parseCSV('﻿a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]));
test('CSV：引號裡的逗號與換行', () => eq(parseCSV('"a,1","b\nc"'), [['a,1', 'b\nc']]));
test('CSV：兩個雙引號代表一個', () => eq(parseCSV('"他說""好"""'), [['他說"好"']]));
test('CSV：略過空白列', () => eq(parseCSV('a\n\n,\nb'), [['a'], ['b']]));
test('CSV：最後一格空白', () => eq(parseCSV('a,'), [['a', '']]));

// ---------- 欄位格式 ----------
test('價格：各種寫法', () => eq(['550', 'NT$1,200', '$ 980 元', '洽詢', '', '0'].map(parsePrice), [550, 1200, 980, null, null, null]));
test('度數：補上「度」', () => eq(['58', '58%', '58.0', '38度', '', '約58'].map(formatAbv), ['58度', '58度', '58度', '38度', '', '約58']));
test('容量：純數字補 ml', () => eq(['600', '600ml', '0.75L', ''].map(formatVolume), ['600ml', '600ml', '0.75L', '']));
test('價格加千分位', () => eq([550, 6400, 12800].map(formatPrice), ['550', '6,400', '12,800']));

// ---------- 整理品項 ----------
const sample = parseCSV([
  '分類,品名,度數,容量,單瓶價,整箱價,每箱瓶數,狀態,備註,前次價格',
  '經典系列,金門高粱酒,58,600ml,550,"6,400",12,,最熱銷,530',
  ',金門高粱酒,38,600,420,,,少量,,450',
  '紀念酒,國慶紀念酒,58,750ml,洽詢,,,預購,,',
  '紀念酒,舊款,58,600ml,500,,,下架,,',
  ',,,,,,,,,',
].join('\n'));
const items = rowsToItems(sample);

test('品項：略過下架與空白列', () => eq(items.map(i => i.name), ['金門高粱酒', '金門高粱酒', '國慶紀念酒']));
test('品項：分類空白時沿用上一列', () => eq(items.map(i => i.category), ['經典系列', '經典系列', '紀念酒']));
test('品項：狀態空白當作現貨', () => eq([items[0].status, items[0].statusKind], ['現貨', 'in']));
test('品項：狀態樣式', () => eq(items.map(i => i.statusKind), ['in', 'low', 'pre']));
test('品項：價格與整箱', () => eq([items[0].price, items[0].casePrice, items[0].perCase], [550, 6400, 12]));
test('品項：漲跌', () => eq(items.map(i => i.change), [20, -30, 0]));
test('品項：不填價格顯示詢價', () => eq(items[2].price, null));
test('品項：格式化度數容量', () => eq([items[1].abv, items[1].volume], ['38度', '600ml']));
test('標籤欄', () => eq(rowsToItems(parseCSV('品名,標籤\nA,熱賣\nB,')).map(i => i.tag), ['熱賣', '']));
test('分類順序', () => eq(categoriesOf(items), ['經典系列', '紀念酒']));

test('欄位順序可以不同、可以用別名', () => {
  const r = rowsToItems(parseCSV('價格,商品名稱\n100,x\n品名,售價\n'));
  eq(r, []);
  const r2 = rowsToItems(parseCSV('售價,品名,類別\n100,金門高粱,經典'));
  eq([r2[0].name, r2[0].price, r2[0].category], ['金門高粱', 100, '經典']);
});
test('欄位名稱有括號或空白也認得', () => {
  const r = rowsToItems(parseCSV('品名 ,單瓶價（元）\nA,300'));
  eq(r[0].price, 300);
});
test('前面有說明列也能找到標題列', () => {
  const r = rowsToItems(parseCSV('怡軒特產行價格表\n品名,單瓶價\nA,300'));
  eq(r.map(i => i.name), ['A']);
});
test('沒有品名欄回傳空清單', () => eq(rowsToItems(parseCSV('<html><body>請登入</body></html>')), []));

// ---------- 搜尋 ----------
test('搜尋：度數、容量、多個詞', () => {
  eq(items.filter(i => matchesQuery(i, '58度')).length, 2);
  eq(items.filter(i => matchesQuery(i, '高粱 600')).length, 2);
  eq(items.filter(i => matchesQuery(i, '  ')).length, 3);
  eq(items.filter(i => matchesQuery(i, '紀念 預購')).length, 1);
});

// ---------- Google 試算表連結 ----------
const ID = '1AbC-def_123';
test('試算表：空白不使用', () => eq(sheetCsvUrl(''), null));
test('試算表：共用連結', () => eq(
  sheetCsvUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`),
  `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv&headers=1`));
test('試算表：共用連結指定分頁', () => eq(
  sheetCsvUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=123456`),
  `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv&headers=1&gid=123456`));
test('試算表：發布到網路（網頁版連結）', () => eq(
  sheetCsvUrl('https://docs.google.com/spreadsheets/d/e/2PACX-abc/pubhtml'),
  'https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?output=csv'));
test('試算表：發布到網路（已是 CSV）', () => eq(
  sheetCsvUrl('https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?gid=0&single=true&output=csv'),
  'https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?gid=0&single=true&output=csv'));
test('試算表：看不懂的文字不使用', () => eq(sheetCsvUrl('我的價格表'), null));

// ---------- 範例價格表 ----------
const csvCheck = fetch('../data/prices.csv', { cache: 'no-store' })
  .then(r => r.text())
  .then(text => {
    const list = rowsToItems(parseCSV(text));
    if (!list.length) throw new Error('沒有任何品項');
    const noPrice = list.filter(i => i.price === null && i.statusKind !== 'pre');
    results.push({ name: `data/prices.csv：${list.length} 個品項、${categoriesOf(list).length} 個分類`, ok: true });
    if (noPrice.length) results.push({ name: `提醒：${noPrice.map(i => i.name).join('、')} 沒填價格（會顯示「請私訊詢價」）`, ok: true });
  })
  .catch(err => results.push({ name: 'data/prices.csv 讀取', ok: false, err }));

csvCheck.finally(() => {
  const failed = results.filter(r => !r.ok);
  document.getElementById('results').innerHTML = results.map(r =>
    `<li class="${r.ok ? 'pass' : 'fail'}">${r.ok ? '✔' : '✘'} ${r.name}${r.ok ? '' : `：${r.err.message}`}</li>`).join('');
  const summary = document.getElementById('summary');
  summary.textContent = failed.length ? `有 ${failed.length} 項沒通過（共 ${results.length} 項）` : `全部通過（${results.length} 項）`;
  summary.className = failed.length ? 'fail' : 'pass';
  document.title = (failed.length ? 'FAIL ' : 'PASS ') + document.title;
});
