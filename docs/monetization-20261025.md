# 三種營利與每週代問 — 2026-10-25

Hank 已確認：未訂閱者**每週**重新取得3次代問；純贊助只有NT$90一檔。週界線採台灣時間每週一00:00，不累積。新一輪明確授權收件計次，修正同輪、讀取、撤回及相同UUID重試不重複扣次。退款／續訂／外部收款均不是這個免費額度的證明。

|商品識別碼|方案|基準價格|權益|
|---|---|---|---|
|wishlist_sponsor_90|單次贊助|NT$90|無尊榮、無行銷額度|
|wishlist_premium_monthly|按月自動續訂|NT$90／月|尊榮代問、每月100次行銷|
|wishlist_marketing_10|行銷加值|US$1|10次永久行銷額度|

其他地區依商店價格。舊願望容量與會員標記保留，但不作為本批新付費權益的驗單證明。

## 實作與資料

- `/payment/benefits`：經本人認證的週額度、商店綁定及可購買狀態，private/no-store。
- `/payment/verify`：只接受平台、商品與收據；不接受用戶指定金額／權益。Apple使用官方驗簽程式庫與Store Server API；Google使用Developer API核對帳號、付款、環境、商品與實際訂單金額。
- Apple appAccountToken與Google obfuscatedAccountId綁定同一Wishlist帳號。交易雜湊唯一，不可換帳號領取；帳號刪除清除加密驗單憑證與帳號綁定，保留不能重新領取的交易墓碑。
- Sandbox只授予`BILLING_SANDBOX_USER_IDS`明列帳號的隔離測試權益。正式帳號不接受測試交易。
- 新權益只依驗單帳本；商店狀態過期且無法重新核對時保持未知，不能用舊額度繼續扣次。背景worker及讀取時重新核對續訂／撤銷，均不啟動扣款。
- 行銷兩個建立入口共用尊榮月額100及永久額度。單筆job最多扣1個永久額度；FAILED可退一次，刪除或缺失job本身不視為失敗，不退額。免費調整仍依原規則。
- 既有`/pay`與舊取消／模擬訂閱入口維持停用。它們不是正式收款的替代入口。

## 尚未正式收款：必要上線工作

這批程式與商店草稿**不等於已完成真實金流E2E／商店審核**。付費啟用旗標預設關閉。

1. 網站：目前只有TapPay partner設定，沒有正式Merchant ID／正式前端SDK設定。需先完成商家開通與定期扣款配置，再實作並驗收正式網站checkout；不把原sandbox程式直接開放。
2. Android：新包已配置expo-iap及`com.android.vending.BILLING`；必須以新versionCode上傳後重試兩個一次性商品。月訂閱草稿已建立，尚未啟用base plan。Google license tester應使用測試付款方式，internal track本身不保證免扣款。
3. Apple：三個SKU與基準價格／雙語版本資料已建立；仍需新原生購買畫面實測、真實審查截圖、商品可用地區與審核。不可用舊iOS19二進位／錄影冒充本功能驗收。
4. 伺服器：以既有安全憑證參照注入Store Server及Google Play驗單設定、32-byte `BILLING_RECEIPT_KEY`；Sandbox先限定測試帳號。完成新購買、重啟恢復、取消、退款、跨帳號拒絕及無網路查核後才開正式旗標。
5. 網頁每週代問功能可獨立部署；APP必須透過新原生包發佈。地圖Golden14四平台各85%門檻仍由既有發布對話持續驗收，不以本帳務工作取代。

## 外部設定收據

私人設定與CLI回執：`/Volumes/codex_2T/codex_project/Wishlist/Design/monetization-20261025/`。此處不得存放金鑰值。

Apple App 6468950847，群組22512749；贊助6826857451、加值6826857315、月訂閱6826857742。

Google package沿用原`com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1`，未建立替代App。

官方依據：[Apple Server Library](https://github.com/apple/app-store-server-library-node)、[Google Billing permission](https://support.google.com/googleplay/android-developer/answer/1153481)、[Google實際訂單金額](https://developers.google.com/android-publisher/api-ref/rest/v3/orders)。

H圖層與構圖未修改；網站2.0.817沿用2.0.754既有驗收，沒有重新目視驗收。
