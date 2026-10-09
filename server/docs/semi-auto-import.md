# 半自動匯入：私人待審（管理 API 與本地準備工具）

入口沿用既有管理身分，不新增憑證：`/api/source-lead-admin/pending-imports`。

操作順序：
1. 管理者提供人工整理事實或賣家允許使用的 CSV/JSON；不抓來源、圖片或 Meta session。
2. `POST /`：`{text,format,base}` 建立工作。base 同時綁定 JSON 的 `libraryFileId/jsonVersion/sha256` 和 CSV 的 `csvLibraryFileId/csvVersion/csvSha256`。這些是呼叫端已核對的預期版本，不是服務偷偷查到的即時 Library 狀態。
3. `POST /:id/advance`：`{revision,base,batchSize:500}`；每次有界批次、持久化游標，成功才增加 revision。沿用管理端每分鐘30次限制。
4. `GET /:id?cursor=0&limit=100` 分頁查看逐列待審、錯誤、重複與價格／狀態差異。所有結果都不公開。
5. `POST /:id/review`：`{revision,base,decisions:[{id,contentHash,reviewRef,action}]}`；action 為 KEEP_PENDING 或 REJECT。這是綁定事實的人工查閱紀錄，不是賣家授權或上架批准。
6. `POST /:id/export`：`{revision,base}` 產出同一版本 CSV/JSON 與 SHA manifest。拒絕、歷史、錯誤及未核實紀錄保留，不冒充有效商品。
7. `POST /:id/cancel`：`{revision}` 保留已寫游標並停下。完成後不把既有匯出視為新操作批准。

欄位：sourceUrl、itemKey、title、price、currency、county、district、originalPostedAt、checkedAt、status、rightsRef。常用中文 CSV 標題會映射；JSON 支援 items 陣列，以及每帖 sourceUrl/originalPostedAt/checkedAt 下的多個 items。各品須有穩定原始 itemKey；沒有時以標題暫存指紋並標 STABLE_ITEM_KEY_REQUIRED，不拿標題指紋當可靠改名識別。相同 URL/key 保持穩定 ID，重複去重，價格或狀態不同留下 CONFLICT 和 proposed 供人工決策，不覆寫舊事實。

原發日期採現有台北時區兩曆月門檻；48小時來源查核獨立判定。未知、超期及未確認記錄留在私人待審，沒有自動重寫時間或 TTL。rightsRef 只是有引用的授權主張，仍須審核；ACTIVE 只是輸入狀態，不等於今日真實在售。所有輸出維持 public=false、qualifiedSupplyAdded=0。

## 安全與保存

管理驗證在16MiB專用上傳 parser之前，其他公開 API 保留原1MiB上限。每工作最多10,000品，每輪最多500品。既有私人 volume 的 `.source-sync-receipts/.pending-import` 以0700目錄/0600檔案儲存；父目錄不符合私人權限、owner或為symlink時停下，不轉存公開路徑。無 DB migration、新 key、圖片下載、排程或正式母檔修改。

游標 journal 才是恢復依據，記憶體快取只保留一個有界工作，revision或輸入 stat 改變即重讀。writer.lock 排他；程序硬中斷後不自動偷鎖。CLI lock-status 取得精確 hash；recover-lock 僅同 host 且確認原 PID 已不存在才解除，跨 host、活程序或未知狀態一律停下。CSV/JSON manifest只在兩份檔案均完成後建立，半成品只能在既有 bytes 完全相符時補齊。

## 本機 CLI

先在 server 執行既有 `tsc` 建置；明確提供0700私人資料夾，不自動建立新長期資料區。

`node scripts/pending-import.cjs create PRIVATE_DIR INPUT.csv csv BASE.json`

`node scripts/pending-import.cjs get PRIVATE_DIR JOB_ID`

`node scripts/pending-import.cjs advance PRIVATE_DIR JOB_ID REVISION BASE.json`

`node scripts/pending-import.cjs cancel PRIVATE_DIR JOB_ID REVISION`

`node scripts/pending-import.cjs export PRIVATE_DIR JOB_ID REVISION BASE.json`

`node scripts/pending-import.cjs lock-status PRIVATE_DIR`

`node scripts/pending-import.cjs recover-lock PRIVATE_DIR EXACT_OBSERVED_LOCK_SHA256`

## 55欄母檔映射與既有單一 writer 交接

`canonicalImportPair.ts` 已完成55欄映射、共享欄位／品質狀態／完整ID集合核對、before-item hash綁定及受審查增量準備。55欄來源是2026-10-09正常 Library文字read的CSV v25；JSON metadata為v28。渲染表的人工index不當原CSV欄。其後雲端以現行實際編譯 checkPair/readPairFresh 完整驗證133件／73帖／55欄；合法完整副本双SHA及讀取前後正常Library metadata均通過（2026-10-09 03:41–03:42 UTC，CSV v25／JSON v28）。此為唯讀相容性驗證，不是正式增量匯入或授權驗收。

