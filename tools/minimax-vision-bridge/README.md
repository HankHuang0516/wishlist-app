# MiniMax Code 本機圖片辨識橋接器（測試版）

這是隔離的概念驗證，不是正式 APP 的辨識後台。它使用 Mac 上已登入的 `mcode-tools` host-managed Connector，不需要將 MiniMax 登入憑證或 API key 放進 Railway。服務只監聽 `127.0.0.1`；它**沒有**對外 webhook，也不回寫願望資料。請勿用個人 Token Plan 在此基礎上直接服務公開使用者。

## 執行

先確認 `mcode-tools auth status` 顯示 authenticated。用至少 24 字元的本機測試 token 設定 `WISHLIST_MINIMAX_BRIDGE_TOKEN`，再執行 `node tools/minimax-vision-bridge/server.mjs`。預設端口為 3777，可用 `WISHLIST_MINIMAX_BRIDGE_PORT` 調整。**不要**將 token 寫入 Git、外洩給前端，或設定路由器／Tunnel 公開此端口。

以 `Authorization: Bearer <本機測試 token>` 呼叫 `POST /jobs`，JSON 為 `{ "jobId": "test-1", "imageUrl": "https://wishlist-app-production.up.railway.app/api/listing-media/<UUID>/image" }`；服務回傳 202，再查 `GET /jobs/test-1`。圖片網址僅接受已核准的 Wishlist 圖片路徑，下載禁止轉址、限制 8 MiB，驗證 JPEG／PNG／WebP 檔頭。任務一次只跑一張，最多排隊 5 張，同 ID 重送不會重複執行。輸出只包含可見主體、文字、招牌明示價格與證據；**明示價格不是二手市場估價**。

處理過程：下載圖片至權限受限的系統暫存目錄 → `mcode-tools upload-temp-url` → `connector__matrix__describe_images` → 解析及驗證 JSON → 刪除本機暫存圖片。MiniMax 上傳的暫存 URL 由平台管理，不能視為完全不留存。執行測試：`node --test tools/minimax-vision-bridge/server.test.mjs`。

## 尚未完成的雲端串接

正式的「類 webhook」建議改為 Mac **主動向 Railway 領取**測試帳號任務並回傳結果，而不是讓 Railway 呼叫家中 Mac。Railway 必須增加具短效租約與服務端驗證的領取／回寫端點，EClaw 原工作器要排除同一批測試任務，且任務必須持久存於雲端；Mac 睡眠或離線時保持待處理，恢復後才繼續。這些功能目前都**沒有**部署，不要將本機測試版誤當正式 APP 已接入。

Mac 要保持開機、連網且不進入系統睡眠，螢幕可以關閉；MiniMax 登入及 Connector broker 也需有效。先用測試帳號、單工、人工核對回覆；正式公開使用前須確認 MiniMax 方案適用性、費用與風險。MiniMax 官方 [Token Plan FAQ](https://platform.minimax.io/subscribe/token-plan) 將其定位為個人互動使用，建議正式環境採按量付費。
