# 新版 APP 照片 Flickr / MiniMax Code 測試切換

## 現況與切換邊界

- 舊網頁版已經優先使用 Flickr，但其上傳實作是公開照片，失敗時某些流程仍會退回 Railway 檔案。
- 新版 APP 的既有照片仍留在 Railway volume；資料列沒有 `flickrPhotoId` 時照舊讀取。此變更不搬移、覆寫或刪除任何舊照片。
- 新版 APP 的新上傳**只有明確設定** `LISTING_MEDIA_STORAGE_PROVIDER=flickr` 才走 Flickr；未設定仍走 Railway volume。APP 的 `/api/listing-media/<UUID>/image|thumbnail` 網址保持不變，由 API 檢查權限後代理圖片。
- Flickr 上傳設為 private，來源照片已由伺服器重編碼移除 EXIF/GPS；APP 不收到 Flickr 直連 URL。Flickr 可能仍將具有 secret 的靜態網址視為可分享資源，不能把它當成強私密儲存。
- Flickr 只存一張 JPEG master，顯示與縮圖使用 Flickr 衍生尺寸；Railway 資料庫只保存遠端照片 ID 與衍生 URL。沒有第二份獨立備份，需另建備份方案。

## 上線前強制門檻

1. Flickr OAuth 必須是 `delete` 權限；`write` 只可上傳、不能永久刪除。2026-09-24 讀取目前 Wishlist production OAuth token，結果是 `write`。因此目前不可把 `LISTING_MEDIA_STORAGE_PROVIDER` 切到 Flickr。
2. 以該 token 測試私密上傳、簽名讀取尺寸、API 代理讀取、刪除遠端原檔與重試；確認無孤兒檔。
3. 核對 Flickr 對此商業／拍賣用途的 API 授權；既有網頁程式用 Flickr，不代表本用途已獲核准。
4. 先在隔離資料庫和內部測試帳號驗證，再部署並觀察；不要把舊 Railway 目錄刪除。Flickr 失敗不能以假成功或遺失照片回覆。

## MiniMax Code 單一測試帳號

Railway 設 `MINIMAX_PILOT_USER_ID`（數字 User ID）與 `WISHLIST_MINIMAX_CALLBACK_TOKEN`（隨機 32 字元以上）；Mac 安全環境設相同 callback token，執行 `node tools/minimax-vision-bridge/poller.mjs`。Mac 主動領取待辨識的 APP 照片任務並回寫結果，不需家用電腦開放對外 webhook。只有測試帳號受此設定影響，原 EClaw worker 略過該帳號的 APP 照片。Mac 離線時任務持續留在 Railway；租約到期才允許重領。回寫只接受有效租約，並要求可見證據與最低可信度；沒有圖片可見的價格不寫入。

這是內部測試方案，未驗證 MiniMax Code 個人方案可合法供公開用戶使用。正式擴大前須確認服務條款、費用、隱私告知與穩定執行方式。所有 token 僅在環境中取得，不寫入 repo 或畫面證據。
