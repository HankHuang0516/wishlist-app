# MiniMax Code 本機圖片辨識橋接器（測試版）

原本的 `server.mjs` 是隔離概念驗證；新增的 `poller.mjs` 可用於單一測試帳號，從 Railway 領取 APP 照片並回寫辨識結果。兩者都使用 Mac 上已登入的 `mcode-tools` host-managed Connector，不需將 MiniMax 登入憑證或 API key 放進 Railway。本機服務只監聽 `127.0.0.1`，poller 不開對外 webhook。請勿用個人 Token Plan 在此基礎上直接服務公開使用者。

## 執行

先確認 `mcode-tools auth status` 顯示 authenticated。用至少 24 字元的本機測試 token 設定 `WISHLIST_MINIMAX_BRIDGE_TOKEN`，再執行 `node tools/minimax-vision-bridge/server.mjs`。預設端口為 3777，可用 `WISHLIST_MINIMAX_BRIDGE_PORT` 調整。**不要**將 token 寫入 Git、外洩給前端，或設定路由器／Tunnel 公開此端口。

以 `Authorization: Bearer <本機測試 token>` 呼叫 `POST /jobs`，JSON 為 `{ "jobId": "test-1", "imageUrl": "https://wishlist-app-production.up.railway.app/api/listing-media/<UUID>/image" }`；服務回傳 202，再查 `GET /jobs/test-1`。圖片網址僅接受已核准的 Wishlist 圖片路徑，下載禁止轉址、限制 8 MiB，驗證 JPEG／PNG／WebP 檔頭。任務一次只跑一張，最多排隊 5 張，同 ID 重送不會重複執行。輸出只包含可見主體、文字、招牌明示價格與證據；**明示價格不是二手市場估價**。

處理過程：下載圖片至權限受限的系統暫存目錄 → `mcode-tools upload-temp-url` → `connector__matrix__describe_images` → 解析及驗證 JSON → 刪除本機暫存圖片。MiniMax 上傳的暫存 URL 由平台管理，不能視為完全不留存。執行測試：`node --test tools/minimax-vision-bridge/server.test.mjs`。

## 測試帳號的雲端拉取串接

Railway 設定 `MINIMAX_PILOT_USER_ID`（僅測試帳號的數字 ID）及隨機的 `WISHLIST_MINIMAX_CALLBACK_TOKEN`（至少 32 字元）；Mac 在自己的安全環境中設定相同 token，執行 `node tools/minimax-vision-bridge/poller.mjs`。本機只主動向 Railway 領取任務及回寫結果，不開對外端口。`--once` 可處理一項後退出。舊 EClaw worker 會略過該測試帳號的 APP 照片，避免同一筆任務被兩個模型同時處理。

這只適用於單一測試帳號；關閉 Mac 時任務留在 Railway 排隊，超過租約才重領。正式對所有用戶開放前，必須確認 MiniMax 方案的服務用途、費用與隱私告知。不要把個人 Token Plan 當成正式服務配額。

## 行銷小助手 Beta（四張圖）

獨立的 `marketing-poller.mjs` 以同一把既有 callback capability，主動向 Railway 的 `/api/internal/marketing/next` 領取已確認商品。只對 `MARKETING_ASSISTANT_ENABLED=1` 且 `MARKETING_ASSISTANT_PILOT_USER_ID` 指定的測試帳號開放。每張原始照片仍由 Flickr 私密保存；Mac 暫存原圖、Apple Vision 切出的商品像素與背景生成檔，完成或失敗後刪除本機暫存。MiniMax 生成四個**沒有商品的背景**，本機把賣家的原始商品像素合成上去並印上「AI 行銷示意」，避免 image-to-image 改動商品本體；再產出可編輯的繁體中文文案。四張圖全部保存到私密 Flickr 並且賣家確認後，後端才把選用圖附到公開刊登。一次免費調整只重做指定槽位，其他圖保留。

本機常駐工作器可使用 `com.hankhuang.wishlist.marketing-poller.plist` 與 `run-marketing-poller.sh`；後者每次啟動都從既有 macOS Keychain 讀取 token，plist 與 Git 不存值。此 plist 使用專案的絕對路徑，安裝前應核對專案位置與 `sharp`／Swift 環境。單次隔離驗收：`railway run ... -- env DATABASE_URL=<隔離測試庫> TEST_DATABASE_URL=<同一隔離測試庫> NODE_ENV=test node mobile/scripts/marketing-four-local-e2e.cjs`。不應以生產資料庫執行這個合成照片測試。

若 Mac 離線或睡眠，Railway 工作會等待；最多重試三次，不應在 App 顯示假完成。公開商轉與付費額度尚未開放，內測限指定帳號。

## 外部二手來源的私有 AI 補充

外部來源另有獨立的 `MINIMAX_EXTERNAL_CANDIDATE_AI_ENABLED=1` 開關，預設關閉。須先在後台建立並核實來源、圖片重用與 AI 處理授權，再升級本機 poller，最後才可開啟；此功能仍使用相同的本機拉取通道與 worker token。工作器只從來源登記的 HTTPS 圖片主機下載，驗證公開 IPv4 並固定連線位址，不把 bearer token 送給來源；圖片只在本機暫存，完成後清除。模型補充結果僅回到後台待審候選資料，不能自行新增公開商品、售價或賣家資訊。具體限制與驗收閘門見 [外部商品來源契約](../../docs/external-supply-intake.md)。目前沒有因程式部署而自動加入任何真實雙北商品。

macOS 常駐工作器使用 `~/Library/Application Support/WishlistMiniMax/` 下的獨立程式副本；合併 Git 變更不會自動更新該副本。每次變更圖片橋接器後，應在安全時段核對並更新該副本、重啟單一 Wishlist.ai LaunchAgent，再執行明確 opt-in 的 `node tools/minimax-vision-bridge/runtime-external-image-smoke.mjs`。此 smoke 先確認安裝副本與專案程式雜湊相同，再從固定提交下載本專案自製檯燈圖並核對影像雜湊，最後用**安裝副本**呼叫 MiniMax；只接受有圖片證據且不自行推測外部來源售價／新舊的結果。測試不建立來源、候選或公開商品，也不向 Railway 寫入；它會消耗一次 MiniMax 模型呼叫，需人工明確執行。通過此項仍不能取代真實授權來源及其售出更新的驗收。

## 舊本機概念驗證

原先的 `server.mjs` 仍可做單機概念驗證；請不要將其回環端口公開。新增的 poller 仍需 Railway 部署與兩端一致的私密設定，才算完成端到端串接。

Mac 要保持開機、連網且不進入系統睡眠，螢幕可以關閉；MiniMax 登入及 Connector broker 也需有效。先用測試帳號、單工、人工核對回覆；正式公開使用前須確認 MiniMax 方案適用性、費用與風險。MiniMax 官方 [Token Plan FAQ](https://platform.minimax.io/subscribe/token-plan) 將其定位為個人互動使用，建議正式環境採按量付費。
