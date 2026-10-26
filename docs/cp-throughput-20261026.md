# CP回填與多平台上架（2026-10-26）

每30分鐘的CP目標為完成75–100件非null分數，來源不足須報缺口，不以嘗試、原價、舊分數或INSUFFICIENT充數。維護組先處理需要即時回覆／下架的項目，CP是固定階段，取消剩餘6分鐘／6件／兩批限制。每批6件provider請求保持小批，連續微批直到目標；daily cap預設1000批、可用DISCOVERY_CP_DAILY_BATCH_CAP設定1–2000批，每次真正provider呼叫都在互斥交易保留DiscoveryCpAttempt，失敗重試也扣批次，快取／純讀回不扣；遷移保留舊run已知歷史下限，不冒稱舊重試已完整計數。6000件/日為理想上限，未代表實測達成率，失敗和缺證據仍會降低產量。評分快取維持24小時，資料／原價binding改變仍失效，原價14天、負面研究7天。

新增管理員capacity、100件候選／待評讀取與精確evaluation狀態，全部沿原管理員權限。評分讀取依公開商品key選出有效結果，不再讓最新240批擠掉仍有效舊分數。無新公開或私人資料欄位。

`server/scripts/cp-backfill-drain.cjs REVIEWED_MANIFEST STATE` 接續本輪證據清單，每件須有productKey、bindingHash、sourceCheckedAt與sourceEvidence。原頁ACTIVE實讀證據需1小時內；無原價／型號／品況先分流補資料，只有伺服器ready者進微批。呼叫前後逐件讀回，score數字才完成；ALREADY_SCORED不算新增、null不算成功。未知provider結果保存SUBMITTING/UNCONFIRMED，續跑先GET查核、不自動重送，來源查核過期也不能覆蓋該狀態；明確429存RATE_LIMITED及Retry-After，冷卻後重核來源/binding再繼續。provider回來後重新讀商品公開資格、版本事實及原價hash，變動拒絕CP_SOURCE_CHANGED，不計完成。節流低於原管理端30req/min；正式結果仍由伺服器驗證。

六個來源worker分別負責FB、Dcard、LINE、露天、蝦皮、旋轉拍賣。候選與原價證據可以分工整理；GUI操作必須一個UI持有人加simulator-manager短GUI租約，既有瀏覽身分與外送核准完整保留。worker沒有管理key，不做正式發布／Flickr／CP寫入；唯一主控統一跨平台去重、共用100件成功額度、原回執與發布驗收。來源資料不足／工具型號識別缺口先記待修，不猜型號與原價。

外接營運文件與排程：`fb-manual-pipeline-20261021/tools/scheduled-ops/`。本次以真實隔離PG/HTTP、遺失回覆恢復、100件17微批及跨240批保留評分測試驗證正確性，不等於已在正式站完成100件，也不把六平台文件準備冒稱實際CUA並行驗收。圖示未改，沿用821的驗收。

原價查詢與候選去重也改用目前公開商品的key／binding資料庫配對，取消5000／10000筆歷史觀察視窗；仍優先MSRP、同類證據採較低原價，不採新舊觀察的任意全域截斷。新增10002筆觀察的真PG回歸，確認不漏另一商品原價、不把已有研究商品再放入候選。
