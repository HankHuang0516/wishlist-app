# 隔離原生 QA 基礎設施

此工具是雙平台原生操作驗收的前置設施，**不是雙平台驗收證據，也不是 Google Play 內部測試版**。正式 App 的 bundle/package ID、既有簽章、HTTPS 與登入限制都不變。

## 保護邊界

- 必須明確指定本機、獨立命名的 `TEST_DATABASE_URL`；查詢參數及 fragment 一律拒絕，不載入 `.env`。正式資料庫與一般本機資料庫不可使用。
- 子程序只接收白名單設定，JWT 簽署金鑰每次以密碼學亂數產生，不沿用任何正式管理、提供者或簽章憑證。macOS 自動加入的 `__CF_USER_TEXT_ENCODING` 僅作程序執行設定。
- 伺服器只監聽 `127.0.0.1` 的動態連接埠，建立三個 UUID 隔離的合成買家、賣家與第三人帳號；驗證狀態僅為本機 fixture。登入仍經過真實 bcrypt、JWT 與資料庫版本檢查。
- 合成 Email、密碼與登入 token 只存在控制程序記憶體／IPC，不輸出、不存入 repo 或報告，也不可截入登入畫面證據。
- 實際掛載現行 auth、users、native-wishes、listings、listing-media、chat 路由，不偽造登入、預覽、刪除或恢復成功。沒有注入 `req.user` 的測試捷徑。
- 只允許合成身份登入／寫入。其他帳號、跨 fixture 聊天／封鎖、管理端點、API key 產生、寄信與外部提供者操作不開放。這是路由與設定隔離，**不是 OS 層網路封鎖**；地圖圖磚等原生端公共服務另須按實際環境驗證。
- 一次只執行一個此資料庫的 HTTP／fixture 工作；不可與 DB 整合測試、其他 QA 伺服器或 migration 同時運作。

## 執行與生命週期

先執行 server build，確保使用最新 `server/dist`。控制程序透過 `startNativeQa(TEST_DATABASE_URL, lifetimeSeconds)` 取得 API 位址、合成 actor 與 `stop()`／`exited`；生命週期設定為 1–600 秒，啟動有 30 秒觀察期限。服務到期、控制 IPC 中斷、SIGTERM 或 SIGINT 都會停止接受新請求，等待正在進行的請求結束後清理。

啟動時會先比較原始碼中的遷移清單與隔離資料庫已完成的遷移；少套、重複或多出不符來源的版本會在建立合成使用者之前以 `schema-preflight` 停止。此檢查只防止舊 QA 資料庫被誤當 APP 回歸，並不自動修改資料庫，也不取代完整的 `prisma migrate diff` 結構比對。應在確認是空置的指定測試庫後，先由 `server/` 對它執行 `prisma migrate deploy`，再重跑 QA；絕不可因此對正式資料庫套用未發布 migration。

清理只作用於此程序實際建立的 User ID、追蹤的聊天室 UUID、已驗證的身份／操作摘要，以及私有 `mkdtemp` 儲存空間。圖片只移除合法 UUID 子目錄中的兩個既知 WebP 檔；不遞迴刪除、不掃除一般 App 儲存、未知檔案會保留並讓驗證失敗。啟動失敗回傳非零退出狀態，即使已完成部分啟動的安全清理也不冒充成功。

`node mobile/scripts/native-qa-api-smoke.cjs` 會從真實登入走過願望、圖片、刊登期限、搜尋、配對、聊天、面交、刪除恢復與取消屏障，最後只輸出非機密檢查數和精確 cleanup 計數。這個流程與唯讀 cleanup 檢查已納入 `scripts/validate-before-push.sh`。

`node mobile/scripts/listing-ai-local-e2e.cjs` 是另行明確啟用的**合成照片專用** MiniMax 商品草稿驗收，需先完成 server build，並提供同值的本機 `TEST_DATABASE_URL`／`DATABASE_URL`。腳本固定校驗橘燈與藍杯兩張無個資 fixture 的 SHA-256；子程序自行產生只供本次合成帳號使用的 callback token，未繼承正式 MiniMax／Railway／Flickr／管理憑證。兩張照片都實際走上傳、私密授權讀取、排隊、真 MiniMax Connector、結果回寫與賣家查詢，且這兩張可估價的測試圖須有非空二手參考區間；公開清單在賣家確認前必須為 0。賣家明確填入售價與地區後僅發布其中一件，另一件保持私有，完成時檢查測試資料與媒體清理。這是**本機儲存與隔離資料庫**的端到端 HTTP 驗收，不包含真實 Flickr、正式 Railway、APP 原生 UI、商店配發或真實商品授權，不可外推為正式開放條件。

