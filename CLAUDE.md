# 怡軒特產行｜金門高粱酒即時報價

家裡是金門高粱酒小盤商，這個網頁讓朋友隨時看最新價格。使用者不是工程師，主要靠 AI 開發，說明請用白話、繁體中文。

## 技術規格

- 純前端：HTML + CSS + 原生 JavaScript（ES modules），不用框架、不需要後端、不需要編譯
- 價格來源：Google 試算表（`js/config.js` 的 `sheetUrl`）→ 讀不到時用專案裡的 `data/prices.csv`
- 放在 GitHub Pages（公開儲存庫，`main` 分支根目錄），所有路徑都用相對路徑
- 沒有 service worker：價格不能被離線快取成舊的
- 預設 `noindex`（不讓搜尋引擎收錄），只有拿到連結的人看得到

## 檔案結構

```
index.html              頁面外框（標題列、搜尋、清單、聯絡、頁尾警語、年齡確認）
css/style.css           全部樣式（淺色／深色、手機優先）
js/
  config.js             店名、公告、試算表連結、電話、LINE（使用者會自己改的地方）
  app.js                讀取價格、畫面、自動更新、分享、年齡確認
  prices.js             價格表整理規則（欄位對應、價格解析、搜尋、試算表連結轉換）
  csv.js                CSV 解析
data/prices.csv         備用／範例價格表
icons/                  App 圖示、LINE 分享預覽圖 og.png（1200×630）
manifest.webmanifest    加到主畫面用
tests/                  自動檢查頁（tests.html + tests.js，只測邏輯）
start.bat、tools/       本機預覽伺服器（port 8001）
```

## 價格表格式

第一列是欄位名稱（順序不限，別名見 `prices.js` 的 `HEADER_ALIASES`）：
`分類, 品名, 度數, 容量, 單瓶價, 整箱價, 每箱瓶數, 狀態, 備註, 前次價格, 標籤`

- 「標籤」有填（例：熱賣）會在品名下方顯示朱紅色 🔥 標籤

- 「品名」必填；找不到「品名」欄就當作讀取失敗
- 分類空白沿用上一列；狀態空白當現貨；狀態「下架／隱藏」不顯示
- 價格欄去掉 `NT$`、`,`、`元` 取數字；空白或文字顯示「請私訊詢價」
- 漲跌 = 單瓶價 − 前次價格，台灣習慣紅漲綠跌

## 讀取規則（app.js）

- 有 `sheetUrl` 就讀試算表，否則讀 `data/prices.csv`；`fetch` 一律 `cache: 'no-store'`
- 試算表連結轉換：共用連結 `…/d/<ID>/edit` → `gviz/tq?tqx=out:csv&headers=1`（即時）；發布連結 `…/d/e/<ID>/pub…` → `pub?output=csv`（Google 約 5 分鐘快取）
- 讀不到時：保留畫面上已有的 → 用 localStorage 上次存的（`yx-prices-cache`）→ 有試算表時改讀 `data/prices.csv` → 都失敗才顯示錯誤；非最新資料一定要顯示提示
- 每 `refreshMinutes` 分鐘自動更新（頁面在前景時），切回頁面超過 1 分鐘也會更新
- 年齡確認記在 localStorage `yx-age-ok`
- 除錯：開發者工具輸入 `app.state`

## 不能改掉的規則

- 頁尾與年齡確認的警語「禁止酒駕　飲酒過量，有害健康」「未滿十八歲禁止飲酒」要保留且明顯（菸酒管理法：酒類廣告要標示警語）
- 不做線上下單、購物車、付款（菸酒管理法：不能用網路購物等無法當面確認年齡的方式賣酒），只放聯絡按鈕
- 公開儲存庫：不要放進貨成本、客戶資料、個人資料；Google 試算表也一樣會被看到
- 不使用金門酒廠的商標圖案；網頁是怡軒特產行自己的風格

## 啟動與測試

- 本機：雙擊 `start.bat` → `http://localhost:8001`（不能直接雙擊 `index.html`，模組和 CSV 讀不到）
- 自動檢查：`http://localhost:8001/tests/tests.html`
- 改店名或主題色時，要重新產生 `icons/` 裡的 PNG 與 `og.png`，並更新 `index.html` 的 og 標籤與 Google Fonts 的 `text=` 字集（標題用的思源宋體只載入用到的字）

## 部署

- 儲存庫：https://github.com/azin0609-dev/Kaoliang-liquor
- 網站：https://azin0609-dev.github.io/Kaoliang-liquor/（Settings → Pages → `main` / root）
- 改完 `git add -A` → `git commit` → `git push`，約 1～2 分鐘自動更新
- commit 用 GitHub 匿名 Email（`<id>+azin0609-dev@users.noreply.github.com`）

## 待辦

- [x] 換成真正的品項與價格（2026-11-03，依手寫價目表）
- [x] LINE 連結（電話未填）
- [ ] 設定 Google 試算表（第一次讀取時確認畫面上沒有「暫時連不到最新報價」）