1. 既有 writer 的合法只讀通道接入 `readPairFresh(base, reader)`。adapter只有metadata/bytes兩個唯讀函式：先核對兩個identity與版本，取得指定版本bytes，再重查兩個版本；任何過期、讀取中變動、bytes SHA、55欄、ID集合或共同事實不符即停止。
2. 使用待審export、manifest和綁定pending ID/hash/reviewRef、既有archive ID/before-item hash的decisions，呼叫 `prepareMotherIncrement`。只產出本地candidate JSON/CSV、increment及receipt，完全沒有Library或DB writer。相同事實再次提供會回NO_CHANGE，不新增history。
3. 更新私人既有商品只改已審閱的名稱/價格/幣別必要事實；保留ID、不相關欄位、UNKNOWN、原日期/座標/來源查核時間，新增完整before-facts及審閱歷史。若事實變更，舊查核的price_verified與independent_content_reviewed會失效，舊證據原樣留歷史；不拿舊查核為新價格背書。
4. 新品是PRIVATE_PENDING候選，UNKNOWN權利/庫存、public=false、不直接checkout、不補座標或新來源查核時間。人工提供的日期/checkedAt只是claim；來源時間和日期門檻仍須既有正式發布守門驗證。
5. CSV保留全55欄、所有未修改cell值；JSON保留原root/歷史、僅更新stored total。原品質summary/validation保留其歷史範圍，`semi_auto_import_snapshot`明示新候選沒有獨立來源查核、不增加合格供給。不得把舊品質summary視為整份新候選的即時驗收。
6. 既有唯一 writer 真正寫入前重新核對當前雙版本及hash；NO_CHANGE不要寫。正式Library的兩檔不具跨檔原子交易：`readObservedPair`先重查兩份當前metadata/bytes再重查版本，`reconcilePair`辨識before/after/partial/conflict，不自動重試或回滾。已有確定JSON成功但CSV失敗時，只能在同operation的確切當前base核對後由既有writer繼續；結果未知或他人新版本一律停止。
7. 完成後兩檔readback需同一increment的expected版本與SHA，`repeatIncrementStatus`確認已完成重複為零修改。只有明確核准恢復並讀回原bytes時，`restoredBase`才接受Library restore後的新版本作新base；舊批准/舊版本不會自動變成新操作。

可重現本地準備工具：

`node scripts/prepare-canonical-increment.cjs PENDING.json MANIFEST.json SNAPSHOT-DESCRIPTOR.json DECISIONS.json PRIVATE_OUTPUT_DIR`

descriptor僅是合法已取得本機副本的兩個identity/version/path。輸出明確標snapshotOnly=true、liveLibraryBytesVerified=false；不能當真正雲端即時核對。0700輸出下以0600存兩份candidate及increment，最後才建立ready manifest；同輸入重跑核對相同bytes，不覆寫衝突。

`node scripts/verify-canonical-preparation.cjs EMPTY_PRIVATE_TEST_DIR`

此測試產出合成驗收回執，覆蓋成對讀回、單檔失敗、重複及明確恢復；不是真實Library故障注入，不寫母檔。

本次沒有新增管理UI，沒有desktop/窄版畫面驗收需求，也沒有假稱 API 測試是畫面驗收。已完成真實母檔133筆唯讀相容性驗證；正式新API／volume驗收於部署後另行記錄，外部writer未執行正式增量。正式公開source payload仍需既有parseLead／照片與地點證據及單次job授權，不可直接把private母檔candidate送公開/import。

## 集中發布範圍與授權界線

本次共16個功能檔（另拆離候選準備不需要的媒體載入相依，保持原規則語意）；沒有新增dependency、DB schema/migration或client UI。既有五項三件維護修改原樣保留，不打包成新批准範圍。

Hank於2026-10-09 04:48:23 UTC核准本次16檔、必要version/changelog、單一PR／CI／合併／部署；發布仍須通過正常檢查，再以既有私人volume／管理身分及合成資料驗證新API與可恢復queue。這不批准寫真實Library母檔、正式商品或開外部公開；首次真實增量需當前合法raw副本、fresh雙版本核對與明確受審查batch，仍由既有單一writer執行。沒有新key、持續access或其他安全設定需求。

## Meta 官方可行性（2026-10-09，只讀研究）

Meta Groups API及相關權限自2024-04-22全版本移除，不能因舊版、社團管理者或瀏覽器登入而推定可恢復官方大量社團讀取。官方Marketplace Partnership/Seller/Item API是合資格合作夥伴的供給發布方向，不是任意台灣社團完整搜尋／再利用的證據。

官方來源：
- https://developers.facebook.com/docs/graph-api/changelog/version19.0/
- https://developers.facebook.com/docs/marketplace/partnerships/
- https://developers.facebook.com/docs/marketplace/partnerships/itemAPI/

因此此版先用人工提供事實／賣家允許的CSV/JSON。Muse或Custom Connector仍未核台灣範圍、社團搜尋、再利用授權與既有連線，未實接。沒有繞過403、登入、風控或安全阻擋。
