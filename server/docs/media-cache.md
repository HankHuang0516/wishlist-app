# 照片快取與預熱（來源縮圖、商品照片）

來源線索與站內商品的照片都存在 Flickr（私人相片），由伺服器代讀後回給瀏覽器（`/api/source-leads/:id/media/:mediaId/thumbnail|image`、`/api/listing-media/:id/thumbnail|image`），回應一律 `private`，Flickr 的網址不會給到客戶端；除了公開陳列中的縮圖可在瀏覽器留 10 分鐘（見「瀏覽器端短效快取」），其餘都是 `no-store`。2026-11-10 之前每個請求都重新向 Flickr 讀一次：縮圖伺服器端中位數約 50 ms、p90 約 250 ms，加上台灣到美西的往返，探索與來源地圖頁的縮圖每張要 230–520 ms，而且清單回來之後才開始載。

## 快取（`src/lib/listingFlickrStorage.ts`、`src/lib/mediaByteCache.ts`）

- `ListingFlickrStorage.read()` 先看記憶體：同一個 Flickr 網址的位元組保留 24 小時（同一網址的內容不會變，換照片會換新的 Flickr id 與網址）。沒有就向 Flickr 讀一次；同時有多個請求等同一張，只讀一次。
- 兩個預算：縮圖（≤96 KB）與原圖分開，預設合計 64 MB（縮圖 48、原圖 16），`MEDIA_CACHE_MB` 可調，設 0 關閉。滿了先丟最久沒被讀的。
- 讀取失敗或不是 JPEG 的回應不會存起來。
- 權限與有效性仍在路由層逐次檢查：線索撤下（`leadCurrent` 為 false）或商品不再公開時，快取裡的位元組不會被送出。這一層只在伺服器記憶體裡，和瀏覽器留不留無關。

## 預熱（`src/lib/mediaWarm.ts`）

清單回應送出的同時（不等待），把前 8 件商品的縮圖讀進快取：探索（`/api/discovery`，含後備全掃路徑）與來源清單（`/api/source-leads?presentation=1`）。瀏覽器對這些縮圖的請求比清單晚一個往返到，到時多半已在記憶體裡。

- 代理網址要先換成 Flickr 來源：來源線索查 `ExternalSourceLead` 一次、商品照片查 `ListingMedia` 一次；結果按網址記住（最多 5,000 筆），同一頁再被讀不再查資料庫。
- Flickr 讀不到的來源記 10 分鐘內不再試；最多 3 張同時讀；任何錯誤都吞掉，不影響清單回應。
- 測試環境（`NODE_ENV=test`）預設不預熱，避免測試套件向 Flickr 送請求；`MEDIA_WARM_IN_TESTS=1` 開啟（`mediaWarm.integration.ts` 自己會設）。

## 瀏覽器端短效快取（`src/lib/mediaCachePolicy.ts`）

有了上面的記憶體快取，縮圖伺服器端只剩約 13 ms，瀏覽器端每張仍約 200 ms，幾乎全是台灣到美西的往返。這一段只有瀏覽器自己留著才省得掉。2026-11-10 起（Hank 同意），公開陳列中的縮圖回應改成 `Cache-Control: private, max-age=600`：瀏覽器 10 分鐘內再用到同一張，直接取自己的快取，不送請求。

| 照片 | `Cache-Control` |
|---|---|
| 仍有效的來源線索的縮圖 | `private, max-age=600` |
| 上架中商品的縮圖（`isDiscoverable`，且不是未選用的 AI 行銷圖） | `private, max-age=600` |
| 原圖（`image`），任何情況 | `private, no-store` |
| 願望的照片（拿到不透明網址就能讀，但不是公開陳列的東西） | `private, no-store` |
| 只有擁有者或 worker 讀得到的照片（草稿、已下架、已過期、未選用的行銷圖） | `private, no-store` |

- `private`：只有使用者自己的瀏覽器可以留，中間的共用快取（CDN、代理）不行。
- 只看「這張照片現在是不是公開陳列」，不看是誰來讀：擁有者讀自己上架中商品的縮圖也是 `max-age=600`（內容和別人拿到的相同）；商品一下架，擁有者讀到的就是 `no-store`。
- 走 Flickr 的回應（來源線索全部、試行使用者的商品照片）由 Express 自動加 ETag。期限過後瀏覽器帶 `If-None-Match` 來問，內容沒變回 304，不重送位元組；回 304 之前照樣跑完整的路由檢查，已撤下的回 404。存在本機的 webp 是串流送出，沒有 ETag，期限過後整張重抓。
- `MEDIA_THUMBNAIL_MAX_AGE_S`：秒數，預設 600，上限 3600；設 `0`（或任何讀不懂的值）就回到全部 `no-store`。在 Railway 改這個變數會重新部署，部署完成後生效。已經送出去的回應收不回來：關掉之後，各瀏覽器手上的縮圖最多再留到它原本的期限。

**取捨**

- 縮圖被撤下（線索撤回、商品下架或過期）後，10 分鐘內載過它的瀏覽器仍可能從自己的快取顯示它。清單 API 不會再回這一件，所以實際上只會出現在還沒重新整理的畫面，或直接開縮圖網址的時候。伺服器收到的每個請求照舊檢查。之前全部 `no-store` 時是下架當下就看不到；為了回訪速度放寬的就是這一點，而且只放寬到縮圖、10 分鐘。
- 只對「10 分鐘內載過同一批縮圖」的情況有效：同一次使用中來回切頁、短時間內回來。隔天再來仍要往返（有 ETag 的可以用 304 省下傳輸量，往返省不掉）。
- 沒做：`stale-while-revalidate`、更長的期限、原圖快取。網頁的 service worker 仍然不快取任何商品照片（`client/vite.config.ts`、`client/public/pwa-cache-policy.js`），這次沒動。

## 測試

- `src/__tests__/mediaCachePolicy.test.ts`：哪些情況給期限；設定值的解讀（取整數秒、上限一小時、0 或讀不懂就關）。

- `src/__tests__/mediaByteCache.test.ts`：依位元組上限淘汰最久未讀、超過整體上限的不收、同鍵覆寫、到期。
- `src/__tests__/listingFlickrStorage.test.ts`：同一張讀兩次與同時讀只向 Flickr 讀一次、失敗不留、原圖與縮圖分開計。
- `src/__tests__/integration/mediaWarm.integration.ts`（假 Flickr）：縮圖路由讀兩次只向 Flickr 讀一次且撤下後 404；清單回應會預熱第一頁每件的第一張縮圖，之後的縮圖請求與再次讀清單都不再向 Flickr 讀；只看前 8 個網址、不認得的網址與不存在的線索跳過、讀不到的來源會被記住；仍有效線索的縮圖是 `private, max-age=600` 並帶 ETag，帶 `If-None-Match` 再問回 304 且不再向 Flickr 讀，原圖 `no-store`，設定值 0／讀不懂／45／86400 各自的結果，撤下後帶 `If-None-Match` 來問回 404。
- `src/__tests__/integration/listingMedia.integration.ts`：草稿與願望照片的縮圖是 `no-store`；上架中商品的縮圖對訪客、其他使用者、擁有者都是 `max-age=600`，原圖 `no-store`，設 0 就關；過期後訪客 404、擁有者讀到 `no-store`；存在 Flickr 的上架商品縮圖是 `image/jpeg`＋`max-age=600`＋ETag，再問回 304。
