# 新版 APP 照片 Flickr / MiniMax Code 儲存與辨識

## 現況與切換邊界

- 舊網頁版已經優先使用 Flickr，但其上傳實作是公開照片，失敗時某些流程仍會退回 Railway 檔案。
- 新版 APP 的既有照片仍留在 Railway volume；資料列沒有 `flickrPhotoId` 時照舊讀取。此變更不搬移、覆寫或刪除任何舊照片。
- 新版 APP 的新上傳**只有明確設定** `LISTING_MEDIA_STORAGE_PROVIDER=flickr` 才走 Flickr；未設定仍走 Railway volume。設定 `LISTING_MEDIA_FLICKR_PILOT_USER_ID` 時，僅該 User ID 走 Flickr，其餘使用者仍走 Railway；移除 pilot ID 才是全用戶切換。2026-09-24 production 已設定 Flickr 並移除 pilot ID，為全帳號新照片路徑。APP 的 `/api/listing-media/<UUID>/image|thumbnail` 網址保持不變，由 API 檢查權限後代理圖片。
- Flickr 上傳設為 private，來源照片已由伺服器重編碼移除 EXIF/GPS；APP 不收到 Flickr 直連 URL。Flickr 可能仍將具有 secret 的靜態網址視為可分享資源，不能把它當成強私密儲存。
- Flickr 只存一張 JPEG master，顯示與縮圖使用 Flickr 衍生尺寸；Railway 資料庫只保存遠端照片 ID 與衍生 URL。沒有第二份獨立備份，需另建備份方案。

## 上線前強制門檻

