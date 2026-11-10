# 頁面載入預算檢查（1000 ms）

每個頁面從「開始載入」到「真正的內容出現在畫面上」不得超過 1000 ms，超過即 FAIL。
這組腳本用真實的 Chrome 逐頁開啟、等畫面不再變動，再回報時間。只讀頁面，不登入正式站、不送表單、不寫資料。

## 量什麼

| 欄位 | 意義 |
|---|---|
| 內容就緒（`content`） | 判定用。以下三者最晚的一個：畫面上可見文字最後一次改變、視窗內最後一張圖片載完、畫面有地圖時最後一個資源載完 |
| 文字（`text`） | 可見文字最後一次改變的那一幀 |
| 圖片（`image`） | 視窗內最後一張圖片載完的時間 |
| 換頁完成（`route_ready`） | 「正在載入頁面…」消失、該頁自己的畫面出現 |
| API 數／串接層數 | 這次載入打了幾支 API；其中必須「一支等一支」的最長鏈有幾層 |

「畫面不再變動」的條件：沒有進行中的請求、沒有看得到的載入指示（轉圈、骨架、「載入中」文字）、視窗內圖片都載完，且持續 700 ms 沒有新動靜。載入指示只算人看得到的：在視窗內、而且沒有被捲動區塊捲到外面。清單裡還沒捲到的列會一直留著「圖片載入中…」（瀏覽器要捲到才抓那些圖），那不屬於畫面上的內容；`instrument.check.cjs` 檢查這條規則。20 秒內達不到就記為未完成（FAIL）。

三種情境：

- `cold` 第一次造訪：空快取、新連線、不啟用 Service Worker（量頁面本身，不含背景預先快取）。
- `warm` 回訪：Service Worker 與快取已就位，重新整理頁面。
- `spa` App 內切頁：不重新載入，從另一頁切過去（最接近 APP 內點分頁）。

判定：任一次超過預算即 FAIL；中位數沒超但有單次超過，備註「不穩定」。頁面載入時伺服器回 5xx，或頁面自己撞上限流（429），該次也記 FAIL。

`--spa-reuse`：App 內切頁改成同一個分頁連續量（第 1 次是這次使用中第一次打開該頁，之後是切回來），每條路由只重新載入一次，省下正式站的靜態額度。

## 對正式站跑（只含不需登入的頁面）

```bash
PUPPETEER_MODULE=/絕對路徑/node_modules/puppeteer \
node scripts/page-load/page-load-budget.cjs --vars vars.production.json --scope guest --enforce
```

`vars.production.json` 提供路由裡的 `{listingId}`、`{sellerId}`、`{sourceId}`，取自公開 API 當下的公開商品（`GET /api/listings` 的 `id` 與 `ownerUserId`、`GET /api/discovery` 任一筆來源的 `id`）。這個檔案不放進版本庫，因為商品會下架：

```json
{ "listingId": "<站內商品 id>", "sellerId": "<該商品的 ownerUserId>", "sourceId": "<公開來源 id>" }
```

腳本會讀回應的 `RateLimit-*` 標頭，額度低於保留量（預設留 150 次給同一 IP 的其他人與排程）就等視窗重置；收到 429 立即停止。地圖頁一次會打數十支 API，`routes.json` 內限制每情境只跑 1 次。

## 對本機隔離環境跑（含登入後頁面，可在發布前自我驗證）

```bash
(cd server && npm run build) && (cd client && npm run build)
createdb wishlist_marketplace_test_pageload && \
  (cd server && DATABASE_URL=postgresql://$USER@127.0.0.1:5432/wishlist_marketplace_test_pageload npx prisma migrate deploy)

TEST_DATABASE_URL=postgresql://$USER@127.0.0.1:5432/wishlist_marketplace_test_pageload \
PUPPETEER_MODULE=/絕對路徑/node_modules/puppeteer \
node scripts/page-load/local-stack.cjs --leads 5500 --latency 190 -- --runs 3 --enforce
```

`local-stack.cjs` 會：