## 原生操作驗收與已完成證據

Android 已加入獨立的 debug QA 建置、真實介面 instrumentation 與受監督裝置控制器；iOS 已加入獨立 XCUITest runner、Simulator Debug 建置、匿名導覽及多個單一 authenticated flow。是否通過仍以各次實際 `result.json`／畫面證據為準，不能由控制器已寫好倒推通過。2026-09-24 最新來源證據：iOS 匿名2／2、刪除1／1、商品探索1／1、聊天1／1、面交1／1、連拍刊登入口1／1、相簿商品照單張私有上傳1／1、相簿同批兩張不同商品私有上傳1／1；Android 兩張連拍私有上傳已在獨立流程通過。正式 Release 禁止明文 HTTP，不能直接用此 loopback API 取代正式服務；不覆寫已安裝正式簽章 App、不卸載／清除既有使用者資料、不放寬 Release 的 HTTPS 限制。

### iOS 隔離匿名基線

先執行 `node mobile/scripts/build-ios-qa.cjs YYYYMMDDHHmm`，在未使用的 `mobile/build/ios-native-qa-LABEL/` 編譯獨立 runner（build-for-testing）與 App。明確 opt-in 僅允許 Debug／iphonesimulator；App 為 `com.hankhuang.weesh.qaLABEL`、runner 為 `com.hankhuang.wishlistnativeqa.qaLABEL.xctrunner`，連結 scheme 與 Keychain access group 均不與原 App 共用。採 Simulator ad-hoc signature，不讀取正式私鑰或 provisioning 機密；正式 Release bundle／Team／scheme 不變。

Simulator 的 entitlement 可能在 Mach-O 的 `__TEXT,__entitlements`，不能只信任空的 ad-hoc 簽章權限。工具逐一驗證 universal binary 的每個架構，拒絕截斷、重疊、未知架構、錯誤 section 與不一致權限；每個架構必須精確匹配唯一 QA application identifier／單一 access group／get-task-allow，不能含原 App 或額外群組。App／runner 另須 deep strict codesign 成功，來源與執行檔 SHA256 保存於 build.json。

XML只忽略節點之間的排版空白，不刪除key／access group值內的空白。`node mobile/scripts/verify-ios-qa-entitlements.cjs LABEL` 可唯讀檢查既有QA執行檔的SHA256、兩架構精確權限值與deep strict codesign，不編譯／重簽／操作裝置或修改原成功manifest。建置manifest是host當時快照，實際有限runtime成功以各次result.json為準；之後來源變更仍須新label與host build，不能覆寫已裝QA重跑。

新版 host／runtime 指紋包含目前 `src/` 頂層所有 `.ts/.tsx` 與公開 app config／package lock／tsconfig，以及原有原生／控制器檔案。runtime 要求清單完整且不重複，成功前再次檢查指紋；測試中不得修改這些來源。這不是全部 node_modules／Pods、伺服器依賴或未來新增子目錄的可重建證明；新增巢狀來源時須擴充收集規則。

若 **host 編譯已終止失敗**且尚未產生成功 build.json，允許 `--resume-host-build` 重新做兩個相同 host 工作的增量驗證；新的 xcresult 不覆寫原失敗記錄。這個選項不會租用裝置／重跑狀態操作，成功 manifest 或不完整失敗目錄一律拒絕。

host build／純規則測試完成後，明確提供隔離 `TEST_DATABASE_URL`／同值 `DATABASE_URL`，使用保存的 `--session` 與 mobile `--project`：`sim-manager run ios --mode auto --boot --timeout 120 --budget-seconds 300 --json -- node /absolute/mobile/scripts/ios-native-qa.cjs LABEL`。僅使用租用分配的 UDID，不改排程設定、不自動重排。QA App／runner 都必須尚未安裝；控制器先安裝新 App，Xcode 首次安裝新 runner，再由 `UseUITargetAppProvidedByTests` 的測試自行 launch App。Xcode 26.6 實際拒絕 Simulator 的 `UseDestinationArtifacts`（只允許實體裝置），因此保留 SDK 產生的 runner 路徑，不使用該選項。禁用 parallel testing／自動重試；不覆寫或清除原 App／先前 QA 安裝資料，配置修正後使用新的 build label。

