# Wishlist.ai Regression Test Plan

### 手動商品草稿與公開刊登（Web 2.0.609）

- `/sell` 的「手動填寫／儲存商品草稿」進入 `/sell/manual`；未登入時保留登入返回路徑。
- 使用 production build 實際查看桌面與手機的「確認並公開刊登」，核對可見文字與深色底、儲存草稿白底；同一按鈕不可同時套用 `bg-white` 與深色背景。DOM 標籤存在不代表文字可見。
- 只有名稱、零照片、空售價／說明／地點、未勾公開同意，也能建立後台 `Listing DRAFT`，在「我的商品 → 草稿」查看；未驗證帳號仍可儲存。公開地圖／匿名商品頁／其他帳號不可看到草稿。
- 填了選填欄位時需驗證格式；零元贈送、品牌、新舊、分類、交付方式、議價、台灣失效日期、最多八張自有手動照片皆傳原生共用 API。精確座標在傳輸／安全紀錄前轉為約兩公里網格。
- 私人照片上傳保留 `MANUAL_PHOTO` 用途與原照片回執；未知結果先查核，重選僅可重試同一檔案。取消勾選不刪除照片。
- 草稿使用獨立、加密、帳號／API 範圍的 v2 DRAFT 紀錄；v1 公開刊登紀錄仍拒絕 `publish:false`。原 ID、完整內容與雜湊不可換成新的公開操作。
- 中斷後重開只 GET 原回執；404 不代表可自動重送。明確重試沿用原內容／ID；安全取消只取消未完成操作，已建立的商品／照片不刪除。
- 已確認結果仍須讀取後清理完全相符的本機紀錄；CAS 失敗、保存不可用、帳號切換、外人回執皆阻擋新增與跨帳號讀取。公開按鈕維持說明、售價、照片、地點、交付與公開同意的完整驗證。
- 自動化：`manualListing.test.ts`、`ManualListingPage.test.tsx`、共用 Web／Server 草稿雜湊 fixtures、真 HTTP／獨立 PostgreSQL 的 `listingCreation.integration.ts`。正式 APP 的 MyListings 沒有既有 DRAFT 發布按鈕，不因舊 API 存在而新增該流程。

> **版本**: v1.0  
> **日期**: 2026-01-01  
> **目的**: 進版前驗證系統穩定性

---

## 📋 測試概覽

| 類別 | 測試數量 | 預估時間 |
|------|----------|----------|
| **Quick Smoke Test** | 5 項 | 2 分鐘 |
| **Core Functionality** | 15 項 | 10 分鐘 |
| **Full Regression** | 30+ 項 | 30 分鐘 |

---

## 🚀 Quick Smoke Test (進版前必測)

每次部署前**必須**通過以下 5 項測試：

### 1. 應用程式啟動
```bash
# 前端建置
cd client && npm run build

# 後端啟動
cd server && npm run dev
```
✅ **Pass Criteria**: 無錯誤輸出，服務正常啟動

### 2. 登入流程
- [ ] 開啟首頁 → 點擊登入
- [ ] 輸入測試帳號 → 成功登入
- [ ] Header 顯示使用者名稱/頭像

### 3. 願望清單顯示
- [ ] 登入後能看到願望清單列表
- [ ] 點擊願望清單可進入詳細頁

### 4. 新增願望 (AI 功能)
- [ ] 點擊 "+" 按鈕
- [ ] 使用 Smart Input 輸入商品名稱
- [ ] AI 正確回傳商品資訊

### 5. 基本 API 健康檢查
```bash
curl https://[YOUR_RAILWAY_URL]/api/health
```
✅ **Pass Criteria**: 回傳 200 OK

---

## 🔧 Unit Tests (自動化)

### 執行指令
```bash
cd client
npm run test
```

### 現有測試
| 檔案 | 說明 |
|------|------|
| `client/src/App.test.tsx` | App 元件 Smoke Test |

### 待新增測試
- [ ] `auth.test.ts` - 登入/註冊邏輯
- [ ] `wishlist.test.ts` - 願望清單 CRUD
- [ ] `ai.test.ts` - AI 辨識結果解析

---

## 🧪 Core Functionality Tests

### A. 認證模組 (Auth)

