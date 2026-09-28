# Wishlist.ai v2 單頁 UI/UX 審查資料

`uiux-v2-home-match-multiple.json`、`uiux-v2-chat-meetup.json`、`uiux-v2-explore-map-default.json` 與 `uiux-v2-my-listings-active-card.json` 分別是「首頁一個願望有多件吻合／預設收合」、「聊天／面交提議中第 1 版」、「探索地圖已載入且選取單件商品」及「我的商品在售單件卡片未展開」的固定 100 分檢查表。每份只檢查**一種畫面狀態**，不能代表該頁的空白、錯誤、封鎖、篩選、群聚、編輯展開、行銷入口等其他狀態，更不能代表五分頁、雙平台或商店發布通過。其他必測狀態仍須各自建立固定表與基準。

使用 `node mobile/scripts/uiux-acceptance-score.cjs /absolute/review-manifest.json` 計算。Manifest 需有：

- `schemaVersion: 1`、固定的 `screen` 與精確 `context.screenState`：首頁多件收合為 `home-match-multiple`／`multiple-matches-one-wish-collapsed`，聊天為 `chat-meetup`／`meetup-proposed-v1`，探索為 `explore-map-default`／`loaded-with-selected-listing`，我的商品單件未展開卡為 `my-listings-active-card`／`active-one-item-card-collapsed`。`items` 須與該固定表 ID 一一對應，不能省略或改權重；不可用單一狀態截圖聲稱其他狀態通過。
- `baseline.image`、`baseline.designReference`、`baseline.fixture`、`baseline.approval.evidence`；每個檔案用絕對 `path` 與真實 `sha256`。首頁與探索核准稿來源須是 `wishlist-uiux-buyer-v2-20260927.png`，聊天須是 `wishlist-uiux-social-billing-v2-20260927.png`，我的商品須是 `wishlist-uiux-seller-v2-20260927.png`；核准宣告須是 `decision: "approved"`、`reviewer: "Hank"` 並有可查證的批准證據。不得把實作截圖改名當基準。
- `candidate.image`、`candidate.fixture`、`candidate.build`；建置須標示 `type: "release-equivalent"` 並提供實際檔案及 SHA-256。基準與候選的固定資料檔雜湊須相同，兩張截圖須為不同檔案、相同 PNG 畫布。
- 兩側 `context` 必須完全一致：`platform`、`deviceModel`、`osVersion`、`locale`、`timeZone`、`colorScheme`、`fontScale`、`fixtureId`、`screenState`、`scrollState`、`keyboardState`。iOS 與 Android 各自建立基準，不跨平台直接像素比較。
- 每個 `item` 須有 `id`、`result`（`pass`／`fail`）、`reviewer`、`note` 與至少一份雜湊核對的 `evidence`。標示通過的幾何項另須填入 contract 所列 `requiredMetrics`，每筆有 `id`、`baselinePt`、`candidatePt`、`tolerancePt`（0–4）；差值超過容差時工具會改判失敗。

工具會對缺基準、不同裝置／資料／狀態、未列入固定表的畫面狀態、缺證據、未量測、同圖自比及雜湊不符拒絕計分；失敗項不能靠另一項高分抵銷關鍵門檻。`state-candidate-pass` 只表示**這一個畫面狀態的申報證據符合機器可檢條件**；工具無法獨立確認 Hank 批准的真偽、人工判斷的正確性、Release 建置是否真與正式版等效，也無法代替 VoiceOver／TalkBack 實際操作。最後仍需逐狀態人工複核、雙平台完整矩陣及發布前獨立安全／付款驗收。

目前沒有 Hank 核准的同裝置／同內容逐頁基準或完整 Release 等效證據，因此**尚未建立正式 manifest，沒有合法 99% 分數，也不應填入假的通過值**。先用 `node mobile/scripts/test-uiux-acceptance-score.cjs` 驗證拒絕與評分規則；其產生的合成檔案只存在測試暫存區，不是產品畫面或人員批准。

## 全 APP 覆蓋與總放行閘門

`uiux-v2-required-coverage.json` 固定了七個群組、59 種必測畫面狀態；iOS 與 Android 各一份，共 **118 項狀態審查**。另有 **16 項跨頁門檻**，包含 Release 等效來源、同資料／同狀態、關鍵互動、私人照片、VoiceOver／TalkBack、Android 320×640、大字級、長中文標題、缺圖、冷啟動與崩潰、測試／建置、缺陷與付款安全、Hank 最終視覺確認。此矩陣雜湊固定在 `uiux-acceptance-coverage.cjs`；若範圍要改，必須明確修改兩者並審查，不能靜默刪狀態來提高覆蓋率。

執行 `node mobile/scripts/uiux-acceptance-coverage.cjs` 可唯讀查看目前的覆蓋摘要；可選傳入一個絕對路徑作為審查資料夾。當某狀態已有獨立固定 100 分表時，審查 manifest 須放在 `<資料夾>/ios/<狀態 ID>.json` 或 `<資料夾>/android/<狀態 ID>.json`，並由單狀態計分器核對正確 screen、state、平台、圖片、資料與建置雜湊。尚無固定表的狀態標為 `missing-contract`，不得藉由自行放置 JSON 充數。跨頁門檻收據置於 `<資料夾>/gates/<門檻 ID>.json`，須有 `schemaVersion:1`、相同 `id`、`result`、`reviewer`、`note` 與至少一份絕對路徑加 SHA-256 的 `evidence`；Hank 最終視覺確認收據的 reviewer 必須為 `Hank`。

只要任何狀態缺表、缺審定基準、未達單狀態 99%、關鍵項失敗，或任何跨頁門檻缺收據／失敗，平台總分保持 `null`、整體為 `incomplete`。即使機器條件全滿，也只回 `candidate-ready-for-manual-audit`，**不會自動宣稱 99% 已由 Hank 核准或可發布**；仍需人工核對批准真偽、Release 等效、輔助操作與報告。若未來啟用平台購買，必須新增實際沙盒付款狀態矩陣，不能以目前的「未開放購買」狀態取代。

目前只有首頁多件收合、聊天提議中、探索已選單件與我的商品未展開在售卡四份固定表，且四者均缺 Hank 核准的同畫布基準與 Release 等效審查 manifest。因此目前工具如實輸出 **0/118 狀態、0/16 跨頁門檻通過，沒有平台總分**。用 `node mobile/scripts/test-uiux-acceptance-coverage.cjs` 驗證七項覆蓋／拒絕測試；測試中的假審查資料不能當產品證據。
