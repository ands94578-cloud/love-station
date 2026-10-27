# 寶貝的戀愛補給站

手機版情侶互動 PWA。男友、女友各自登入，看到各自的畫面，資料透過 Supabase 即時同步。前端無建置步驟，`dist/` 就是整個網站。

| | 女友登入 | 男友登入 |
|---|---|---|
| 頁面 | 首頁、兌換券／票夾、每週抽獎、情書、許願池、心情、回憶、小遊戲 | 首頁、男友後台、情書、回憶、小遊戲 |
| 能做的事 | 抽獎（每週一次）、兌換券、許願、記錄心情 | 送券、完成兌換、回覆願望、看她的心情、設定暱稱與紀念日 |
| 兩人都能 | 寫情書、貼回憶照片 | |

本機預覽：`python -m http.server 4173 --directory dist`，開 http://localhost:4173。

## Supabase 設定（第一次）
1. 到 https://supabase.com 註冊並按 **New project**（區域選 Tokyo 或 Singapore 比較快）。
2. 左側 **SQL Editor** → 貼上 `supabase/schema.sql` 全部內容 → **Run**。
3. **Authentication → Sign In / Providers**：關掉 **Allow new users to sign up**，只讓你們兩個人能登入。
4. **Authentication → Users → Add user → Create new user**，建立兩個帳號（男友、女友），勾選 **Auto Confirm User**。email 可以用真的，忘記密碼時比較好處理。
5. 回到 **SQL Editor**，執行 `schema.sql` 最下面「綁定情侶」那段（把兩個 email 換成剛剛建立的），只執行一次。
6. **Project Settings → API**（或 API Keys）複製 **Project URL** 和 **anon public／Publishable key**，連同兩個 email 填進 `dist/config.js`。
   **不要**用 service_role／Secret key，那把鑰匙可以略過所有權限。

## 安全設計
- anon 金鑰本來就公開在網頁裡；保護資料的是 `schema.sql` 的權限規則（RLS）：只看得到自己這對情侶的資料。
- 抽獎、兌換、完成兌換、送券、回覆願望、修改設定，都由資料庫函式執行並檢查角色：女友不能進後台送自己券，男友不能替她抽獎。
- 每週抽獎由伺服器決定獎品，用台北時間週一 00:00 計算週期，資料庫唯一索引保證每週一次。
- 回憶照片存在私人儲存空間（`memories` bucket），用一小時有效的簽名網址顯示。

## 加到手機桌面（PWA）
需透過 HTTPS 開啟（localhost 也可測試）。
- Android Chrome：首頁會出現「加到桌面」按鈕，或用選單的「安裝應用程式」。
- iPhone：用 Safari 開啟 → 分享 → 加入主畫面（首頁會顯示提示）。iPhone 桌面上的 App 和 Safari 是分開的，第一次打開 App 要再登入一次。
- sw.js 採「有網路就拿最新版，沒網路才用快取」。新增或改名檔案時，記得更新 sw.js 的 `SHELL` 清單和 `CACHE` 版本號。

## 線上網址與更新
網站：https://ands94578-cloud.github.io/love-station/ （GitHub Pages，來源為 gh-pages 分支，內容即 dist/）

修改後更新上線：
1. 把 dist/sw.js 的 `CACHE` 版本號加一。
2. `git commit -am "說明"` 後執行 `git push` 與 `git subtree push --prefix dist origin gh-pages`。
3. 約 1 分鐘後生效。

## 檔案
- `dist/config.js`：Supabase 連線設定
- `dist/app.js`：畫面與流程；所有資料讀寫都經過 `window.loveApi`
- `dist/vendor/supabase.js`：Supabase 官方 JS 套件 2.117.3（MIT 授權，見 supabase-LICENSE）
- `supabase/schema.sql`：資料表、權限、伺服器函式、照片儲存空間

## 來源
粉紅甜點券插圖（dist/assets/dessert.webp）與站名、風格、署名、甜點／飲料／宵夜券來自原始對話；其餘券種與文案為補齊的版本。圖上「兌換卷」的「卷」是錯字，正確為「券」，需重新生成圖片才能修正。