| ID | 測試項目 | 步驟 | 預期結果 |
|----|----------|------|----------|
| A1 | 註冊新帳號 | 填寫手機+密碼 → 送出 | 成功建立帳號並登入 |
| A2 | 登入 | 輸入正確帳密 | 成功登入，跳轉首頁 |
| A3 | 登入失敗 | 輸入錯誤密碼 | 顯示錯誤訊息 |
| A4 | 登出 | 設定頁 → 登出 | 清除 session，跳轉登入頁 |
| A5 | 忘記密碼 | 輸入手機 → OTP → 新密碼 | 密碼重設成功 |

### B. 願望清單模組 (Wishlist)

| ID | 測試項目 | 步驟 | 預期結果 |
|----|----------|------|----------|
| B1 | 新增願望清單 | Dashboard → 新增 | 新清單出現 |
| B2 | 編輯清單名稱 | 點擊編輯 → 修改 → 儲存 | 名稱更新 |
| B3 | 刪除清單 | 長按/右鍵 → 刪除 → 確認 | 清單消失 |
| B4 | 新增願望項目 | + → 輸入資訊 → 儲存 | 項目出現在清單中 |
| B5 | 刪除願望項目 | 滑動/點擊刪除 | 項目消失 |
| B6 | 編輯願望項目 | 點擊項目 → 修改 → 儲存 | 資訊更新 |

### C. AI 功能模組

| ID | 測試項目 | 步驟 | 預期結果 |
|----|----------|------|----------|
| C1 | 圖片辨識 | 上傳商品截圖 | AI 回傳名稱/價格/連結 |
| C2 | Smart Input | 輸入 "Apple AirPods" | AI 搜尋並回傳商品資訊 |
| C3 | 貼上連結 | 貼上商品 URL | 自動擷取商品資訊 |

### D. 社群功能模組 (Social)

| ID | 測試項目 | 步驟 | 預期結果 |
|----|----------|------|----------|
| D1 | 搜尋使用者 | 輸入名稱 → 搜尋 | 顯示符合的使用者 |
| D2 | 追蹤使用者 | 點擊追蹤按鈕 | 按鈕變為已追蹤 |
| D3 | 取消追蹤 | 點擊已追蹤 → 取消 | 按鈕變回追蹤 |
| D4 | 查看追蹤者清單 | Social 頁 → 追蹤者 | 顯示追蹤者列表 |
| D5 | 查看朋友願望清單 | 點擊朋友 → 願望清單 | 顯示公開清單 |

### E. 設定模組 (Settings)

| ID | 測試項目 | 步驟 | 預期結果 |
|----|----------|------|----------|
| E1 | 更換頭像 | 上傳新圖片 | 頭像更新 |
| E2 | 修改密碼 | 舊密碼 → 新密碼 → 確認 | 密碼更新成功 |
| E3 | 語言切換 | 選擇不同語言 | UI 語言切換 |

---

## 🌐 API Regression Tests

### 執行指令（如有）
```bash
cd server
npm run test
```

### API Endpoints 檢查清單

| 路由 | Method | Endpoint | 測試項目 |
|------|--------|----------|----------|
| Auth | POST | `/api/auth/register` | 註冊 |
| Auth | POST | `/api/auth/login` | 登入 |
| Wishlist | GET | `/api/wishlists` | 取得清單 |
| Wishlist | POST | `/api/wishlists` | 新增清單 |
| Item | POST | `/api/items` | 新增項目 |
| AI | POST | `/api/ai/analyze` | 圖片分析 |
| Social | GET | `/api/social/search` | 搜尋使用者 |
| Social | POST | `/api/social/follow` | 追蹤 |
| User | GET | `/api/user/profile` | 取得個人資料 |
| Payment | POST | `/api/payment/subscribe` | 訂閱 |

---

### F. Bug Regression Tests (已修復問題驗證)