這兩個方法只驗證改版說明、匿名登入／註冊／forgot／resend／verify／reset 頁面導航，以及真正 terminate／launch 後仍匿名。**不輸入、傳入或序列化帳密，不提交帳號／寄信，不等於已驗證登入、驗證連結、SecureStore session 恢復或帳號刪除。** 自動 system attachments 禁止保存，只有確認無憑證欄位的改版說明可建立刻意命名的單張 screenshot；成功還須 exact 2 passed／0 failed／0 skipped、結果 device ID 匹配本次租用、單張安全 attachment 與精確 fixture／自有 Metro 清理完成。未知／局部結果均不能算通過，完整雙平台驗收繼續按 acceptance gates 逐項推進。

### iOS 可選真登入流程

原生按鈕 tap 只查 `.button`，公開文字輸入只查 `.textField`，不接受同名標題 firstMatch。底部分頁保留 `accessibilityRole="tab"`，不因測試方便改成普通按鈕；XCTest 用五個公開白名單 `wishlist-tab-*` 識別碼查真正可操作分頁，拒絕重複 ID。登入、分頁、編輯器、文字輸入及提交 ACK checkpoints 分開記錄，未知儲存結果不重送。這些選擇器及指紋規則仍須各次實際原生結果驗證，不能由來源／host 測試推定通過。

最新QA-only觸發採 `simctl notify_post`，公開名稱固定為本次唯一bundle＋input＋允許動作，不傳帳密或capability。QA App在Debug／Simulator啟動時依公開NATIVE_QA_INPUT_PORT註冊自己名稱的Darwin observer，自己向broker一次性claim該動作capability，再交同一UIKit文字引擎。XCTest仍只取得布林完成狀態；沒有直接設session／user／JWT。通知delivered、capability claim及實際ACK可分開診斷，原URL模式失敗與安裝資料保留，不將這個QA觸發當正式Deep Link通過。

Broker僅loopback＋精確QA bundle header／Host、禁止Origin／body／任意動作，capability與payload一次性且no-store；沒有將header宣稱為OS層身份認證，這不是同Mac帳號內其他程序的完整隔離。啟動／URL／notification探針只回報whitelisted enums，拒絕只記原因名稱，不記header值。SceneManifest不存在時，QA input只fallback至AppDelegate自己註冊的弱window引用；仍需active／key window／唯一空白可見的真正欄位，不擴至其他window或App。

在完成相同 host build、完整回歸及明確 session／project 租用之後，每次只執行一個真登入流程：`--authenticated-deletion`、`--authenticated-marketplace-discovery`、`--authenticated-marketplace-chat` 或 `--authenticated-marketplace-meetup`。單一流程設計可保留明確失敗邊界，也避免前一個有狀態流程污染後一個流程。QA App 內的文字輸入引擎僅在 **Debug＋WISHLIST_NATIVE_QA＋Simulator** 條件編譯，且再次核對唯一 bundle／scheme、動作／一次性 job、loopback 埠與可見的空白 UIKit 欄位；不直接寫入 user／JWT／session，也不跳過後端 admission 或真實提交。

新增 `--authenticated-listing-batch-entry` 與 `--authenticated-listing-batch-photo`，後者只在受管理、402×874 的隔離 iOS Simulator 使用固定 SHA-256 的合成杯子照片；先以 `simctl addmedia` 放入相簿，XCTest 只點選剛檢視過的最前端圖片格，選取狀態與私有草稿各保留一張安全截圖。系統相簿是另一個程序，iOS 26 的圖片格在 App 的 XCTest 查詢中不可見，故座標操作限定該尺寸並以後端真實結果作為通過條件，不可外推到其他裝置。`202609242305` 的精確結果為 1／1：本人可讀原圖、其他合成帳號與匿名均為 404，資料庫僅 1 張未刊登的賣家照片，憑證日誌稽核通過，六類後端清理殘留 0。此隔離服務未開 MiniMax 或 Flickr，所以只證明照片上傳與權限，**不證明正式辨識、Flickr、兩張 iOS 連拍或公開刊登**。`simctl addmedia` 的相簿測試圖可能仍留在該隔離 Simulator；後端 cleanup 的 `photoFoldersRemaining: 0` 不包含系統相簿。

