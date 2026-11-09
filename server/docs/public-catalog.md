# 公開目錄讀取模型（`PublicCatalogEntry`）

探索、首頁的公開來源筆數、商品頁的原價資訊，原本每個請求都把所有公開商品從來源資料列重算一次。現在每件商品只在它的來源資料列變動時算一次，存進 `PublicCatalogEntry`；請求只讀一頁已經算好的資料。

對外的回應內容不變。`src/lib/discovery.ts` 的 `scanDiscovery()`（全掃）仍是基準，也是後備路徑。

## 怎麼保持同步

1. **標記**：資料庫觸發器 `public_catalog_mark()` 掛在 `Listing`、`ListingMedia`、`ListingLocation`、`ExternalSourceLead`、`ExternalListingCandidate`、`ExternalListingSource`。任何寫入（API、腳本、主控台）都會在同一筆交易內往 `PublicCatalogDirty` 寫一筆「這一列要重算」。
2. **重算**：`src/lib/publicCatalog.ts` 取出標記，用全掃同一組函式（`listingProduct`、`leadProduct`、`candidateProduct`）重建那幾列的項目，並在同一筆交易內刪除標記。
3. **讀取前先同步**：`catalogReady(now)` 會先把尚未處理的標記補算完才回答，所以寫入後的下一次讀取一定看得到。沒有待辦時只是一次索引查詢。
4. **時間條件**：站內商品的到期（`expiresAt`）與地圖顯示期限在讀取當下用欄位比較。來源與外部候選的時間條件（查核時間、14 天視窗、照片授權期限）由 `refreshAt` 記下「下一個可能改變的時刻」，到時重算。

## 什麼時候走全掃

`catalogReady(now)` 回 `false` 時，呼叫端一律改走全掃，結果仍然正確，只是慢：

- 第一次完整建置尚未完成（部署後背景建置，5,500 筆約一分鐘內）。
- 規則版本或 API 位址改了，正在重建（見下）。
- 一次有超過 2,000 筆異動尚未重算（大量更新）。背景工作會追上。
- 設了 `PUBLIC_CATALOG_DISABLED=1`（不需重新部署程式碼的關閉開關；改變數後重啟即生效）。

## 改到商品內容的規則時

分類規則、價格解析、商品欄位這類會改變「存下來的商品長什麼樣」的修改，要把 `CATALOG_PROJECTION_VERSION` 加一。啟動時發現版本（或 `API_URL`，照片網址含它）不同，就在背景全部重建；重建完成前走全掃。

即使忘了加版本，背景工作啟動約一分鐘後、之後每 24 小時會把每一列重新推導一次，內容相同就不寫入，不同就修正。

## 各端點現在怎麼讀

| 端點 | 讀法 |
|---|---|
| `GET /api/discovery`（一般列表與地圖模式） | 一個 SQL 敘述：篩選、分類數量、總數、分頁代碼、該頁商品。只讀該頁商品的內容 |
| `GET /api/discovery/products/:kind/:id` | 以鍵查單筆 |
| `GET /api/source-leads/summary` | 對 `PublicCatalogEntry` 計數 |
| `GET /api/source-leads/map`（來源地圖的位置與各位置件數） | 一個 SQL 敘述：目前公開的來源項目接回來源列取座標，依座標分組。讀取模型不可用時改由 `scanSourceMap()` 全掃，結果相同 |
| `/api/discovery/for-you`、`/api/discovery/cp`、`POST /cp-evaluations`、`/api/retail-price-admin/*` | 仍取得全部商品再運算（`loadDiscovery()`），但商品來自已存好的項目，不再逐筆重驗與重組。超過 20,000 筆時這幾支仍會回 `DISCOVERY_SCAN_CAPACITY` |

分頁代碼（cursor）的規則不變：只對「同一組查詢條件、同一批結果」有效，結果有任何增減或內容改變就回 409 `DISCOVERY_RESULTS_CHANGED`。

## 已知的成長特性

一般列表每次請求仍會讓資料庫掃過符合條件的列來算總數與分類數量（不經過 Node、不搬商品內容）。本機量測：5,500 筆時整支 API 的伺服器時間約 50 ms，20,000 筆約 80–130 ms。要再壓平，可以把這些彙總依目錄版本（`PublicCatalogState.version`）快取。

## 驗證

- `src/__tests__/integration/publicCatalog.integration.ts`：29 種查詢條件下與全掃逐欄比對、分頁順序、寫入後立即可見、撤下後舊分頁代碼失效、站內商品／照片／地點／原生 SQL 寫入都會反映、到期時刻、大量異動時退回全掃、項目被改壞後自動修正、關閉開關。
- `src/__tests__/publicCatalogRefresh.test.ts`：把時鐘走過每一個期限（含前後各一毫秒），確認存下來的項目與全掃在同一時刻的結果一致。
- `scripts/page-load/`：頁面載入預算檢查與「互相拖累」檢查（見該資料夾 README）。