1. 在 `wishlist_marketplace_test_*` 本機資料庫建立三個合成帳號（願望、站內商品、對話、追蹤）與指定筆數的合成公開來源（都通過伺服器自己的現行有效檢查）。
2. 以固定的乾淨環境變數啟動真正的伺服器建置（不帶任何正式金鑰、供應商憑證）。
3. 在前面放一個 HTTP/2 延遲代理，每個請求加上 `--latency` 毫秒（預設 190，為 2026-11-09 自台灣量到正式站每個請求的往返底限）。
4. 用合成帳號登入，先跑未登入、再跑登入後的所有頁面；每一輪前重啟伺服器，讓各輪的限流額度互不影響。
5. 伺服器有公開目錄讀取模型（`PublicCatalogEntry`）時，會等它建置完成、並把剛放入的資料補算完才開始量；否則前幾次量到的會是後備的全掃。

常用參數：`--leads` 公開來源筆數（放到 20000 可重現探索頁的筆數上限）、`--wishes` 合成帳號的願望數（2–100）、`--passes guest,signed-in`、`--modes cold,warm,spa`、`--seed keep` 沿用上次的資料。本機環境裡頁面自己撞上限流會記在該頁（`--on-limit record`），不會中止整輪。

`--session` 只接受本機或名稱帶 `staging`／`dev`／`test`／`qa`／`sandbox`／`preview` 的主機，不能對正式站注入登入狀態。

本機的限制：合成來源沒有照片，圖片時間以正式站實測為準；本機 CPU 比正式站容器快，重運算 API 的秒數會偏樂觀，網路往返層數則相同。

## 互相拖累檢查

```bash
node scripts/page-load/head-of-line-check.cjs            # 對正式站，約 20 個讀取請求
node scripts/page-load/head-of-line-check.cjs --budget 500
```

先單獨讀一個極小的靜態檔，再在一支重 API（預設 `/api/discovery`）進行時重讀。重 API 超過 `--budget`，或小檔被拖慢超過 `--allow`（預設 200 ms），就是 FAIL。

## 背景重新推導期間的讀寫檢查

伺服器啟動約一分鐘後、之後每 24 小時，背景工作會把公開目錄的每一列重新推導一次（見 `server/docs/public-catalog.md`）。2026-11-10 正式站在這段時間探索要 10–12 秒，其他 API 也跟著停住。這支腳本在本機重現同一個情境：

```bash
(cd server && npm run build) && (cd client && npm run build)
TEST_DATABASE_URL=postgresql://$USER@127.0.0.1:5432/wishlist_marketplace_test_pageload \
node scripts/page-load/catalog-contention-check.cjs --writes 4 --rounds 6 --out result.json
```

要先用 `local-stack.cjs` 在同一個 `wishlist_marketplace_test_*` 資料庫放好合成公開來源。腳本會：

1. 啟動真正的伺服器建置（和 `local-stack.cjs` 同一組固定環境變數）。
2. 每秒 `--writes` 次，直接在資料庫改一筆合成來源的標題（任何寫入都是這樣到達讀取模型），隨後像另一位訪客一樣查「剛改的那個標題」和探索第一頁；同時每 250 ms 讀一個極小的靜態檔，看伺服器有沒有停住。
3. 在三種時候做這件事：伺服器閒著、背景工作自己的重新推導（啟動後約 60 秒）、另外 `--rounds` 輪（腳本放入同樣的標記來啟動）。

FAIL 條件：

- 重新推導期間任何一次探索回應超過 `--budget`（預設 1000 ms）、沒有顯示剛做的修改，或請求失敗。
- 伺服器回報 `Public catalogue bypassed`（讀取模型答不了，改走全掃）。
- 背景工作的步長不對。伺服器在每一輪結束時記一行 `Public catalogue upkeep: <列數> rows in <步數> steps …, longest step <毫秒> ms`，腳本據此判定：平均每步超過 80 列（一步最多取 40 個標記，另加最多 40 筆到期的項目）、最長的一步超過 `--budget`（讀取若剛好要等那一步，就等那麼久），或這一行的數目少於重新推導的輪數（步長無從判斷）。回應時間都在預算內也一樣 FAIL：本機一步重算幾千列只要一兩秒，正式站慢十倍。