| ID | 測試項目 | 觸發條件/步驟 | 預期結果 |
|----|----------|--------------|----------|
| F1 | `Shopee Soft Block` 處理 | 輸入 Shopee 連結 (觸發 Robot Check) | Server 偵測 "Soft block detected"，自動切換至 AI Fallback |
| F2 | `Smart Search` (Shopee IDs) | URL 為 `shopee.tw/product/123/456` | 系統辨識 ID 並執行 `site:shopee.tw "123" "456"` 搜尋 |
| F3 | `Gemini Grounding` Fallback | Google Custom Search 失敗/無結果 | AI 自動使用內建 `googleSearch` 工具查出正確商品 (如遊戲名稱) |
| F4 | `Resend API` 缺失啟動 | 移除 `.env` 中的 `RESEND_API_KEY` 並啟動 Server | Server 正常啟動不崩潰 (使用 Mock Key) |
| F5 | `Gemini Model` 版本確認 | 執行 AI 分析 | 無 `404 Not Found` 錯誤 (使用 `gemini-1.5-flash-001`) |
| F6 | `TS Error` (GoogleSearch) | 執行 `npm run dev` (Server) | 無 `TS2353` 編譯錯誤 (使用 `@ts-ignore` 或正確型別) |
| F7 | `Social Follow` | 點擊追蹤使用者 | API 回傳 200 OK (非 500)，資料庫新增關聯 |
| F8 | `AI Image Double Fallback` | 網址無法直接抓圖時 (如 Shopee ID) | 觸發 "Secondary Image Search"，確保顯示有效圖片非破圖(X) |
| F9 | `Static File Serving` | 前端 (5173) 讀取後端 (8000) 圖片 | 圖片正常顯示，無 403 Forbidden 或 CORP 錯誤 (Helmet Config Correct) |
| F10 | `E-commerce Crawler Resilience` | 測試 Momo, PChome, Yahoo, Books 爬蟲 | 全數通過 (Status 200, Content Loaded)，無阻擋 |
| F11 | `Google CSE ID 設定` | 執行 `searchGoogleWeb("momo購物網")` | 返回 `totalResults > 0`，非 0 結果 (確保 CSE 設定為搜尋整個網路) |
| F12 | `Momo 商品名稱解析` | 添加 Momo URL `i_code=14244558` | 商品名顯示完整名稱（如 Nintendo Switch），非「待確認商品」|
| F13 | `Proactive Smart Search` | 使用 Momo/PChome/Shopee URL | 系統執行 Google CSE 搜尋後再傳給 AI，有 `Got search context` log |
| F14 | `Learn More 滾動` | 首頁點擊 "了解更多" 按鈕 | 頁面平滑滾動到 Feature Preview 區域 |
| F15 | `i18n 首頁標題` | 變更瀏覽器語系為 en-US | 首頁標題顯示 "Organize your desires." 而非中文 |
| F16 | `i18n Feature Cards` | 使用 zh-TW 語系 | 4 張功能卡片標題與描述顯示中文 |
| F17 | `Locale Detection` | 檢查 `navigator.language` | 系統正確偵測並切換語系 (zh/en) |


---

## 📱 Cross-Platform Tests (PWA)

| 平台 | 測試項目 |
|------|----------|
| **Desktop (Chrome)** | 安裝 PWA、離線功能 |
| **Android (Chrome)** | 加到主畫面、推播通知 |
| **iOS (Safari)** | 加到主畫面、全螢幕模式 |

---

## 🚨 進版前 Checklist

```
[ ] 1. 執行 Quick Smoke Test (5 項全過)
[ ] 2. 執行 Unit Tests: `cd client && npm run test`
[ ] 3. 建置成功: `cd client && npm run build`
[ ] 4. 更新版本號: `client/package.json`
[ ] 5. Git commit & push
[ ] 6. 到 Railway 確認部署成功
[ ] 7. 在 Production 執行 Smoke Test
```

---

## 📊 測試報告模板

```markdown
# Regression Test Report
- **日期**: YYYY-MM-DD
- **版本**: v0.0.XX
- **測試者**: [Name]

## 測試結果
| 類別 | 通過 | 失敗 | 略過 |
|------|------|------|------|
| Quick Smoke | X/5 | X/5 | X/5 |
| Unit Tests | X/X | X/X | X/X |
| Core | X/15 | X/15 | X/15 |

## 失敗項目
| ID | 問題描述 | 嚴重程度 |
|----|----------|----------|
| XX | [描述] | High/Medium/Low |

## 結論
[ ] ✅ 可以部署
[ ] ⚠️ 有問題需修復
[ ] ❌ 不可部署
```


## 2026-10-02 來源線索限定發布
來源線索與商品/結帳分離，公開網址 `/source-leads?id=<UUID>`。座標指向公開公共地點，不代表現貨所在地；原始日期須近兩月且來源核對在48小時內。私有證據與聯絡路由不進公开 DTO。询问先保存，再逐次明確同意；無已核原賣家路由維持 WAITING_ROUTE，撤回不宣稱已送。
回滾：關閉 SOURCE_LEADS_PUBLIC_ENABLED 或回退應用版本，保留新增兩表與收件歷史；不刪除正式資料。既有外部商品公開開關維持關閉。手機舊版需另更新新圖層，網頁可獨立查看。


### Source contact original-operation recovery — v593

