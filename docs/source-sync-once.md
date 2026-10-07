# 受限的單次來源同步工具

本次僅部署工具與驗證私人回執，不匯入商品。`server/scripts/source-sync-approved-jobs.cjs` 必須維持空清單；沒有已核准 job 時，CLI 在讀取輸入、憑證或發出 HTTP 前停止。沒有公開執行入口、排程、新金鑰或資料表變更。

日後每次匯入須另取得精確單次批准，並經程式審查固定 jobId、時間窗、Library 身分與版本、archive/payload 原 bytes SHA256、來源 ID/URL/原查核時間及逐件 hash。外部檔案不能自行取得授權。

`node server/scripts/source-sync-once.cjs APPROVED_JOB_ID ARCHIVE_PATH PAYLOAD_PATH`

CLI 僅在原服務內使用既有 ADMIN_API_KEY 與 PORT，固定 loopback 原 import 路由；不印秘密、不讀 Keychain、不接受任意 host。沿用正式 parser 與管理認證，不改日期、權利、圖片及公開門檻。最多 1000 筆，每批最多 20 筆；所有 dry-run 通過後才寫入，各請求相隔 2.2 秒。任何未知寫入結果停止且不自動重送；成功亦需另做逐 ID 回讀，不增加合格供給。

## 本次私人回執驗證

固定目錄 `/app/server/public/uploads/.source-sync-receipts` 使用既有 uploads volume。僅目錄 0700、檔案 0600、擁有者與服務執行 UID 相同時可用。既有 uploads router 限制平面檔名、拒絕隱藏與子目錄，因此此目錄沒有公開讀取入口。不得把 receipt 放在可公開的平面檔案。

人工於已核准服務內執行 `node server/scripts/source-sync-receipt-check.cjs --initialize`，只建立本目錄與一筆非商品部署驗證 marker；不更改既有不安全目錄、不新增帳號或 ACL。後續 `--check` 唯讀回傳模式、UID、同磁碟及 marker SHA，不輸出目錄內容或秘密。跨容器部署後 marker SHA/createdAt 相同才能稱持久化實證；僅同程序重讀不足以證明。

外網需核对 `/uploads/.source-sync-receipts/deployment-verification.json`、編碼點及隱藏目錄入口均拒絕、正文不包含 marker。200 的 SPA HTML 也不能當作檔案讀取；記錄實際 HTTP 狀態和內容判定。

## 測試與回滾

CI 執行 `node --test scripts/source-sync-once.test.cjs scripts/source-sync-receipt-check.test.cjs`。全部合成資料、替身 transport、真 parser/管理 middleware 與本機檔案；不連 production 或讀取真憑證。

本次無 migration、無商品匯入、無開關變更。需要回滾時回復上一個已驗證的應用部署，保留 volume 中的私人目錄與回執；不可刪除回執解鎖重送。原 repo 其他 STOP 仍保持。