結束碼 1 是 FAIL，2 是腳本本身出錯。結束時會把改過的標題還原。

參數：`--writes` 每秒寫入數（1–20，預設 2）、`--rounds` 追加輪數（0–20，預設 3）、`--budget`、`--server-port`（預設 18990）、`--proxy-port`（預設 18991；這裡沒有東西監聽它，只用來讓伺服器的網址設定與 `local-stack.cjs` 相同，啟動時才不會整個重建讀取模型）、`--out` 結果 JSON。`--writes 4 --rounds 6` 全程約兩分半（5,500 筆時每一輪約 170 步、9 秒）。

本機的限制同上：一輪重新推導本機只要幾秒，正式站要數十秒，所以秒數偏樂觀。判讀時先看「有沒有改走全掃」和「答案對不對」，再看秒數。

## 已登入的瀏覽器分頁（正式站登入後的頁面）

腳本不會、也不能在正式站登入。登入後才看得到的頁面，要由本人先在自己的瀏覽器登入，再把量測程式放進那個分頁執行。兩種做法，安裝期間頁面送出的所有非 GET 請求都會被擋下並列在結果裡，開頁面不會造成任何寫入（例如聊天已讀、草稿儲存）：

- **`in-frame-runner.js`（建議）**：在分頁上蓋一個手機尺寸（390×844）的同站框架，在框架裡量。觀測程式與判定規則和 `page-load-budget.cjs` 相同，所以數字可以直接和未登入的結果比較，也量得到「回訪」（整頁重新載入）。

  ```bash
  node scripts/page-load/build-in-frame-payload.cjs --minify   # 產生要貼進分頁執行的程式
  ```

  貼進去後：`await __plbFrame.load('/wishes')` 量回訪、`await __plbFrame.inApp('/wishes')` 量 App 內切頁、`__plbFrame.links('^/wishlists/\\d+$')` 取框架內目前頁面的連結（找需要識別碼的頁面）、`__plbFrame.close()` 收掉框架。結果只有時間、數量與去掉識別碼的請求路徑，不含頁面文字。每次量測的 `injected` 會記下觀測程式放進去的時刻，以及在那之前頁面是否已經送出 API（應為 0）。「第一次造訪」要清空快取才量得到，這個做法不量。

  要一次量完登入後的所有頁面，接著貼 `in-frame-driver.js`：它會自己找出需要識別碼的頁面（願望清單、聊天室、追蹤對象），每頁量回訪與切頁各 2 次，並把讀取頻率壓在每分鐘 20 次以下；進度看 `__plbProgress`，結果在 `__plbResults`。量測期間分頁要保持在最上層。

  `in-frame-runner.check.cjs` 用本機隔離環境檢查這個做法：同一批頁面用它量和用 `page-load-budget.cjs` 量，數字應該一致。

- **`in-app-probe.js`**：直接裝在分頁本身，只量 App 內切頁（`await __plbGo('/wishes')`），視窗是瀏覽器當下的大小。

## 檔案

- `page-load-budget.cjs` 量測與判定；`--enforce` 時有 FAIL 會以非零結束。
- `instrument.js` 注入頁面的唯讀觀測程式；`instrument.check.cjs` 用合成頁面檢查它判定載入指示的規則。
- `routes.json` 全部路由；`signedIn` 需登入、`guestOnly` 只在未登入時量、`textLoaders: false` 表示該頁內文本來就會提到「載入」。
- `local-stack.cjs` 本機隔離環境。
- `head-of-line-check.cjs` 互相拖累檢查。
- `catalog-contention-check.cjs` 背景重新推導期間的讀寫檢查。
- `in-frame-runner.js`、`in-frame-driver.js`、`build-in-frame-payload.cjs`、`in-frame-runner.check.cjs` 已登入分頁用的框架量測、整批執行、產生貼入程式、本機對照檢查。
- `in-app-probe.js` 已登入分頁用的切頁探針。
