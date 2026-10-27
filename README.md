# 寶貝的戀愛補給站

手機優先、無建置依賴的互動前端。可直接開啟 dist/index.html；建議在此目錄以 `python -m http.server 4173 --directory dist` 啟動，再開啟 http://localhost:4173。

包含首頁、16 種券、票夾、兌換申請、每週抽獎、情書、許願與回覆、心情、含照片的回憶、三類情侶遊戲及展示後台。資料存在 localStorage；無登入、跨裝置同步、訊息發送或真正交易。後台無權限隔離。

## 來源與暫定內容
重用原對話取回的粉紅甜點券圖片（dist/assets/dessert.webp，已由 2.6 MB 的 PNG 壓縮為約 90 KB），及使用者確認的站名、風格、署名、甜點／飲料／宵夜券。原對話的助手規劃只回傳引用標記，無法取回正文；其餘券種、文案與細部流程為本次補齊的展示版本，不宣稱逐字重現原規劃。

## 後端接口
在 dist/app.js 替換 window.loveApi，保留 getWeeklyStatus 與 drawWeekly。正式環境由伺服器計算 Asia/Taipei 週一 00:00 的週期與 nextDrawAt，前端不得決定獎品或可信時間。

- GET /api/weekly-draw：回傳 eligible、nextDrawAt。
- POST /api/weekly-draw：帶登入憑證及 Idempotency-Key。回傳 couponId、issuedCouponId、weekStart、nextDrawAt；已抽過回傳 409。
- 在同一筆資料庫交易內新增抽獎紀錄與使用者券；對 couple_id + user_id + week_start 建立唯一索引。隨機抽取 16 種券，各 1/16。重試相同冪等鍵須回傳原結果。
- 券狀態 available → pending → done；伺服器必須驗證所有權、角色與合法狀態轉換，拒絕重複兌換。情書、願望、心情與回憶必須依 couple_id 隔離。
- 示範採本機鎖與 localStorage 協調同瀏覽器分頁，但清除儲存、更改時間、換裝置均可繞過，不能當正式防重複抽獎機制。

建議資料表：couples、users、coupon_types、issued_coupons、weekly_draws、redemptions、letters、wishes、mood_entries、memories。照片上傳正式環境應使用有權限控管的儲存空間。

Google Fonts 連線失敗時會使用系統中文字體；圖片與其他前端資源皆隨附在 dist。

介面只提供手機版：最大內容寬度 480px，寬螢幕置中顯示相同手機介面，無桌面側邊欄。

## 加到手機桌面（PWA）
需透過 http(s) 開啟（直接雙擊 index.html 不會啟用）。上線請用 HTTPS（GitHub Pages、Netlify 等皆可）；localhost 也可測試。

- Android Chrome：首頁會出現「加到桌面」按鈕，或用選單的「安裝應用程式」。
- iPhone：用 Safari 開啟 → 分享 → 加入主畫面（首頁會顯示提示）。
- 離線可開啟：sw.js 會快取所有前端檔案與字型。**每次修改任何檔案後，請把 sw.js 裡的 `CACHE` 版本號加一**，手機才會換成新版（第二次開啟時生效）。
- 圖示：assets/icon-192.png、icon-512.png、icon-maskable-512.png（Android 自適應形狀）、apple-touch-icon.png，由甜點券插圖中央裁切而成。