`--authenticated-listing-batch-two-photos` 將固定雜湊的合成橘色檯燈與藍色杯子加入相簿；因反覆測試會保留同款照片，iOS 26 的外部 Photos picker 不能靠第一、第二格推定不同商品。此 QA 方法以固定尺寸畫面截圖的橘／藍像素特徵定位兩種商品，找不到即拒絕，不讀取或上傳其他照片；後端再要求恰好兩筆不同 `contentHash`、兩筆都未刊登且本人可讀／其他帳號與匿名 404。`202609242333` 為 **1／1 passed**、隱私日誌稽核通過、六類後端清理 0，五張安全截圖及 `result.json` 位於 `mobile/build/ios-native-qa-202609242333/qa-67321736-1925-4530-a3bc-6e727ba16738/`。前兩輪誤選重複檯燈被不同內容門檻擋下，失敗結果保留。此流程不代表 MiniMax AI、Flickr、iOS 相機連拍或公開刊登已驗收。

XCTest 只取得公開動態埠，向本機 broker 請求 enum 動作；broker 透過私有一次性 capability 讓 QA App 取得合成帳密、填入真正文字欄位並送出正常 editingChanged。XCTest 只收到布林完成狀態，不把帳密放入 launch environment、typeText、剪貼簿、測試設定或畫面附件。通道逾時／已取用／順序錯誤不自動重送；停止時取消待處理工作並關閉自己的 listener。

成功必須是所選單一方法 **1 passed／0 failed／0 skipped**、結果 device 匹配租用、該 flow 預期的私密輸入動作完整完成，以及 SDK 匯出的 action／方法 activity／可取得 console 日誌沒有合成帳密或已知編碼。`deletion` 另要求 fixture 清理前同查詢證明買家已刪且另外兩位仍存活；其他 marketplace flow 要求既定 fixture 與輸入動作精確完成。只有 SDK 明確回報 `Error: No console log available` 可記錄該欄不存在，再檢查 action／方法；未知錯誤、空白／缺漏活動或不同裝置均失敗。這是 **SDK 匯出日誌**的有限檢查，不是所有不透明 OS 日誌／正式服務的全面憑證掃描。

只保存該 flow 白名單內、已確認無憑證欄位的刻意命名畫面；未知附件不接受。各 cleanup 獨立執行，保留 App 安裝資料及失敗證據。控制器新增不代表方法已通過，須看各次 result.json／主代理畫面檢視；Simulator 成功仍不等於實體相機／定位、真斷網／推播、Play 配發安裝或商店審查完成。

### Android 隔離介面測試

外部來源地圖／私密願望的 Android Debug UI smoke 可先以 `node mobile/scripts/build-android-debug-qa.cjs YYYYMMDDHHmm` 建置新的獨立 package；此流程只編譯 `assembleDebug`，不需要已缺失的 `NativeQaTest.kt`，不產生 `androidTest` APK，也不讀取正式 upload key。需至少 15 GiB 可用空間；不繞過門檻。新包、來源 SHA-256 與「不可當商店交付品」標記保存在 `mobile/build/android-debug-qa-LABEL/`，每個 label 僅能使用一次。建置後仍須透過受管理 Android 模擬器執行 `external-map-android-smoke.cjs LABEL`，由腳本驗證 package、Debug 身分、APK 雜湊及建置來源未變；實際 UI 運行結果另存證據。**只建置或只載入舊 Debug 包都不等於 Play 內測版驗收。**

先以 `node mobile/scripts/build-android-qa.cjs YYYYMMDDHHmm` 編譯。label 必須是未使用過的 12 位識別碼，產物保存在新的 `mobile/build/android-qa-LABEL/`。只編譯 app 的 arm64 debug 與 androidTest，不讀取正式 keystore／密碼，不生成新 key。原 package 只在明確 `wishlistNativeQa=true` 的 debug assemble 工作加上 `.qaLABEL`，QA 連結 scheme 為 `wishlistqaLABEL`，避免攔截正式 `weesh` 連結；混合／Release 工作拒絕 QA 參數。正常 Release 的識別碼、scheme 與簽章設定保持不變。