**用途許可狀態：** [Flickr 開發者指南](https://www.flickr.com/services/developer/business/) 明確反對一般後端儲存，[API 首頁](https://www.flickr.com/services/api/) 說明商業用途須事先安排。2026-09-24 產品負責人已明確告知「私密商品照作為後端儲存」獲 Flickr 許可；此處記錄的是負責人的確認，並非本專案已檢視書面許可內容。請將正式許可證明留存在私有法務／合規紀錄，不要提交至公開 repo。用途、流量或帳號條件若超出許可範圍，停止切換。

1. Flickr OAuth 必須是 `delete` 權限；`write` 只可上傳、不能永久刪除。2026-09-24 經負責人明確同意後，在 twopiggyhavefun 帳號授權現有 Whishlist 連結；隨後 production OAuth token 的 API 查核回報 `delete` 且帳號 ID 相符。沒有把 OAuth 值寫入文件或更換正式 token。
2. 以該 token 測試私密上傳、簽名讀取尺寸、API 代理讀取、刪除遠端原檔與重試；確認無孤兒檔。合成照片直接 Flickr 上傳、原圖／縮圖讀取、刪除與刪後查詢已通過；production API 在 pilot 與全帳號切換後都通過代理讀取、匿名拒讀與遠端刪除。Android APP 測試帳號也完成相簿選圖、上傳、MiniMax 回寫、縮圖顯示與測試願望刪除。iOS 本輪尚未做實際 UI 驗收。
3. 確保實際商業／拍賣用途持續在 Flickr 授權範圍內；既有網頁程式用 Flickr 本身不構成許可證據。
4. 先在隔離資料庫和內部測試帳號驗證，再部署並觀察；不要把舊 Railway 目錄刪除。Flickr 失敗不能以假成功或遺失照片回覆。

## MiniMax Code 單一測試帳號

Railway 設 `MINIMAX_PILOT_USER_ID`（數字 User ID）與 `WISHLIST_MINIMAX_CALLBACK_TOKEN`（隨機 32 字元以上）；Mac 安全環境設相同 callback token，執行 `node tools/minimax-vision-bridge/poller.mjs`。Mac 主動領取待辨識的 APP 照片任務並回寫結果，不需家用電腦開放對外 webhook。只有測試帳號受此設定影響，原 EClaw worker 略過該帳號的 APP 照片。Mac 離線時任務持續留在 Railway；租約到期才允許重領。回寫只接受有效租約，並要求可見證據與最低可信度；沒有圖片可見的價格不寫入。

Mac 可用 `tools/minimax-vision-bridge/run-poller.sh` 從登入鑰匙圈讀取 callback token 後啟動長輪詢；工作器只保留單一行程。macOS 可能阻止登入代理讀取 Desktop 上的原始碼，因此背景代理應執行安裝在 `~/Library/Application Support/WishlistMiniMax` 的 `run-poller.sh`、`poller.mjs`、`server.mjs` 副本；每次修改工作器程式碼後需同步這三個檔案並重啟代理。Mac 關機、睡眠或 MiniMax Code 登入失效時，新任務留在雲端排隊，不會自動辨識；恢復後工作器重領。價格僅在圖片文字可讀、且可歸屬於主要品項時回填，不產生二手市場估價。辨識結果並非 100% 保證，涉及具體型號／版本時仍應讓使用者確認。

這是內部測試方案，未驗證 MiniMax Code 個人方案可合法供公開用戶使用。正式擴大前須確認服務條款、費用、隱私告知與穩定執行方式。所有 token 僅在環境中取得，不寫入 repo 或畫面證據。

## 商品連續拍照 AI 草稿（2026-09-24 開發中）

- 每張上傳照片只建立一筆私有 AI 草稿；相機連續拍攝或相簿批次選取不會自動發布商品。草稿包含可見事實、待確認項與可能的二手價格區間，價格明示不是即時成交行情。賣家確認售價、商品狀況、共用行政區與公開同意後才逐件提交刊登；前次不確定的刊登使用原 idempotency key 恢復。
- `MINIMAX_LISTING_AI_ENABLED=1` 是獨立開關，預設關閉。驗收期再設 `MINIMAX_LISTING_AI_PILOT_USER_ID` 限定單一測試帳號；未設定 pilot ID 代表所有帳號，**不得**在未確認 MiniMax 公開服務授權、用量與隱私告知前移除 pilot ID。先同步並啟動向後相容的本地 poller，再部署後端與 migration，最後才可開 pilot 開關。
- 本地 worker 只在處理中的租約期間帶 callback token 讀取那張私有商品照片；匿名、其他使用者與 worker 讀取非處理中照片均為 404。失敗或低信心輸出維持私有草稿，不能被當成已上架商品。
- 2026-09-24 的無個資合成橘色檯燈／藍色杯子直接 MiniMax Code 測試均未取得 Connector 圖片描述結果，不能宣稱商品草稿提示詞已通過品質驗收。外部命令逾時例外已改為固定錯誤碼，避免把短效簽名圖片網址與提示詞寫入診斷；本機 LaunchAgent 的 `poller.mjs`／`server.mjs` 副本已同步並重新啟動，相關安全測試 6／6 通過。待 Connector 可穩定回傳後，仍須比對圖片事實、磨損、類別、待確認事項與保守價格，再進行測試帳號的完整佇列驗收。
- 2026-09-25 直接用同兩張合成照再測：檯燈在不附提示詞時 67 秒取得圖片描述；短版 JSON 提示詞 37 秒回傳，顯示原圖可讀，先前長提示詞／90 秒呼叫的失敗不能歸因於照片 URL。正式 `recognizeListingImage` 改用簡短繁中草稿提示與僅限商品草稿的 150 秒上限後，以真 Connector、真臨時圖片上傳和實際解析器連續通過 **2／2**：橘燈約 36 秒、藍杯約 40 秒。兩件均辨出品類、顏色、可見磨損與賣家須確認的功能／內部狀況；未見可信價格資料，兩件價格皆為 `null`，不捏造市場行情。這僅是無個資合成圖片的本機辨識驗收，**尚未**證明 Railway 私密圖片授權讀取、資料庫回寫、真實賣家照片或 APP 完整佇列。解析器補上單一字串待確認事項的保留；連線中斷、未知錯誤及本機橋接回覆採固定安全錯誤碼，避免日誌／回覆外洩短效圖片 URL。本機 LaunchAgent 安裝副本已比對 SHA-256 相同並重啟，行程運行中；正式 pilot 開關仍關閉。
- 2026-09-25 隨後以隔離 PostgreSQL、合成帳號及本機私有媒體儲存完成更長的真 HTTP 路徑：兩張照片上傳、賣家 AI 排隊、worker 只在租約處理中讀圖、MiniMax Connector 真辨識、callback 寫入兩筆私有草稿、賣家讀取；匿名與其他帳號無法讀取，callback 後 worker 也不能再讀。首次擴至賣家確認時發現公開刊登竟要求填品牌，與 AI 對無品牌商品保留 `null` 相衝突；已將品牌改為可省略且 APP 地圖接受、顯示未標示品牌。修正後重新驗收：確認前公開清單 **0**、賣家自行填售價／地區並確認橘燈後公開清單 **1**、藍杯仍私有，最後 User／ListingMedia／Listing／清理任務計數皆 **0**。既有未啟用 AI 的原生 QA 基線另通過 76 個真 HTTP 檢查。此證據仍是本機儲存與合成照片，**不證明**正式 Flickr／Railway、雙平台原生 UI 或商店分發的商品 AI 流程。
- 同日再針對參考價測試短版提示詞：橘燈與杯子均由真 Connector 給出保守二手區間；要求未測試電器納入故障風險後，單獨測試橘燈為 NT$100–500、缺角杯為 NT$10–50，理由明示「僅依照片粗估，非即時行情」。將此提示詞接入正式辨識函式後，重跑上述隔離端到端路徑，兩件都產生通過解析的**非空參考區間**，且賣家自行設定的實際售價仍獨立於 AI 建議，確認前絕不公開。APP 不再把 `brand:null` 改寫成「未確認」假品牌；無可靠估價時仍保留 `null` 並要求賣家自定價格。模型估價沒有即時成交資料，不保證準確，不能視為正式市場價格驗收。本機 LaunchAgent 副本已同步並重啟，正式 pilot 仍未開放。
- 雙北地圖目前沒有在售商品。外部來源必須先有真實商品、授權或投稿、原始連結、可核對的所在行政區與失效時間；AI 可幫忙整理及草擬，不能憑空產生賣家、庫存或面交地點。Facebook／LINE 不做未授權批量擷取。
