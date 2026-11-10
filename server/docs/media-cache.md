# 照片快取與預熱（來源縮圖、商品照片）

來源線索與站內商品的照片都存在 Flickr（私人相片），由伺服器代讀後回給瀏覽器（`/api/source-leads/:id/media/:mediaId/thumbnail|image`、`/api/listing-media/:id/thumbnail|image`），回應一律 `private, no-store`，Flickr 的網址不會給到客戶端。2026-11-10 之前每個請求都重新向 Flickr 讀一次：縮圖伺服器端中位數約 50 ms、p90 約 250 ms，加上台灣到美西的往返，探索與來源地圖頁的縮圖每張要 230–520 ms，而且清單回來之後才開始載。

## 快取（`src/lib/listingFlickrStorage.ts`、`src/lib/mediaByteCache.ts`）

- `ListingFlickrStorage.read()` 先看記憶體：同一個 Flickr 網址的位元組保留 24 小時（同一網址的內容不會變，換照片會換新的 Flickr id 與網址）。沒有就向 Flickr 讀一次；同時有多個請求等同一張，只讀一次。
- 兩個預算：縮圖（≤96 KB）與原圖分開，預設合計 64 MB（縮圖 48、原圖 16），`MEDIA_CACHE_MB` 可調，設 0 關閉。滿了先丟最久沒被讀的。
- 讀取失敗或不是 JPEG 的回應不會存起來。
- 權限與有效性仍在路由層逐次檢查：線索撤下（`leadCurrent` 為 false）或商品不再公開時，快取裡的位元組不會被送出。回應標頭不變，瀏覽器端仍不快取。

## 預熱（`src/lib/mediaWarm.ts`）

清單回應送出的同時（不等待），把前 8 件商品的縮圖讀進快取：探索（`/api/discovery`，含後備全掃路徑）與來源清單（`/api/source-leads?presentation=1`）。瀏覽器對這些縮圖的請求比清單晚一個往返到，到時多半已在記憶體裡。

- 代理網址要先換成 Flickr 來源：來源線索查 `ExternalSourceLead` 一次、商品照片查 `ListingMedia` 一次；結果按網址記住（最多 5,000 筆），同一頁再被讀不再查資料庫。
- Flickr 讀不到的來源記 10 分鐘內不再試；最多 3 張同時讀；任何錯誤都吞掉，不影響清單回應。
- 測試環境（`NODE_ENV=test`）預設不預熱，避免測試套件向 Flickr 送請求；`MEDIA_WARM_IN_TESTS=1` 開啟（`mediaWarm.integration.ts` 自己會設）。

## 測試

- `src/__tests__/mediaByteCache.test.ts`：依位元組上限淘汰最久未讀、超過整體上限的不收、同鍵覆寫、到期。
- `src/__tests__/listingFlickrStorage.test.ts`：同一張讀兩次與同時讀只向 Flickr 讀一次、失敗不留、原圖與縮圖分開計。
- `src/__tests__/integration/mediaWarm.integration.ts`（假 Flickr）：縮圖路由讀兩次只向 Flickr 讀一次且撤下後 404；清單回應會預熱第一頁每件的第一張縮圖，之後的縮圖請求與再次讀清單都不再向 Flickr 讀；只看前 8 個網址、不認得的網址與不存在的線索跳過、讀不到的來源會被記住。
