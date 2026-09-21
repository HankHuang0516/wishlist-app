# Wishlist.ai 原生手機端（開發中）

採浪浪地圖同款 React Native／Expo／原生 MapLibre。Web 與後端保留；這裡不是 Capacitor 或遠端 WebView 包裝。

2026-09-21 23:36最新：Android隔離QA `202609212333` 兩個原生方法通過；最新source的真登入／五分頁、私人願望／TWD8000、二次確認、後端真刪除、本人裝置清理與force-stop重啟匿名完成，broker login／deletion順序完整、rejection0、六類cleanup0、四張安全截圖已人工檢視。QA帳密改走一次性loopback，不再放在instrumentation命令參數；來源指紋涵蓋全部mobile business source、native／Gradle／plugins／lock及控制器，新增12個broker安全tests。最新完整pipeline為753／207／45／728＝**1,733 framework**，另76真HTTP。最新source signed AAB versionCode15以原upload憑證成功；Play線上最高仍14，離線preflight 0 error／1標準AAB metadata warning，package／target36／64-bit／16KB／secrets／policy與簽章指紋通過。AAB尚未上傳，listing／Data Safety、完整交易原生E2E、dry-run／internal發布與安裝回驗仍待完成。

2026-09-21 23:22最新：iOS隔離QA `202609212318` 已 **3passed／0failed／0skipped**。真登入／唯一五分頁、私人清單、Nintendo Switch OLED／TWD8000、密碼與精確中文確認、第二Alert、後端真刪除、本人裝置資料清理、返回登入及真正terminate／launch後匿名全部通過；結果日誌隱私稽核、四張限定安全截圖人工檢視及六項cleanup0通過，manager已釋放。前輪2307發現刪除結果頁保留長表單底部offset，已在`AccountDeletionScreen`結果切換時回頂，使用全新label／雙架構 entitlement／deep-strict簽章／三binary SHA重建重驗。Expo SDK57相容patch與Pods已同步，`Podfile.lock`納入QA來源指紋。固定Node runtime的完整pipeline仍為741／207／45／728＝1,721 framework，13 migrations／drift0，另76真HTTP及合成殘留0。這只代表iOS帳號與文字願望基線；刊登、MapLibre、搜尋配對、聊天面交、治理、故障／效能／實機、Store及新版internal仍待完成。正式部署因既有crawler count1維持暫停，ASAP與原ID／簽章門檻不變。以下為歷史紀錄。

2026-09-16 00:15終態：009原生handle82707 terminal1、2passed／1failed，中文確認欄tap後 `public-input-visible-control-missing`。登入與刪除目前密碼輸入ACK、私人清單／預算願望儲存與文字核對已經過；SDK確認typing=false／Return=false，不證明較早mismatched修復。無真刪除／重啟／privacy pass／完整成功畫面人工驗證；六項cleanup0、manager released=true／requeues0，QA安裝資料與失敗證據保留。下一步核對鍵盤／版面變動後的欄位取得，不降低精確文字、真HTTP或第二次Alert門檻。完整雙平台／Store／新版internal仍待完成，ASAP不變。以下執行中描述保留為歷史快照。

2026-09-16 00:13：完整pipeline handle83676 terminal0，741／207／45／728＝1,721 framework，13 migrations／drift0／build／typecheck／Expo0，另76真HTTP／七項合成殘留0。iOS003實際2passed／1failed，真登入／五分頁後停在公開清單輸入，SDK證明tap／typing、不足以確定根因；無真刪除／重啟。公開輸入固定enum診斷的28純Swift host通過，132相關host為framework子集，均不當原生證據。009新52來源host／雙架構單一QA Keychain群組與deep strict簽章成功，原生handle82707執行中、尚未通過；較早中文確認mismatched亦未解決。僅清已terminal003的兩可重建cache約1.58GiB，全部產物／報告／使用者資料保留。完整MVP／雙平台／正式政策與備份保留／Store及新版internal仍待完成，正式部署依Railway Ops暫停，原ID／簽章／憑證與ASAP門檻不變。以下為歷史紀錄。

