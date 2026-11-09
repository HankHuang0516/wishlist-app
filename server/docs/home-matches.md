# 首頁配對一次讀取（`GET /api/listings/home-matches`）

登入後的首頁原本先讀 `GET /listings/match-wishes` 拿到願望，再對每個願望各打一次 `GET /listings/matches`（一次三支）。從台灣到美西每個往返約 220 ms，三層串行就是 1.0–1.4 秒。現在首頁只打一次 `home-matches`，伺服器在資料庫旁邊把每個願望的第一頁配對一起算好回來。

## 回應

```
{
  groups: [{ wish: {id, name, maxPrice, priceCurrency, wishlist}, items: [...], nextCursor, scannedCandidates, ordering, notice }, ...],
  nextCursor,            // 下一頁願望的游標（願望 id），同 match-wishes
  matchLimit, scope: { bbox }, ordering: 'RECENT_CANDIDATES_PAGE_SCORE', notice
}
```

- `groups` 的順序與內容和 `match-wishes` 同一頁一樣（不含隱藏、已完成的願望；最新的在前）；每個 `wish` 的欄位相同。
- 每個 group 的 `items`／`nextCursor`／`scannedCandidates`／`notice` **就是** `GET /listings/matches?wishItemId=<id>&bbox=117,20,123.8,26.6&limit=<matchLimit>` 會回的第一頁：同樣的候選 SQL、同樣的評分與排序、同樣的游標。所以前端只對 `nextCursor` 不是 null 的願望，拿這個游標接著用舊端點讀下一頁；其餘願望不再多打任何請求。
- 範圍固定是首頁地圖用的台灣範圍（`bbox=117,20,123.8,26.6`），也就是只配對有公開位置、仍在地圖上顯示的商品，與原本首頁送的查詢相同。
- 查詢參數：`limit`（願望數，1–100，預設 50）、`cursor`（願望 id）、`matchLimit`（每個願望第一頁的候選數，1–100，預設 50）。其他鍵一律 400；不存在或不屬於自己的 `cursor` 回 404。
- `Cache-Control: private, no-store`；需要登入；只回自己的願望，公開的願望清單也不會讓別人讀到。

## 伺服器怎麼做

`src/controllers/wishlistMatchController.ts`：候選 SQL（`candidateSql`）與一頁的評分（`scoredPage`）從原本的 `matchWishListings` 抽出來共用。`homeMatches` 先讀一頁願望，四個一起跑各自的候選查詢，再用一次 `findMany` 讀出所有候選商品，最後逐願望評分。名稱資訊不足的願望回空頁與同樣的提示。

## 測試

`src/__tests__/integration/wishlistMatch.integration.ts`：對每個願望把 `home-matches` 的 group 與 `matches` 的第一頁逐欄比對（含游標），再用游標接著讀完剩下的頁，確認與全部候選一致；地圖範圍外、自己的、隱藏的願望都不會混入；權限、分頁與查詢檢查。`homeScale.integration.ts` 用編譯後的網頁版在 10k／30k／50k 商品下走一遍首頁，仍要求展開後顯示全部吻合商品。

## 原生 APP

`mobile/src/WishHome.tsx` 仍用 `match-wishes` ＋ 逐願望 `matches`，兩個端點都保留、行為不變；APP 改用 `home-matches` 要另外做並在模擬器驗收。