The original Explore → source detail → Chat flow encrypts the complete ASK/CONSENT body, original UUID and room in the existing account/API-scoped browser vault before posting. Withdrawal uses a separate immutable slot. Reopening and Refresh read the original owned inquiry and exact private action receipt; they never post. Explicit Retry original operation resends only the persisted body. Old session markers migrate as receipt-only identities; corrupt or unreadable storage blocks writes, retains owned history where readable, and offers explicit restoration. No plaintext fallback, access token or seller contact details are saved in this journal.

GET /source-leads/:id/inquiry/:roomId/actions/:requestId returns only the authenticated buyer’s exact operation and public inquiry projection, with private no-store caching. Unknown operations return null without allocation; mismatched ownership, room, lead or query parameters return 404. Read receipts remain available after withdrawal or rollout disablement. HTTP errors, absent/mismatched receipts, timeout or cleanup failure retain the original journal. CAS cleanup cannot erase another tab’s newer operation. Terminal confirmed cancellation fences late questions on the same owned room and resolves them as stopped, never accepted; CANCEL_REQUESTED and delivery review remain unresolved forwarding states. Reads and local-storage waits are bounded by 30 seconds, abort on departure, and respect the shared cooldown without automatic retry. All source contact/recovery controls follow Chinese/English and retain original product/question content.

Regression coverage includes unknown committed/uncommitted sends, reload and exact replay, later 401/429/409, encrypted scope isolation and erasure, corrupt legacy data, save/read/cleanup faults, stale cleanup, late logout responses and an unresponsive local read. Real isolated HTTP tests validate private receipt ownership and unchanged data on reads, including withdrawal and disabled sources. Formal UI/release evidence remains in docs/web-app-parity.md; automated coverage is not proof of native or formal mutation acceptance.

### Source inbox language and explicit read recovery — v596

The source inquiry inbox follows Chinese/English for its heading, loading/error/retry controls and all forwarding/withdrawal states; original item titles and questions remain unchanged. Reserved forwarding, withdrawal requests and delivery review are explicitly unconfirmed states. Reload source conversations and Retry source conversations restart the owned read from the first page without creating or replaying an inquiry. Failed refreshes retain previously verified history. Reads have a 30-second deadline, abort when leaving or changing accounts, reject repeated cursors and ignore departed-account results. Regular chat polling/reload remains independent. Regression checks cover each state, controlled read failure and explicit recovery, retained history, withdrawn-source fallback, malformed pagination, account departure and timeout.

### Web app installation lifecycle — v601

The root application retains a browser installation opportunity across routes. Only an explicit Install Now click invokes the one-use prompt; dismissal, rejected/invalid results and a 30-second timeout consume it and leave manual installation guidance. Pending installation blocks a Settings language reload. A fresh browser opportunity remains usable even if it arrives during an earlier prompt. Accepted means accepted by the browser, not proven installed: only appinstalled reports installation, and standalone display mode or Safari's standalone property identifies the current Web app window. Late outcomes cannot replace a newer installation report or timeout. Nothing is stored, sent to an account API, automatically retried or automatically reloaded by installation.

Desktop-class iPad Safari with touch uses Safari sharing instructions, including Open as Web App where shown; Android and desktop browsers retain menu guidance and ordinary website access when installation is unavailable. Regression checks cover cross-route capture, dismissal, repeated clicks, synchronous failure, rejection, malformed outcome, timeout, newer events, browser-menu installation, late results, standalone changes, Safari standalone and desktop-class iPad detection. Controlled browser events and UI evidence are distinguished from a real OS installation; native Safari/Android installation remains an independent acceptance item.

### Web installation artwork and built manifest — v604

The public manifest uses actual 192px and 512px PNG derivatives of the existing logo instead of declaring the 1024px logo at both sizes. Safari receives an explicit 180px Apple touch icon and app title. The manifest preserves Home start URL and root identity/scope, and uses the same theme color as the page. All three public icons are included in the generated precache; existing private-cache exclusions and installation lifecycle remain unchanged.

The existing postbuild worker gate now checks the actual built manifest, PNG signature/IHDR dimensions, Safari link, matching theme and public precache entries. Regression fixtures reject the old dimension mismatch, HTML fallback, missing/wrong-size Safari image, account/external/queried/traversing paths, native-store diversion, competing manifests and theme mismatch. PNG-header fixtures prove validation only; separately decode the real product files in the browser, read formal manifest/asset URLs after release, and retain independent native OS installation acceptance. Correct metadata and successful browser decoding do not prove installation or explain an absent browser installation prompt without its own diagnostic evidence.