2026-09-15 23:56：最小檢舉操作回執／本人GET及明確安全放棄接上，手機以Expo Crypto核對canonical內容hash；案件404才追加GET最小回執，不把未知結果當取消。Alert確認放棄僅伺服器ABANDONED成立，已收件回RECEIVED、report可null而不複製已刪商品內容。member gate後重驗JWT／API key，真middleware授權後撤銷競爭被拒絕；盤點version2／23類與檢舉／稽核刪除說明接上。完整pipeline **741／207／45／728＝1,721項**、13 migrations／drift0／build／typecheck／Expo0，另76真HTTP／七項唯讀殘留0；手機協定69／branches97.43%、新Hermes export0只證明編譯，沒有新原生測試。初次String.isWellFormed型別失敗以明確UTF-16配對檢查修正，未放寬tsconfig；正式遷移未套用。iOS確認mismatched與其他MVP／原生治理／正式政策與備份保留／Store／最新原簽章internal仍待驗收。正式部署依Railway Ops暫停，原ID／簽章／憑證及完整目標不變。以下為歷史紀錄。

2026-09-15 23:42：商品詳情「檢舉商品」／探索「我的檢舉」與本人origin-bound加密待確認journal已接程式；重開只GET、明確重送原UUID／內容，回執嚴格比對、不把404當取消；45新協定tests／branches96.34%。Native QA已掛實際檢舉route、未載入管理key；新增真DB case先重現大寫UUID跨fixture漏洞，修正同業務正規化後回歸。完整pipeline **739／200／45／704＝1,688項**、12 migrations／drift0／build／typecheck／Expo0，另64真HTTP／cleanup0；雙平台Hermes export0，**沒有新原生檢舉驗收**。磁碟低於15GiB時只清已terminal本任務5組QA的10可重建compiler cache，約8GiB至19.7GiB、所有App／runner SHA及報告／使用者資料保留，不能undelete。iOS確認mismatched、最小回執保留／安全放棄／新資料政策及其他MVP／Store／新版internal仍未完成，正式部署暫停，完整目標active。以下為歷史紀錄。

2026-09-15 23:28：後端商品檢舉／本人回執、header管理佇列／版本決定／原子下架已掛載，27規則／15真HTTP與DB case通過；手機治理介面、使用者／訊息檢舉、政策／通知尚未完成。完整本地pipeline **739／199／45／659＝1,642項**、12 migrations／drift0／build／typecheck／Expo0，另51真HTTP／cleanup0，新檢舉／稽核表亦唯讀cleanup0。iOS QA `202609152315` 仍2passed／1failed，公開確認文字enum為mismatched、尚未Return／真刪除／重啟；manager terminal1／released、六項cleanup0，原失敗／安裝資料保留。該原生輪次使用之前後端，不包含新治理驗收。正式部署依Railway Ops暫停；完整雙平台／Store／新版internal目標active、原ID／簽章／管理憑證不變。以下為歷史紀錄。

2026-09-15 23:11：最新iOS QA `202609152304` 真登入／唯一五分頁／私人預算願望完成，但第三方法停在刪除確認文字的精確值檢查、整輪 **2passed／1failed**。SDK確認typing存在／Return不存在，不記實際值、不推定鍵盤根因，沒有真刪除／重啟／完整畫面人工驗證。manager terminal1／released、六項cleanup0，正常sharing釋放僅留本任務，原結果／安裝資料保留。最新完整pipeline **712／184／45／659＝1,600項**、11 migrations／drift0／build／typecheck／Expo0，另51真HTTP／精確cleanup0；同QA三執行檔SHA／權限／簽章唯讀重驗0，未重跑。完整MVP／雙平台原生交易／治理／政策／Store／新版internal仍待完成；以下為歷史紀錄。

