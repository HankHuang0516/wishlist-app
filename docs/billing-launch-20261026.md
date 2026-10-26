# 付費方案分平台開放

Hank 於2026-10-26直接要求「現在開放」。沿用已討論的三個商品：

- `wishlist_premium_monthly`：尊榮月訂閱，台灣NT$90/月；尊榮代問權益、每月100次行銷額度。
- `wishlist_marketing_10`：10次永久行銷額度，基準US$1，非訂閱。
- `wishlist_sponsor_90`：純贊助，台灣NT$90/次，不含尊榮或行銷額度。

實際購買金額及幣別必須來自商店，不得使用客戶端金額核發權益。免費代問每週3次維持不變。

## 獨立開放控制

既有`APPLE_BILLING_ENABLED`／`GOOGLE_BILLING_ENABLED`仍控制收據核對能力，不應為關閉新購買而關閉既有交易的恢復與核對。

新購買必須先符合既有平台憑證及全域環境開關，再檢查可選的平台環境開關：

| 平台 | 正式新購買 | 測試新購買 |
| --- | --- | --- |
| Apple | `APPLE_BILLING_PRODUCTION_ENABLED` | `APPLE_BILLING_SANDBOX_ENABLED` |
| Google | `GOOGLE_BILLING_PRODUCTION_ENABLED` | `GOOGLE_BILLING_SANDBOX_ENABLED` |

全域`BILLING_PRODUCTION_ENABLED`或`BILLING_SANDBOX_ENABLED`不是`1`時，個別平台不能開放。平台環境開關省略時保留既有全域行為；有設定時僅`1`視為開啟。Sandbox仍僅限`BILLING_SANDBOX_USER_IDS`的帳號，不影響一般正式帳號。

## 本輪商店準備

Google現有monthly方案原為DRAFT，已依本次授權啟用；補建兩個單次商品。自動換算曾把台灣贊助轉成NT$94，啟用前已精確修正回NT$90；行銷方案美國價格也精確保留US$1。其他地區使用Google換算價格，購買畫面依商店回傳。

Apple原有三個商品仍缺上架資料，且2.0.18(21)已IN_REVIEW。Apple正式新購買須獨立關閉，直到實際商品審查與可銷售狀態完成，不能將Google成功當作Apple上架成功。本輪不得把AI示意圖作為實際購買頁的審查截圖，也不能將模擬收據測試宣稱商店付款成功。

## 驗證與回復

驗證可用性矩陣、收據負向驗證、帳號／環境綁定、重複入帳、配額及既有權益路徑。原退款／續訂由商店核對及背景reconciliation維持。關閉新購買時設定平台環境開關`0`，保留核對憑證與帳本；不撤銷既有權益或刪除交易。

正式環境需重新登入或在「我的→贊助與升級」按「重新核對權益」後取得最新availability，再進入「查看商店價格與購買」。商品仍須由原平台顯示金額並讓使用者最後確認，開放本身不會代使用者付款。

本輪程式變更只新增後台分平台開關及其測試；UI示意稿另存Design/billing-ui-20261026，尚未混入既有iOS21或Android39包體。
