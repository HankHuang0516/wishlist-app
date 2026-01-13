# Flickr 備份與遷移指南

此指南說明如何使用 Flickr 來備份 Wishlist App 的圖片。

## 功能概覽

1. **自動備份**：新上傳的圖片會自動備份到 Flickr 的專屬相簿 "Wishlist App Items"
2. **現有圖片遷移**：可以將已存在 Railway 的圖片一次性遷移到 Flickr

## 環境設定

確保 `.env` 檔案中包含以下環境變數：

```env
FLICKR_API_KEY=your_api_key
FLICKR_API_SECRET=your_api_secret
FLICKR_OAUTH_TOKEN=your_oauth_token
FLICKR_OAUTH_TOKEN_SECRET=your_oauth_token_secret
FLICKR_USER_ID=your_user_id
```

同時也要在 **Railway** 環境變數中設定這些值。

## 功能說明

### 1. 自動備份新圖片

當用戶上傳新圖片時，系統會：
1. 在本地暫存圖片
2. 使用 AI 分析圖片內容
3. **自動上傳到 Flickr**
4. 將圖片加入 "Wishlist App Items" 相簿
5. 更新資料庫，使用 Flickr URL

這個過程完全自動化，無需手動操作。

### 2. 遷移現有圖片

如果您有已經上傳到 Railway 的圖片，可以使用遷移腳本將它們備份到 Flickr。

#### 預覽模式（推薦先執行）

```bash
cd server
npx ts-node scripts/migrate_images_to_flickr.ts --dry-run
```

這會顯示：
- 有多少圖片需要遷移
- 哪些圖片已經在 Flickr 上（會跳過）
- **不會實際進行任何變更**

#### 執行遷移

確認預覽結果無誤後，執行實際遷移：

```bash
cd server
npx ts-node scripts/migrate_images_to_flickr.ts
```

遷移過程會：
1. 從 Railway 下載每張圖片
2. 上傳到 Flickr
3. 加入 "Wishlist App Items" 相簿
4. 更新資料庫中的 imageUrl

#### 遷移特性

- ✅ 自動跳過已經在 Flickr 的圖片
- ✅ 每次上傳間隔 1 秒（避免 API 限制）
- ✅ 顯示進度和詳細日誌
- ✅ 失敗時不會中斷，會繼續處理其他圖片
- ✅ 最後顯示完整的統計報告

## Flickr 相簿設定

所有圖片會上傳到名為 **"Wishlist App Items"** 的相簿，具有以下特性：

- **標題**：依照商品名稱自動命名
- **標籤**：`wishlist-app`（遷移的圖片額外加上 `migrated` 標籤）
- **可見性**：公開但隱藏於搜尋（is_public: 1, hidden: 2）
- **描述**：Photos from Wishlist App - automatically backed up

## 常見問題

### Q: 遷移需要多久？
A: 取決於圖片數量。每張圖片大約需要 1-2 秒（下載 + 上傳 + 更新資料庫）。

### Q: 如果遷移中斷了怎麼辦？
A: 可以安全地重新執行腳本。已經遷移的圖片會被自動跳過。

### Q: Railway 上的原始圖片會被刪除嗎？
A: 不會。遷移只會更新資料庫中的 URL，原始檔案保持不變。

### Q: Flickr 有容量限制嗎？
A: 免費帳戶有 1000 張照片的限制。如果需要更多空間，可以考慮升級 Flickr Pro。

### Q: 如果上傳失敗怎麼辦？
A: 腳本會記錄失敗的項目，並在最後顯示詳細的錯誤報告。您可以手動處理失敗的項目。

## 驗證

遷移完成後，您可以：

1. 前往 https://www.flickr.com/photos/me/albums 查看 "Wishlist App Items" 相簿
2. 檢查 Railway 上的應用程式，確認圖片正常顯示
3. 查看資料庫，確認 imageUrl 已更新為 Flickr URL

## 故障排除

### 錯誤：Missing credentials

確認所有 5 個 Flickr 環境變數都已正確設定。

### 錯誤：Failed to download image

可能是圖片 URL 已過期或無法訪問。這些圖片會被標記為失敗，需要手動處理。

### 錯誤：Failed to upload to Flickr

可能是 API 限制或網路問題。可以等待幾分鐘後重試。

## 支援

如有問題，請查看：
- Flickr API 文檔：https://www.flickr.com/services/api/
- flickr-sdk 文檔：https://github.com/flickr/flickr-sdk