2026-09-15 22:59：最新完整pipeline **712／184／45／659＝1,600項**、11 migrations／drift0／build／typecheck／Expo0，另51真HTTP與精確cleanup0。iOS QA `202609152252` 真登入／五分頁出現，SDK確認登入Button1次／StaticText0次，但第三方法停在create-private-list、仍2passed／1failed；沒有願望／刪除通過或完整安全截圖人工驗證。manager釋放／cleanup0，已回報協調任務。保留tab語意、加入唯一ID與細分checkpoint，新QA `202609152258` host編譯中，7項導覽規則通過；治理header授權38項成功但完整治理API未掛載、legacy admin未改。provenance涵蓋目前頂層手機來源與公開config／lock、成功前重查，不宣稱所有原生依賴。完整MVP／雙平台／Store與新版internal仍待完成；下列為歷史紀錄。

2026-09-15 22:52：最新完整回歸 **674／184／45／652＝1,555項**、11 migrations／drift0／build／typecheck／Expo0，另51個真HTTP與精確cleanup0。禁售共享policy含品牌／Unicode混淆、25項規則與5個新增真DB case，不當完整治理。iOS QA `202609152244` 私有原生UIKit輸入／ACK已成功，但三方法仍 **2passed／1failed**；唯讀SDK activity確認實際點到登入StaticText1次／Button0次。測試改只選button、公開文字只選textField，不改正式登入／backend admission；全新QA `202609152252` host編譯中，未推定修正後原生通過。manager terminal1／released、六項cleanup0，已回報協調任務；原結果及安裝資料保留。完整MVP／雙平台／Store gates與新版internal仍未完成，以下為歷史紀錄。

2026-09-15 22:27：新QA `202609152220` host build／兩架構 Keychain隔離／deep strict codesign成功；第二輪native仍 **2 passed／1 failed／0 skipped**，停在 `real-login-native-input`，broker只有requested／url-opened、沒有App訊號。未證明登入／刪除或前景等待已修復問題，原結果與QA安裝資料保留、fixture cleanup0／manager released。唯讀完整SDK action log未觀察已知URL錯誤／ATS訊息，不等於排除問題；host Foundation URL guard與QA scheme核對成功。最新完整本機回歸仍1,513項＋另51個真HTTP，不取代原生／MVP／Store驗收。下一步核對URL傳入、guard及broker拒絕；新版internal未發布。

2026-09-15 22:20：首次 iOS 真登入基線 **2 passed／1 failed／0 skipped**，第三方法停在 `real-login-native-input`，未完成憑證輸入、未證明登入／刪除；原結果及QA安裝資料保留，fixture cleanup0、manager released。安全 enum 診斷／最多3秒前景等待已加入，63項相關 host 測試成功，新QA `202609152220` 正做host編譯。最新完整 pipeline **637／179／45／652＝1,513項**、11 migrations／drift0／build／typecheck／Expo0，另51個真HTTP成功。完整原生／MVP／Store與新版internal仍未交付；以下是歷史基線。

2026-09-15 22:13：iOS 真登入／私人願望／刪除與重啟的第三原生方法已接入，QA 專用 UIKit 一次性憑證輸入不直接設定登入態，也不將帳密傳入 XCTest 環境或 typeText。相關 55 項 host 測試成功，完整本機 pipeline **629／179／45／652＝1,505 項**與另 51 個真 HTTP 成功、cleanup0。QA `202609152214` 尚在 host 編譯，未確認新增原生方法通過；完整 MVP／Store／新版 internal 仍未交付。以下保留歷史有限基線，不能由 host 檢查外推原生成功。

2026-09-15 21:58最新：iOS隔離QA `202609152152` 六匿名帳號頁面導航／說明ACK與真正terminate／launch仍匿名，**2 passed／0 failed／0 skipped**。唯一安全說明截圖已檢視、device匹配本次租用、六項精確cleanup0、manager terminal0／released。沒有輸入帳密／提交帳號／寄信，不能當作iOS登入／願望／帳號刪除或交易已驗收。成功結果在 `build/ios-native-qa-202609152152/qa-c5fb2c10-dcdd-49f4-b462-21278007a4fe/result.json`；原失敗與QA安裝資料保留。隨後host verifier拒絕XML值內空白，唯讀重新確認同一對artifact的雙架構／精確單一QA群組／簽章／SHA256，沒有native重跑；之後新來源runtime需新label。最新完整pipeline **590／179／45／652＝1,466項**、11 migrations／drift0／build／typecheck／Expo0，另51個真HTTP成功。完整雙平台MVP／Store gates與新版internal尚未交付；[操作規範](scripts/NATIVE_QA.md)，以下為歷史紀錄。