主 App 直接讀取可公開的 `process.env.EXPO_PUBLIC_API_URL`（再 fallback 至嵌入 manifest），由 Metro bundle 注入該次 loopback endpoint。這是 [Expo 官方的公開環境變數方式](https://docs.expo.dev/guides/environment-variables/)，不是機密儲存；所有 Release API／session／恢復驗證仍拒絕明文 HTTP。QA Metro 使用 18887、localhost、offline 與禁止 dotenv 的白名單環境，既有埠占用時直接拒絕，不關閉別人的服務。

完成 host typecheck／測試／build 後，透過保存的 session 與 mobile 專案路徑執行 `sim-manager run android --mode auto --boot --timeout 120 --budget-seconds 240 -- node /absolute/mobile/scripts/android-native-qa.cjs LABEL`，並明確提供相同的本機 `TEST_DATABASE_URL`／`DATABASE_URL`。每次 `run` 必須帶 `--session` 與 `--project`；不自動重排這種有狀態工作。

控制器比對 APK、source SHA256、實際 debug manifest／instrumentation target，只操作租用分配的 serial；拒絕已有安裝／保留資料的 QA package。只安裝新的 QA 與 QA.test，不安裝原 package、不重設資料。該次 API 與 Metro 使用精確 adb reverse；不覆寫既有 reverse，離開時只移除自己建立的 endpoint。各項 cleanup 分別執行，某次裝置命令失敗不會跳過合成帳號清理。

第一個真實介面測試經 bcrypt／JWT 登入、五分頁、私人願望清單及預算願望、18 項唯讀刪除盤點、中文確認、第二次原生 Alert、刪除收據與 SecureStore 清理，再返回登入。控制器在兩次測試間只 force-stop 自己新安裝的 QA App；第二個測試重新啟動並確認仍為未登入，不用清除資料製造假成功。中文／密碼輸入使用直接 Accessibility `ACTION_SET_TEXT`，不更換全域輸入法／剪貼簿，也不使用可能輸出文字診斷的 UIAutomator setText。合成憑證僅由記憶體傳入 instrumentation，不回顯 raw diagnostics。

畫面僅截取已登入首頁、願望、空願望編輯器／合成清單診斷、已刪除收據，以及返回登入失敗時仍無憑證欄位的診斷畫面，不截登入輸入／密碼；只複製自己 UUID prefix 的五個已知畫面。首頁、願望與已刪除收據是成功報告必備證據，局部截圖不能算測試通過。QA 安裝資料保留供檢查，不碰原 App；後續工作需新 label，不覆寫已存在資料。

新增願望編輯器必須實際出現才輸入；測試最多重試兩次純介面開啟，不重送儲存／刪除。報告記錄安全的失敗階段、原因、例外類型與成功時的開啟次數，保留失敗證據；兩次才開啟亦不能當作單次觸控品質通過。共享 runtime 的排隊／boot 失敗與 App 已操作後的斷言失敗分開記錄，不把任何未測項標為通過。

清單儲存後等待實際ACK／舊表單與處理指示消失；每次觸控前觀察控制項真實bounds連續穩定，再注入一次觸控，不在結果未知時重送save／delete／clear。買家刪除的唯讀DB稽核必須在服務到期至少30秒前且程序仍存活、fixture清理尚未請求時完成；同查詢須證明另外兩位合成帳號仍存在。服務到期／停止造成全部fixture不存在，不是App刪除證明。UI失敗即使獨立DB核對成功也不能改為方法通過。

目前已親自驗證雙平台的登入、五分頁、商品探索／地圖、搜尋與願望交叉比對、聊天／預約，以及刪除確認、重啟恢復、SecureStore 清理和第三人隔離；後端另有76個真HTTP檢查，但不能替代原生證據。最終功能 AAB／APK versionCode15 已以原 upload key 建置，Google Play internal 已發布並回讀為 completed。仍需以 Play 測試帳號補商店配發安裝、實體相機／定位、真斷網／推播與長時間負載證據；這些不得由模擬器成功結果外推。
