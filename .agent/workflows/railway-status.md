---
description: Fetch Railway backend data (stats, crawler logs, health)
---

# Railway 後台數據查詢

當使用者提及此工作流時，執行以下步驟取得 Railway 後台資訊：

// turbo-all

1. **Health Check** - 取得伺服器健康狀態
   ```
   read_url_content https://wishlist-app-production.up.railway.app/api/admin/health
   ```

2. **System Stats** - 取得系統統計數據
   ```
   read_url_content https://wishlist-app-production.up.railway.app/api/admin/stats?key=wishlist-admin-2026
   ```

3. **Crawler Logs** - 取得爬蟲失敗記錄
   ```
   read_url_content https://wishlist-app-production.up.railway.app/api/admin/crawler-logs?key=wishlist-admin-2026
   ```

4. **匯總報告** - 將以上資訊整理成表格回報給使用者

## 輸出格式範例

```
### 🏥 Health Check
- Status: ok
- Uptime: 2972 秒
- Version: 1.0.0

### 📊 System Stats
| 項目 | 數量 |
|------|------|
| 使用者 | 20 |
| 願望清單 | 12 |
| 商品項目 | 28 |
| 爬蟲錯誤 | 0 |

### 🕷️ 最近 Crawler 錯誤
(列出最近錯誤記錄或顯示「無錯誤」)
```

## 備註
- API Key: `wishlist-admin-2026`
- 這些端點可用 `read_url_content` 工具直接存取，不需要權限確認