2026-09-15 21:52最新：iOS隔離Debug App／獨立XCUITest runner已host build成功，逐架構單一QA Keychain access group、bundle／scheme、deep strict codesign通過；正式ID／Team／私鑰不變。實際runtime先在OpenStep安裝清單解析、再因Xcode26.6拒絕Simulator的UseDestinationArtifacts而失敗，**方法0、沒有原生流程成功證據**；兩次manager已釋放、第二次六項fixture清理0，先前QA安裝資料及失敗報告保留。配置修正後使用新QA `202609152152` host建置中，不覆寫既有安裝資料。完整pipeline **588／179／45／652＝1,464項**、11 migrations／drift0／build／typecheck／Expo0，另51個真HTTP檢查通過。iOS匿名控制器只驗證頁面導航與真正重啟，不輸入帳密，不代替登入／帳號刪除／交易E2E；操作規範見[NATIVE_QA.md](scripts/NATIVE_QA.md)。完整雙平台／MVP／Store與新版internal仍未交付，以下為歷史進度。

2026-09-15 21:26最新：Android隔離debug兩個真正原生方法已通過：合成買家真登入／五分頁／私人預算願望、盤點與密碼／中文／第二Alert確認刪除、收據／本人pending與原session清理、返回登入；僅此新QA App實際force-stop後重啟仍未登入。DB稽核在fixture清理前證明買家刪除、其餘兩位保留；編輯器1次開啟、四張安全畫面已檢視、六項cleanup0，manager terminal0／released。完整pipeline server534／DB179／Web45／mobile652，共 **1,410項**、11 migrations／drift0／build／typecheck／Expo0，另51個真HTTP檢查成功。

只修正測試控制器ACK／觸控bounds穩定等待、不重送save／delete／clear，沒有據此推定正式App缺陷已修復；失敗歷史保留。這是有限Android QA基線，不是iOS完整操作、商品picker／地圖／聊天、完整MVP／Store gates或新版internal。QA使用獨立debug package／scheme與既有debug key，原Release身分／簽章／HTTPS不變。操作及保護邊界見[NATIVE_QA.md](scripts/NATIVE_QA.md)，對應成功報告在 `build/android-qa-202609152124/qa-4673dad3afaa142f47f9c3485204deea/result.json`（git-ignored）。以下時間段為歷史進度。

2026-09-15 21:20：Android獨立debug QA建置／instrumentation與受監督控制器已接上。真介面登入合成買家、五分頁、預設私人清單及預算願望成功，刪除收據與本人pending／原session清理畫面亦已檢視；最後返回登入仍失敗、重啟未執行，願望編輯器用了2次開啟。**完整原生方法與雙平台gate未通過**。20:56完整pipeline server518／DB179／Web45／mobile652，共1,394項、11 migrations／drift0與build／typecheck／Expo一致性成功；其後新增稽核邊界，兩個相關純規則suites49項通過，不當完整重跑。

控制器的刪除證明必須在fixture清理與服務到期前，唯讀查回本人不存在且其餘兩位合成帳號仍存在；UI失敗不因DB證明而改成通過。正式Release HTTPS／原ID／簽章不變，不覆寫／清除原App資料；iOS隔離控制器與完整MVP／Store驗收仍待完成，尚未新版internal upload。詳見[隔離原生QA操作規範](scripts/NATIVE_QA.md)。以下各時間段為歷史證據。

2026-09-15 20:33：新增[隔離原生QA設施](scripts/NATIVE_QA.md)，真實API處理器與三個合成身份完成51個HTTP檢查，六項程序生命週期驗證通過，確切測試資料／照片清理皆0殘留。最新完整pipeline為server502／隔離DB179／Web45／mobile652，共1,378項，11 migrations／drift0及build／typecheck／Expo一致性成功；商品listener生命週期修正後另三次併發回歸成功。

