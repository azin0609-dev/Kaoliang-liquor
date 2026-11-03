// 網站設定：要改店家資訊、聯絡方式、價格來源，改這個檔案就好
// 注意：這個專案是公開的，這裡寫的東西任何人都看得到

export const CONFIG = {
  shopName: '怡軒特產行',
  title: '金門高粱酒即時報價',

  // 頁面上方的公告（不需要就改成 ''）
  notice: '目前顯示的是範例價格，正式報價整理中。',

  // 價格來源：Google 試算表的「共用連結」或「發布到網路」連結
  // 留空 '' 就使用專案裡的 data/prices.csv
  sheetUrl: '',

  // 備用價格表（Google 試算表連不上時使用）
  localCsv: 'data/prices.csv',

  // 每幾分鐘自動重新讀取一次價格
  refreshMinutes: 5,

  // 聯絡方式（留空就不顯示該按鈕）
  phone: '',     // 例：'0912-345-678'
  lineUrl: '',   // 例：'https://line.me/ti/p/~你的LINE ID'
  contactNote: '價格會隨酒廠與市場調整，訂購前請先私訊確認。',
};
