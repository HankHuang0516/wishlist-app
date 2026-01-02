# Wishlist.ai Regression Test Plan

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