此QA尚未接原生控制器，不能把本機API測試當作雙平台UI／商店驗收；不改Release HTTPS／原ID與簽章，不卸載或清除既有正式App資料。本輪沒有新原生build、正式部署或internal upload，下一步需專屬debug QA連線及有效simulator-manager租用。

## 執行

`npm ci`（首次建立lockfile用npm install），設定非機密的 `EXPO_PUBLIC_API_URL` 為後端HTTPS origin，再執行 `npm start`。MapLibre需原生development build，不能只用Expo Go驗證。

`npm run typecheck` 與 `npm test` 驗證型別及API安全規則。`npm run prebuild` 產生本機原生工程；不要使用 `--clean` 覆蓋尚未保存的原生修改。

## 上架身分與憑證保留

- iOS `com.hankhuang.weesh`／ASC `6468950847`。
- Android `com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1`。
- 使用舊WeeshGifts安裝產物查得的既有EAS project `1f7233de-f650-4938-a46d-97b419832519`；先查驗存取、credentials及certificate。不要執行init建立重複project或在credentials manager選Generate／Reset。
- `play-internal` 產出store格式AAB，但不會自動發布internal track；須通過雙平台驗收、正確簽章、Play預檢及readiness後再由gplay發布。
- 初始versionCode 15僅為預留；發布前重新查所有既有上傳版本並提高。
- API URL由環境提供，不保存管理key／密碼／service-account／keystore；token用SecureStore。

## 目前狀態

目前最新Android局部介面結果見最上方；下列排程失敗為20:10歷史紀錄：當時共享runtime兩次請求均waiting60秒terminal exit3，iOS冷啟動及Android匿名導覽未開始boot／install／App操作、未產生當輪截圖，本任務leases／queue皆0。當時原生產物只證明build／簽章檢查，不當runtime通過；依manager規則保持排程，不停止其他裝置或強制建立新環境。

20:10App帳號刪除增量：我的新入口、strict18項唯讀盤點、目前密碼＋「刪除帳號」文字＋第二確認、原token與nonce加密journal先於一般session restore已接上；已證明收據同筆保存／state不降低，真ERASED才清本人views／indexed pending／精確原session，storage失敗留紀錄重試；ABANDONED不清本人資料、unknown不能直接移除journal。1900byte record送出前預留最大收據容量，不存password／JWT chunks。完整pipeline server480／DB173／Web45／mobile652、11 migrations／drift0／build／typecheck／Expo0，三核心125tests／branches94.59%。新原upload APK與iOS adhoc Release simulator已成功；後者1620warnings保留。原生刪除操作與所有E2E未實測，過期且未取得收據的支援、資產／政策／其餘MVP仍未完成，未新版AAB／distribution archive／部署／internal發布。歷史段落不當最新gate證據。

19:58帳號刪除恢復增量：後端真正DELETE／原JWT收據GET／取消tombstone POST已完成；手機原token／origin／本人／UUID綁定協定及加密pending-key索引已接刊登／願望／訊息／面交儲存層，遺失ACK只查收據不自動重送。索引先登記精確pointer／chunk再寫私密payload，清理先存永久本人scope late-write fence、失敗保留hint重試，不清他人scope；1024 hints／1900byte record硬上限。完整pipeline server480／DB173／Web45／mobile596、11 migrations／drift0／build／typecheck／Expo皆0；新增兩手機模組69 cases／branches93.02%。App實際刪除確認／啟動恢復、session／pending清理呼叫尚未連畫面，舊Flickr／uploads只完成候選盤點而未清理，政策／完整生命週期仍待完成；未新建原生產物／操作UI／部署／internal發布。下方19:38等段落為歷史證據，不能當最新source已驗收。

