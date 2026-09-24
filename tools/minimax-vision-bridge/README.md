# MiniMax Code 本機圖片辨識橋接器（測試版）

原本的 `server.mjs` 是隔離概念驗證；新增的 `poller.mjs` 可用於單一測試帳號，從 Railway 領取 APP 照片並回寫辨識結果。兩者都使用 Mac 上已登入的 `mcode-tools` host-managed Connector，不需將 MiniMax 登入憑證或 API key 放進 Railway。本機服務只監聽 `127.0.0.1`，poller 不開對外 webhook。請勿用個人 Token Plan 在此基礎上直接服務公開使用者。

## 執行

先確認 `mcode-tools auth status` 顯示 authenticated。用至少 24 字元的本機測試 token 設定 `WISHLIST_MINIMAX_BRIDGE_TOKEN`，再執行 `node tools/minimax-vision-bridge/server.mjs`。預設端口為 3777，可用 `WISHLIST_MINIMAX_BRIDGE_PORT` 調整。**不要**將 token 寫入 Git、外洩給前端，或設定路由器／Tunnel 公開此端口。

以 `Authorization: Bearer <本機測試 token>` 呼叫 `POST /jobs`，JSON 為 `{ "jobId": "test-1", "imageUrl": "https://wishlist-app-production.up.railway.app/api/listing-media/<UUID>/image" }`；服務回傳 202，再查 `GET /jobs/test-1`。圖片網址僅接受已核准的 Wishlist 圖片路徑，下載禁止轉址、限制 8 MiB，驗證 JPEG／PNG／WebP 檔頭。任務一次只跑一張，最多排隊 5 張，同 ID 重送不會重複執行。輸出只包含可見主體、文字、招牌明示價格與證據；**明示價格不是二手市場估價**。

處理過程：下載圖片至權限受限的系統暫存目錄 → `mcode-tools upload-temp-url` → `connector__matrix__describe_images` → 解析及驗證 JSON → 刪除本機暫存圖片。MiniMax 上傳的暫存 URL 由平台管理，不能視為完全不留存。執行測試：`node --test tools/minimax-vision-bridge/server.test.mjs`。

## 測試帳號的雲端拉取串接

Railway 設定 `MINIMAX_PILOT_USER_ID`（僅測試帳號的數字 ID）及隨機的 `WISHLIST_MINIMAX_CALLBACK_TOKEN`（至少 32 字元）；Mac 在自己的安全環境中設定相同 token，執行 `node tools/minimax-vision-bridge/poller.mjs`。本機只主動向 Railway 領取任務及回寫結果，不開對外端口。`--once` 可處理一項後退出。舊 EClaw worker 會略過該測試帳號的 APP 照片，避免同一筆任務被兩個模型同時處理。

這只適用於單一測試帳號；關閉 Mac 時任務留在 Railway 排隊，超過租約才重領。正式對所有用戶開放前，必須確認 MiniMax 方案的服務用途、費用與隱私告知。不要把個人 Token Plan 當成正式服務配額。

## 舊本機概念驗證

原先的 `server.mjs` 仍可做單機概念驗證；請不要將其回環端口公開。新增的 poller 仍需 Railway 部署與兩端一致的私密設定，才算完成端到端串接。

Mac 要保持開機、連網且不進入系統睡眠，螢幕可以關閉；MiniMax 登入及 Connector broker 也需有效。先用測試帳號、單工、人工核對回覆；正式公開使用前須確認 MiniMax 方案適用性、費用與風險。MiniMax 官方 [Token Plan FAQ](https://platform.minimax.io/subscribe/token-plan) 將其定位為個人互動使用，建議正式環境採按量付費。