19:38帳號刪除核心增量：後端已新增唯讀影響盤點、重新核對密碼／session version的實體刪除核心、保留對方自有訊息的聊天室封存、ledger解除關聯與durable照片清理worker；新migration只套用隔離測試DB。手機聊天已支援nullable已刪身分與封存資料，收到fresh member state時移除不再存在的成員訊息，停用封存聊天的傳送／封鎖／面交入口。完整本地pipeline server456／DB150／Web45／mobile527、10 migrations／drift0皆成功；公開刪除／lost-ACK transport、App刪除確認與本人私密journal清理、資產／政策生命週期仍未完成。本輪沒有重新建置原生產物／操作UI／部署，以下APK／iOS截圖是較早版本，不能當作新archive支援已驗收。

19:13之後新增原生一次性Weesh → Wishlist.ai說明，不假造舊帳號／資料遷移；獨立origin-bound SecureStore acknowledgement、儲存失敗明確只這次繼續。恢復Modal back與表單共用操作鎖，延遲session probe以epoch保護後來的登入。新原upload APK含此增量但Android本輪UI在manager啟動階段未執行；新label iOS Release simulator build／Hermes／deep strict codesign成功，1615 warnings保留；實際冷啟動說明畫面／10秒process穩定成功、截圖已檢視、lease釋放。未點確認／登入、非distribution簽章。完整pipeline手機506 tests，後續label helper後手機517 tests通過，不等於完整gate。以下19:03／19:05證據不含新說明／guard。

19:03原生AuthScreen已有登入／註冊／forgot／resend／Email驗證／reset六個表單，nonce／Deep Link只預填並待用戶確認；驗證信不自動登入／切換帳號。登入先查fresh profile再安全存入SecureStore，註冊未驗證JWT不當作登入。已連結現有Web政策，但內容仍須marketplace審核；App帳號刪除仍未完成。新原upload簽章APK含這些畫面，AAB／iOS archive為早期版本，新的完整native帳號操作尚未驗收。

已有登入／SecureStore session恢復、原生清單／文字願望CRUD及公開／私人／隱藏／完成管理、願望探索首頁與可解釋配對、真實照片刊登、縮圖／群聚探索與共用搜尋清單、文字聊天室及私密面交預約卡。願望距離以視野格點計算，不送精確GPS；配對為近期候選分頁、頁內評分排序。刊登／訊息／面交／願望建立先保存加密待確認journal；願望有per-user UUID receipt與刪除後防重建，面交另有伺服器原子放棄tombstone，不能把放棄未成立操作當作取消已成立預約。

18:50原生「我的」已接上密碼變更／撤銷全部JWT裝置登入與前景session檢查；後端需部署新的authVersion migration及對應API。密碼變更／重設會撤銷該用戶個人API key，單純撤銷登入則保留；均不改管理憑證／上架私鑰。明確ACK才報成功，遺失ACK只依真正401鎖住登入並保留未確認結果，不自動重送。

願望照片／URL自動分析、通知／治理、完整原生註冊／驗證／重設操作驗收與帳號刪除及其他MVP缺口仍待完成。2026-09-15新原upload簽章release APK含願望管理／帳號安全頁／六個AuthScreen表單，AAB及原Team iOS archive仍為較早native版本。19:05排程請求的本輪APK在指定私有Android SDK36 emulator完成五個匿名帳號頁面／合成連結預填導覽，回傳0、無fatal、截圖已檢視、lease已釋放；沒有提交帳號／Email。4096頁面不算16KB測試。願望／帳號登入後原生操作及完整交易 E2E尚需驗證。TypeScript、純規則、Hermes export或成功建置均不代表完整雙平台驗收；尚未上傳新版internal。

`scripts/build-android-local.cjs` 在讀取原簽章密碼前要求至少15GiB可用空間，不會自動上傳商店或產生新key。`scripts/build-ios-simulator-local.cjs` 與 `scripts/build-ios-archive-local.cjs` 可傳入人工選定 `YYYYMMDD-HHMM` label，隔離新app／result，拒絕覆寫既有產物；無參數歷史路徑保留。後者限定原Team既有login identity，不改全域keychain或私鑰ACL。Session v2綁定API origin，舊prototype session不自動遷移；安全儲存失敗不降級明文。
