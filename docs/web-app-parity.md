# Wishlist.ai 網頁／APP 2.0.12 完整功能對齊驗收

## 現行目標與完成條件

1. **網頁視覺相似度目標：由99%改為至少90%（首頁、設定頁各自≥90/100）**。以 Hank 核准的 AI 示意圖與同畫布實際瀏覽器截圖逐頁審查，不以兩頁平均代替；原網頁風格維持、僅一個帶標籤的設定入口，APP 既定介面不改。
2. **功能對齊：100% 可適用 APP 功能**，既有網頁功能亦須保留；90%只調整視覺門檻，不降低功能完整度。
3. **正式交付：測試與 CI 通過，部署既有 Railway 後，以正式網站實際操作及截圖再次驗收**。本機90/100或本機測試通過不等於目標完成。

相似度使用下述逐頁人工加權審查，不宣稱像素級90%或兩頁平均達標。這組完成條件補充現有完整功能追蹤目標，不另建或將未完成目標標為完成。

**發布節奏（Hank 2026-10-02 最新指示）：「每完成一個功能就部署最新版上去」。** 每個已完成功能通過必要回歸／CI、納入最新 main 修正及正式資料庫升級檢查後，直接部署既有 Railway 並回讀正式畫面，不再等整個對齊目標全部完成才發布。這是增量發布授權；APP不改、原資料與Web功能保留。完整矩陣與首頁／設定各90的最終正式驗收仍逐項追蹤，單次發布不把全目標標為完成。

目標：正式 Railway 網頁完整提供 APP 已存在的所有可適用功能，並讓首頁與設定頁各自對齊已核准 AI 示意圖至少90%相似度；保留原網站風格與既有功能，APP既定風格不變。視覺門檻由99%調整為90%，不降低功能、測試或正式部署驗收要求。這不是 APP 發布成功或付款正式開通的聲明。

目前狀態：第121批原APP12完整23類刪除影響盤點與明確只讀刷新已增量發布Web2.0.650。PR132、精確候選d40d6bca7c688ae5eb13dcbf4f2b137b29a357bb／CI37169845001三工作成功、merge e955ed7dce25eb77ea4a72e9bbfb76d539d38b58／trigger e595de5109abecb5a4bdfb1dcda71ce9dbbe0fde四runtime樹一致，Railway ea056fe7-e4ba-443e-b82d-8d443ac74c06 latest SUCCESS、public version及entry／Explore／Chat／Settings／MyListings／AccountDeletion六assets逐byte對本機production build。正式Explore／Chat／Settings真h1與meta650、唯一Settings、23category labels與明確重新盤點恢復就緒已驗；不記私人aggregate／身分，不輸入密碼或點永久刪除。完整Web1998、原impact realHTTP8與隔離DEV成功／503與畸形完整回覆拒絕／各自明確GET恢復通過；原harness共用限流429首失敗保留，只改隔離oracle測試流量。原APP183source／88compiledinputs／兩expected binaries及恢復172檔、原129改動、3278舊不可變紀錄保持。完整32列／既有Web與Home／Settings各90目標active；最近整頁90仍110歷史630，本increment不當全目標完成。

## 第一百二十二批：通知偏好完整語系與原操作恢復提示

- 核對目前650發現通知頁只有標題與行銷標籤使用語系，其餘已保存偏好、服務未開通、guest返回、待確認原操作／重試／清理／兩步取消仍是中文。本批補齊繁中／英文，沿用共同Settings copy及原profile journal／GET／POST，不改APP、後台controller、schema或寄送能力。
- 通知頁CONFLICT明示本次未套用並顯示目前後台值；ABANDONED不再誤稱本頁保留未送出草稿，改為明示已保存偏好不撤回。原忙碌／持久原操作／帳號隔離保持。六項新English測試涵蓋正常／guest／失聯重開GET-only／conflict／畸形讀取重試／兩步取消，原十項繁中回歸保留。
- 候選653完整Web129檔／2004件與NODE_ENVproduction建置、server build及原profile HTTP／PostgreSQL12件通過。隔離DEV18927／compiled原handler18926同一owner6：原opt-out、真APPLIED1後503／重開GET-only恢復、正常opt-out2、另一legacy操作更新3後CONFLICT、profile讀取503／明確Retry GET恢復共七snapshot；三個UI POST／兩APPLIED及一CONFLICT，其他帳號全欄位保持。初harness async callback漏呼叫造成host真exit1且零profile操作，僅修隔離工具並確認舊兩fixture v0false／receipt0後清理；最初GUI與retry首次期限finishfalse保留。DEV重啟後舊頁Settings出現React useContext dispatcher错误，正常UI reload後恢復，不把初頁當正常驗收。最後GUI finishtrue／manager0 released、host0／users0／socket移除、Web0及PG正常stop；這些是隔離DEV證據，不當正式故障或production-build UI。精確新CI與正式發布另回讀；完整32列與Home／Settings各90仍active。

## 第一百二十一批：完整帳號資料影響盤點與明確重新讀取

- 原APP12 AccountDeletionScreen實際列出23類，原Web只驗證與顯示5類且失敗指示整頁重載。本批按原native labels與v2 DTO補齊23類，包含本人檢舉／回執／審核、共享房間／對方保留訊息、面交、解除購買與他人願望關聯。各類獨立可能重疊，不加總當刪除數；原APP12、後台controller／schema／worker未修改。
- 重新盤點只送原authenticated GET，exact完整count keys／32bit非負integer／canonical capturedAt驗證，30秒等待、原shared cooldown／redirect error及離開帳號取消保持。失敗或畸形結果保留舊數字但標示未確認；有效新盤點前停止delete eligibility，原密碼與確認文字只留RAM。原永久確認、encrypted journal、DELETE與cleanup／回執恢復不重寫、不自動提交。
- 完整Web129files／1998tests，production Web與server build成功；real原deletion-impact routes／專用UTF8 PG55621八件成功，全23類各有真fixture值、anonymous401／injected400／revoked401與對方／outsider身份均核對。這些只讀preview測試不當permanent-erasure驗收。
- 真隔離DEV18925／compiled routers18924，成功完整23類、填入既有current password及指定確認文字後可用、controlled503後舊wish2保留且停用、只新增一個自有fixture wish後明確GETwish3恢复；real DTO某額外category purchaseRecords改負值200被拒絕，再一次明確GET恢复。各refresh只有一個原GET，沒有DELETE／新密碼／對方資料變更；清空表單後原完整截圖實際檢視。這是本機DEV操作，不冒稱production-build UI或正式故障。
- 首次初讀與503保護真成功，但oracle核對流量共用browser IP耗盡真5次／15分鐘securityLimiter，使下一GET429；原failed UI／host1／GUI finishfalse與實際manager0 released保留。修正的是隔離harness oracle的192.0.2.x測試proxy metadata，browser仍原loopback與原limiter，產品規則未放寬。第二次完整五snapshot通過、GUI finishtrue且實際manager0 released，host0／users0／private socket移除、Vite0、PG正常stop。
- 硬碟清理另釋放271.6MB的下載cache與14天以上未開啟IDE舊log，原183source／88compiled inputs／APP及debug expected binaries／172檔復原副本、3273＋5不可變舊證據與目前feature source保持。完整32列與Home／Settings各90目標active；最新整頁90仍110歷史630。本候選650尚待新精確CI、合併、Railway與正式回讀，不標整體完成。


- 首次本機Vite production mode建置仍沿用NODE_ENVtest，因此public正確650 entry不在舊dist；首比較failure保留。新精確release checkout以NODE_ENVproduction建置exit0，沒有產品source改動，六正式JS現在逐byte吻合；CI原production build亦通過。首正式分頁正常reload仍647且更新按鈕未可見、GUI finishfalse／manager0 released保留；第二正常reload已650，三頁與23類盤點刷新全部通過、finishtrue／manager0。首map截圖仍loading不當底圖證據，後續純截圖phase已實際檢視臺灣底圖與63／19cluster，未新評整頁90。
- 發布後外部回執：PR132已合併，exact CI三工作Web1998／server989＋3skip／realHTTP672／upstream native861。正式650原32列保持，23類label與重新盤點只讀回讀通過，六JS逐byte與latest SUCCESS已核對；upstream861不是原APP12 runtime聲明，Home／Settings全頁90與其餘待項繼續。

## 第一百二十批：可操作的帳號安全確認與登出结果導頁修復

- 使用既有可存取dialog取代browser confirm，明示更新密碼或撤銷登入的不同後果；取消／Escape不送HTTP，恢復鍵盤焦點，44px按鈕、中英內容、reload／語言／帳號切換防護保持。待確認內容與token只留RAM，明確確認後只送原操作一次，沿用既有current-password及unknown ACK只GET，不自動重送；後台controller／權限／schema與原APP12均不改。
- 真瀏覽器首次owner7錯誤密碼401與正常撤銷200已驗，但導至login next settings而無結果提示，該回合failure checkpoint與host exit1保持。早期harness notice字串也不符正式sessions-revoked／security-unconfirmed，已依真契約修正而非放寬斷言；僅pathname guard不足，真AuthProvider新兩regression仍失敗。現在AuthProvider在清session前明示正在前往登入，Settings不另覆寫该導頁，抵達login解除過渡；直接匿名Settings仍回login next settings。
- 最新完整Web128files／1982tests全過；real provider／Settings61 focused與兩production build成功，後台安全19 real HTTP／PostgreSQL成功，無新migration。早期全套1978pass1fail為舊nativeconfirm fixture，新導航兩fail與不充分修正的失敗全套保留，不冒稱從未失敗；最後真候選全套實際exit0。既有chunk大於500KB與PWA容量警告保留，未放寬門檻。
- 同獨立UTF8 PG55620／compiled real routers／loopbackDEV18923，fresh合成owner9：開啟／Escape／保留原狀零security HTTP；錯誤密碼401 version1保持；明確確認正常200 version2，原兩JWT401與個人API key不變，結果sessions-revoked顯示且正常既有密碼重新登入。下一實際controller commit version3後harness只將ACK改503，probe401導security-unconfirmed，正常重新登入並GET恢復，撤銷POST仍三次401／200／503，沒有失聯重送。外帳號所有欄位與目前密碼保持。這是本機DEV真操作，不是正式故障或production-build UI；browser沒有新密碼輸入，HTTP密碼變更只在隔離fixture。
- 两正常GUI phase finishtrue、實際manager exit0/released，最終host0、private socket移除、合成user0、Vite0與專用PG正常停止。selected text actual合成credential literal／URL／base64／hex audit保持，未擷取masked profile或聲稱全機／OCR。原APP183source與原129改動、前85–119的3102不可變證據、172檔恢復副本保持。安全dialog原圖保存供驗收，首頁／設定全頁視覺未重評。
- 提交時尚待精確新CI及增量正式部署回讀；此候選不將其餘32列cross端、真mail／provider、privacy、OS／mixedversion、永久操作等缺口標為完成。部署後版本與PR／provider／public assets／實際Explore／Chat／Settings以本批外部回執保存。

## 第一百一十九批：正式帳號說明記住與重開、642核對及原APP副本恢復

- 延續完整32列原APP12與既有Web功能、首頁與設定各90目標；前118與本次硬碟快取清理均有實際進展，未將全功能完成条件縮小。當前外部PR130已发布642，來源及部署與精確CI候選四runtime樹相符；本批没有产品code／新PR／上传或变量变更。五notice／auth／Settings source逐byte對641一致，同当前f13 HEAD重驗ProductNoticeWeb四件成功，不冒称完整642本機回歸。原APP12 notice14件只引用117歷史測試，不稱重跑。
- 既有guest登入說明在641中展開，點非條款「記住」後收合；正常reload與register導覽讀到642仍收合，手動重開後再次reload仍收合，正常login返回表單。兩未後製安全空表單截圖已實際檢視，原登入2欄與註冊6欄／44px操作完整；沒有建立帳號、資料移轉、條款同意或新密碼輸入。元件測試涵蓋storage failure／visit-only，但本批没有真browser storage fault，不把正常記住當全部失敗分支通過。
- 首identity phase看到已過期登入，deadline finishfalse；cleanup遇context reset没有执行凭證輸入、原MCP handle随后missing，actual finalexit没有恢复，不补造0。cleanup-retry則確實正常輸入既有QA帳號／密碼並到Settings，但原field比對false後到期，不能當own928 UI證明。新profile-identity normal hard reload後仍false／finishfalse；最後profile-method正常phase finishtrue／actualexit0／released，唯讀診斷觀察phone/email property有遮蔽字樣，且attribute與property不相等。這說明原比對無法認領browser身份，不當別的帳號證據，也不繞過工具遮蔽。收合contact後正常到642 Explore h1，只有一Settings link；正式未做profile／security／marketplace更新。
- 獨立正常API登入確定既有QA928，只有login POST與前後me兩GET，profile bytes一致；private profile/token在RAM與0600 Unix socket使用後釋放，selected text literal／URL／base64／hex audit成功，無raw private欄位保存、不冒稱圖片OCR／future檔全機audit。原host actualexit0、socket移除與ownGUI lease／queue皆0。正常notice与profile-method管理工具exit0不代替其他failedphase成功。
- post首檢發現原75 APP build app-derived bundle消失，183來源與88compiled source、3022原證據仍通過；失敗source／exit1保留。按原manifest兩expected executable SHA尋到唯一保留bundle，復原到原路徑，兩hash相符，沒有APP重編、簽章、重裝、reset或device資料改動；另在Documents保存172resource檔逐byte相符持久副本。刪前完整resource manifest沒有，不能宣稱全部原resource逐檔歷史相符。下一post誤讀/health SPA為JSON亦保存exit1／source，依真server route改/api/admin/health後完整post成功，未放寬health斷言。
- fresh正式642版本、登入／註冊／探索／聊天／設定SPA與原admin health200，latestRailway32e3265d-33ad-491e-8270-8024e5f67b2a SUCCESS／providercommit f13及uploads mount保持；external130 exactCI三工作與四樹已核對。public200不代替未實際操作頁的UI，本批只新確認normalnotice與Explore，不借118的641 Chat h1當642 Chat UI。原129其他workspace改動保持；最近整頁90仍110歷史630，642尚未重評。storage failure真browser／security確認及其他matrix跨端、mail、provider、privacy、OS／mixedversion、永久操作待項全部保持，goal active。

## 第一百一十八批：原地圖顯示回執恢復、641增量發布與正式取消核對

- 前117是progress，確認外部PR128新版639的手動地圖與隱私改動並保留舊636歷史證據。這批沿用真最新639源碼，修正MyListings的手動一小時顯示／停止在回覆丟失時沒有原操作的缺口；在既有owner／API scope加密journal與不可變管理回執增加MAP，先保存完整UUID／consent body hash／原version，重開只GET原回執與最新商品，明確retry仍同原UUID與body，不盲目重POST或續期。新nullable deadline migration保持舊EDIT／STATUS／EXTEND精確projection與所有狀態／hash／版本CHECK，native direct PUT共用transaction且保留原endpoint；沒有改original APP。
- 使用原MarketplaceDialog保留一小時約2公里模糊位置、非即時位置、不自動續期及取消後果，鍵盤焦點／Escape與中英內容保持。原deadline可以已過期，不誤讀為現在仍顯示；原MAP APPLIED version與较新另一端狀態分開比較，同version嚴格核對deadline。Listing／聊天／其他欄位與owner fence不變。
- 完整本機Web1962、server957+3既有skip、兩production build成功，專用UTF8 PG55618與real routers管理／Apple remediation整合29pass。初28pass1fail是重構direct PUT時漏傳已驗consent，實際exit1／log保持，修正後29pass與重新build0；未放寬原consent、其他owner404或正式HTTPS gate。先前查錯不存在檔案及FAQ placeholder patch拒絕亦照實保留來源／工具紀錄。
- 真合成owner11／outsider12、單件合成商品、backend18920與DEV18921，正常cancel零operation，check-in2與stop3；實際MAP commit4後外部harness只丟回覆503，舊direct PUT正常stop5後同tab重開只GET原receipt4／最新5，UI分開原deadline和目前隱藏；未commit503→同tab重開GET404零自動POST，明確原UUID／完整body重試APPLIED6，再正常stop7。六UI POST狀態200/200/503/503/200/200、五原UUID／五回執、全其他欄位及旁觀帳號不變；這是實際localDEV source與真controller證據，不冒稱production-build瀏覽器、正式故障或原APP12 native runtime。正常與recovery-retry GUI finishtrue；首recovery initial guard發生admission前、等待同一官方call但phase到期finishfalse且沒有fault／產品request，未冒稱成功。
- PR129 https://github.com/HankHuang0516/wishlist-app/pull/129 已附此task並合併，candidate4a1b8f9b64af18df9628113c1c285cf5d8214554、merge9632875a09a53c1ac8b5cc3bf8e91e800529e1ec、empty trigger327d001b0a8c422d216069b66cce43ce292589aa。exact candidate CI37133985133三job成功：Web126files／1962、server61+1skip／957+3skip、real marketplace42／663、upstream native44／861。保留外部128原mobile／worker樹，本PR无native或worker修改；upstream861不是原APP12的861件或runtime聲明。版號為base gitcount640+1=641，按每完成功能即部署授權發布。
- 既有服務CLI由乾淨exactCI四樹上傳，deployment6cab332c-a83a-4701-be71-fcf6ebe39ba2 SUCCESS且最後再次fresh latest同ID，provider metadata實際null，不虛構commit。uploads持久mount／vars不改。正式meta／web-version641，entry、Explore／Chat／Settings／MyListings五實際JS與同本機productiondist逐byte一致，四SPA及health200；public200自身不當UI成功。候選integration docs的等待CI／部署字樣是提交當下記錄，當前實際狀態以本完整矩陣及本批final proof為準。
- 正式既有tab7正常reload先讀舊639meta和641更新提示，正常goto我的商品後真641載入三手動地圖button；非自有QA身分未確認，不登出／改帳號／提交MAP／security。新確認窗的一小時約2km／非即時位置／不自續／可取消与两44pxbutton，Escape與明確取消均guard內實際關閉。原exact link「探索」role locator在第一formal phase no_matches／deadline，後guard因phase已到期拒絕，finishfalse與selector診斷保持；不把該phase標完整成功。第二formal-nav phase finishtrue但初h1空是lazy載入shell，未算功能內容完成。第三formal-ready首guard於admission前ENOENT，實際ownQueue仍pending，同一call獲准後正常等可見heading「探索商品地圖」及「聊天與面交」三次真641、六nav／唯一設定；完成前guard、tab標deliverable及finishtrue，兩次正常後續GUI均exit0／released。沒有讀取或保存private帳號input／訊息／商品details，也沒有把helper API journal當全瀏覽器網路零寫入證據。
- 正常runtime既有QA928 API登入及GET me／owned listings，隨機未存在management receipt正常404已經過新Prisma projection，純GET沒有DB配置數量證明不虛稱配置零；原APP12確切managedListing parser在RAM讀正式三筆owner資料成功，只是原source與新資料schema契約，不是原native真UI。profile before／after bytes一致；無正式listing／MAP寫入。既有QA与token變體選定88文字檔audit成功，不稱涵蓋future artifacts／OCR；合成host selected62檔audit及host aggregate passedtrue／exit0、userszero、serverclosed／private socket移除，Web0／PG正常stop、55618／18920／18921closed、自有leases／queue0。localTab42真關閉，正式探索tab保留。
- release preparation首assert因status strip與untracked directory projection失敗，候選doc／README已写但未commit，原source／failure保存，改idempotent與原raw status後17path exact source proof一致，未隱藏初失败。post preservation首將「原第75批」誤當編譯檔75件而assert失敗，原source／exit1保存；按原build manifest实际88個source逐hash核對及原APP／debug binary通过，不修改APP或削弱逐檔檢查。finalize首matrix count assert在修改matrix與archive之前失敗，後一修正亦因實際原表31個功能列而停止；兩初source／exit1保持，subheading診斷只是假設不當事實。歷史稱32與實际31不一致，本批保留全部31原列並把外部639新增手動MAP隱私／回執恢復明列第32項，不移除、縮減或冒稱舊32項已驗。原129无關修改、183原APP source与所有85–117共2870原證據不改。完整32列、Home／Settings各90與正式／native／mixedversion／privacy／provider／mail／OS／security／永久操作待項繼續，單次feature／deploy不把goal判完成。

## 第一百一十七批：帳號說明補驗與目前正式639部署核對

- 上一輪116屬partial security progress，真後台與19／30／19契約證據保持，原browser確認與host exit1仍未冒稱完成。本輪先從完整32列選取Weesh改版帳號說明，不縮減原APP12／Web功能和視覺門檻；另檢查來源地區規則，原核准臺北行政區未明示與三縣已知行政區規則一致，沒有放寬geo gate或為測試改產品。
- 原Web ProductNoticeWeb四件與原APP12 productNotice十四件實際exit0／full logs保留，APP沒有重編。這些驗證說明版本／API service隔離、三欄metadata、storage failure／visit-only、正常原登入表單與非條款確認。fresh最新639的ProductNoticeWeb／productNotice／Login／Register四個source逐byte對636一致；不能因此冒稱新639全套本機回歸或正式UI已操作。
- 管理GUI actual exit0／released但deadline已到、finishObserved false，後寫finish檔不當正常收尾，tab deliverable mark於phase後未guard，已如實記錄不作功能UI成功。实际browser inventory仅正式tab7，先前local41已不在inventory，不稱由本批取消確認。首browser handle缺await的實際binding錯誤保存，改用documented await後正常讀Settings；首observed loading沒有誤當完整頁，後正常讀到帳號安全與原表單。以runtime參考帳號做DOM值相等比較只有boolean，結果false；不認領別人session、不登出、不提交任何auth／security／register／migration或記住說明。正式remember／reload／login-register／重展開仍待，沒有GUI成功證明與新截圖。runtime identifier已釋放，沒有輸出憑證值。post首錯誤期待finish true造成exit1、後未先檢查post就啟finalize而缺proof exit1；兩次失敗及原source保持，首finalize未寫matrix／archive，修正後依次核對actual terminal結果。
- 第一次沿用636 latest斷言實際exit1；fresh獨立provider診斷發現外部已合併PR128：639／deployment db0a1cdb-99d7-46a3-a8b9-886d6e4b0b1b SUCCESS、providercommit6dd831fe8db54da0887f17d8c37720333bf435b7。保留失敗，沒有為了對齊舊測試回滾或覆蓋新版。只fetch refs，historical integration HEAD／四樹仍clean636。PR128與exact merge CI37130104709三工作實際SUCCESS已回讀，不冒稱本批建立或合併该PR。
- 最新public read直接由639 HTML的真entry及observed JS references找到探索／聊天／設定／登入／註冊／ProductNotice六lazy資源皆200，五SPA含639metadata、health JSON ok，uploads mount保持。首次資源regex誤匹配NotificationsSettingsPage，actual exit1與原helper source／diagnostic保持；改成observed完整basename等值前綴後exit0。只有公開bytes SHA紀錄，未宣稱639與舊636 local dist一致、新整頁90、或未執行的正式guest操作。
- 外部128有手動一小時地圖顯示／預設不顯示、搜尋時效、檢舉及upstream mobile変更，需要繼續對原APP12跨端和混合版本核對。primary原APP12 source183、QA compiled inputs／APP與debug binaries及129無關修改仍保持；本批不改APP／產品、不建新CI、不重部署，前85–116共2833不可變紀錄與歷史failure保持。只補帳號說明列及最新provider狀態，不把全32列或完整goal判完成。

## 第一百一十六批：安全契約真後台補驗與未完成的瀏覽器確認

- 上一輪115分類progress：增加同隔離nonpremium／quota用完與Web失敗／重試、原APP12兩case證據。這輪從當前完整32列選取修改密碼／撤銷所有裝置，未縮減目標。integration clean636 HEAD／四樹及原APP12 source183／75編譯輸入／APP、debug binary與129原修改保持；不改產品、不做新CI或部署。
- 既有Web AccountSecurityPanel／accountSecurityWeb兩檔19件、原APP12 accountSecurity30件、real routers／專用UTF8 PG55616的accountSecurity integration19件實際pass，完整logs保存。HTTP19含同後台wrongpassword保持／版本0 legacy／更新密碼與舊JWT及personal key撤銷、併發安全更新、一次性reset／verification／OTP、role欄拒絕與秘密不回profile等；mail service為原套件mock，X-Forwarded-For原測試IP僅專用隔離DB，不稱真mail或正式限流驗收。初native誤用Jest flags，實際Vitest拒絕exit1；原source／log／result保持，依package.json改正後30pass，未重編APP。
- 另unchanged636 compiled real backend18917正常登入user7（專用合成user）、wrong password PUT401後原session GET200及authVersion0保持，正確PUT200的changed／requiresLogin／personalApiKeysRevoked真ACK核對；兩次原正常login JWT與原personal API key讀取401、舊密碼正常login400／新密碼login200，authVersion1及原reset／OTP／API key清空。僅runtime產生自己的合成憑證，沒有改用戶／正式QA928密碼。為session保留測試再種專用fixture key；不作廣泛授權或真平台key聲明。
- Same636來源Web DEV18918正常auth/login200與profile讀回user7、Settings正常展開security、六nav／唯一Settings。沒有於瀏覽器輸入新密碼或送密碼更新；browser password變更依工具規則仍需要本人handoff。以現有測試帳號目前密碼點撤銷，原window.confirm確實開啟；此GUI尚未完成cancel／wrongpassword／confirmed revoke／lost-ACK，更不能把HTTP和component pass替代它。最終journal browser security mutation為0、user authVersion仍1。
- 首click的Input.dispatchMouseEvent timeout後高階getJsDialog undefined，初部份JS宣告因前一步中斷未建立也保存；deadline guard拒絕後續UI。新lease Page.enable後fresh Page.javascriptDialogOpening真event有hasBrowserHandler true和原後果說明，但高階接口仍undefined；正常Page.handleJavaScriptDialog取消尝试在Emulation.setFocusEmulationEnabled timeout停止，未宣稱已取消。native Codex app由Computer Use安全限制拒絕，未操作或绕過；一般Chrome連線实际不可用。關原自有tab也同focus timeout、另同browser documented interface仍undefined。沒有替換window.confirm、把確認改成自動true、关闭保護或改產品來讓測試通過。
- 四個官方GUI call自身exit0／released，前三phase到期未finish，最後direct-cleanup phase finishObserved true；均不當安全流程UI成功。標snapshot-cancelled的獨立正常後台check只驗security POST0與version1／key／旁觀帳號保持，沒有證明原視窗已取消。自有tab41未稱關閉，已排隊顯示原tab並請使用者如看見原確認按取消；在回覆並正常UI核對以前仍保持此驗收未完。
- 正常finish原host時recovered proof缺失，所以實際host exit1／aggregate passedfalse，原failure code／journal保留，不把cleanup成功冒充整體成功。仍正常關18917、private socket移除、自己合成users清零、Vite18918 exit0、PG55616正常stop、三portclosed與own lease／queue0；沒有停止別人process或reset／erase／shutdown device。runtime RAM真合成password／email／keys／nonce及所有已觀察JWT literal／URL／base64／hex掃37個選定文字檔通過，不聲稱掃全部future檔、OCR或全機PII。
- fresh正式Railway f3cce895-986e-4cee-837b-75dd448bce19仍latest SUCCESS、636meta／四JS逐byte與原production dist一致、三SPA及health200，原uploads mount／vars不改，providercommitmetadata實值保留。原85–115共2764不可變證據與115 manager errors／113、114、111、112歷史失敗不改。只追加安全列本批正確範圍，完整32列及正式／cross-end／privacy／provider／mail／OS／mixed-version和視覺門檻仍追蹤，goal active。

## 第一百一十五批：原APP12與同636來源Web的隔離非會員、月免費額度用完與讀取恢復

- 本批驗收既有已發布636功能，不創造新產品修改／版號／PR／CI／部署。integration HEAD 3bbdb6440da8dbfdbce2034e431ed2cb024fb21c與四樹乾淨保持；原APP2.0.12不編譯、不重裝、不reset，183來源／75編譯輸入與APP、debug binary逐hash不變，原129改動保持。外部XCTest runner另編譯簽章，只改測試程式，原APP不存在的生日／姓名／地址／privacy編輯不發明。
- 專用UTF8 PG55615套用44既有migration，原636 real backend18915正常auth/routes，未改response狀態或繞req.user。合成buyer5非會員、freeMonthlyLimit3／used0／永久0／paidfalse；同user5三正常marketing POST202建立三PENDING root jobs，第四POST429 MONTHLY_LIMIT，讀回used3。商品與照片只是隔離配額prerequisite，未公開正式網站、未启动provider worker、未做圖片生成／交易／付款／mail。每筆profile正常200仍同完整SHA c2fd6405f8c83ad27fb3a35f85849215d7487a06ba4cf694ebaa0065e38b3d44。
- 原APP12重用自己原device，configured available與exhausted各真SDK1/1、Node exit0及外層Python exit0，重新正常登入再進入我的，真非會員／購買未開放／付款暫停／永久0與用完notice兩狀態核對。外部runner hash78334f592ffc6f18971d86fd907c309b272db99468f7880f31d76a8cd3e91fc2；SDK summary、原截圖與attachment manifest另存。framework marketplace-meetup／marketplaceFixtureSeeded是舊generic欄位，不能當本批面交／聊天fixture或交易驗收。初user3 available額外1/1保存，不把重複case增加成三種狀態。
- Web初使用production dist配loopback HTTP，真Settings被既有HTTPS pendingScope gate擋住；失敗原檔保留，不放寬產品gate。後改同乾淨636 source的DEV18916→原backend18915 proxy，API status／response bytes保持；這是DEV隔離跨端驗收，不是production-build UI或正式非會員驗收。user5 available→exhausted notice與zero／paused／no payment button或link正確；僅browser inspector阻擋marketing GET，真失敗顯示未知餘額而不用舊值或零次；finally移除blocking，明確Retry users/me與marketing兩GET200恢復used3／無alert。nav6與唯一Settings保持，raw JPEG1280×720未裁切，隱私輸入空白／聯絡收合。
- 三次native manager工具都返回error，最後兩次error文字帶Python exit0，內部實際Python／Node／SDK成功不能抹掉manager錯誤。沒有manager exact exit code／release flag，原因仍未確認；另live status own lease／queue0。最終第三GUI官方exit0／released true且finishObserved true；第一GUI功能失敗但工具正常release，第二GUI超時未finish也完整保留，不稱每次UI都成功。
- 初host觀察器讀Express mounted時可變request.path而沒捕捉正常login token，helperexit1；改用入口凍結path。第二host缺synthetic worker callback token導致正常配額POST503，used仍0、finish時未exhausted所以exit1。兩個失敗host原code／journal／exit1／清理零筆都保存。第三host僅隔離環境生成synthetic callback token，沒有用正式provider key、放寬正式flag或啟動worker，整體正常finish與host exit0。自己的Web exit0、fixture全清零、socket移除、PG正常stop；55615／18915／18916關閉，未停止別人process或erase／shutdown device。
- 既有Web AccountBenefits6與原APP12 AccountSecurity30件實際pass，外部receiver compile0；不是新全面CI。第三host RAM实际合成password／emails／所有已觀察JWT tokens literal／URL／base64／hex掃10個第三host選定檔與四種native SDK console/action log通過，第二host另保存自己的audit。此audit沒有涵蓋所有115檔、callback token、OCR或全機PII，不作全部憑證／私有值都掃到的聲明。native原圖全部private local-only0600；Web本輪測試圖已視覺核對只含空白個資欄與狀態，交付時需標隔離DEV測試。
- fresh正式Railway f3cce895-986e-4cee-837b-75dd448bce19仍latest SUCCESS、uploads mount保持、providercommitmetadata實值保留；public636 metadata、entry／Explore／Chat／Settings各JS逐byte等於原production dist、三SPA與health200，未新upload或修改vars。APP原版、85–114不可變2615證據及113／114／111／112原失敗保持。僅更新矩陣權益／付款兩列本輪隔離case證據，完整32列正式／跨端／永久動作和視覺完成條件保持，full goal active。

## 第一百一十四批：正式來源聊天未知行政區讀取修復與發布

- 第113批完成使用者指定633部署時揭露真來源inbox GET200仍有alert；本批依原完整目標與每功能完成即部署授權繼續修復。先fresh確認clean main 14f6ad6e0bcb1962ce2111cabca5291b6f28b12c，保存2527不可變紀錄及原129改動，版本HEAD數635加一636。APP2.0.12不改，沒有重定義完整goal完成条件。
- 真正式QA928正常登入、profile與source GET200，五筆context只有一筆臺北市／行政區未明示，未帶locationPrecision；URL／title／price／routing基本檢查正常。現有storedSourceContext要求正式行政區，後台public/detail已識別COUNTY_ILLUSTRATION但owned inquiry projection漏marker。因此同一新案例在產品修改前真測試15項中4fail／11pass，完整tool輸出曾truncated如實保留summary，不偽造untruncated log；一次patch驗證失敗原子未套產品也保存描述。
- 僅owned inquiry context追加由現有已核定lead evidence推導的COUNTY_ILLUSTRATION。ordinary context不加marker；Web只讓明確marker與臺北市／行政區未明示同時成立的case通過，未知marker、其他行政區、非臺北未知值仍拒絕。marker在原歷史context保留，沒有新座標／取貨點、歷史media仍[]，source chat以繁中／英文明示概略位置不是取貨點；原title／amount／question／UUID、owner／receipt／write與權限規則不改。
- 10新Webcases涵蓋双語mixed history全顯示、4無效位置拒絕、withdrawn原context保留、原clear retry、兩語純display無POST；focused2files45pass，full126files1954pass／build0。localServer955pass加3既有skip／build0。新真隔離UTF8 Postgres55614、44既有migration不改，county与source兩真HTTPsuite17pass，owned marker／foreign與anonymous拒絕、withdrawal／rolloutOFF保留、重複GET不新增／改原inquiry實驗；自己的PG已關閉與portclosed，沒接正式DB或停止其他process。
- PR127 https://github.com/HankHuang0516/wishlist-app/pull/127，candidate a3a63d55e864f227bfd1cc43d424981e8180f52e，精確CI 37122153862 三組全success，實際Web1954／Server955+3skip／HTTP654／upstream15 native859另存counts；不是原APP12新增runtime驗收。merge c7395c006836a657dfa6acbcee273f1eda126ded、empty trigger 3bbdb6440da8dbfdbce2034e431ed2cb024fb21c，乾淨候選四樹由CLI上傳既有service。Railway f3cce895-986e-4cee-837b-75dd448bce19 SUCCESS且latest相同，原uploads mount／vars保持，providercommitmetadata實際返回值不補造hash關聯。
- 公開version／meta636、entry與Explore／Chat／Settings資源逐bytes對production dist、health与三SPA200。fresh正常QA source讀回五筆與一筆未知臺北marker；移除新增locationPrecision後整份JSON SHA与633原response c78c1d2aabb703802adfe8cd0b65b0808fb92352ca305ecf0f68a0278d116ca4相同，原context／thread／state／price等所有值保持，profile在正常GET前後bytes一致。原payload与credentials／token仅RAM，選定檔掃真credentials／新token literal／URL／base64／hex，沒有聲稱不在RAM的舊alias或全機PII掃描。
- managed正式GUI以正常更新633→636，不清cache／storage／journals；同正式帳號真讀五筆、選明確未知行政區原來源history，概略位置說明與原owned詢問可讀。只把browser inspector該source GET受控阻擋，真alert仍保留五筆原列→finally移除→原明確retry取得source200／五筆恢復；不是backendoutage，不送問／consent／cancel／訊息／profile寫入。真DOM nav6、唯一Settings、1280×720及636三頁保持，原截圖pixels另記，不裁切或等同DOM。官方managed phase完成exit0／released與own leasequeue0。
- 首段GUI等待更新按鈕曾timeout，原deadline到期未finish，後續guard在任何UI動作前阻擋；正式managed結果exit0／released仍不冒稱驗收完成。第二段真讀到網站更新已就緒，按更新網站→我已保存，重新載入成功633→636並完成來源清單與失敗恢復；其Settings metadata是重新載入後元件尚在載入的快照，僅作版本確認，不能充作完整Settings畫面或人工90。後續來源卡片helper閉包名稱未更新產生兩次strict selector ambiguity、一次拼接AX文字exact role no matches，均未click；原deadline到期guard再次阻擋，原診斷與官方release保留。最後另獲管理phase，以可見商品名稱唯一filter完成真owned GET200／位置說明與探索畫面後finish與release，不把工具選取錯誤當產品故障。
- 最後GUI曾有一次官方queue timeout，未取得lease、未操作UI；另一次依同session排隊取得資源，唯一filter完成真owned GET200／notice與Explorer screenshot，finish後官方exit0／released。這些原queue與selector錯誤均留檔，不冒稱每次phase成功。
- 此批功能修復實際發布，先前113sourcealert仍是當時真失敗不可變，現已另以636證據關閉；原111／112native／Web benefits以及112 host marketing429exit1與manager error／独立recovery保持。Home／Settings產品source無變，110原完整各90是最新人工整頁score，不虚構636新score。所有其餘完整32列條件與goal active保持。

## 第一百一十三批：使用者指定立即部署目前最新網頁進度

- 使用者明確要求把最新網頁進度發布並提供連結，接續「每完成功能就部署」授權；本次正式發布2.0.633到既有Railway project／production／service，無新網站、環境、權限或外部通知。原APP2.0.12與整體功能對齊目標保持。
- 起始main ee7515994a8cb5085fd0f052d563f168a7594727、Git數632，版號按HEAD數加一633。只提交client package版本／lock版本、已完成到112批的功能矩陣，以及SettingsInstall既有heading wait上限五秒；依精確expected paths提交，保留原129未提交修改，無產品功能source、server、native或worker改動。
- 第一次完整測試1943pass／1fail：Home轉Settings的lazy heading未在預設一秒內觀察到。原14項未改程式單獨重測全過，只能推論是負載下readiness等待敏感，不聲稱正式網站功能故障或已證明具體CPU根因。保留原log／exit1與focused結果；不刪任何安裝斷言、不改global timeout，僅既有真頁面heading await改bounded5000ms。修正後完整126files／1944tests全過及build0。
- PR126 https://github.com/HankHuang0516/wishlist-app/pull/126，候選 8093b191655143127ca8c91fc920a790ae6e4187，精確CI 37120570247 的三required jobs全success；實際各測試數另存ci-test-counts，不把upstream15 native CI當作原APP12本次runtime。merge 956c8bcf3bb947c12b6908a81ba14d9786d24506，empty deployment trigger 14f6ad6e0bcb1962ce2111cabca5291b6f28b12c；CLI只從乾淨精確候選四樹checkout上傳。
- Railway 4fcf3238-d86e-4199-9c51-87168edabfd3 SUCCESS且latest ID相同；uploads原mount保留，未修改vars。providercommitmetadata為實際返回值，若null不補造Git關聯，精確source／CI→CLI returned deployment ID另存。公開version／index meta633、entry與ExplorePage／ChatPage／SettingsPage逐bytes對local production dist，health與三SPA路徑200。
- 原已開網站透過正常更新／重載取得633；不清除快取、local storage、private journal或帳號。managed own GUI階段逐實際Explore／Chat／Settings route、meta633、1280×720、六個導覽、唯一Settings入口核對。只導覽與網站更新，無profile／privacy／付款／訊息／商品寫入；探索原viewport截圖供部署結果查看，沒有以633重新宣稱整頁視覺90。管理階段完成釋放與own lease／queue0。
- 實際聊天來源代問顯示read alert。透過原「重試讀取來源對話」只dispatch正常GET，觀察/api/source-leads/inquiries/mine真200、未truncated，但提示仍存在；不是已證明network outage或429。回應僅RAM讀取，保留五筆type／length／UUID等安全shape而不存原title／URL／contact／payload，基本shape正常不足以證明所有parser條件。根因與完整來源對話驗收仍待，未修改產品或正式資料，不把200／入口可開當成完整功能pass。
- 初Settings metadata在reload尚未完成時630，原sample逐bytes另存並排除，真正等633meta後重新核對。第一managed GUI105秒deadline結束、官方exit0／releasedtrue，但finish flag false；晚到操作被guard拒絕且沒有UI／network action。另取新managed phase完成實際read-only重試、正常Explore真圖與finish、官方exit0／releasedtrue／ownleasequeue0。原1265×712 JPEG未crop／修改，DOM1280×720另存，不混稱兩者相同pixels或fresh90。
- 第111／112批原APP權益實際success／controlled failure／recovery以及112原host marketing429exit1、manager toolerror無exactwrapperexitflag、後續獨立normalread200全部保留；本次發布不改寫那些結果。85–112共2463不可變證據保留，183原APPsource／compiledinput／binary未改。其餘原完整32列驗收仍待，整體goal active；本次明確交付「最新版已部署」與可開啟連結。

## 第一百一十二批：原APP12權益讀取失敗與重新進入恢復，整體收尾失敗及獨立核對

- 本批接續第111批已驗正式Web權益success／browser GET failure／explicitRetry及原APP12同正式928正常讀取，補原版native既有的失敗與恢復分支。不改APP／Web產品，不虚構新CI／PR／版本或重複部署；原183 native來源／75原compiledinputs／APP／debug、integration同root與四樹、129原改動逐hash保持。第110批当前630完整Home与Settings各人工90仍是最新視覺證據，不重新評分或合併為平均。
- 新external runner獨立編譯簽章，compiledXCTestSHA 89668e5e06e31cdf63086b6cf3a6e40db024949cf57d30539f66c0c5cc9d02fb，來源逐檔另hash，原SDK inputguard不改。唯一assigned原device與原APP12 DEBUG／build12，正常fresh QA928登入，唯一input action login-buyer。framework marketplace-meetup／marketplaceFixtureSeeded仍只為原hookmarker，不建DB fixture／PG listener、不驗面交或種資料。
- localhost18912 test-only mode先arm failed，只對下一次原APP marketing/availability GET回503，實際journal1次且notForwardedToFormalBackend；其餘正式GET與正常登入原status／bytes未改。App的users/me真200仍讀premiumtrue，但Promise.all錯誤依原邏輯把會員與allowance設未知。真UI讀到會員狀態暫時無法確認、永久餘額暫時無法核對、付款仍暫停；錯誤畫面沒有用已知永久0或既有會員copy代替。這是local proxy受控read故障，不是正式後端宕機、非會員、免費用完或付款驗單。
- 原APP沒有explicit benefitsRetry按鈕，真正既有恢復方式為點首頁離開→test-onlymode恢復normal→重新進入我的觸發新兩GET。實際正常formal marketing與users/me200，真UI會員原平台管理與永久0恢復、未知copy不可見，兩個狀態PNG保留且SDK附件bytes各與原圖一致。XCTest與nativeSDK自身result1/1／privacyAudit true，APP來源及binary完全不改；不把這次原版runtime誤當upstream15 CI或商店release binary驗收。
- 原整體收尾沒有全成功。正式hostfinish時users/me200已返回，下一個marketing/availability429令helperexit1、沒有formal-benefits-after aggregateproof。原host失敗／journal／code完整保留，test-mode已normal、proxy與sock已關閉。source順序可推斷profile selectedRAM比較已到達後才呼叫marketing，但這是來源順序推論，不把未保存的aggregatehostproof補寫成pass。初publicversion／health序列也429，當時未保存精確path／headers，不能指定原因或和第111批早期reload受限作因果對應；後續單獨health診斷200、500;w=900／reset686只代表這次回應。
- native-manager官方call回tool error，內含已完成1/1與五stage stdout，沒有提供exactexitcode或releaseflag；不猜成124／0、也不聲稱原wrapper succeeded。原結果保留。後續独立live-status ownlease／queue0與原ownPID65484不再存在，18912／18887與contextsock皆閉；沒有手動釋放活躍lease、停止其他task、關閉／erase任何device。具體工具收尾根因仍未確認，不以SDK成功抹掉wrapper錯誤。
- 稍後獨立正常QA登入→profile／marketing／version全部200；不偽造IP／header、不繞過限制、不重送產品寫入。只在RAM讀payload，profile完整responseSHA da1214a6499cb3d50dcf8e88e58eeccf8b4dffe3d2ae36344797126d97dfb150與原native失敗前及正常重進後所有profile200 bytes相同；allowanceSHA 33d4d389b0a4d1163ab4f4bea9289a0635713cd986c0411c35ae521551b846dc與native recovered真200 bytes一致、expected會員true／免費3已用0／永久0／paidfalse。這項獨立byte比較支持資料保持，但不改寫原host整體exit1。新readhelper實際terminal54424exit0與正常恢復proof單獨保存。
- 第一次external postguard把429path猜為users/me而exit1，原source保存；讀untruncatedjournal才確認users/me200→marketing429。初description把selectedRAM comparison與整體finish混說，也逐檔rename原bytes保留，另外寫更正metadata與來源順序推論，不改原照片、rawresponsehash、SDK或host結果。read-onlyapp.ts猜路徑不存在亦未產品修改。外部metadata修正不是產品功能或新驗收操作。
- 原nativehost在完成後15選定檔掃runtime實際QA credentials／buyeralias／tokens的literal／URL／base64／hex，完整SDKconsole／action兩log類型檢查；獨立recovery另掃20選定檔／新login token，原已關hostalias不再於RAM可用，不聲稱新alias重掃或所有future檔／OCR／全機PII不存在。兩PNG均含profile顯示名稱，以0600和privateLocalOnly保留、不公開嵌入。
- 最新仍3c34af9f-0f0d-4815-b96a-ac5ae4799e79 SUCCESS，version／health200與entry／SocialPage bytes對精確已發布CI與localdist一致，uploads mount與vars不改、providercommitmetadata實null。第111批Web6＋原APPsecurity30現有測試結果保留，本輪不重跑或加算成新37測試。85–111共2403不可變紀錄保持；此批progress。非會員／月用完runtime以及其餘原完整32列正式跨端、privacy／provider／真mail／OS／mixed-version／security credentials／permanentaction-time等需求保留，完整goal active。

## 第一百一十一批：原APP12與正式630同帳號權益讀取、Web受控失敗和重試恢復

- 這批驗收已部署630，不虛構新產品功能、版號、PR、CI或部署。integration root／client／server／mobile／worker四樹保持；原APP12 source183、75原編譯輸入、APP與debug逐hash一致、原129改動保持。現在repo upstream mobile15的CI不能代替這次原12真runtime；外部XCTest runner獨立編譯／簽章，activeRunnerHash是XCTest executable SHA bd31a5a8196af25e393ec73863aac78c9ea5be0827d6bb300c9503a4faac8879，來源逐檔另hash，不混為同一SHA。
- 原APP AccountSecurityScreen「我的」真正對齊範圍為刊登／管理入口、預設收合帳號安全、贊助／尊榮／行銷加值與既有後台。原APP沒有Web生日、姓名、地址或privacy編輯欄位；本批不增加APP、不發明跨端個資欄位寫入、不把Web額外功能移除。
- 正常既有QA928 runtime登入／GET，正式會員true、免費月3／已用0／永久0、paidPurchasesAvailable false。localhost18907僅正常登入POST把原framework合成buyeralias於RAM轉成原正式憑證，其餘只允許GET，正式API的status／原responsebytes逐筆未改、同owner／會員及allowance核對。首頁正常背景GET一併保留方法／path／status／bytehash，無新listing／wish／chat／follow／profile／payment寫入。沒有PG listener／DB fixture；marketplace-meetup selector與marketplaceFixtureSeeded true只是原SDK hook marker，實際外部hook不建fixture，不拿它當面交或種資料證據。
- 原APP12 DEBUG在唯一已指派原device正常fresh登入→我的，刊登／管理存在、account security收合、目前密碼不可見；真UI1/1讀到付款暫停、未收款、既有會員原平台管理、NT$90／月、US$1／10次、不限期／未開放、永久0與退款管理說明。截圖top／lower為兩個實際視角，nativePNG與SDK附件各對應相同bytes；含profile顯示名稱，全部private local-only，不公開嵌入。只證明本次premium／free3used0credit0讀取，不稱非會員／月用完／付款開通、商店版或native故障重進已驗。
- 第一nativeattempt exit1在未改SDK input guard前：外部helper傳UUID-native別名，但原guard只接受UUID-buyer。未開始登入、UI或XCTest。原attempt、原helper／compiledrunner保存；只把新host別名改為原guard要求，不放寬guard、不改APP。新host正常fresh登入後成功，唯一input action為login-buyer；不是session-restored或繞過登入。
- 最初formal Web成功原圖與三details保持，但網路trace不完整，當時沒有apply block，不採作完整成功／失敗／恢復。次次reload暫時沒Settings欄位：新managed diagnostic fullAX實際顯示帳號讀取暫時受限／安全讀取暫停與兩retry，沒有原失敗HTTPstatus，未推測cache或具體後台根因。公開Settings JS200與精確已发布build bytes相同，只證明該公開asset正常。後來先點重試讀取設定，實際users/me200再marketing與users/me200；另點重新核對帳號，受限提示清除。沒有自動反覆reload／重送寫入。
- 新managed final phase正式630，同928成功三details展開、真balance0與原平台說明；只对此tab marketing/availability設定Network.setBlockedURLs、reload。真GET被inspector阻擋，users/me仍200；權益失敗notice和永久餘額暫時無法核對，沒有用舊值或0代替。exact text locator包含retry button而不匹配，原錯誤保存；finally立即清urls[]，新AX／DOM證明仍保留失敗狀態，再保存原失敗圖。正常重新核對權益按钮真GET兩路200讀回同balance／會員，三details再展開、notice消失。這是browser受控read故障，不是正式後端宕機、commit失聯／新receipt或native故障。
- 初第一networkflags未保存細項、eval來源字串被CUA拒絕、舊closurephase guard在UI前拒絕、猜錯summarylabel、exactfailureselector、diffAX當完整樹誤判、錯meta selector及第一次post-proof把compiled executable hash與Swift source hash混比的失敗都保存。三accepted UI JSON不回填缺失version欄；原JPEG實際footer630、新currenttab正確wishlist-web-version meta630与同origin真wire／immutabledist另核對。最初navigation diff的singleSettings0／versionfalse紀錄排除，最後fullAX與DOM證明Explore heading、六nav、singleSettings1、1280×720、alerts0與blockfalse。
- 五官方GUIphase全部terminal0／release，四finish、一個verifiedphase100秒autoexpire；初success-only／diagnostic並非完整flowacceptance。新success／failed／recovered三圖與真wire都在finalphase deadline內、handoff在自己phase內，native最後官方run0release、ownlease／queue0。host正常finish／actualterminal23914exit0、18907／18887與sock關閉；正式selected個資／privacy／profileVersion前後RAMdeepEqual及權益不變。rawSettings JPEG含生日等，所有Settings／native圖0600與privateLocalOnly保存，不作無PII或公開圖聲明。
- 現有Web AccountBenefits6件與原APP12 accountSecurity30件通過，外加這次原版runtime1/1；不是37個全面UI案例、不是新全CI。新host RAM實際QA憑證、alias與全部已觀察token literal／URL／base64／hex，在70選定檔與完整SDKconsole／action兩log類型掃描通過；此前48檔audit原檔完整rename保留，重複exclusive save拒絕也記錄，fresh audit另成功。後續新檔另掃actual QA憑證，不聲稱未存的RAMtoken掃到所有未來檔／OCR／全機所有私有值。
- 最後既有3c34af9f-0f0d-4815-b96a-ac5ae4799e79仍SUCCESS latest，version／health200，entry與SocialPage bytes對精確已發布CI/localdist，Settings公開chunkba06ca5ff0dcca8877e82719b191a8f4fb95da0fd7ae1db5a54890f474fbb104同原publisheddist；uploads mount／vars不改，provider commit metadata真值null，不虛構GitSHA binding。85–110共2285不可變證據保持；第110批Home與Settings各fresh人工90仍是最新630全頁視覺證據，不重新評分。非會員／月用完、native failure／reentry，以及其他全矩陣privacy／provider／真mail／OS／mixedversion／安全credential與permanent action-time等待項保留，full goal仍active。

## 第一百一十批：正式630首頁與設定完整新視覺審查及手機版核對

- 本批只驗收已部署630，不為新的驗收紀錄虛構產品修改、版號、PR、CI或新部署。integration仍是ee7515994a8cb5085fd0f052d563f168a7594727，原PR124精確CI與四樹關聯保持；原APP12的183來源、75編譯輸入、APP及debug binary逐hash一致，129原未提交改動保持。
- 使用原Hank核准1536×1024配對示意板，SHA256 bdd6b2edde630cef4d366f0776c23d3756759ca6d69612b9779a1b8a1d2ab776。正式兩頁DOM各736×952，未後製camera原圖721×933，真正scroll至Home284／Settings232下半部。原圖實際格式JPEG，最初helper因.png檔名誤認PNG而exit1，原失敗source／診斷保持；修正為檢測實際格式，不轉碼、不改圖，索引明記原suffix與actual format。原概念reference為PNG。
- Home第一次refresh enabled只代表API已ready，照片／lazy map仍在載入，pageHeight1076；原初圖保留且排除評分。其後真正頁尾1236與四張圖解碼、地圖完整署名核對，另managed phase回到scroll0取得settled verified top。配對只有一真group，不補概念三件假商品；價格、照片、假資料／餘額／節日日期不作matching target，但一欄實際空白、metadata、核對提示、聯絡與真方案等額外結構及高度照樣扣分。
- 下表是本agent從這輪fresh圖逐頁人工加權設計判斷，非像素、第三方review或兩頁平均，不繼承96歷史分數。導航以六個具名功能、可辨認圖示及唯一Settings核對，原help／logout保持；概念額外無標籤齒輪依既定單一設定規則排除，探索／方案圖示差異在cards項扣分。

| 第110批類別／滿分 | 正式首頁 | 正式設定 | 當前扣分依據 |
| --- | ---: | ---: | --- |
| 版面與資訊順序／35 | 31 | 33 | Home真願望metadata、可靠性提示、單匹配空白及地圖後收合願望列；Settings額外聯絡摘要與第三真權益列。 |
| 原站配色與字體／25 | 24 | 24 | 實際item／欄位狀態說明較密，原白灰、深色主操作、藍入口與粉藍提醒一致。 |
| 卡片／按鈕／圖示／20 | 18 | 18 | Home真cluster地圖／refresh／未支持愛心與概念不同；Settings公開勾選位置、privacy eye及方案icons不同。 |
| 間距與比例／15 | 12 | 10 | Home1236／Settings1184實際全高，map署名、selector、真聯絡／方案及重複欄位狀態使頁尾下移，完整下半部仍扣分。 |
| 導航一致性／5 | 5 | 5 | 同一共用六具名入口、可辨圖示、唯一有標籤Settings，保留Webhelp／logout。 |
| 合計／100 | **90** | **90** | 各自达到本輪正式人工門檻；不代表全站功能全部完成。 |

- 390×844 DOM／375×812原圖，Home1763／Settings1824頁高；root scrollWidth均375、六導航約54×48與single Settings。Settings兩頁閉合contact／security／advanced狀態沒有main outlying rect；Home記錄的wish strip子rect有local overflow-x:auto ancestor，root不溢出。Home頁尾小數位置844.25與整數maxScroll造成原footerFullyVisible false，獨立按1CSS px tolerance與原圖核對；不修改原geometry。只證明本輪兩頁已開狀態／上與下畫面，不作手機概念評分、整站所有表單或效能保證。
- 四個已存在套件SettingsParity／SettingsInstall／WishHomeWeb／WebNavigation，4檔61件通過；不是新增測試或全面新CI。正常QA928僅一次login與GET users/me／version；selected personal profile及privacy欄位前後deepEqual，值僅RAM，不把API值留存；此說明不包含raw Settings圖，它們確實含本人的私人profile資料，四張原圖以private local-only標記與0600保存，不作公開交付圖。contact保持收合，visiblecredential／phone／email guard通過；無fullSettings AX／input value檔案。
- 最後reset1280×720，在正式導航真正點Explore與Chat，兩heading／path／630meta、single Settings與alerts0核對，再留探索deliverable。六個官方GUIphase全部在deadline內finish／exit0／release，API live session31715實際terminal0，ownlease／queue0。正常profilehelper完成時43 selected files掃actualQA credentials／runtime token literal／URL／base64／hex，後续檔另檢actualQA credentials；非token掃全部future檔、OCR、全機或無PII聲明。沒有profile、privacy、language、message、purchase、mail或OSpermission寫入。
- 最後原Railway3c34af9f-0f0d-4815-b96a-ac5ae4799e79仍SUCCESS latest，uploads mount與變數未改，provider commit metadata實值null；正式version／health200，entry與SocialPage bytes和已發布exactCI build及localdist一致。85–109共2216不可變紀錄保留，包括109正式追蹤往返／兩APPLIED歷史回執；本批分類progress，完整goal active。其餘32列dual-end／formal writes、privacy/provider分支、真mail、OS／mixedversion、永久移除action-time及credential handoff等原待項沒有取消。

## 第一百零九批：既有正式朋友追蹤往返、原回執與只讀重新載入

- 本批是既有已部署630功能的正式驗收，非新增APP朋友功能。原APP社交以ChatInbox為基準，保留Web增額SocialPage。integration仍是108 trigger ee7515994a8cb5085fd0f052d563f168a7594727，完整Git root tree及client／server／mobile／tools/minimax-vision-bridge四樹保持，不改native／後台／migration／worker／會員權益或limit，不產生新產品PR或新部署。
- 現況先驗原85–108共2151不可變紀錄、129原修改、原正式630及同QA928；target是既有合成QA 測試賣家 C（非真實交易）948，正常authenticatedAPI following為0／未追蹤、followingVersion0，target private phone／realName／address／birthday為null。三個原followWeb／useFollowOperation／SocialPage套件26測試通過，使用已發布source。原prepare工具猜了不存在recognition-worker目錄而exit1，原source與失敗結果保持；從actual Git tree定位tools/minimax-vision-bridge後成功，失敗未做產品或UI操作。
- 同原tab7真正點追蹤，原body target948／wanted true／expectedVersion0、單次POST200與APPLIED1。正常API用同browser UUID69a885c6-8130-4e8a-9159-f3323c27e2bd獨立GET回執、hash／owner／原payload及following1核對。UI維持原加密本機pending及暫停新異動；追蹤中頁顯示1／∞與唯一target948，沒有其他人聯絡欄輸出。原已部署schema的操作歷史並未直接DB查核、fixture或seed。
- 第一次CDP cursor在等待期間變舊而truncated，原gap diagnostic及failed reload capture保留；retained buffer earliest request在自有follow phase開始前，真正follow request的wallTime在該100秒內，最初操作與正常API同UUID核對。該舊reload不當zero POST證據。follow與recovery wrapper各自到100秒正常release但finish未寫，deadline guards拒絕後續UI動作；不冒稱兩phase完整完成。提前準備的新unfollow／finish流程每個動作前都確認own marker及deadline，fresh cursor直接在UI操作前取得，兩次正式reload各只有同原follow／unfollow回執GET200 private/no-store，沒有follow POST；fresh trace無truncation。沒有正式network故障注入或未知writeACK-loss聲明。
- 已讀原follow回執後只清相符本機marker，不撤回server follow；重新正常搜尋同target後，真UI單次取消追蹤body false／expectedVersion1，UUID370cc149-6aac-4e4b-9aad-4539204c52b4 APPLIED2。正常API独立读取後為following0／false／version2，原follow回執仍APPLIED1但current是false／version2，明確保留歷史與現在差異；不把account followingVersion重設成0、不刪後台原receipt。正常target整個public profile DTO前後deepEqual；兩receipt匿名讀401。helper只有正常login POST，其餘GET，没有任何helper follow寫入，emergency restoration沒有執行。
- 取消後再reload查同原unfollow receipt，UI確認未追蹤，已讀後清理本機標記的fresh follow trace沒有POST；正常following明確空狀態／0／∞、pending false，安全未裁切畫面保存。最後探索630、single Settings、1280×720 reset及deliverable tab保持。GUI五個官方結果全部released／exit0，自有lease／queue0；本輪沒有啟動native或隔離DB，只有兩個本批正常server receipts保留，關係已還原。
- 四次成功／還原畫面與最後探索都保存原PNG，沒有phone／email／birthday值、API key或credential畫面。正常QA credentials／token只runtime讀原ref；API完成時34 selected files包含literal／URL／base64／hex的actual token檢查；後續54 selected files另外檢查actual QA credentials，明確不是token掃全部後續檔案、OCR或全機logs。原Network header RAM buffer已捨棄，只有selected follow fields／status／UUID存檔，不保存Authorization或其他endpoint headers。
- 最後原Railway3c34af9f-0f0d-4815-b96a-ac5ae4799e79仍SUCCESS latest，uploads mount與variables未改，providercommit null如實保存；正式web-version／health200、entry及SocialPage bytes与原108已發布精確CI build及localdist各自相同。這輪沒有source變更，正式功能本來已在630發布；不為新的驗收證據虛稱新CI／新部署或增加版號。原183 APP12 source、75 compiledinputs與APP／debugbinary逐hash保持。
- 分類progress，整體goal active。原正式90分為96批615歷史，不稱630新版全頁新90；朋友HTTPS avatar provider、設定隱私欄跨端及其他分支、完整矩陣其他待項仍保留。正式follow成功／正常reload往返已補，不代替formal失聯写入／限額／不同owner等獨立分支。

## 第一百零八批：朋友公開清單嚴格編號、正式發布與社交只讀核對

- 原後台getUserPublicWishlists用parseInt，數字suffix／decimal／exponent／leadingzero／whitespace會別名到有效ID，zero／negative回空200、overflow可能500；改用既有followUserId正32位嚴格parser，錯誤400／INVALID_INPUT後不查清單。登入middleware、private/no-store、valid公開清單／隱藏item過濾／DTO及有效不存在ID空集合保持。沒有follow寫入、native或migration改動。
- 新9個actual-social-route＋isolated UTF8 PostgreSQL55608案例在原handler明確失敗，原6privacy案仍通過；修正後15／15。完整localWeb126／1944與build、server61pass＋1skip／955pass＋3skip與build成功。只正常停止自有新PGcluster，檔案保留，正式DB沒有fixture、seed或直接寫入。CI真HTTP全套件數由原joblogs保存，不把15focused當全套。
- PR124 https://github.com/HankHuang0516/wishlist-app/pull/124，candidate 62e3eabf7aba6f91444ffe1817f60836d161ff5e、merge a6fc61ea73bbc28a64bf98c4eb2280965cbc3c10、emptytrigger ee7515994a8cb5085fd0f052d563f168a7594727；精確CI37113996116三job成功，originalAPP12不改。upstreamnativeCI859僅repo15，不代替original12新runtime。server只有controller＋integrationtest兩path，Web只有版號＋README／regressiondoc，worker unchanged；base count629＋1＝630。
- 原Railway乾淨exactCI四樹CLI上傳deployment 3c34af9f-0f0d-4815-b96a-ac5ae4799e79 SUCCESS，最後latest同ID；uploads mount及variables不改，providercommit按actual值保存不假設Git綁定。web-version／indexmeta630及entry／SocialPageJS bytes與localdist一致、publicroutes200、healthJSON200／anonymousprivate401。本輪原tab7正常網站更新627→630，原storage保持，非HTTP200代替UI。
- 第一外部正式helperterminal1沒有記錄stage，原source與不含rawerror結果保留；新diagnostic attempt同正常login實際429，尚未讀version／search／profile／wishlists，因此沒有原627正式alias重現證據。沒有放寬或繞過limit、刪browserstate或重複盲登入；先完成新修正的CI／正常部署，正式after讀回獨立記錄。九項原handlerHTTP失敗才是本輪重現證據，不把helper429算產品驗證失敗。
- 正式627原QA朋友空查詢真拒絕→正常搜尋exact合成QA 測試賣家 C（非真實交易）得唯一948；公開profile暱稱／真姓名／電話／地址／生日已隱藏、photo unavailable；正常publicwishlist為明確空狀態。原資料及兩安全畫面保存。630更新後同原導航正常搜尋／profile／公開清單及following只讀回讀與normal authenticatedAPI匹配，正式正常bad owner suffix400、anonymous401及emptysearch400；valid currentowner public IDs保持。這不是正式follow／unfollow、非公開資料翻轉、formal斷網或originalnative social新runtime。
- UI與API只保存合成名稱、IDs、欄位null／數量及public section；currentQA帳密與token只RAM取原ref，literal／URL／base64／hex選定files掃描，非OCR／全部OSlogs。追蹤清單或其他currentuser欄位未export敏感值。invalid前端owner路由本地拒絕不當serverwire證據；UI段與server400各有獨立proof。原storage、唯一Settings、viewport reset及safe正式exploretab保留，ownGUI／queue0，無資源新增或待清理的formal testrecords。
- 上述原UI段保留為preliminary來源：原profile段finish在guidance後171秒，超過最多30秒admission＋110秒操作；其他原段缺少準確start，全部不作最終UI验收。原proof／post bytes另存保留；新recheck-a／b／c每次動作與保存前確認自有marker及deadline，100秒內39／45／64秒完成，manager全released0，重驗同948 masked profile／empty publiclists、own52、invalid route及630朋友搜尋／following／探索／聊天。recheck-b實際搜尋讀取失敗及重試仍失敗、帳號受限banner保存；recheck-c稍後正常搜尋與空following恢復。只讀anonymous診斷當時search401與version200，不推斷browser失敗wire根因，不注入正式斷網、不放寬limit。
- 新recheck-d另受管17秒，從原受限banner按「重新核對帳號」只讀，banner及retry消失、630／探索保持，安全完整畫面保存；沒有刪state、重新登入或寫product資料。c第一次admission過期、marker未建立而guard拒絕操作，原錯誤保留後重排成功。四次精確start／finish／end與所有新畫面mtime在自有100秒内，正式provider與公開version／health在四次重驗後再次回讀同630／同SUCCESS latest。
- 原129未提交狀態與183originalnative／75compiledinputs／APP及debugbinary逐hash保持，85–107共1995不可變紀錄保持。分類progress，完整goal active，所有原矩陣其他待項保留；原96批615Home／Settings各人工90為歷史，本批不宣稱630全頁新90分或整站全部功能完成。

## 第一百零七批：願望編輯提示對齊、正式發布與會員權益只讀核對

- 編輯名稱提示改「願望名稱（必填）」／Wish name · required；圖片改「商品圖片網址（唯讀）」／Saved product image URL · read-only，維持disabled；名稱aria-required與原編輯validator一致。新增流程的照片可留名空白／HTTPS提示保持。既有空白名稱含照片測試改為繁中與英文兩案，原code兩案失敗、修正後成功且零PUT／POST／journal；完整Web126檔1944與production build通過，原五欄照片編輯及失聯回讀測試保持。本批不是後台validator／APP變更。
- PR123 https://github.com/HankHuang0516/wishlist-app/pull/123；candidate 2233e8707f4eda3cbd2290f95e41f1b99960dd14、merge 332ed5216db835648382d12ce3df58c3ef4edad1、empty trigger 860880d1c433c7f66e6aea94d20e733e0543212e；精確CI37112459194三job成功，Web1944／server955+3skip／HTTP644／upstream native859件數原log摘錄保存。upstream native為repo版本15，不當原APP12新runtime驗證；本批server／mobile／worker與base樹相同，版號base count626＋1＝627。
- 既有Railway乾淨exact-CI四樹CLI上傳，deployment e4650663-c4e2-464c-a9ed-c549c81a9094 SUCCESS及清理後latest同ID，uploads mount與變數不改；provider commit metadata按actual原值保存。公開web-version／index meta627，entry與WishesJS bytes與localproductiondist一致，health200及匿名private401。HTTP200不是UI驗收；原tab7透過原網站更新624→627、保留原storage。
- 第一筆正常API手動private清單59／願望820在外部驗收假設currency null失敗，Item schema原manual SKIPPED item的預設為USD；未進入UI、socket、benefits或保存階段。外部helper首錯／terminal1及API只清own59／820並保留建立回執已封存，不改後台預設或覆寫首失敗。僅修外部snapshot假設USD後，fresh独立private清單60／願望821正常建立，aiStatus SKIPPED／image null／reference price null／reference currency USD；無照片upload、AI、Flickr或native操作。
- 正式624原编辑dialog的誤導提示真AX及原圖保存；627真UI必填／唯讀提示及aria-required核對，空白三spaces按保存顯示本地名稱錯誤、原spaces保留，正常API當下snapshot五欄仍初值。成功改名稱QA107 已保存名稱，備註兩行／link null／USD12.34及原AI與reference currency USD保持，保存後與正常重新讀取各核。helperjournal只涵蓋helperAPI、不冒稱記錄browserPUT或正式零PUT；零PUT只為component受控測試。正式繁中操作與中英測試各自列明，不稱正式英文操作已驗。
- 原APP12 AccountSecurityScreen與Web AccountBenefits源碼均使用同users/me及marketing/availability欄位；正式Settings的贊助服務、尊榮版NT$90／月、行銷US$1／10次三展開內容真UI核對，同正常QA會員true／免费3已用0／永久0／paidPurchasesAvailable false。既有會員原付款平台管理、未開收款／不導付款頁、加值不限期／未開購買、餘額0如實顯示；沒有可付款CTA／payment links。本輪無真付款／驗單、非會員正向、正式讀取失敗／恢復或原APP12 benefits新runtime；本機既有失敗不假0與retry GET測試保持，不能以本輪true會員代替全部分支。
- Settings不持久化full AX／profile值；三次截圖前geometry仍有私人生日input在viewport，均拒絕擷取、沒有保存或emit任何Settings圖，僅公開benefits section文本與UI操作核對。一次read-only checkVisibility不支援已保留診斷；benefits GUI110秒期限正常釋放，再新lease收合三區、viewport reset。沒有把DOM核對冒稱Settings截圖／OCR／所有OSlogs。正式627原導航探索／聊天實際載入，單一Settings核對及兩安全原圖保存，保留探索tab。兩個新private清單／願望均用正常API只清自己的IDs，原create receipt deleted／resource null保留，不稱所有DB零；runtimeQA及token literal／URL／base64／hex選定artifact掃描成功。
- 原183native／original75compiledinputs與APP／debug binaries逐hash及原129未提交狀態保持，沒有新native runtime／OS／密碼／信件／私密欄位保存。85–106共1891不可變紀錄保持，第一failure及唯讀查檔錯誤保留於診斷說明。完整矩陣其他待項保留，尤其formal雙端寫入、社交／註冊mail、OS／mixedversion、永久移除UI及原行銷圖跨端品質；全頁Home／Settings人工90仍為96批615歷史，本批沒有重新評分。

## 第一百零六批：已有照片願望的正常編輯修正、正式發布與原版 APP 讀取

- 原網站 WishesPage 的 save 先把唯讀既有 imageUrl 送入新增 AI 圖片驗證，才移除 imageUrl；正常上傳來源為 /api/listing-media/UUID/image，故即使只改名稱／預算／備註也被圖片網址規則拒絕。新增專用 writable-fields validator，既有照片編輯忽略唯讀照片，正常新建照片規則不變；空白編輯名稱先拒絕且不以待辨識商品取代。兩個新 component 測試在原 code 明確失敗，修正後通過；第三案驗空白名稱無 request。完整 Web126／1943與production build成功，原錯誤回覆／未知修改讀取恢復測試保持。
- 編輯表單仍沿用原新增表單的「有照片可留空」名稱提示；編輯實際名稱不可空白，提示文字對齊仍待補，不把本批保存修正當整張表單已完全驗收。
- PR122 https://github.com/HankHuang0516/wishlist-app/pull/122，candidate a69865f341eb388f6ea0da3b9936dfd565ab580c、merge 2626622d12855faf2ae62dc32f000472edd690d7、empty trigger 132a4751a65524542e5dcc847594d87c9f338995；精確 CI37111093869三job成功，件數逐job原log摘錄另存。upstream native43／859是目前repo native15，不代替原版APP12真UI；本批 server／mobile／worker樹與base相同。版本為base commit-count623＋1＝624。
- 既有Railway服務乾淨exact-CI四樹CLI上傳，deployment e937d13f-067c-41b3-b61f-c2a5b3d9bbf7 SUCCESS且最終latest相同；uploads mount與變數保持。provider commit metadata按回傳值保存，不虛構綁GitSHA。公開version／index meta624、entry與Wishes JS bytes逐一等於localproductiondist、health200与匿名private401；HTTP200本身不是UI驗收。
- 正常既有QA登入及API建立新的私人QA106SyntheticWishAi清單58／願望819／獨立檯燈照片，真Flickr來源與既有MiniMaxworker辨識COMPLETED；95%為模型自述信心，並非經校準準確度或providerwire證據。正式原tab7、原QA621編輯五欄按儲存顯示AI圖片必須是公開HTTPS圖片網址，當下正常GET確認五欄仍原值／原照片bytes未變。失敗截圖為對話框下方，error本身由實際AX及可見文字bool證明，不以未入鏡error推成截圖包含它。
- 原網站更新流程621→624，沒有清cache／storage，不解釋歷史延誤。正式同筆由真UI保存名稱QA106編輯桌燈、三行備註、參考連結、預算USD12.34，正常後台GET再核每欄／原AIstatus／null參考價格／原media URL与照片bytes；不是新建或AI重新生成。正常重新讀取與詳細資訊再驗，原圖片完成解碼。實際已驗結果以UIproof及snapshot為準，未將component controlled failure当正式斷網驗收。
- 只使用原75的APP2.0.12 DEBUG／build12，source183、original compileinputs及APP／debug binaries逐hash保持；外部XCTest runner獨立編譯，不改或重建APP。original assigned iOSdevice下正常QA登入，localhost只讀轉送同筆正式GET、原照片URL及原responsebytes不改；只正常登入POST，無nativewishedit／聊天／面交／其他產品寫入。原版真UI1/1讀到已改名稱、USD12.34、三行備註、參考連結、AI辨識完成及原照片載入，兩張原PNG保存。不代表原版native的相同編輯validator缺陷被修正，也不是native全部欄位寫入／不同owner驗收。
- 原native framework的marketplace-meetup及marketplaceFixtureSeeded名稱保持，僅代表原hook被呼叫；外部hook明確不建fixture，實際只有本筆wish只讀。兩個capture PNG與兩SDK附件四份bytes完全相同，一張完整畫面已可見全部五欄；不稱四個不同狀態。第一native35秒 admission timeout未執行UI，後續重新排隊正常1/1；兩次原結果均保留。
- 正式探索／聊天仍由原導航實際載入624，設定入口唯一；回到安全公開頁並viewport reset，自有GUI／native leases与queue全部釋放。只對本批新IDs用正常API清理wish／list／media與erasuretask，FlickrgetInfo為notfound；正常create／upload回執保留，不称全DB清空。18906／18887／未啟動55606關閉。原profile／真願望／上市商品不改，沒有郵件／密碼／OSpermissions操作。
- 原失敗兩項、外部helper讀取不存在檔案及編譯來源雙閉括號在執行前修正的記錄保留；未當產品失敗。編譯log出現SwiftCompile文字但command exit0且獨立簽章／產物fingerprint與後續真runtime1/1成功，原log保持。runtime RAM credential／nativealias／provider／DB值、literal與URL／base64／hex選定artifact及SDKconsole／actionlogs檢查通過，不稱OCR／所有OSlogs。85–105共1782不可變證據保持，整體goal active與其餘矩陣待項保持；最新全頁Home／Settings人工90仍為第96批615，本批不重新評分。

## 第一百零五批：窄螢幕設定標題修正及最新版正式發布

- 本批是已發布產品進展。正式618原tab7、原QA登入在320×844實拍顯示「語言」被flex擠成兩行；header27.39×48，而整頁client／scrollWidth305、visible descendant無橫向超界。聯絡資料、安全與進階一起展開亦305／305、欄位在邊界內。未重現早期未診斷的DIV；不能將本批語言換行追認為舊DIV根因。
- 只加Settings language header的flex:none與white-space:nowrap，原按鈕wrapping與mobile44px、語系／reload保護、所有欄位／操作保持。版本按base HEAD commit-count620＋1為621；沒有增加鏡像CSS單元測試，以完整既有Web tests／build及正式真版面核對驗收。APP、server、worker、API／schema／permissions不改。
- PR121 https://github.com/HankHuang0516/wishlist-app/pull/121，candidate 40e307da2e41fc22077607c39bc0a7c682bd8d58、merge 27177075195396a98e013c60fd1617368f2e81f3、empty trigger 0e7c1c9e0e0103536882d75ad9bfe26981335131。精確CI37109628735三job成功：Web126／1940＋build，Server61／955＋3既有skip、HTTP41／644與migration/schema，upstream native43／859。upstream native是原repo當前15，不替代原APP12真UI；原183 native／75 compileinputs與Debug binary另逐檔hash保持。
- CLI乾淨exact-CI四樹上傳至既有Railway正式服務，deployment 13460ce6-a730-4c38-97c0-77ac8fdce7f7 SUCCESS且latest相同。原uploads mount、服務變數不改；provider commit metadata null照實保存，來源是精確clean checkout與CLI回傳ID關聯。公開version／index meta621、entry與Settings JS／CSS bytes逐一相同於本機production dist，health200與匿名private401通過；HTTP200本身不算已驗UI。
- 正式tab第一個normal reload初讀為未ready空頁／meta618，原geometry保存而排除成功判定；實際既有UI再顯示618→621更新已就緒，按更新與已保存重新載入，後續真621 meta／stylesheet與版面核對。沒有清cache／storage，不將本輪舊page狀態推定為歷史延誤原因。第一輪bounded110秒checkpoint釋放後再排隊接續。320／390／1280皆語言heading24px高、nowrap；手機buttons≥44。320與390安全／聯絡／進階都由原UI展開後讀同頁欄位幾何，document／scrollWidth一致且無超界。正常320／390原JPEG與桌面1280×640安全首屏保存並人工看圖；桌面952高geometry亦保留。clip方法原擷取造成窄版型異常只保存為diagnostic而排除，正常getScreenshot的456px設定正文才作證據，不推定產品故障。僅此頁／這些狀態，不推成整站全descendant／全部瀏覽器通過。
- 探索與聊天由正式導航實際開啟、621meta／entry一致、唯一Settings核對。只讀畫面，不send訊息／面交／詢問／AI copy／diagnostic mail，不改個資／公開權限／語言偏好，不輸入密碼、不刪任何資料。最終封存不含聯絡／生日值或full Settings AX：首次390截圖未核scroll位置，曾帶QA生日欄位且已emit到本chat工具輸出；該張排除驗收並移除私有暫存，不虛稱已撤回工具輸出。改正常scroll至0、先核private field top977大於844後重擷取safe圖；錯誤只保留不含生日值的metadata。所有展開区收合，viewport reset，正式探索tab保留，自有GUI／queue0。
- 原persistent browser變數不存在的前置工具錯誤照實保存；按文件取已選browser2並續用tab7，錯誤發生前無UI action，不稱產品故障。所有85–104共1711immutable與原104wrapper exit1保持。既有QA credential runtime RAM byte及URL／base64／hex選定新文件掃描通過，不稱OCR／全部OSlogs／全部provider secret審計。
- 最新全頁Home／Settings人工90分仍為第96批正式615；本批三寬度驗證不虛構新全頁視覺分數。既定32列矩陣全部剩餘項與整體goal active保持，尤其永久移除真UI、OS／PWA／定位分享、mixed-version／credential、真mail及其他cross-end／全站效能。每個完成產品修正立即部署的使用者節奏持續遵循。

## 第一百零四批：正式辨識新願望的網頁與原APP畫面

- 本批分類為驗收進展。85–103共1638不可變紀錄先核對，乾淨已發布618來源及原APP12／75 scratch全部183 native、compiled input及原debug binary fingerprints保持。沒有產品修改、新CI／PR／部署，不把歷史CI當新run或把upstream APP15當原12。首頁與設定90分沿用已存歷史人工審查，本批不重評。
- 既有內部QA帳號正常正式auth/login，新private清單QA104SyntheticWishAi 57、synthetic橘燈MANUAL_PHOTO及wish818各正常POST201，AI最高預算0／TWD。正常GET四次讀既有正式辨識服務至COMPLETED，名稱橘色桌燈、燈具、電線／掉漆等可見依據、品牌／年份／燈泡／實際通電待確認，price與currency null。98%為模型confidence，不是accuracy。沒有手動seed完成狀態／callback、重啟worker或更改pilot。兩installed MiniMax module與published618 source相同、既有LaunchAgent running；身分依原pilot routing／結果format推論，provider wire與mcode次數未觀察。
- 未附wish原source匿名404；附屬後原opaque圖片匿名200且bytes同hash，符合原APP與Web已揭露的知道網址仍可查看，不稱owner-only。private list／item／create receipt匿名401，public最新20items未含新wish；非全部搜尋頁或其他owner正向權限驗收。
- 外部XCTest沿用原APP12 DEBUG exact binary，真願望tab→指定同title清單→同wish。只能由loopback18905代理GET正式原API及正常QA登入：私有broker輸入嚴格synthetic alias，僅該auth/login在runtime轉為既有QA憑證；上游仍正常驗證並核actual user ID，DTO／照片URL／bytes不改、其餘POST拒絕。native實際照片已載入、AI完成、TWD0、reference price不顯示與完整notes文字核對，1/1及原SDK privacy audit通過，兩safe原PNG已人工查看。不是App Store binary或新native建立／編輯證據；舊framework flow名meetup不代表做了面交，沒有seed本機DB。
- 第一次native外部binding port仍55603而context預期55604，在private-service-start／tests null即停止，接著wrapper未處理null tests也報错。原結果與safe log保持；改外部port與null判斷，第二次正式只讀結果通過，原APP不改。local binding只作原framework guard，未啟PG55604，也沒有將正式DB URL交給native driver。
- 正式原tab7正常Chat→願望導航→查看新private list→展開詳細資訊，compiled618／既有QA session直接讀同818。實際photo1086×1448解碼、exact media ID、name／AI completed／notes／TWD0、沒有虛構reference price，原wishlists57與explore wish818 link一致。上下原JPEG／全AX與read-only DOM proof保存並人工看圖，native與Webnotes及原照片一致；未做願望刪除按鈕或OS照片挑選。
- fullPage方法的原截圖版面異常保留為diagnostic，不作視覺驗收；正常viewport1265／heading736與正常擷取沒有同異常，top與實際scroll後detail畫面通過。AXWebArea捲動被UI tool拒絕，改在新截圖的頁面空白處正常捲動；不推定上述工具問題為產品故障或用它重算Home／Settings分數。第一次capture GUI排隊timeout未執行，之後受管run成功並正常釋放。
- 完成畫面後正常API只DELETE新item818／list57各200，原create receipt同ID變deleted true／resource null，正常upload／create receipt仍保留。既有outbox只清新media／task，owner與匿名image404、Flickr getInfo code1 not-found、ownlist／item rows0。不是全部DB0、永久刪除UI完成或所有已解碼照片立即撤回的證據。正式清單重讀也不再出現本輪QA清單，原existing清單保留，最後返回正常探索頁。
- 外部host先完成native／Web UI，但finally control.close已自動移除Unix socket，無條件unlink再拋錯，原整體runtime exit1／flow passed false保持。原exact helper保留，獨立teardown smoke重現ENOENT；只修外部existence guard後smoke returned true、socket無殘留、API／provider／正式寫入皆0。故本批僅宣稱已驗畫面與已驗清理，不能宣稱原wrapper整條exit0。
- 35選定runtime文件、完整native SDK console／action兩類log及實際憑證／synthetic alias／provider／DB值的URL／base64／hex byte檢查通過；原native privacy checker亦pass。不是OCR或所有OS／歷史log審計。API18905／Metro18887／unused55604均閉、socket無、ownlease／queue0。正式version618與entry bytes再次吻合published build；其他用戶／Listing／Chat產品操作不改。所有其餘既定矩陣缺口保留，full goal active。

## 第一百零三批：同一真四圖原APP與網頁往返

- 第102批已實際修正、發布618並完成正式探索／聊天導航，本批分類為跨端驗證進展。先核85–102共1510不可變紀錄、乾淨bbad679e7a34f8e0ce61b2e58f66110980a845c8與原183native／75 scratch來源及原iOS debug編譯hash。APP12與Mac installed worker原hash保持，本輪產品編輯0、重複部署0；不以upstream native15作原12證明。
- fresh loopback PG55603／API18903、兩UUID合成帳號正常auth/login。正常MANUAL_PHOTO原synthetic橘燈Flickr upload201與ACTIVE商品NT$450／v1、现代CREATE，再執行已安裝的精確618 Mac marketing worker一次：真4背景與真copy、4 private JPEG1024、owner200／other和匿名404；本輪去背attempt失敗走既有完整照片相框fallback，非本輪guard触發實證，也不是新AI辨識。實際原圖與四圖人工對照黑線／罩與底座使用痕跡、四背景／badge，非所有照片保真保證。
- 原iOS12 QA DEBUG APP正常登入→我的商品→編輯→行銷入口，同一job四張320縮圖真的解碼、預設封面位置1。第一external XCTest在不存在文字的frame查詢失敗，並非照片載入失敗；保留原exact SHA測試來源、結果、credential-free log audit與三safe附件。修正僅external test：不存在元素不讀frame、以原APP adjustable標籤核對位置；重新編譯external runner與簽章／來源hash，原APP不改，復驗1/1與privacy audit通過。
- 初次HTTP載入正式built618被既有production HTTPS URL校驗安全停止，保留畫面；read-only evaluate環境投影不當根因證據。改同一乾淨618 source的DEV18904，本機proxy只改JSON imageUrl／thumbnailUrl來源，照片bytes、正常操作body／status、所有商品欄位與ID保持；有真API前置比對。外部proxy的初始語法錯誤與middleware排在Vite fallback後失誤保留，修正後才進行功能；四圖UI的320縮圖不冒當原1024，初次錯誤1024預期保留。
- 同tab37正常fixture登入、商品與4真thumb、鍵盤上下將公開順序3/1/4/2；唯一一次正常确认POST实际APPLIED2提交後注入503，畫面原選圖／copy／v1記錄保留。正常reload→商品v2→開編輯，元件只GET同原receipt200並正常結束本機原記錄；完成工作readonly、cover3與3/1/4/2、原copy可見，沒有retry POST。實際proxyjournal及四MediaID的320 JPEG SHA與後台當前bytes完全相同。原ROOT monthly1、唯一APPLIED receipt2、四生成圖＋原source最後、source原contentHash保持。
- 原APP同session冷重開後正常讀回同COMPLETED job，4圖真解碼、adjustable slots3/1/4/2與cover3、確認按鈕不再出現；另1/1和privacy audit通過，APP全來源／binary fingerprint保持。保留前後六safe原圖，這是隔離DEBUG QA不是store deliverable。runner framework舊flow名稱meetup不表示本批做面交；native不approve／revise／send message。
- 第一DEV功能階段從錯誤working directory啟動Vite，Tailwind utility掃描不完整，原unstyled截圖保留且不作風格驗收。外部Vite改client工作目錄、CSS實際layout／spacing utilities前置核對，fresh tab38同正常stored session只讀同v2／四圖／readonly排序，有樣式原完整頁及AX保存、人工看圖正常，沒有第二批准。這不是Home／Settings90重審或正式APP相框發布證據。
- 只清自己5個remote，delete與Flickr getInfo not-found、七DB類0；API18903／Vite18904／Metro18887閉合、PG55603停止、全部ownlease／queue0。121選定文件的runtime provider／DB／合成password原值與URL／base64／hex byte檢查通過；native complete SDK logs各自privacy audit，不宣稱OCR或所有OS logs。正常正式metadata618及主entry bytes重新回讀相同；本輪沒有正式帳號或商品修改、新PR／CI／部署，沿用已驗PR120來源發布關聯。原129不相關改動保持。
- 尚未完成的既定矩陣項保留：正向永久商品移除UI／實際503恢復、101新願望辨識的native／browser display、OS分享／定位／PWA、mixed-version與browser實體生命週期、mail收取及其餘平台／正式流程。全部目標仍active。

## 第一百零二批：行銷照片漏細節保守修正與正式發布

- 第101批有真願望辨識與正式Explore／Chat導航進展，本批不重寫其舊失敗原因。先核85–101共1360不可變紀錄與原129改動。變更僅行銷worker的兩module、六項offline回歸與CI／說明／Web版號；APP／server／API／migration保持。完整遮罩與電線仍可使用去背；遮罩外明顯連續原照片邊緣、分離配件或錯尺寸／透明度／解碼觸發既有完整照片相框。低對比／透明／模糊可能漏判，無邊緣不代表完整，仍需人工對照。
- 六項回歸全pass：完整線、黑／黃／藍線遺漏、分離配件、壞遮罩、最終JPEG四角與線區域像素／JPEG容差、四背景distinct。先用錯尺寸源PNG的拒絕檢查保留但不當edge實證，改用101 source proxy1086×1448與100兩個同尺寸valid alpha實際舊mask，均拒絕、完整照片恢復已直接看圖。
- 真MiniMax正常產品pipeline第一輪四图成功及人工看圖後，我將需為own session ID的續行marker誤寫成說明文字，QA AssertionError停止；不是產品生成失敗。五remote／七類DB0／API閉合已驗，未抹去失敗。第二個fresh owned namespace使用同一已清零隔離DB、未改產品或放寬斷言，完整四圖＋slot2一次免費重做皆成功；人工審視原四張及新第二張均保留原照四角、黑線、刮痕，AI badge與背景有別，其他三圖ID／hash不變。source AI COMPLETED為隔離precondition，非新AI辨識。
- 正常approve原選3/1/4/2真commit後503，GET同原APPLIED2且無第二POST；child選2/4/1/3 APPLIED3後root回執完全不變，月用量1、付款關閉。隔離公開五图为選4＋原source最後，未選舊2仍private；owner200／other與匿名404、公開選圖200。只清自己六remote，Flickr getInfo not-found、七DB類0及API18902閉合、PG55602停止。這是candidate worker與真provider的隔離正常API實證，不冒稱已在原APP或正式browser顯示這組行銷圖。
- PR120 https://github.com/HankHuang0516/wishlist-app/pull/120，候選e1d3698f282e68e4370be9010707a33042185310／CI37105298523三項成功，詳細counts另存；merge 71196009b6d6689f0f9d31244250c223ca051ef1、empty trigger bbad679e7a34f8e0ce61b2e58f66110980a845c8。client／server／mobile／worker四樹與精確候選CI完全相同的乾淨checkout部署原Railway，deployment 6253a994-1a04-4ec6-ae02-3f7ce9bd3c56 SUCCESS且latest相同，uploads mount／正式變數不改；providerCommitMetadata依實際回讀，不虛稱非null。Web126檔1940＋build、server與隔離HTTP／migration／schema gate，原upstream native2.0.15單元結果不當原APP12驗收。
- 本機既有com.hankhuang.wishlist.marketing-poller先確認指定pilot PENDING／PROCESSING0，暫停單一既有worker後再查idle0，私有backup與兩module安全同步、原plist／wrapper／package lock／Swift hash不變，重啟僅該agent，新PID running且兩installed hash與精確CI一致。沒有Keychain、callback、pilot開關或其他agent異動。真正import安裝副本並使用固定Sharp，對實際漏線mask拒絕與full-photo生成成功；此installed smoke provider0／正式寫入0，不冒稱再次真provider調用。
- 正式version／meta618與entry／三route200、health JSON200、匿名私有401回讀；原正式7使用Settings正常更新615→618、保存確認後重載，再真正Explore／Chat切頁、原圖／AX核對。沒有清storage、真訊息／商品或帳號寫入，唯一Settings保持。第96批Home90／Settings90為歷史，本批無UI外觀變更但未重評新版90分。所有本輪GUI lease／queue0，known runtime credential byte與URL／base64／hex掃描通過，非全部OSlogs或OCR。完整目標active，尚待原APP與browser真行銷圖跨端、永久移除UI、OS／mixed-version／mail與矩陣剩餘項。

## 第一百零一批：正式願望真辨識與探索聊天正常導航

- 先核85–100共1322不可變紀錄與原129改動；615乾淨release三樹及原APP12保持。既有internal QA login只runtime讀原private reference，正式DB連線只唯讀本轮IDs。正常API建立1私人清單QA101SyntheticWishAi、1合成橘燈MANUAL_PHOTO、1待辨識wish，各POST201；正常create回執只GET，未重送／seed AI或手動callback、未更改pilot／key／背景服務。
- 新願望maxPrice0／priceCurrency TWD，兩次每5秒正常GET讀到PROCESSING→COMPLETED，actual為橘色金屬桌燈、品類與五可見依據、95%模型confidence、品牌／年份／燈泡待確認。照片無明示售價，price／currency保持null，不造二手估價；零元最高預算保持。這是synthetic lamp實證，材質為影像推測、confidence不是accuracy百分比，不當真使用者照片普遍品質。原操作回執ID不變但resource是當前projection，不能當不可變AI歷史快照。
- 原MiniMax pilot routing排除EClaw，正常結果notes格式與product result一致；唯讀檢查既有WishlistMiniMax的poller.mjs和server.mjs兩份與615 release hashes相同、LaunchAgent running。worker身分依routing／format／installed runtime判斷，不宣稱直接看到provider HTTP或確切mcode次數；未重啟、搶領別人queue或更改runtime source。
- 私人清單／item／原receipt匿名皆401，公開最新20items未含新wish，但未窮舉所有公共搜索頁或另owner登入。未綁wish的source匿名404；綁定後原opaque URL匿名200且原bytes同hash，符合原APP12與Web已明示「知道圖片網址的人仍可查看」，不誤稱附屬願望照片owner-only；原私有Flickr sourceURL未保存，contentHash／attachment不變。
- 只DELETE新item817與list56（各200），再GET各原receipt均deleted true／resource null／同resourceId，正常create／upload回執retention保持，不稱全部DB0。既有outbox清除本轮media与task後，owner／anonimage404及Flickr getInfo code1 not-found核對；無Listing／Chat／其他用戶資料異動。整條正常正式API流通過，不冒稱browser最終永久刪除按鈕、實際斷網／native往返或本筆AI display。
- 一個受管GUI正常release。先fresh正式7 Chat615、舊98 tab36已不在session且7無dialog，正常點Explore後真地圖／8站內／0external／84來源實際載入；正常點Chat後四來源與QA商品收件匣／圖片真可見。保存未後製原JPEG與AX，已手動檢視；正式7再mark deliverable、未改viewport。98／99 click與cancel失敗原證據保持，本輪成功不證明之前無回應原因，也不冒稱去掉原生Codex app拒絕。
- 已產生安全證據與既有QA登入／provider／DB secrets及URL／base64／hex byte掃描通過，非OCR或全部OSlogs；ownlease／queue0，沒有新API／PG本機listener或mobile占用。公開version／meta615及health JSON200再讀，新產品／APP修改0、CI0、部署0，PR119正式部署保持。完整目標active，尚待行銷品質／native與browser真圖片跨端、正向移除UI、OS／mixed-version／mail及其餘矩陣。

## 第一百批：真四張行銷圖、一次免費調整與不可變原批准

- 先驗85–99共1263不可變紀錄與原129改動；615 release三樹乾淨，原APP12不改。fresh UTF8隔離PG55600與loopback API18900，runtime只取既有Flickr／callback憑證，正常原compiled storage與現有MiniMax worker只領本輪隔離任務，未改正式變數／pilot／背景服務。原合成橘燈與seller確認price450；aiDraftStatus COMPLETED只是隔離前置，不冒稱新AI辨識，99正式真辨識另有實證。
- 現代CREATE正常核版號1，owner原回執QUEUED、other404／anon401、同鍵改body409。原worker真生成四個背景，4個internal asset201存私人Flickr，真文案connector完成，owner四張1024JPEG200、other／anon各404、hash皆不同。手動檢視四圖與原去背，四種背景與AI示意badge可見，主體／掉漆保留，電線被mask排除；不宣稱严格所有配件保真或真使用者照片普遍品質。
- root選3→1→4→2，真handler APPLIED2 commit後外部wrapper只將成功ACK改503。只GET同原UUID回讀原排序／文案／hash與版號2，沒有第二批准POST；other404／anon401。這是獨立API受控503，不冒稱browser reload／正常UI按鈕或實際斷網。
- 真一次免費REVISION只槽2，另一新request409。原worker只生成1背景／asset201，另三張ID與JPEG bytes hashes完全保持，第二張背景較亮。root與revision去背bytes不同，仍漏電線，不稱identical mask。child選2→4→1→3正常批准APPLIED3後，重讀root不可變原證據逐欄一致，freeUsed1／permanent0／purchase false。
- 以真local publish handler建立1 ACTIVE，公開順序為新版2→原4→原1→原3→原實拍source，五image匿名200；未選舊2匿名／other404而owner200。原照片hash不變、sellerDraftVersion3，沒有正式Listing／Wish／Chat寫入，沒有native／browser display或拖放驗收。原全照留存通過不消除去背品質缺口。
- worker兩次正常exit0，僅清本輪source＋4 root＋1 revision共6遠端photo，每張delete後getInfo code1 not-found；isolated users／listings／media／marketing jobs／requests／approvals／erasure tasks七類0。API正常關閉後PG stop0，18900／55600closed，own lease／queue0；無GUI／mobile lease或共享裝置操作。已產生安全檔與runtime secrets URL／base64／hex byte掃描通過，非OCR或全部OSlogs。
- 新產品／APP修改0、CI0、部署0，公開version／meta615及health JSON200再核對，現有PR119正式部署保持。保存真正provider素材／人工品質限制／所有回執與trace，不把外部test wrapper當產品修正，也不重複部署同615；行銷品質／native與browser真四圖跨端、WishAI、正向移除UI、其他完整矩陣仍active。

## 第九十九批：正式 Flickr API 與現有 MiniMax 真辨識佇列

- 先核85–98共1237不可變紀錄及原129保留；615乾淨release HEAD／三樹保持。既有internal QA帳密只從原私有release文件於runtime讀取，callback與Flickr／DB憑證只RAM；未建立新key、修改pilot gate／服務變數、重啟或搶領其他worker任務。外部wrapper僅記錄既有smoke腳本stage／安全HTTP status及synthetic草稿，原產品script與APP／Web程式未改、無新部署。
- 真正式auth200且原腳本核對與既有pilot User ID相符；合成橘燈只upload1次201（3289ms），唯讀正式DB核對owner／Flickr photoID／兩source存在，來源URL與auth header不保存。本人image／thumbnail200、匿名image404。原AI endpoint只POST1次202，5個status GET皆200，既有正常worker完成約26秒後讀到COMPLETED與MINIMAX_CODE_VISION。沒有手動callback、harness假result或代問訊息；client journal不冒稱觀察worker內部HTTP或MiniMax網路次數。
- actual draft為「二手橘色復古金屬桌燈」、home／USED／brand null、2項evidence／5項uncertainties／confidence0.9；對照原synthetic PNG，橘色／燈罩支架底座、掉漆與黑線可見，功能／燈泡／安全仍要求seller確認。NT$150–900及priceBasis明示模型外觀／既有知識粗估，非即時行情；材質／使用歷史是影像推測，不能當物理驗證或真實照片普遍品質。尚未驗Wish辨識／iOS與Web這筆草稿display、四張行銷生成／免費調整或跨端品質。
- 只DELETE本輪新media1次204；原product smoke等待同media ListingMedia與MediaErasureTask均消失，然後真Flickr getInfo code1 not-found才PASS，結果／執行source與journal保留。正式test media已清理，正常upload回執／tombstone政策retention未檢查，不稱全DB fixture或所有歷史紀錄0。沒有正式Listing／Wish／Chat寫入或使用者商品刪除。
- 一個受管GUI成功release，fresh正式tab7聊天AX和raw JPEG再看到主要導航「探索／聊天」、footer615及原QA inbox；正常AX click與依fresh DOM語義重定位均未導航，舊98到期confirm的documented CDP cancel也未成功，保留限制／不accept、不繞過原生Codex app拒絕。本批不宣稱探索導航或AI草稿browser成功；正式7保留。own lease／queue0，無mobile runtime或shared-device資料清理，原98本機服務保持停止。
- 本批17份既有QA登入與runtime Flickr／callback／DB secret bytes及URL／base64／hex掃描通過；不是OCR／全部OSlogs。公開version／meta615和health JSON200再讀。新產品修改0／CI0／部署0，既有精確PR119 CI與正式部署保持；補正式API provider實證，整體目標active，其餘完整矩陣未降低。

## 第九十八批：真 Flickr 私人圖片生命週期與移除權限拒絕

- 先核85–97共1174不可變紀錄與更早84鏈、原129改動；乾淨615 source／三樹保持，產品與APP0變更／新部署0，既有精確CI與Railway保留。新UTF8隔離DB、真compiled handler透過API建立全欄位ACTIVE1／兩張320×240合成MANUAL_PHOTO；不是新Web建立表單驗收。
- 真Web正常登入／my-listings讀商品、價格320／expiry／兩照片欄位與原ID。按移除開啟不可正常還原的確認窗後IAB CDP停止回應、documented dialog API回undefined，原生Codex app操作也被拒絕；未繞過。當下已要求人工確認並提供原始reviewable JPEG，900秒內未取得，host到期清零；旧確認現已不可操作。最終remove POST成功0／回執0／fault0，不宣稱商品移除或真503 reload恢復通過；cleanup是隔離harness清理，不是產品移除。
- 到期前獨立真HTTP核對：本人清單1／其他0／匿名401；原建立回執owner200、其他404、匿名401。ACTIVE公開兩照片image／thumbnail的本人／其他／匿名共12讀皆200、原圖bytes吻合DB hash；未發布／已移除圖片權限不可外推。三個管理拒絕POST依序未登入401／錯owner404／非法版本0回400，全部商品欄位、兩media IDs／hash／order及原creation回執不變，沒有管理回執或消耗fault。
- 真Railway既有runtime credentials僅RAM取用，現615部署SUCCESS／Flickr全用戶storage enabled與AI pilot gate記錄布林，未修改變數或key。初兩SDK probes失敗保留；安全診斷指出TypeError發生於網路前，compiled production storage本身checkToken200／ready。absolute folder require忽略conditional exports選了browser main；改server createRequire的官方Node export後同帳號／delete scope與compiled ready均成功。不能把工具錯誤當正式憑證失效。
- 一張專用640×480合成JPEG經原compiled ListingFlickrStorage真私有upload，Flickr getInfo證實本人帳號且public／friend／family均0；真讀原圖640×480及縮圖320×240、JPEG解碼／bytes hashes保存。僅清理這張本輪新photo，原delete成功且getInfo code1 not-found，無遠端遺留。這是實際Flickr lifecycle，尚非正式API代理／APP兩端或MiniMax辨識／四圖生成，未產生正式Listing／Media／chat資料。
- 三GUIphase受管釋放，收尾own lease／queue0，API6類fixture0並退出後自有Viteexit0／PGstop，5portsclosed；不erase／shutdown共享裝置。tab36 close也timeout，保留失敗、正式7只mark deliverable且本批不冒稱新authenticated UI。合成email／password的28份byte檢查與runtime Flickr secrets掃描通過，含URL／base64／hex，非OCR／全部OSlogs。公開version／meta615与health JSON200再次核對；本批部分實證、整體目標active。

## 第九十七批：原iOS12聊天真503、冷重開與Web明確同鍵重試往返

- 本批前先驗85–96不可變1070份及更早84鏈、原129不相關改動；release615三樹乾淨保持，原183 tracked native sources與第75批compile inputs／APP executable和debug dylib原hash保持。APP2.0.12／build12隔離Debug包，外部97 XCTest runner為測試操作器，不改APP／產品。沿用既有615CI與正式部署，不虛構新CI或重部署同版。
- 同一900秒獨立UTF8 DB／compiled615 handler／同組RAM合成帳號與商品room，全流程不reset／重seed。首輪原iOS正常登入及開room後，外部PublicInputState拒絕新synthetic常數IOSQAChat97Lost，尚未typing／messagePOST／fault，原5列未變；原SDK失敗／genericfailure stage／活動診斷保留，完整SDK console／action／activity credential audit通過，不把driver尚未完成privacy欄false當洩漏證據。只在97外部copy把預核准聊天常數改成精確IOSQAChat97Lost，分類logic／private拒絕不變，37項host checker通過、重新build-for-testing與signature fingerprint，保留原2份Swift／metadata／ownedrunner舊hash；沒有放寬產品或功能斷言。
- 受管original04D iOS正常登出自有舊session／重新登入，實際傳送一次seq6／原UUID。compiled handler真正保存後原201改503，APP保留原內容及未知結果／明確重試；冷關重開沿用buyer session，不重新登入、不POSTmessage，實際GET原receipt200及原bubble恢復。sender／recovery／receiver各1/1 passed、0skip，原生privatelog／safe screenshot guards通過；先前1failed未覆蓋。
- Web相同18889origin的615 DEV UI透過正常表單登入seller，未注入session storage。收件匣實見3未讀與iOS原訊息，開同room後先read6。送出WebQAReply97Retry在dispatch前503，DB仍6；同一tab正常reload保留原UUID／文字，僅GET原receipt404，沒有自動POST。明確重試才以完全相同body／UUID201保存seq7一列；messageHTTP總3（native503、Web503／201），新列僅2、原5列不變。受控localhost503不是實際斷網／儲存損壞／正式故障。
- 原iOS再啟動沿用登入，收件匣真1未讀、實開room可见原訊息與Web回覆，正常更新／返回無未讀；DB買／賣皆read7／unread0。Web收件匣同樣無badge。無面交PROPOSE／CONFIRM／CANCEL，本批不挪用85面交結果。六原生safe PNG、四Web訊息raw JPEG加零未讀inbox一張、AX及DBjournal保存；Web1280×720／root1265、唯一Settings、真照片loaded，非全站90重算／手機擴展驗收。
- 3iOS及2GUI成功phase全supervisedrelease；首failed亦受管release，ownership新runnerhash歷史保留。自有tab35關閉、正式tab7保留615／Explore與Chat入口，viewport未改1280；API先正常stop，6類fixture全0，再自有Viteexit0與PGstop，5ports均關閉（5227從未啟動），ownlease／queue0，不erase／shutdown共享裝置或操作其他工作。已掃58份已產生證據的synthetic email／password及URL／base64／hex bytes；不是圖片OCR或所有OSlogs。正式version／meta615與health200再讀。
- 仍待：iOS聊天衝突／大history與正式雙端寫入、跨端面交衝突／恢復、其他商品狀態／新移除真UI、多頁／完整照片／wish／social流程、真MiniMax／Flickr／四圖與mail、OS分享／定位／PWA／mixed-version及整站表單／效能。整體目標active，本批僅補證據、產品變更0／新部署0。

## 第九十六批：最新正式615視覺、展開手機表單與探索聊天回讀

- 615乾淨release三樹與原APP12 native樹不變；原精確PR119 CI／Railway證據保持，沒有產品修改或重複部署同版。先核85–94 immutable915、95新90、原129改動及更早84鏈，最後公開version／meta／health再讀615。
- fresh正式Home／Settings736×952 DOM及721×933未改原JPEG，上半scroll0與真正下半284／232各核對核准概念板；layout／色字／cards／spacing／navigation權重35／25／20／15／5，Home31＋24＋18＋12＋5＝90、Settings33＋24＋18＋10＋5＝90。是本agent獨立逐頁人工設計判斷，非pixels／第三方review／兩頁平均；原商品metadata、實際單件配對空白、額外聯絡／權限／真方案與頁高差異皆扣分，不用示意假商品或假餘額補齊。桌面六導航44×48、唯一有標籤Settings；原APP與原Web風格保持。
- 正式390×844 DOM／375×812原圖實開Home、Settings及帳號安全／聯絡／進階展開、三筆既存私人商品草稿及首筆AI辨識依據展開、手動商品表單與日曆、Explore地圖／篩選展開、Chat收件匣。root375、六導航約54×48，Settings與其他實開頁main descendant無越界；Home14 outlying rects屬現有wish radio strip、root不溢出，不冒稱新ancestor clipping診斷或舊Settings DIV原因。密碼欄40px已觀察，不聲稱每個input都44px，也不是整站所有表單／效能通過。
- 正式探索保留8件站內商品／0外部provider商品、另84來源線索的如實說明；桌面列表8件站內商品照片全真解碼（5件明確QA名稱與3件原刊登）、另30已可展示來源圖，全部38載入image elements；Chat真原四筆來源收件匣與QA非交易room及一張照片。初archive checker誤要求8個alt均QA前綴而失敗，原5QA／3原名稱與38loaded metadata保存，改依实际來源前綴與原名稱區分，未丟失敗或宣稱原照片未載入。只導航展開與日曆開關，未輸入／save／publish／upload／remove／send／meetup／ASK／CONSENT／CANCEL／generate；沒有新真provider生成、品質或正式雙端異動驗收，也未裝network mutation journal而冒稱窮舉POST為0。
- 初English首頁heading及link aria label、HTML summary誤當button與外部capture閉包旧phase皆按實際DOM修正，不改產品／斷言。desktop與expanded占用110秒到期正常release，晚capture由marker拒絕，新lease才續作。初命名chat-desktop在reset未settle時量到390，原圖／geometry保持并排除桌面證據；freshAX後重拍verified1280／document1265，探索也1280。全部20份原JPEG及20幾何保留，Settings全AX／input值不另匯出，私人profile圖留本機，不作公開交付圖。六GUIphase全release／exit0、ownlease／queue0，viewport1280正常reset、正式7保留在chat，未碰其他工作視窗或裝置。

## 第九十五批：真自訂日期、雙照片與跨端成功回覆中斷恢復

- 615乾淨release三樹、原APP12 source與static Android QA APK hash不變；只有外部驗收工具及本文件，產品與APP無修改、無重複部署同版。正式version／index meta／health最後再讀615，沒有正式資料寫入。
- 新同源18889 fixture真Web表單正常上傳兩張640×480合成MANUAL_PHOTO，各POST201及本人原receipt GET200；正常填WebFull95／QA95品牌／多行說明／toys／NEW／TWD245.5／MEETUP與SHIPPING／議價／臺北市中山區／約2km示例網格及公開同意。透過真日曆按2026-10-19而非直接fill，單POST201建立ACTIVE v1；原body expiryDate、DB CUSTOM_DATE與台灣日末2026-10-19T15:59:59.999Z核對一致。兩張原照片id／hash／順序0與1均保存。
- 原APP12 Android正常登入同owner、實際讀名稱／價格／新品／地點／分類／多行說明／10-19與第一blue縮圖；真reserve expected1→RESERVED2。網頁正常確認release expected2，exact production handler真commit APPLIED3後外部QA wrapper依nested receipt.state攔下唯一成功200回覆改503；未修改產品handler、資料庫、權限或限額。中斷後畫面保留原v2／動作與待查核，按鈕禁止其他異動；當時DB已ACTIVE3且同原回執APPLIED3，原始畫面與snapshot保存。
- 同一Chrome session正常reload，僅GET原管理回執與最新商品，確認原操作已完成版本3，沒有第二POST；明確只讀重查仍同結果。原APP第二phase再讀ACTIVE3／原日期／真縮圖後正常sold expected3→SOLD4；Web只GET正確並列原完成3與最新售出4，再已讀清理原本機紀錄、讀已售出及詳情。原create1次、Web release1次503、native status2次reserve／sold，原UUID／管理hash保持；兩media IDs／bytes hash／順序与所有非status/version欄位四版全不變。
- 售出後真RAM login只讀探測，兩照片原image／thumbnail合計12次owner200／other404／anonymous404且image bytes同DB hash；原creation／management回執owner200／other404／anonymous401。只驗selected assigned Android5558，原子兩台容量核對不當兩台UI通過；不是iOS、正式寫入、真provider、原APP第二張照片展示或615全頁重新評分。
- 第94批正常200及fault未命中仍保持，不因95成功重分類94。95初prepare被歷史85→93 helper對現行doc的「最新593各90」舊literal攔下；94已如實改為92最新完整612各90，並非artifact改動。未修改旧helpers／证據，新增95 validator逐檔核對85–94共915索引紀錄、85真90評分、92最新612敘述及84之前鏈與原129改動；失敗紀錄與原因保留。
- 兩Android與四GUI階段全部release／exit0；第一次release GUI因占用到期正常釋放，補借create-more才操作，未在無lease時點擊。自有Chrome新視窗與IAB34已明確關閉，正式7保留；不追認94 IAB33舊close timeout。51份當時合成email/password及URL/base64/hex byte掃描、原生截圖privacy guards通過，不聲稱OCR或全部OS log。自有API清理六類fixture全0且已退出後才停止PG，Web兩children exit0、四portclosed、ownlease／queue0，共享裝置／原APP資料不動。

## 第九十四批：完整商品、雙照片與原 APP 商品狀態往返驗收

- 615乾淨release三樹保持；原APP12 source與Android inputs、static QA APK SHA2560abbc486ac062fa1ef45568cba8e0431c2145125cc854a893bae3ecc34db2da4核對不變。只新增外部驗收工具及本文件，產品／APP無修改、沒有重複部署同版。正式版本／meta與health最後再讀615，沒有正式資料寫入。
- 第一fixture照片實際POST201／receipt GET200，但Web5218與server固定API_URL18889不一致，strict同源校驗不採用；原失敗及cleanup保存。fresh94b將Web／API／原APP統一18889，以外部loopback passthrough及相同615 DEV source完成，不鬆產品HTTPS／photo parser，也不把新scope當同一upload journal恢復。初啟動依賴缺檔、selector及原日期fill限制均保留。
- 真Web表單上傳兩張640×480合成MANUAL_PHOTO，各只有一POST201及原receipt GET200；確認原結果後正常填WebFull94／QA94品牌／多行說明／toys／NEW／TWD245.5／MEETUP與SHIPPING／議價／臺北市中山區／約2km示例網格及公開同意，單POST201建立ACTIVE v1與CREATED回執。初IAB直接date fill未進controlled request，本筆只證預設30天；第89批真正日曆選日證據保持，不能宣稱94自訂日期成功。
- 原APP12 Android實際正常登入同owner並讀名稱／價格／新品／地點／說明／分類與真blue thumbnail，標記保留expected1→RESERVED2；Web同id讀回並正常確認恢復在售expected2→APPLIED3。IAB普通window.confirm令documented dialog／CDP／reload停滯，當時後台仍v2沒有POST；Chrome connector unavailable後使用原生Chrome自有無痕視窗確認，非私自改confirm或hidden store。原APP第二phase再讀ACTIVE3並sold expected3→SOLD4；Web只GET同原receipt3與最新4，明確顯示原操作完成後又有更新，再清理本機紀錄及已售出詳情。
- DB逐欄證實除status／version外原欄位與两media IDs／hash／position全不變，只有1 create、1 Web management release、2正常native status POST。原fresh sourcefault wrapper錯把nested receipt.state當body.state，沒有注入503，正常回覆200；初failed proof與進度更正保存，本批只算正常跨端及reload只讀查核通過，ACK-loss恢復仍待。Readonly probe初fixture未提供token而401，改真login留RAM後，兩原image／thumbnail合計12次owner200／other404／anonymous404，image bytes同DB hash；原creation／management receipt owner200／other404／anonymous401。不是正式寫入、iOS或真provider驗收。
- 两Androidphase及六GUIphase均正常釋放；原子借兩台僅核容量，真UI僅5558，不清共享設備／原APP資料。自有Chrome新視窗已關，IAB33明確close仍因confirm timeout未核實，正式7markDeliverable；不宣稱所有localtab已關。两个QA host六類fixture均0、Web/API/PG正常停止、四portclosed、session lease/queue0；60份當時合成email/password及URL/base64/hex byte掃描與native capture guards通過，不聲稱OCR或所有OS log。原129使用者改動與93 immutable52、91/92及更早證據全保持。

## 第九十三批：探索與來源聊天空價格修正並發布615

- 第92批正式原卡片／詳情原圖與full AX重新核實None元。共享sourceLeadPrice僅轉換空值與None／null／undefined／NaN單一價格sentinel為繁中「售價待詢問」或英文Ask about price；正常0元／固定价／區間／議價／名稱含None原文保持，原publicFacts不改。Explore列表／詳情／地圖標記與SourceContactChat使用同一formatter。原圖尚未取得展示許可維持誠實說明，不新增媒體許可。
- 本機全Web126檔1940與production build通過，新增真payload形態的中英卡片→詳情→chat且零POST與原facts不改的回歸。初English測試selector漏existing連字符造成一次harness失敗，改原External-source item後全測通過；並非產品copy錯誤。精確CI37096583889三項通過，HTTP及migrations/schema gate成功，完整counts另存，不修改APP／server。
- PR119 https://github.com/HankHuang0516/wishlist-app/pull/119，head 66f22c76f3b63c2df2902f8794a0dff31f48572b、merge 808d6dd4f883b7f0e3c199859c63d452e12e6235、empty trigger 66b3a8619cb5aa4b3824b0d20bc3f5f69fe98897，client／server／mobile三樹與CI head逐一一致，既有Railway部署 bc55d343-0430-45fa-b4ef-61542e28ca71 SUCCESS且latest一致、uploads mount保留、變數不改。不猜provider未提供的commit metadata。
- 正式615版本／meta／route資源／health與匿名private讀取拒絕回讀；真登入tab由612正常更新至615保留原storage，原汽車卡片→詳情→來源聊天缺價提示一致，普通來源標價保留，主導覽Explore與Chat可見可用。原source id与私密交易狀態沒有新寫入；地圖marker使用同formatter但這筆無媒體權限，不能宣稱其marker照片實測。詳見formal-ui-proof與raw新圖。
- 第92批55份immutable索引、91原115＋wording1及較早證據全保持、原129使用者改動保持；ownedGUI正常釋放、viewport reset、正式tab保留，本批未起native／PG／QA runtime。首頁與設定最新完整人工審查是612各90，615僅價格顯示修正，不給虛構新全頁分數。已完功能依Hank節奏直接部署；full goal仍active。

## 第九十二批：正式612首頁、設定與手機導覽重新驗收

- 使用原始未改JPEG核對最新612與核定圖；桌面736×952 DOM、實圖721×933，Home與Settings頂部及真正底部均檢視，人工權重35／25／20／15／5分別31／24／18／12／5=90與33／24／18／10／5=90。為本agent設計判斷，非pixel相似度或獨立review。真資料、額外說明／欄位與高度差異照實扣分；一個帶標籤Settings。
- 手機390×844 viewport、DOM375，九項預設流程實開、nav六項≥44px，來源84線索与8站內商品分離，Chat收件匣實際可見。Home選到最右願望後仍root375，已改回原book並收合。Settings全AX不保存、沒有密鑰／密碼／資料寫入；四受管GUI釋放、viewport reset。Social raw尺寸獨立記錄，不用它冒稱精確手機畫布視覺得分。
- 發現「充電遙控汽車（大小款合併）」空價被當成None元；原圖／AX保存，待下一增量修正及正式回讀。此批僅新增驗收證據，沒有產品修改／新部署，整體功能、provider／iOS／正式寫入與全頁效能仍active。

## 第九十一批：原 APP 與網頁共用私人商品草稿及版本衝突驗收

- 原APP12 tracked source／Android build inputs與既有static APK逐檔保持，APK仍0abbc486ac062fa1ef45568cba8e0431c2145125cc854a893bae3ecc34db2da4。Web／server為乾淨612 release checkout與第90批精確CI同樹；本批只有外部驗收工具與這份矩陣，不改產品／APP，不重複部署相同版本。
- fresh cross91隔離UTF8 PG55591／同一18889 host連續持有合成buyer帳號；網頁實際只填WebDraft91建立一件DRAFT v1與一份CREATED回執。售價／說明／地點null、零照片、publishedAt null，原APP正常真登入並在「我的商品→草稿」實際讀回售價未填／地點未填／無照片。
- 原APP實際編輯NativeEdit91＋說明「APP 編輯的草稿91」＋售價0，PATCH expected1→v2；Web讀回同id／description／免費贈送，未送出WebPending91修改關閉保留／reload／重開原encrypted edit draft後仍在，後台保持v2、此重開只有GET。APP再正常修改NativeConcurrent91，PATCH expected2→v3。
- Web尚留v2表單明確儲存，原管理回執CONFLICT expected2／appliedVersion null，v3與APP文字不變；reload只GET同action回執200、原POST仍一次。只有明確「保留我的修改，以最新版本重新編輯」再明確儲存，才以新action expected3→APPLIED4；APP第三phase實際重新讀同id的WebPending91／原description／免費贈送。最終只有1 create POST、2個正常native PATCH與2個Web管理POST，無重複Listing／自動重送。
- Other QA seller的真正browser草稿0且沒有buyer的原操作內容；匿名及other owner GET DRAFT404、兩次越權PATCH404，公開search200零件，原row逐欄與v4保持。外部首次search誤用query參數400保存診斷，改正為契約允許的公開列表後通過，不當產品故障。
- 測試限制全部保留：正式built612在loopback HTTP被strict HTTPS parser保護，改相同source的DEV模式而未鬆產品驗證；5556容量不足未安裝／未清資料，原子借兩台只核容量、實際UI仅5558；外部AX setText未打開鍵盤，初Back關閉editor而沒有PATCH，修工具後通過；初Vite supervisor cwd令Tailwind未掃正確位置，早期無樣式圖只作功能證據、不作視覺驗收，修cwd後styled final result真圖已檢視。這些都不是使用者先前看不到探索／聊天的原因證明。
- 已知合成email／password及URL／base64／hex形式的105份當時證據byte掃描通過，原生截圖guard／instrument結果亦核對；不是全面OS log、歷史JWT或圖片OCR審計。5個GUI與3個成功Androidphase均釋放，兩個前期Android失敗保留；自有host六類fixture0、private socket移除、各port與本session lease／queue0，PG正常停止；原APP包與共享emulator保持。
- 正式web-version再次讀回612，沒有正式資料寫入、真provider／照片／定位或新formal CRUD宣稱。第90批部署與CI證據保留，本批不把舊CI當新run；完整Home／Settings最新人工90仍593。cross-end-proof、實拍與原失敗保留在wishlist-web-audit91-evidence-20261003.json／exclusive hash index；手動name-only DRAFT往返與編輯版本衝突局部驗收已補，商品多頁／其他狀態／iOS／provider／正式端與全矩陣最後視覺效能仍active。

## 第九十批：手動公開刊登按鈕可見性修正

- 第89批真手機截圖發現primary公開CTA白底白字，computed background／color皆rgb255，DOM accessible label存在不等於可見。共用button shape移除background，再各自套一種背景，public深色28／25／23＋白文字，private-save保留白底stone文字。僅5條Web／版本／驗收文件路徑，draft-save與公開validate／journals／API／server／schema／APP均不改。
- 全Web125檔1927與production build通過，未增加只對class字串的鏡像測試；真正建置CSS在受管browser確認桌面public computedStyle及實拍，375手機兩CTA46px且y469／527真正可見、scrollWidth375，照片／商品資料沒有新寫入。初QA fixture api相對範圍與AuthContext full URL不同導致不能恢復，僅修fixture；built worker後續把test-only URL當SPA而404，改fresh loopback5210預覽，不清原storage／不解除worker。两個初限制保存，不能當產品故障或使用者缺探索聊天原因。
- PR118 https://github.com/HankHuang0516/wishlist-app/pull/118，head f8a9924fa4afe75209444a22c23847637a72ced3／CI37093862856精確3/3：Web125／1927、Server61／955＋3既有skip、HTTP41／644、current upstream native43／859；merge 03da16c331e205ceae566896f689572146b48614、empty trigger 8b5ec7126c559ddfa529d1439fb31f6197785dd5。原Railway CLI exact client／server／mobile三樹乾淨checkout部署 0810a87d-b882-4f88-8800-b9f87ad7d9dd SUCCESS且latest一致，uploads／變數保持，沒有猜provider commit metadata。
- 正式版本／meta612、Manual／Explore／Chat／Settingschunks200、health JSON200、匿名private GET401及88 manifest三PNG原bytes核對。原609登入分頁正常更新check／explicit保存確認reload至612，site storage與登入保持；正式manual桌面与390 viewport（DOM375）primary深底白字、private-save白底文字、兩按鈕46px与無root橫溢出，actual fresh-AX core JPEG檢視通過。正式没有商品／照片／對話／來源寫入，不冒稱formal CRUD驗收。
- 自有5209 API／5210 built preview停止，原55589 PG正常停止，5合成Listing／5receipts／2photos保持；三轮owned GUI正常釋放，localtabs關閉／viewport reset，正式tab保留，原129改動及89 immutable111與更早證據核對。evidence／exclusive hash index保留原failure與修正後真圖；增量修正已部署，full goal仍active。原APP12與獨立PR116 upstreamnative保持，完整Home／Settings最近90仍593，未給612新分數。

## 第八十九批：手動商品私人草稿與原操作恢復

- 對照原APP12 ListingComposer／listingForm：save draft只要求名稱，0–8照片及售價、描述、地點、公開同意可留白。Web原sell只有私人media sellerDraft，並非Listing DRAFT。新增/sell/manual與sell可見入口，private/manual與public-create分別校驗；不新增APP MyListings原本沒有的既有DRAFT發布功能。未送出的新manual欄位未提供autosave，不冒稱持久保存；已提交原內容可恢復。
- DRAFT v2與既有公開v1 journal分開、原ID／canonical hash、owner與kind校驗、encrypted CAS隔離；reload只GET原creation／photo receipt，404須明確同ID同body retry，安全取消只取消尚未完成操作。已成功結果保留至明確已讀，clear失败暫停，安全重讀可恢復。MANUAL_PHOTO全unused pages、最多8、原照片重試與owned proxy驗證，勾選取消不永久刪照片。
- 真UI發現目的過濾unused DTO沒有owner／purpose欄，改驗實際投影並依後台purpose route權限；production /api相對base會被strict照片parser錯拒，改取getFullApiUrl只驗同源absolute proxy，transport路由保持。新增真production模式與DTO回歸、draft canonical fixture由現有server parser生成，沒有改production server或schema。
- 本機隔離真production handlers／PG／browser驗名稱only、0價commit502→reload GET、photo commit502→GET、完整optional私有欄位／約略2km位置及真正calendar2026-10-15、公開缺欄拒絕後完整ACTIVE、切另一帳號空表單。最終5 Listing／5 immutable receipts，四DRAFT＋一ACTIVE、兩MANUAL_PHOTO／兩upload receipts，private四ID匿名404。原name-only logger記router-relative path，後續改觀察originalUrl；初date fill未送入controlled body，不claim2100已存，另有實際日曆選日／POST／DB／reload一致證據。初GUI排队逾時與測試selector問題保留。
- 原607 candidate因PR116獨立merge版本衝突未得CI；保留upstream縣市／臺北未明行政區與native2.0.15，僅版本JSON conflict解，base608＋1進609。PR117 https://github.com/HankHuang0516/wishlist-app/pull/117 精確head 7d6e8e28bdd856d7fbead5861c3423a596746bbe／CI37092812933：Web125檔1927、Server61組955＋3skip、HTTP41組644／migration diff0、upstream native43檔859。merge 55dc2d369f158567b427f81644ea51fee198ee1a，empty trigger 56a7f40c9d1a9416759e2681d810a7c7206a0d3f；Railway 99b466d1-b0cf-4717-bcd6-fd8ccab1fdab SUCCESS且latest，CLI實際三樹與exact CI相同，uploads／變數保持，provider commit metadata不冒稱存在。
- 正式meta／web-version609、entry及Explore／Chat／Settings／Manual chunks200，health JSON200、匿名private GET401，88 manifest三PNGbytes與尺寸維持。原604分頁ready target先605，使用正常更新check取得609，再explicit reload至609，登入／site storage保持。實際Explore8站內商品／84來源、Chat四來源＋QA商品、唯一Settings與manual入口／表單核對；正式沒有商品／照片／對話寫入。
- 手機DOM375／scrollWidth375、兩CTA46px，首actions截圖控制仍在viewport外不算可見證據；再scroll後final真圖顯示private-save可見，public CTA卻白底白字。computedStyle確認同為rgb255，根因base bg-white與primary bg-stone-900衝突；這是本批實際未通過視覺項，立即另批修復，未以DOM標籤宣稱可見。已實際檢視正式表單／手機final及本機calendar恢復原JPEG。
- 自有5208／5209／55589停止，合成DB／media與初失敗證據保留；所有GUI釋放、暫時localtab關閉、viewport還原1265／scroll0、正式manualtab保留。原129改動、88原61與screenshot supplement／較早證據不改。evidence／exclusive hash index歸檔，whole goal active，原APP12不改，593 Home／Settings90不冒稱609新分數。

## 第八十八批：安裝圖示規格與正式manifest發布

- 真缺口：601 manifest把同一1024×1024原logo宣告192及512，Safari缺主畫面專用圖示，HTML與manifest主題色不同。沿用原logo生成實際192／512／180PNG，不重畫品牌；首頁start_url、根id／scope及既有worker私有資料排除保持，Safari加入touch icon與名稱，主題同HTML。原logoSHA256保持。本次只改11條Web／驗收／版本路徑，不改server、mobile、資料權限、schema、服務變數或正式內容。
- 新postbuild gate驗實際dist單一manifest、PNG signature／IHDR尺寸、Applelink／180size、主題與三張圖precache。九項有意義回歸包含真舊1024logo錯宣告、HTMLfallback、Safari遺失／尺寸、account／external／query／traversal、native-store diversion、重複manifest與主題差異。601真built gate先失敗，604 focused30／完整122檔1901與productionbuild成功；unit PNG header fixture僅證metadata，真PNG解碼另以browser驗，不把標頭驗證當完整decoder。
- 唯讀CDP Page.getAppManifest成功讀到601真manifest及正規根id；Page.getInstallabilityErrors在IAB無法取得target errors，初limit文字過廣已保留並另檔更正。沒有宣稱尺寸就是promotion／安裝受阻或探索聊天未見原因。受管GUI內真built public三張圖片complete、natural dimensions192／512／180，manifest新theme／id／scope核對；技術圖示檢查頁不冒稱accountAPI或OS驗收。原截圖JPEG誤存png的初檔保留，byte-identical正確jpg另存，非圖片加工。
- PR115 https://github.com/HankHuang0516/wishlist-app/pull/115，精確head 63b85904c41ff16fc7de41acf9d6a2ed8bd5cbf8／CI37090489899三項成功：Web122檔1901、Server61組951＋3既有skip、真HTTP41組640且migration／schema一致、current main native858。本次從原main603＋1進604；正常merge 661052f3be8b3f1a7e41578446f30b115c8b032a與空trigger 7e4eaa9945d1950eccd46c51dbce9cf23e5f0420。原Railway CLI同CI三樹乾淨checkout上傳 d2ad42f7-fe90-4eba-9956-96aa97f509f3 SUCCESS且latest一致，原uploads掛載及變數保持；provider commit metadata為null，只聲明checkout與回傳deployID關聯。
- 正式meta／web-version604、/assets/index-BdTnQyG-.js與Explore／Chat／Settingschunks200、JSONhealth200、匿名privateGET401；formalmanifest及三PNG200且與Gitpublic原bytes同hash、實體尺寸相符。正常網站更新601→604使用ready banner及保存確認，未清site storage，登入保持。正式真manifest根id与601相同，正式三PNG直接browser解碼成功；設定桌面與390viewport文档375手機手動安裝說明／無橫向溢出、探索與聊天六導航／單一設定實際核對。沒有新增訊息／來源ASK／同意／撤回／面交／帳號POST。
- 四張初次clip截圖未顯示安裝區域，不當視覺證據；原檔保留並標示限制。另取得第三個owned GUI phase，先fresh AX觀察再core viewport截圖，desktop與390手機實際安裝說明可見且未包含私人profile欄位，正確完整原JPEG已檢視；不是圖片加工。Settings離開至Explore的首個click沒有換route且無dialog，未保存含profile的departed DOM；改開已觀察的/explore正式路徑成功，接著Explore→Chat導航正常。不把首個click冒稱成功，也未判它是產品缺陷或使用者舊版原因。
- 全部三輪自有GUI正常釋放、臨時tabs關閉、viewport reset、5205技術preview停止。原129其他workspace改動及87的87／更早86、84、85 immutable證據保持。完整evidence與hash索引保留初次限制、PNGmetadatafail／真decode、精確CI及正式部署回讀；增量功能已發布，真OS安裝、儲存／混合版本、其他跨端／providers與完整矩陣、最後視覺／效能仍active；最近整頁Home／Settings90仍593，未給604新分數。

- 第三輪返回Chat後的chat-final原圖仍顯示照片載入中，不當解碼成功證據，也不推論provider失敗；正式照片成功證據是較早formal604-chat.jpg與240×320 loaded DOM。61份主證據保持原hash，另存一份補充註記及hash索引，交付使用已核對的較早完整聊天圖。

## 第八十七批：網頁安裝提示生命週期與手動恢復發布

- 真缺口：首頁收到beforeinstallprompt但Settings尚未掛載會遺失；取消後同一一次性事件仍可重用，失敗沒有回復、雙擊可重複呼叫、未知結果阻塞，Macintosh UA的觸控iPad被當PC，Safari standalone與瀏覽器選單安裝未被識別。移到App根層，只在明確按鈕click呼叫一次；取消／錯誤／畸形結果／30秒逾時顯示如實提示和手動替代。新的browser事件不被舊結果清除；appinstalled／standalone變化優先，accepted只表示接受，不冒稱OS完成。pending同步擋語言reload；安裝不寫帳號API、不存事件、不自動重試。
- 14項新回歸；fixture前三輪錯誤原log保留，改用已建立的隔離pending store與真Navigator屬性後，原596六項行為失敗。最終APP整合／Settings回歸與完整Web1892通過。受控網頁使用真Settings、根provider與BrowserRouter，fetch僅合成read；首頁→設定保留提示且自動prompt0、取消1次、英文reject／pending語言凍結／實際30秒timeout／新accepted／appinstalled全部核對，account POST0。不是實際原生安裝。
- 首輪Vite因/tmp與canonical /private/tmp不一致拒絕頁面，修正本機服務allow list，未繞browser警告。一次GUI queue超時無lease／無UI；已取得兩輪完成受控流程、tab關閉、viewportreset、5204服務停止。timeout手機原圖只顯示前段Settings，不當作提示視覺證據；正式安裝说明手机截图另驗，375寬無橫向溢出。
- 同時PR113 main更新，初PR版本衝突且沒有candidate CI；正常rebase保留縣市示意來源，僅解兩版本檔，依新main600＋1改為601。原599候選／checks完整保留，不沿用原證據作新CI；根provider／Settings安裝元件／App／新測試在rebase前後同內容。本次9路徑diff不含server／mobile；main server新tree來自PR113，與原APP12分開。
- PR114 https://github.com/HankHuang0516/wishlist-app/pull/114，精確head 9f328d1bf54ba5522edbfbcc7110197713dbf989／CI37089045320三項成功：Web121檔1892，Server61組951＋3既有skip，真HTTP41組640、migration／schema一致，current main native858。正常merge ad0f6a2aa1c723a33ca87fe9ad23555e5c93fef7與空trigger 67c5e5ae2a63b48a7ff515b2d42bd1b1d0258e4e；原RailwayCLI同CI三樹乾淨checkout上傳 ac8db046-35c5-4771-9c0a-ff1c476bc52a SUCCESS，原uploads掛載／變數保持。provider commit metadata為null，只聲明checkout與回傳部署ID關聯。
- 正式metadata601／/assets/index-CaxDy6dU.js、Explore／Chat／Settings資源200、JSONhealth200、匿名私有GET401。使用原網站更新就緒／保存確認596→601，沒有清browser storage；正式Settings安装说明desktop與390×844（document375）、探索8站內／82来源、Chat四原source row／原QA room照片240×320與新來源重新讀取全部實際核對。首個English locator改依真中文DOM；第一GUI自然到期後晚動作由marker拒絕，新ownedphase完成，正式7保留deliverable，所有lease釋放。正式source讀取未新ASK／CONSENT／CANCEL、訊息／面交／個资POST。
- 原129其他workspace改動與86的149／84的175／85的116份immutable證據保持。完整evidence與hash索引保存此批控制／正式JPEG、partial screenshot限制、初次失敗、重整主線、精確CI及部署回讀。新增查核發現manifest將同一1024×1024 logo宣告192／512，留待獨立安裝規格／真OS驗收；未宣稱它阻擋安裝或是Hank入口問題原因。功能增量已發布；完整矩陣與最終逐頁90、mixed-version／真OS／providers等仍active。

## 第八十六批：來源原操作驗收、收件匣英文與明確重試發布

- 原593 fresh source86b隔離DB／真編譯handler連續完成三組真UI：ASK未commit503、CANCEL已commit503後切另一帳號無資料／原帳號關閉來源重開，GET原ASK null與原CANCEL回執、只一CANCEL事件；ASK已commit503後來源撤下，重開同WAITING_ROUTE與完整原問題且不POST；舊ASK無同意，CONSENT未commit503後reload只查原UUID，明確同UUID／完整consent hash重試後只一CONSENT事件，再CANCEL已commit503且關閉來源重開只GET確認。合計含舊seed七次HTTP action／五個事件／三room／五故障，另一帳號零room。原問題不重建、撤回不當問題已送；沒有正式資料或真賣家派送。
- 真實英文畫面發現來源收件匣標題／狀態仍中文；源碼核對一般Reload inbox只更新普通聊天，来源讀取失败沒有本頁重試。新增獨立重新讀取／重試來源對話，從本人第一頁開始、保留最後已驗歷史、30秒deadline／離開與切帳號abort、重複cursor拒絕；一般聊天限流及週期保持。七種狀態繁中／英文如實區分未送、保留代轉、已記錄代轉、撤回待核與送達待核，原商品與問題不翻寫。新七回歸在修正前六失敗一成功，最終全部通過。
- fresh source86c新版596正常登入／Settings English／Chat，第一本人來源GET由外部worker受控503；實際按新Retry source conversations後GET200同原room與seed ASK，查核前後沒有新action POST。正常同意與撤回各一次，同一原中文問題保持，INQUIRY／WAITING_ROUTE未送／CANCELLED英文收件匣實際核對。桌面1280×720與390×844 DOM／375×812手機原圖已審視，documentWidth375、所有main button至少44px；其他審查狀態為自動UI案例，沒有冒稱全部真operator／provider驗收。
- 原86遇另一task PG55487占用而未動它，初次fixture登入欄位錯誤在UI前失敗；停止後fresh86b更正既有phoneNumber登入契約，不重啟已過期fixtures。兩個GUI queue超時沒有動作，自然到期後晚到mutation由marker先拒絕；新的受管phase接續，同一live fixture未reset，最後viewport还原／臨時tab關閉／正常釋放。外部proof誤將公開detail GET actorId視為已認證字段，改以本人mine、另一帳號空room與原数据不變核對；原失敗及修正原因保留。初次backend runner flag及TS型別推論失敗均保留，未刪斷言或降低門檻。
- 精確CI 37087098467／head 45ceb75a6b86c954734638aef766a8e8a4b32ddb三項成功：Web120檔1877、Server947＋3skip、真HTTP40組638／migrations／schema一致、current main native858及發布gate。client／server build成功，server及mobile樹與原base相同，原APP12 tree e2dcf2b0962aaef9fc6b3e157994b1af0efc426a保持。PR112 https://github.com/HankHuang0516/wishlist-app/pull/112正常merge 5d41ae75e0ccf6c5da8471d2388084007d17f21a、空trigger 87efa21799d6ab979482ae532fdca84196ede238推main，不切動另一task的main worktree。原Railway乾淨CLI上傳 815914eb-76c6-4e28-9b47-bb538cc7b986 SUCCESS，三樹與精確CI一致、uploads掛載及變數保持；provider commit欄為null，只聲明來源checkout／回傳部署ID關聯。
- 正式版號／meta／/assets/index-DfoIBqQ3.js與Explore、Chat、Settings資源200、JSONhealth200／三匿名私有GET401再次核對；正常網站更新后實際探索／聊天／新來源重新讀取入口、六導航與單一Settings核對，正式原JPEG／DOM保留，未正式傳訊／面交／ASK／CONSENT／CANCEL。不是Hank此前看不到入口的cache根因診斷。第85批正式593 Home90／Settings90保留，本批不冒稱596新視覺評分。
- 自有三個來源namespace的API／Web／PG全部停止，fixture清零、private socket移除，原129份workspace其他改動、第84批175／85批116份immutable hashes保持。證據wishlist-web-audit86-evidence-20261003.json與artifact index保存原593操作、未翻譯畫面、596修正／真UI、初次失敗、精確CI與正式部署回讀；已知合成credential與encoded byte掃描通過，不冒稱正式資料／全面OS log／圖片OCR掃描。功能增量已發布；完整功能矩陣及browser storage實體生命週期、其他跨端與真providers／OS PWA仍active。

## 第八十五批：跨端訊息失敗恢復與正式593視覺重評

- 原APP12的183份tracked source、129個Android inputs與既有static／non-debuggable QA APK 0abbc486ac062fa1ef45568cba8e0431c2145125cc854a893bae3ecc34db2da4逐檔核對不變。Web／server保留乾淨main 1dd74455d0e2c23a4d8e4e541141c72d911c6b6d與PR111精確CI同樹；沒有產品修改或新部署。外部runner／loopback worker才加入兩種受控503，與真實網路中斷、正式寫入、browser storage實體損壞及商店APP分開。
- fresh cross85獨立UTF8 PG55486／新DB與同一host18889持有合成帳號及原room。原APP正常真登入、五tab／探索map／list／商品→原聊天。AndroidQAChat85Lost真handler commit201後，外部wrapper只將ACK改503；原未知提示、停用中的原文字與重試入口實際可見。強制停止自有QA APP後冷重開原room，GET原clientMessageId回執200、原泡泡保留、pending清除且composer可用，沒有第二次原生message POST。composer可用以真UI斷言核對，它在截圖下方，不冒稱截圖包含composer。
- Web賣家正常表單登入／接收原訊息。WebQAReply85Retry第一次POST在真handler前受控503而未寫入；reload原room只GET相同UUID回執404、沒有訊息POST，durable pending文字及原disabled input保留。只有明確「明確重試相同訊息」後第二次Web POST201，UUID與完整body逐欄相同。seed五列原值保持、原APP共一POST／Web共兩HTTP嘗試，各只一新增row seq6／7，沒有重複文字或新識別碼。
- APP恢復後正常提出TaipeiStationQA85原v1，Web明確確認expectedVersion1，原APP最後收取原兩則／正常「更新聊天」／返回無未讀徽章收件匣／再讀双方確認。DB及真read ACK核對雙方read7／未讀0；原id／起迄時間／timeZone／地點／proposer／buyerConfirmedAt保持，PROPOSE expected0與CONFIRM expected1各一次及兩份v1回執一致。本輪沒有注入面交故障或衝突，不能替代面交失敗恢復驗收。
- 三個原生phase與兩個寫入GUI phase皆實際完成並釋放；12份安全原生PNG與Web兩泡泡／confirmed preview原圖已檢視。原子借兩台只核對容量，實際UI僅5558，5556不當第二台UI證據。未清資料、未重裝原APP或停止共享裝置，只安裝外部test-only runner並清自有reverse。兩端的受控失敗是隔離本機DEV代理，合成照片及Web照片替代提示不證明真provider品質。
- Web proof初次誤要求稍後保存DOM仍保有transient 404 alert，實際下一次週期讀取已清alert但durable pending／原input／重試仍在；修正外部斷言核對持久提示，原精確GET404／reload零POST／原UUID與完整body／row count斷言全部保留。原web-reopened-pending.jpg只顯示history，composer在viewport外，明確排除為可見pending-input證據。失敗／修正說明與所有原圖不覆寫。
- 正式593首頁及設定各用736×952 DOM／721×933原始畫面與核准Web示意圖獨立人工加權：layout35／色字25／cards20／spacing15／nav5，Home31／24／18／12／5＝90，Settings33／24／18／10／5＝90；增加的真實權限／說明／頁高及少量實際配對所造成空白皆扣分，不以假商品補齊。首頁page1236／實際scroll284、設定page1184／scroll232另存下半部，兩頁唯一Settings、六導航皆44×48，首頁四張照片natural240×320。額外無標籤concept gear依單一設定指示排除；不是pixel90%或獨立審查。
- 手機390×844 DOM／375×812原圖，首頁上半部及實際scroll919下半部、設定上半部已查看，root document375；Home14個超視窗button／span均屬收合的願望交叉比對及其橫向strip，未驗展開操作。Settings原一DIV矩形疑點與後讀未再出現均保留，未判根因或宣稱全部descendant零溢出。原名home-lower-desktop圖的End沒有捲動、scroll0，保留但排除下半部證據，另以真scroll284圖驗收。第一desktop GUI100秒自然到期，晚到呼叫在marker缺失時先停止、未執行動作；下一受管phase補設定下半部，最後受管phase補首頁下半部並還原viewport／保留正式Settings分頁。
- 自有host／Web／PG正常停止，六類fixture0、private socket移除、18889／55486／5199／5200及本session租借／queue皆0；原129其他workspace改動及第84批175份immutable hash／sizes保持。72份前正式階段證據已知合成憑證與encoded byte掃描通過，另有原生report privacy核對；不是後續正式檔、全面OS log或圖片OCR掃描。公開593／JSON health200／原index-BqRS0g4q.js再次讀回，不能推定先前使用者看不到入口的cache根因。證據wishlist-web-audit85-evidence-20261003.json及索引保留，完整目標active。

## 第八十四批：Android 原APP與網頁同聊天室往返驗收

- 原APP2.0.12的183份tracked source、129個Android build inputs逐檔保持，沿用static JS／non-debuggable自有QA包及APK 0abbc486ac062fa1ef45568cba8e0431c2145125cc854a893bae3ecc34db2da4，不重建APP、不改產品source。Web／server是乾淨main 1dd74455d0e2c23a4d8e4e541141c72d911c6b6d與PR111精確CI同樹；main另一工作的native14不混作原12證據。本批只修改外部測試工具，沿用已發布593，不重複發布同版本。
- 初次84的三次外部工具失敗如實保留：截圖目的地未取target context、診斷directory為null、傳送按鈕誤用Web式標籤而原APP是「傳送」。修正外部工具後Android探索地圖／清單／商品／聊天單次訊息及面交v1提案、Web回覆與同意、Android收取與雙方確認画面均通過；但最終DB為buyer read6／未讀1，完整往返驗收明確失敗。外部receiver當時未等已讀回報就離開／停止APP，不能把畫面成功當未讀成功，也不推定產品缺陷根因。900秒期限結束清理後沒有重啟原fixture。
- fresh84b使用獨立UTF8 PG55485／新DB、同一host18889連續持有同組帳號／room，跨Android sender、Web GUI、Android receiver不重置。合成買家正常真登入，五tab／探索地圖列表／商品→聯絡賣家、AndroidQAChat84b seq6與TaipeiStationQA84b v1提案皆實際通過。Web賣家正常表單登入、接收原文字、僅一次WebQAReply84b seq7及同意原第1版。原五則seed rows保持、只有兩個新增message POST／clientMessageId各與DB一致；只有PROPOSE expected0及CONFIRM expected1、两份resultingVersion1回執，原id／時間／時區／地點／買家確認時間皆未變。
- 最終Android實際「1則未讀」→原兩則訊息可見→正常「更新聊天」→返回收件匣沒有未讀徽章→再開原面交「雙方已確認 · 第1版」。四份receiver安全PNG及最後live snapshot核對雙方lastReadSequence7／未讀0，HTTP另確有buyer throughSequence7的200回報。這證明正常手動更新後的已讀與收件匣一致，沒有宣稱純自動已讀時序已單獨通過。sender7圖與receiver4圖共11份，Web標準viewport兩則泡泡及confirmed preview已實際審視。
- 所有原生租借採原子兩台容量唯讀核對，實際UI僅選assigned emulator-5558；5556只做容量檢查，不稱兩台UI／多人驗收。原QA包先驗ownership與installed hash，未清除裝置資料、未重裝原APP或停止共享emulator；只安裝各自外部test-only runner並清除自有reverse。fresh84b兩次GUI在marker有效期間操作並正常釋放；原84第一GUI期限跨越時可能已包含Web回覆的限制保留，不替該輪補造租借證據。fresh84b憑證僅RAM／一次性broker，55份已知憑證及編碼byte掃描成功；非全面OS log／圖片OCR審查。
- 正式593探索地圖8件站內商品／30來源線索及原4筆AI代問／QA聊天收件匣再核對，頂部探索／聊天與單一設定入口、1280×720／document1265px、頁尾593原JPEG／DOM保留。公開version593／JSON health200／原index-BqRS0g4q.js再讀成功；meta[name=app-version]查詢為null，版號證據採頁尾與web-version.json，沒有捏造meta結果。未正式傳訊、面交、來源ASK／CANCEL或provider。本機DEV loopback proxy及合成缺圖fallback不當正式HTTPS寫入／真照片品質；首頁／設定90仍是583歷史評分。
- wishlist-web-audit84-evidence-20261003.json及175項immutable artifact index保留原84三失敗／unread失敗、fresh84b完整UI／DB／HTTP／編譯指紋與兩張正式入口原圖。兩組host六類fixture皆0、私有socket移除，18889／5199／5200／PG55484／55485均停止，自有lease／waiter0，臨時local tabs關閉、正式7留供查看，129份其他工作區改動hash保持。七則成功流程不是大分頁、競爭改版或真失聯；跨端失敗恢復、新來源其餘UI／儲存生命週期、真providers、OS PWA、完整矩陣與最終逐頁視覺驗收仍active。

## 第八十三批：來源聊天原操作恢復與正式增量發布

- 沿第82批原探索／來源商品／聊天入口，先保存完整原requestId、action、問題或同意hash，再派送POST。新source-inquiry與source-cancel兩個不可變加密slot分帳號／API來源，沿原AES-GCM、CAS、owner清除；沒有明文fallback或credential存檔。重開只GET目前room與原操作回執，確認逐欄相符及清理成功才解鎖；未知原問題保持供閱覽，只能明確同UUID／同body重送，沒有期限後自动重播。
- 新私有GET回執綁本人、lead、room及requestId，禁止query、private/no-store，找不到回null且不配置聊天室；來源撤回／功能關閉後仍能確認既有操作。停止用獨立slot保存，只有本人同room已確認terminal CANCELLED才停止未決原操作；CANCEL_REQUESTED／DELIVERY_REQUIRES_REVIEW不說已送達或已停止。後續401／409／429、無回執或清理故障不抹先前未知結果；後來較新CAS紀錄不被清掉。
- 舊sessionStorage ID-only標記只遷移原身份至加密保存，不重建POST；壞／不可讀紀錄fail closed。儲存讀取失敗仍可讀本人歷史、所有寫入鎖定並提供恢復；保存失敗不POST、清理失敗留原紀錄。30秒bounds包含storage等待，離開／切帳號隐藏私人畫面與abort，晚回覆不解鎖新scope。原共用限流、原訂單／轉送審查語義保持，新增繁中／英文恢復文案與48px操作目標。
- 聚焦60項含真WebCrypto＋IndexedDB加密／兩slot／帳號API隔離／CAS、原完整SourceContact13項及13新增UI案例、舊紀錄與精確回執6項。完整local Web119檔1870項、build、Server947＋3略過、fresh PG真HTTP40組638項、migrations及schema drift檢查成功。精確CI37080751624 head6ece9f51452a9a52b7a43f5ec3391d16dd7a7a2e再次三項全成功：1870／947＋3／638／current native858；此858是main2.0.14 source測試，不當原12 binary證據，APP未改。
- 三組正常真登入後本機UI使用fresh compiled後台／隔離PG與實際Web：提交ASK後503只讀確認無第二POST；派送前503後重開原問題含newline保持、明確同UUID／全部原欄重送後只一事件；原ASK未提交、CANCEL提交後503再重開確認terminal，只保留一CANCEL事件且沒有ASK事件。合計五次action HTTP、兩個問題事件與一次停止，沒有真賣家／provider／正式資料異動。UI候選592與最終593六個functional runtime git blobs完全相同，最終差異僅CI測試等待與版本文件；儲存故障是自動案例，不冒稱真browser破壞儲存驗收。
- 初次PG locale啟動拒絕後用自有環境C locale正常啟動；UI host與同DB HTTP suite重疊使三項數量斷言失敗，完整失敗log保留、合成紀錄全部清理後638重跑成功。初次transport drop由Chromium同鍵重試兩HTTP但DB只一事件，另存原證據、清理後用gateway503重新驗上述三組，不把兩POST當只GET。初次CI既有行銷測試在effect前查一次排程，改為等待同一exact one-poll條件，原全部斷言保留，完整1870與精確新CI再過；依新增commit版本規則592→593。
- PR111 https://github.com/HankHuang0516/wishlist-app/pull/111正常merge4c0dc9c993bafcfc8e0fc52375915e96de5c5d17，空trigger1dd74455d0e2c23a4d8e4e541141c72d911c6b6d推main；main已有他task worktree，使用同一乾淨detached checkout，未切動其工作區。原Railway服務直接上傳481cd882-fa29-4631-a1dc-1ce36c844bbc SUCCESS，client／server／mobile三樹與精確CI一致、uploads掛載及正式變數保持。provider commit欄為null，證明是乾淨CLI來源與回傳deployment ID關聯，不聲稱provider runtime SHA。正式version／meta／/assets/index-BqRS0g4q.js、Explore／Chat／Settings chunks200、JSONhealth200與三個匿名私有讀取401核對。
- 正式正常更新589→593保留登入，實際探索地圖／列表8件站內商品與30來源線索、來源商品→同source Chat AI代問，空原問題與disabled送出，返回原4筆來源／QA聊天收件匣核對；開啟没有新增来源item、沒有送問題／停止／訊息／面交或provider。舊589分頁開Settings曾觀察lazy資源失敗，正常ready／已保存確認更新593後Settings正常；這是驗證瀏覽器的觀察，不推定Hank先前看不到入口的原因。AX把列表切換顯為checkbox，DOM實為button，修正locator後正常切換；沒有产品改動。
- 原source chat整頁JPEG發生窄欄reflow輸出、保留raw並排除視覺驗收；另一次受管GUI以標準viewport及DOM實測dialog768px／h1 280px、1280×720畫布／doc1265px且无水平溢出。上半商品真照片與下半空輸入／disabled送出／footer593兩份viewport原圖皆實際審視，完整source DOM成對保留於screenshot-supplement；不拿坏fullpage圖或本機圖冒充正式視覺。首頁／設定90只沿583歷史評分，沒有593新評分。
- 證據wishlist-web-audit83-evidence-20261003.json與73項immutable artifact index、另6項screenshot-supplement index保存，含初次失敗、transport replay、三組本機真UI及593正式原JPEG／DOM。自有API18893／Vite5198／PG55483停止、合成user／lead／inquiry皆0、私有broker移除、兩個正式GUI階段皆釋放且自有租約／waiter0、臨時本機分頁關閉，129份原工作區改動hash保持；沒有聲稱其他task租約皆0。完整目標仍active，Android12完整流程／跨端恢復、新來源其餘UI／混合紀錄與browser storage生命週期、真providers／OS PWA、完整矩陣及最終逐頁視覺驗收繼續。

## 第八十二批：最新版來源整合核對與探索明確恢復發布

- 先同步 PR109／main 5f06368812af8bd94fa3926e54e1adfdbf8bf3d8，保留來源商品探索／Agent 聯絡新增功能。584 的 CI37074279284三項成功與部署3ee110b1-5045-4aaa-91e9-c7c6914bd487 SUCCESS／commit5f06368精確核對，client／server／mobile樹相同；實際 `/api/admin/health` 回 JSON200，排除 `/health` 的SPA200。原瀏覽器仍583，正常網站更新後584；這只是本驗證瀏覽器的觀察，不推定 Hank 看到舊入口的原因。
- 新来源 hook原每30秒在429／網路或資料格式失敗後繼續查詢。三項新增回歸在修正前確實失敗，工具原輸出保留於會話、沒有另存prefail檔；現在任何失敗即暫停該查詢週期的自動更新、保留最後完整頁，不發布半份分頁，單頁30秒timeout及離開abort。新query才恢復；來源transport429期限接入原探索倒數與同步gate，等待到期不自動發送，錯誤區新增至少44px明確重試並套用目前關鍵字／範圍，繁中與英文均驗證。
- 五項新回歸涵蓋HTTP429／期限後不派送、網路失敗保留真來源row、壞cursor停止及兩語系原頁倒數／按鈕／文字保持。完整local Web118檔1851項及build成功；初次文字型別build失敗log保留後修正，精確候選CI37077765818再次Web1851／Server947＋3skip／真DB HTTP637／current native858與其他完整發布檢查成功。沒有APP或server產品變更；原指定12baseline與latest main14分別記錄，不把858當12原包證據。
- PR110 head625f8ed6343ec138150eae21e298d3716385cd3b／merge d499cd023c5673a1f135096bd1cf55d6fb968ead／空trigger6884b18456f11fcfb9735f4d11a3aab1bb663e89，依base HEAD588＋1為2.0.589。原Railway服務直接上傳5256d083-59c2-4c2e-86d4-6c0df30fde48 SUCCESS，乾淨checkout三樹與候選CI相同、uploads掛載保持。CLI provider commit欄為null，證明來自已記錄的乾淨上傳來源與回傳部署ID，不虛稱provider提供runtime SHA；正式version／meta／index-BUQbw6Sh.js／Explore、Chat、Settings chunks200、JSONhealth200及匿名私有讀取401核對。
- 正常更新584→589保留登入。實際探索地圖與列表8件站內商品／30來源、CHIMEI來源商品詳情→同source的原Chat AI代問空表單、disabled Send，以及返回原4筆来源／QA收件匣皆核對。開啟未新增來源詢問，沒有送問題／訊息／面交或provider，正式未注入429故障；恢復失敗流程是自動案例。初次列表locator角色不符以實際文字控制修正；一次Settings提前導覽於GUI排隊時發生，停止後續UI直到自有marker取得，界線保留於UI proof。
- 證據wishlist-web-audit82-evidence-20261003.json及27項immutable artifact index保存，包含兩版實際原JPEG／DOM與589來源Chat。GUI釋放／queue0，沒有新本機API／fixture，129份原工作區改動hash保持；primary只有原對齊doc累積改動。完整目標仍active；首頁／設定90最新為583，不外推589／全站，Android與來源代問儲存失敗／新來源UI其餘適用對齊、跨端恢復、真providers與OS PWA繼續。

## 第八十一批：Android 真實登入與測試入口修正

- 上批同room iOS↔Web訊息／未讀／原v1面交確認為實際進展，本批接續Android。現行native tree e2dcf2b0962aaef9fc6b3e157994b1af0efc426a／183 tracked files逐檔hash不變；沿用129個build inputs全一致的2.0.12 Android static JS、non-debuggable隔離包visualqa202610030340，APK 0abbc486ac062fa1ef45568cba8e0431c2145125cc854a893bae3ecc34db2da4；不重新建APP、不使用正式upload certificate。
- 新獨立test-only instrumentation以同一既有debug certificate編譯，僅在受管裝置操作自有visual QA包。5556空間不足於登入前拒絕，之後原子租借兩台逐台唯讀容量檢查、選5558實際UI；不把兩台容量檢查算雙裝置UI通過。原安裝ownership／installed APK hash核對後復用，外部runner更新前亦核對先前自有hash；未清除共享裝置資料或重裝原APP。
- 六次runtime report全部保留，整組流程皆未通過：第一輪容量拒絕，其餘依序為登入入口等待、輸入欄位定位、同名登入標題／按鈕、錯誤「許願」tab斷言，以及復用session主畫面延後顯示。只有role-button輪有真正正常登入POST200與users/me GET200 actor1，UI回讀首頁／探索／社交／我的標籤；原方法仍因正確tab其實是「願望」而失敗，不能改稱整組通過。此真登入與身份證據另存real-login-proof，其他前置失敗皆零auth／chat請求。
- 私有一次性broker傳入合成帳密，直接在真實Android欄位執行輸入動作，不將帳密放command／intent／build或檔案；已執行instrumentation結果之已知憑證／編碼比對通過，不冒稱全面OS日誌掃描。沒有取得可交付的安全原生截圖；欄位輸入動作完成本身亦不當UI或後台成功。所有修正只在外部QA工具，不改APP／Web產品source；最新restored-ready runner編譯及簽章核對完成但未runtime，不能當修正已通過。
- 本機host持有同五則seed／同room共900秒，最後runtime snapshot仍五則原訊息、無面交提案；真登入不等於商品聊天或面交驗收。host依既有期限正常停止，六類fixture清理皆0，socket移除，PG55481停止，全部受管租借／queue歸零；沒有Web回覆階段、正式帳號或provider異動。本task無新產品功能與部署。
- 下一步用最新外部工具與fresh隔離fixture完成Android探索／商品入口／單次聊天／面交，再补Android↔Web往返及剩餘異常恢復。原6失敗與7份test-only編譯metadata保留；900秒到期後不重啟原host冒充同組延續。完整矩陣與原90／100%條件維持active，129份其他工作區改動不變。
- 收尾公開版號首次不等於583，據實核對正式584／新entry；main為5f06368812af8bd94fa3926e54e1adfdbf8bf3d8，PR109已merged且44個檔案完整列舉，其中13個mobile檔案、source package2.0.14。原integration仍bb73乾淨、上述2.0.12測試不冒稱latest main。main merge／公開版號不是精確Railway部署commit或新CI／authenticated UI證據，须先補新來源／正式回歸並保留新增Web功能。`/health`實際為SPA HTML200，排除健康證據。使用者APP baseline選項待回覆，獨立的最新版Web核對繼續，不重複部署覆寫他項成果。

## 第八十批：同聊天室跨端訊息與面交確認驗收

- 同一獨立host持有同組合成帳號／商品／聊天室，跨受管iOS sender、實際Web UI、iOS receiver階段不重置或重播；183份原生tracked source逐檔hash不變。兩次最終原生流程均1/1通過、0skip，Web透過原表單與控制操作。本批沒有產品程式變更，正式metadata仍583；沿用已發布成果，不虛構新部署或重跑第77批CI。
- 原五則seed訊息保持，NativeQAChatSmoke只送一次且存seq6，WebQAReply80只送一次且存seq7；HTTP兩次clientMessageId與DB相同。原Web收件匣3未讀，開啟後seller read6／未讀0；Web回覆後buyer read6／未讀1，原生收件匣實際「1則未讀」，讀取後雙方read7／未讀0。安全HTTP trace不收read-through body，序號另以清理前live DB和實際UI核對；receiver未新增訊息或提案。
- 原面交id／第1版／TaipeiStationQA／Asia/Taipei及UTC開始結束時間皆保持。實際Web按同意後兩端皆「雙方已確認 · 第1版」；只有原buyer PROPOSE expectedVersion0及seller CONFIRM expectedVersion1共兩POST、兩份resultingVersion1回執，沒有改期或第二提案。
- 第一個receiver測試錯誤假設復用APP仍會顯示首次改版提示，於任何新憑證輸入或聊天室異動前失敗；原失敗report保留，不計通過。僅外部QA runner改為辨認已登入五tab或正常登入入口，復用同buyer session後通過完整SDK console／action／activity憑證隱私審查。成功receiver沒有重新登入或改版提示截圖；raw report舊safeProductNoticeScreenshot旗標代表安全附件匯出，不能冒稱該畫面已重驗。
- 第一個compiled PROD client經本機HTTP可驗收收件匣及read6，但pending recovery依原HTTPS規則拒絕寫入，排除其寫入驗收。後續current-source Vite DEV與自有CORS轉送代理仍用同後台／room；先前已讀不重置，DEV收件匣從0開始。聊天縮圖因代理API與fixture圖來源不同被既有origin檢查拒絕，實際顯示缺圖替代；不把合成圖或代理環境當真照片品質。GUI租期到期於安全檢查點中止，重新排隊後不自動重送。
- 12份原生PNG、8組Web原始JPEG／DOM及DB／HTTP／結果證據保存於wishlist-web-audit80-evidence-20261003.json與44項artifact index。Web回覆後第一張截圖只有底部，後續both-message-bubbles才完整顯示兩則文字；不拿前者作文字可見證明。全部自有服務停止、socket移除，fixtures／conversations／receipts／media與photo folders六類清理皆0，受管租借釋放；原129份其他工作區變更hash保持。
- 本批只補同room雙端成功流程；七則history不等於大分頁／競爭改版／實際失聯驗收，隔離debug iOS不等於商店或Android驗收。下一步補Android實際UI及剩餘跨端失敗／恢復、OS PWA、實際provider與完整矩陣；原完整功能與正式逐頁90完成條件保持，目標仍active。

## 第七十九批：使用者可見入口與交付核對

- Hank反映最新版看不到探索／聊天，本批先核對正式交付。正式metadata、實際meta與頁尾皆2.0.583，頂部主要功能可見探索／聊天兩入口；真探索地圖與目前8件結果、真聊天QA收件匣再次回讀。原分頁的限流提示經明確重新載入收件匣消失，未送出訊息或提案，亦無正式資料寫入。
- 探索與聊天可直接開啟 `/explore`、`/chat`。使用者目前查看的瀏覽器／主畫面網站／APP尚未確認，已提出選項；不得推定快取是根因。區分兩個Web入口已發布與完整跨端功能驗收仍未完成，後續每個完成功能沿用直接部署要求。
- 原始JPEG兩份與credential-free證據保存於wishlist-web-user-review79-evidence-20261003.json；GUI已釋放、正式分頁保留供查看，integration產品source保持乾淨且HEAD不變、129其他工作區改動保留。本批沒有新產品功能、不重複部署或重跑舊測試；同聊天室Web／native雙端、Android、provider與完整矩陣仍active，原第78批下一步保留。

## 第七十八批：原生聊天與面交實際驗收

- 上批為明確進展：583探索恢復功能已發布及正式回讀；本批補原生baseline，沒有新增Web或APP產品功能，正式metadata583／health200回讀，沿用第77批部署／CI及視覺證據而不虛構新部署／新評分。完整功能與逐頁視覺原完成條件不縮小。
- current native tree e2dcf2b0962aaef9fc6b3e157994b1af0efc426a／183 tracked files與第75批隔離scratch逐檔hash一致，iOS2.0.12／12 fresh debug QA App／test binary fingerprint保持；非商店release等價。原CUA Device Hub binding障礙由purpose-built XCTest入口繞過；原compiled NativeQaTests功能斷言與私有UIKit credential broker不改，實際登入後五tab／探索清單／聯絡賣家／NativeQAChatSmoke新訊息／返回收件匣皆可見。
- 兩個原生功能、三次原實際測試均1/1成功且0skip、完整SDK console/action/activity credential-free audit通過。面交實際提出TaipeiStationQA／第1版／買家已同意、賣家尚未同意，回聊天preview／手動更新維持同terms，最早訊息可見。五份原fixture訊息及六則history不冒稱121則分頁；green solid-color合成商品圖不作真實照片品質，沒有MiniMax／Flickr／mail或AndroidUI驗收聲明。
- 第三次在原cleanup前新增独立readonly Prisma核對：原五訊息＋單一native訊息seq6／原clientMessageId、buyer read6／incoming0、seller read0／computed unread3；單一PROPOSE receipt／resultingVersion1／PROPOSED與TaipeiStationQA、buyer確認／seller null一致。這是DB與原生畫面的單側baseline，沒有Web recipient或HTTP POST次數聲明，不把它算同聊天室雙端送達。
- 初始依賴缺少test guard與/tmp對/private/tmp精確路径不符兩次皆在原生斷言前拒絕，raw log保留；僅scratch連結current server／scripts並採realpath。原只許fresh install的runtime admission，改成僅本task已持有的unique QA app／runner，核對ownership、實際installed executable/test hashes後復用，不reinstall／erase共享裝置資料或原APP。編譯功能斷言／產品source與server限額不改。
- Separate90s DB observer未捕捉到live提案已排除，后將核對放原清理前、以fresh actors明確重跑面交流程，原正常兩項結果保留。共14份未後製安全原生圖、3run report、独立DB contract与各失敗紀錄在wishlist-web-audit78-evidence-20261003.json及index；沒有借失敗observer聲稱one-message／proposal。
- 受管04D84B5C-1960-466E-8851-3A21D1C93917／GUI FIFO，每階段成功後釋放，新增fair-checkpoint在有他人排隊時120s通知自有node安全終止，無automatic mutation replay。本機原QA worker逐階段只移除自己fresh fixtures／暫存media，合成DB及raw證據保留；PG55478／Metro18887／全部自有phase服務停止、原生device保持boot／shared data不動、manager audit0、原129改動hash保留。
- 下一步獨立host持有同組合成handler／actor／room，跨受管native與Web GUI階段持續，核對Web recipient未讀／接收／回覆／精確v1面交同意，再native收件及已讀回讀。完整目標仍active；本批不以兩個單側native流程取代雙端、Android、真provider／OS PWA及全矩陣。

## 第七十七批正式發布與探索恢復驗收

- 正式v2.0.583，PR108精確head58c57f03b9720dbe28e976fc6f574a5723e1d297／CI37068128710三項成功，正常merge437dcebaeb72d3147acca83af94f7fe15d1c7cff、空triggerbb73a8d3965b9aeb5f99867825eae31eb9be5605。Git trigger／merge兩部署WAITING後，同一乾淨checkout直接上傳原Railway服務8ebd57b8-6ec4-4b5c-991d-a1dae5a61ca1 SUCCESS；client／server／mobile樹與精確CI一致，原uploads掛載／DB／正式變數保留，APP／server／migration不改。
- 新6項與完整Web114檔1838項、兩端build成功；精確CI另Web1838／Server930＋3略過／真HTTP634／原APP852全部通過。原5項prefail、初次QA分頁設定失效及成功路徑journal縮短均保留，不弱化斷言；本機真compiled handlers／PG證明同cursor429→明確200保留舊圖／輸入，等待前後零自動查詢，實際定位不可用／未授權結果後手動移圖零查詢、明確搜尋才兩來源新bbox200。QA跨來源Retry-After未expose，真browser驗的是原API保守60秒fallback，非12秒header讀取。
- 原580正式分頁以自動ready／更新網站／已保存確認正常升級583，不清cache／storage或強制worker操作；中間ready未另存獨立圖，不冒稱有原始中間截圖。正式探索map／8件清單照片、聊天收件匣／空非販售QA聊天室、空輸入與disabled Send均真UI／原JPEG／DOM／footer583核對，無訊息／提案／封鎖／帳號或商品寫入。公開metadata／index／bundle／四chunks583、health200、匿名私有API401、原cache policy與legacy JS200一致；不以公開HTTP代替authenticated UI。
- 新583首頁／設定736×952 DOM畫布原JPEG分别人工31＋24＋18＋12＋5＝90、33＋24＋18＋10＋5＝90；是本代理逐頁加權設計判斷，非独立第三方／像素相似度。實際原圖721×933、doc721、頁高1236／1184保留，願望metadata、額外私隱／聯絡／权益及頁長差異扣分。390×844 DOM／375×812原圖兩頁與探索地圖可靠、設定1入口／導航≥44px／無水平溢出；手機探索選中照片在畫布外未載入，不以此圖證明照片，桌面8圖另驗。沒有全站responsive或手機90聲明。
- local-list-mobile原圖375×211與DOM390×844不一致，raw保留并排除視覺驗收，僅geometry／載圖metadata；580mobile Home仍loading亦排除。初次location圖仍reading不作定位拒絕證據；僅後續實際不可用／未授權及手動替代流程，OS精確拒絕原因未觀察。英文detail／wish重讀為自動案例，沒有真OS／native／provider聲明。
- 自有18890／5280／55475全部停止，Vite為有意SIGINT；QA分頁16關閉、viewport恢復1280×720、正式7保留handoff，manager無owned lease且audit0、129其他改動逐檔hash保留。完整證據wishlist-web-audit77-evidence-20261003.json、visual-review-v583與artifact index；全目標active，真APP-Web雙方訊息／未讀／面交、MiniMax／Flickr／mail、OS PWA及完整矩陣仍待。

## 第七十六批正式發布與分享恢復驗收

- 正式v2.0.580，PR107精確head 5f86c3d15bbd52e9facc021565e1c979747c15d3、CI37065159456三項成功；正常merge826e2c4035dfcea3f2ef03c76958255b7f2379db、空trigger4c449ffda5d22320f0b3ce6dc53f51617261a060。原Git部署c58c46cf-47af-4955-9b80-50feccb2d48c等待；原服務同一乾淨checkout直接上傳67d63307-fa73-48d8-8209-21cc1f73c7a5 SUCCESS，client／server／mobile樹與CI一致、原uploads掛載保留，無APP／migration／正式變數變更。
- 本機完整Web113檔1832項、SSR12項與兩端build成功；精確CI再次Web1832／Server930＋3略過／真HTTP634／原APP852及其他發布檢查通過。九新增分享／refresh／期限／session案例及真handler／PG瀏覽器v3→v4／v6、503恢復、SOLD／private404、390px分享readonly證據保留；受控navigator失敗不是實際OS拒絕，fixture控制不是原生管理。
- 原577正式分頁經ready／保存確認正常升級580，不清storage／cache或操作worker。正式探索map／清單照片、聊天收件匣／空合成非販售QA聊天室、公開商品的手動分享文字與重新GET全部1280×720真UI／DOM／原JPEG回讀；圖片實載、設定入口1、無水平溢出。沒有送出訊息／提案、呼叫自動分享或產品寫入，商品保持v1，不冒稱正式改版或故障注入。公開version／index／主bundle／chunks與health200、匿名私有API401、worker activation1／claim1、legacy bootstrap200核對。
- 初次QA CORS漏標頭與label測試失敗完整保留，未弱化斷言。兩張短狀態fullpage輸出排版不可靠已排除；真正viewport與DOM量測是置中576px面板、512×28標題且視覺正常；沒有為截圖問題修改product CSS。全部自有本機API／Vite／PG停止、資料保留、QA分頁關閉、原129其他工作區改動hash保持，正式分頁保留供後續。
- 完整證據wishlist-web-audit76-evidence-20261003.json及artifact index。完整目標active；最近首頁／設定577各90、沒有580視覺重新評分；英文新增行為是自動測試，原生／Web跨端、真MiniMax／Flickr／mail、OS PWA與完整矩陣仍待。

## 2026-10-03 第七十七批：探索限流等待與明確恢復

- 正式580實際操作遇到transport429，探索原文要求依等待提示重試，但沒有實際等待時間且搜尋按鈕仍可按；願望選單失敗只提供回首頁，商品詳情亦無原商品重讀入口。正式原始畫面／DOM保留，不把失敗的0載入數當全站0商品。
- 候選Web2.0.583依HEAD提交數582＋1。探索使用原ApiFailure.retryAfterMs建立此session的記憶體deadline，兩來源同時失敗採較晚期限；每秒更新等待秒數，期限後僅開放明確操作，沒有自動搜尋或重播。搜尋／套用／清除／範圍／擴大／更多／新detail均有UIdisabled及同步deadline防重入，讀取既有商品／手動移動地圖／列表／調整文字仍可用。
- 願望選單新增明確原GET重讀，不重查商品也不清除輸入；同步gate、signal及帳號session清理保留。商品詳情以原kind/id重讀，等待提示放入modal供實際操作；開始重讀移除舊detail、取消／舊scope與過期檢查保留。非transport產品429不虛構全站等待deadline，原error內容不外露。未調高後台限額、未變更全球cooldown、APP2.0.12／server／45migration不改。
- 新6項Web案例：較晚並行期限及手動條件保留、分頁429保留舊商品與同cursor單GET、英文detail原id明確重讀、願望單GET恢復、產品429無假倒數、StrictMode首次abort後正常讀取。新增前5項實際失敗及原raw log保留；初次focused42項通過後補modal／StrictMode清理，完整Web114檔1838項與兩端build通過。後續真browser、精確CI及原Railway583正式結果見第七十七批完成紀錄；完整目標仍active。

## 2026-10-03 第七十六批：公開商品分享替代與重新讀取

- 候選v2.0.580依HEAD提交數579＋1。公開商品原自動分享失敗僅泛用錯誤，現在自動顯示readonly可選商品名稱／TWD價格／目前版號網址，也可明確展開／收合；成功才顯示已複製、native取消保持安靜，進行中禁止重入／改讀，原payload與期限檢查保留。網址從本站與validated listing生成，不帶原query、測試參數或帳號token。
- ready、暫時失敗及不公開頁新增明確重新載入，使用原anonymous GET且credentials omit／no-store；開始讀取就移除舊商品、分享文字、notice及report，404與503／429分別處理，不把暫時故障當停售。分享與讀取未增加後台寫入，APP2.0.12、server與45migration不改。
- 新9項Web測試，修正前新增5項實際失敗（原工具輸出，無單獨prefail檔）；第一次focused 3項label失敗log保留，明確aria-label修正，未放寬斷言。最後完整Web113檔1832項通過、SSR12項與兩端build通過；focused3檔68項為第9項加入前，完整1832涵蓋全部9項。英文為自動測試，訪客settings登入轉向沒有實際英文GUI聲明。
- 隔離真compiled read handlers／PG／2件本機合成非販售商品，受控clipboard失敗1次且沒有假的copied，v3旧URL重新讀取v4名稱／免費／Reserved／分享?v4，503移除舊操作並明確GET恢復；SOLDv5不公開／原SSR404、恢復ACTIVEv6再讀取與分享?v6。SSR以目前後台版號生成?v4／v6；private draft API／SSR／照片404。合成fixture狀態控制不是APP管理操作；瀏覽器失敗由local QA source注入，不冒稱實際OS權限拒絕。所有產品請求GET，無真實聯絡／分享送出／帳號或provider寫入。
- 初次本機CORS preflight標頭漏Content-Type，原錯誤畫面及log保留；仅QA環境補標頭，保留資料重新啟動而不seed重播。原短狀態full-page截圖另逐一核對viewport／DOM幾何，視覺結果以final-visual-inspection證據為準。390×844商品頁documentWidth375、實際照片載入、readonly文字可讀；QA分頁關閉、尺寸恢復、各程序／18889／5278／55474停止，資料保留。
- 正式部署前577公開商品／照片／SSR與無效連結唯讀核對。名為stale-url的577檔實際?v1等於目前v1，不能作舊版號證據；真正舊URL驗收為本機v3→v4／v6。完整證據wishlist-web-audit76-evidence-20261003.json；精確三CI、正常merge、空trigger、原Railway580與正式畫面回讀接續，完整目標active。

## 2026-10-03 第七十五批：最新版正式視覺複驗與現來源原生驗收準備

- 正式網站再次讀回v2.0.577。以736×952、scrollY0原始viewport圖逐頁對照Hank核准概念板；另外保存完整頁面查看地圖／進階功能／頁尾。首頁31＋24＋18＋12＋5＝90，設定33＋24＋18＋10＋5＝90；為本代理獨立逐頁人工加權審查，非像素相似度、非沿用553分數。原願望標籤、核對與地圖來源說明、隱私／聯絡權限及方案列仍造成高度差異，均列為扣分，沒有隱藏原功能或虛構三張商品／餘額。首頁頁高1236，設定1184；documentWidth721，header六入口均至少44×48、設定1個、無alert。
- 正式390×844首頁與設定各documentWidth375、導航約54×48且唯一設定入口；兩頁完整原圖與DOM已檢視，首頁商品240×320及三張堆疊圖載入。主操作／提醒／搜尋與底圖署名、設定私人欄位／暫停付款／永久0次／進階入口及577頁尾保持；這是兩頁手機排版證據，不是全站響應式或手機90分。原browser尺寸已reset至1280×720，分頁返回正式設定頁；沒有修改本人資料、商品、訊息或面交。
- 新loopback UTF8合成DB套用45個migration；三合成帳號、一個非販售藍杯商品與空room，runtime-only憑證經正常Web登入。收件匣／空聊天室／面交入口與真正320×320私人商品圖均實際核對。原快照70個API請求、訊息0、預約null、外部寫入0；此快照不是連續全時追蹤，含APP的合成賣家名稱不是原生證據，沒有雙端收送／未讀／新版本同意驗收。
- 拒絕把舊iOS QA當目前基準：雖72個hash相符，AuthScreen、ProductNoticeScreen、config、package及QA drivers不同。從577原生樹e2dcf2b0962aaef9fc6b3e157994b1af0efc426a匯出183檔，fresh獨立iOS Debug QA2.0.12/build12、arm64/x86_64、獨立bundle／keychain建置成功。managed04D84B5C-1960-466E-8851-3A21D1C93917安裝／啟動及當前來源Metro bundle成功；CUA對實際Device Hub bundle／安裝路徑／display name皆逾時，沒有原生登入、截圖或互動。建置與啟動不冒稱原生流程通過，未使用XCTest input bridge，也非商店包／release-equivalent包。
- Android第74批static non-debuggable QA重新核對129個source hash及相同當前native樹，產生的Android inputs在原build scratch核對。5556剩餘容量不足失敗保留、未刪資料；atomic受管理兩台分配後，既有自有5558 QA包正常啟動。CUA Android Studio Running Devices／Add Device沒有指定Codex_Shared_7b698d91b5dc，未啟動其他未受管理裝置、未改全域ADB／設定；實際原生跨端仍待。所有native／GUI lease正常結束，只停止獨立QA app及自有reverse，共用装置保持booted與原資料。
- 初次Expo offline/localhost參數組合、deployment-locked pods與generated inputs不存在於integration等中間失敗如實保留；修正只在隔離驗收scratch，183個原生檔最終hash不變。手機GUI曾在排隊期間由guard阻止，取得本任務lease後才操作。API／Vite／Metro／PG正常停止，55474／18889／5277／18887關閉，runtime合成憑證移除，DB／照片／QA包及log保留，隔離tab關閉、原129其他workspace改動保留。
- 本批只有驗收與原生包準備，沒有新產品修改／PR／部署；既有577仍為最新版，不為同版本驗收重複發布。證據`wishlist-web-audit75-evidence-20261003.json`與逐檔hash索引保存。完整目標active；實際APP-Web跨端、真MiniMax/Flickr與郵件、OS PWA/mixed-version CAS、不可逆GUI及其餘功能矩陣繼續。

## 第七十四批正式發布與面交回執驗收

- 正式v2.0.577，PR106精確head 5e51ec0de78ba334b2baa7def0d6c1fcc4f0e544、CI37058756858三項成功；正常合併5fead96423aad34fcd2b0b4e55101f33fbf8f02b、空triggerc45962295b1a7517cc118f641358199f595c9287。原Git部署7d68eb5a-5309-4dab-8a55-7570642aa5cc等待；同一乾淨checkout上傳既有Railway部署88766b64-3e29-4361-ba21-cd55c8bcfac4 SUCCESS，client／server／mobile樹與精確CI一致、uploads原掛載保持。無migration／APP／正式環境設定變更。
- 完整Web113檔1823項、Server58套930項＋3略過、真HTTP40檔634項及build／45migration schema agreement成功。初次既有五秒逾時保留原log與後續原案例／完整有限並行結果，沒有降低timeout或assertion。原面交GET/hash／actor／會員／封存／已放棄／未知／較新版本／關閉晚到／CAS皆有新增證據；不是測試件數等於功能覆蓋率。
- 實際隔離Web買家真handler提出v1後受控502，重開原操作仍保留，查核只增加兩個GET、原POST1；預約ID與全部私密條件不變、賣家未同意。三組原圖／DOM／request snapshots與匿名401／outsider404保持。照片fixtureplaceholder、dev meta absent、後續讀到v1的lost-ack截圖等限制均記錄；這批不冒稱native或production失敗注入。APP2.0.12現來源QA建置／managed5558安裝啟動成功，尚無CUA原生互動，不以含APP的合成賣家名稱當跨端證據。
- 原正式574分頁經ready與「我已保存，重新載入」升級577；原更新前聊天240×320照片保留，升級後探索map／8張清單照片、聊天收件匣照片、空QA聊天室composer及空面交dialog均1280×720、無水平溢出、單一設定入口且原圖已視覺檢查。未送訊息／面交提案／其他產品寫入；正式外部來源保持未開放與0件。公開版號、主bundle與四個chunks200、worker activation1／claim1、legacy registerSW.js200核對，不清cache／storage或繞過正常更新。
- 隔離QA分頁已在managedGUI關閉；API／Vite／PG停止且5276／18889／55474關閉，合成DB／media／失敗log及nativeQA包保留。原129其他workspace改動hash保持，正式分頁返回載入收件匣。完整目標仍active，provider／實際native跨端／OS PWA／不可逆GUI與完整矩陣待完成；最近Home／Settings553各90，未對577重新評分。

## 2026-10-03 第七十四批：只讀查核原面交回執

- 候選v2.0.577依HEAD提交數576＋1。發現Web待確認面交原本只能讀目前預約或明確重送原POST，缺少讀取本人原操作回執；新增「只查核原面交回執」與英文入口，重開仍保留原journal、不自動重送。原UUID與完整標準化內容hash核對，回執確認版號與目前預約版號分開，查核舊同意不會同意新條件。404不推定失敗或取消；已確認但CAS清理失敗保留原紀錄，新scope／晚到／關閉視窗不清掉新操作。
- 新authenticated GET在單一RepeatableRead快照核對目前room會員、未封存及actor本人回執，只接受一個64hex requestHash、嚴格UUID，private/no-store。不同actor／未知404、hash不符409、封存409、額外query400，不寫回執／不重放／不放棄；既有APP mutation契約不改、無新migration。
- 修正前新增三HTTP與一UI案例實際失敗，修正後新增18個Web與3個真HTTP／PG案例；focused3檔67項。完整Web113檔1823項、Server58套930項＋3略過、真HTTP40檔634項、45個migration與schema diff空、兩端build通過。初次完整Web既有BirthdayReminders五秒逾時原log保留，原案例單獨7項及完整兩worker1823項通過，沒有放寬timeout或斷言；精確雲端CI仍用原檢查。
- 隔離compiled真handler／PG／三合成帳號及一非販售商品，Web買家提出邀約真commit後受控502；reload保留原內容，按查核後只增加原回執GET與預約GET，原邀約POST始終1。原預約ID、v1、PROPOSED與私密條件不變，賣家仍未同意。匿名／非參與者真room、messages、meetup讀取401／404且不含私密條件；沒有真實訊息／provider／郵件。三組原JPEG／DOM均已視覺檢查；lost-ack畫面是pending與後續讀到的v1，不是502瞬間。照片fixture相對URL是placeholder，這批不宣稱照片驗收；dev meta absent但footer／build577保存。
- 現APP2.0.12原生樹未改；現來源獨立QA包versionCode30成功建置、安裝及啟動於managed5558。5556容量不足的失敗保留、不刪任何裝置資料；CUA無可控emulator視窗，沒有實際原生登入／操作或雙端送達證據，不能以合成賣家名稱含APP冒稱跨端成功。lease／自有reverse／QA app正常釋放，API／Vite／PG停止與5276／18889／55474關閉、DB／照片保留；QA分頁已於後續managedGUI租約關閉。
- 精確CI、正常merge、空trigger、原Railway發布與正式574→577畫面回讀接續。正式外部來源仍未開放、APP與正式環境設定不改。證據wishlist-web-audit74-evidence-20261003.json，完整目標active、最新首頁／設定仍553各90；真provider、跨端、OS PWA與完整矩陣仍保留。

## 第七十三批正式發布與聊天恢復驗收

- v2.0.574：PR105精確head 8c601e203f37da55ebc9938de2fbe790569ab88f，CI 37052855842 三項成功；正常合併 9ce0c02b087fe0e87b232a828f127bcbfe1c0b4a，空觸發 24c59d3536568c9dd87405bc7814ff9e875fdba2。Git部署 b3ff830c-b173-41c6-87ef-f0ec95d16e8a 等待後，以同一乾淨checkout上傳既有Railway服務，部署 32ddccc3-570e-489d-b13e-f6172b767545 SUCCESS。client/server/mobile樹符合精確CI；uploads掛載、正式環境設定與資料庫服務保持，APP與migration未修改。
- 完整Web113檔1805項、Server58套930項＋3略過及兩端建置通過；四檔88項集中檢查先於最後close/send自動refresh gate，最後來源與八個既有面交editor readiness修正由完整檢查與精確CI覆蓋。修正前四個案例實際失敗，新增九項針對401／429、pending body、並行失敗、visible-read ACK、父子面交與草稿保存；不增加timeout或放寬assertion。
- 隔離45個migration與compiled真實API、兩個合成使用者、一件合成非販售商品、seed history及private appointment；各GET一次受控429／Retry-After5秒後真handler可讀。收件匣在超過30秒後請求數仍3、房間超過15秒仍8、面交超過15秒仍29，原歷史／未送出文字／集合點／私密備註保留。手動child更新只解除child；關閉後parent仍暫停，31個請求在下個週期仍31；明確parent更新後讀取與後續週期恢復。49個API快照GET（46×200＋3×429），零送出／proposal／產品寫入／read ACK／外部provider。
- 快照先於QA分頁關閉，不冒稱涵蓋後续所有GET；房間與面交等待尾端DOM可見，不冒稱連續focus/visibility事件追蹤。繁中desktop與英文390px十四組原JPEG／DOM／geometry；phone面交截圖scrolled到原欄位與更新控制，pause header在保存DOM，不冒稱每張partial截圖顯示完整modal。隔離573與發布574的四個product runtime檔hash一致。401與pending body為測試證據，不冒稱正式登入過期。QA分頁已關、viewport還原、API／Vite／PG停止，5274／5275／55473關閉，資料與證據保留。
- 原正式570分頁經ready與「我已保存，重新載入」更新574；正式探索地圖、8筆站內清單與八張240×320照片、聊天收件匣一張240×320照片均載入。另唯讀開啟既有非販售QA空聊天室，核對訊息輸入／手動更新／面交入口，再開面交dialog核對尚無預約，未填寫或送出、未封鎖；關閉後回到已載入收件匣。五組正式原圖均1280×720無橫向溢出、單一設定入口並經視覺核對；partial聊天室截圖不冒稱包含所有下方控制，原DOM完整保存。正式外部来源仍未開放且0件；沒有清cache/storage、強制worker、送訊息、檢舉或面交操作。公開版號、主bundle、四個功能chunk200、worker activation1／claim1與legacy registerSW.js200核對。
- 原始證據、明確限制與hash索引均保存；不以隔離驗收冒充正式故障、真provider／跨裝置送達或OS PWA。完整目標仍active、最近首頁／設定評分仍553各90，原129其他workspace改動保留。

## 2026-10-03 第七十三批：聊天與面交的明確讀取恢復

- 第72批已部署照片功能及正式567→570更新證據完整保留。核對APP原聊天／面交定時更新與Web既有提示，發現Web在401／429後說已暫停，實際timer／foreground／online仍會繼續；共享API的Retry-After只暫擋網路，到期又會自行讀取。本批修正Web的錯誤／恢復行為，APP不改。
- 收件匣、聊天室與面交視窗在401／429後鎖住自動讀取及自動已讀ACK；只有本頁明確更新成功才解除。限制到期、回前景或連網不解除，手動重讀失敗也保持暫停。平行面交預覽晚到失敗以generation防止另一成功回覆解除；面交視窗的失敗通知父聊天室，避免背後仍輪詢。聊天先核對最新room／messages，再標記曾實際可見的訊息；原80%／500ms與會員／封存約束維持。
- 新雙語持續提示說明更新與重新登入；原訊息、待確認body／client ID、未送出文字、私密面交表單、version與回執均保持，不自行重送寫入。401的room查核失敗後不啟動額外原訊息receipt GET；尚未取得有效room時仍須先更新。
- 原runtime四個timer恢復測試真正失敗，API次數：inbox預期2但9、room預期4但43、meetup預期2但15。修正後新增9項跨timer／foreground／online、401／429、失敗手動恢復、平行預覽、父子視窗、可見已讀及pending保留案例。已讀新案例最初在render後才啟用fake timer，原interval仍是真timer；改在render前建立完整fake clock，斷言與80%／500ms規則不放寬。集中四檔88項、完整Web113檔1805項與Server58套930項＋3略過及兩端建置已通過；精確三CI、隔離真handler瀏覽器與正式573更新接續。
- 正式外部來源仍未開放，沒有新增真實訊息、面交提案、商品或帳號寫入。完整provider／跨端／OS PWA／不可逆GUI及矩陣仍active；最新首頁／設定相似度仍553各90，APP及migration不改。

- 第73批初次精確CI37051885630：Server／Native成功，Web1804通過／1失敗；既有英文面交測試在「Reading meetup appointment」及disabled Propose狀態就fireEvent點擊，編輯器尚未開啟。八處測試改為等待真正enabled後再點，不增加逾時或減少payload／權限斷言；單檔19通過。原產品runtime不因CI測試同步修正而改動，隔離573的成功／失敗／恢復證據可對應同四個runtime檔hash；最終候選依現HEAD573＋1改為574，完整Web及新精確三CI另驗。所有初始失敗原log保留。

## 第七十二批正式發布與照片驗收

- v2.0.570：PR104精確head 35f45573a906b73b020ad96299dae4f27c930683，CI 37048886814 三項成功；正常合併 4d52b8fbc13184a378ff587650b56947781ca12d，空觸發 ae01e2f696640f50c4c15dfd1fdb6a513ecb0045。Git部署 eeb2e1de-63a0-4816-8175-53149c9b1d0d 等待後，以同一乾淨checkout上傳既有服務，部署 4e1dd9cf-2d20-403a-93ae-8018ecd5ee78 SUCCESS。正式client/server/mobile樹符合精確CI；uploads掛載、正式環境設定與資料庫服務保持，APP與migration未修改。
- 完整Web 113檔1796項、Server 58套930項＋3略過及兩端建置通過；四檔59項集中檢查先於最後JSON tuple key修正，最後修正由完整測試及精確CI覆蓋，不冒稱集中檢查曾重跑。
- 隔離compiled真實API／45個migration、單一合成來源及四件審核fixture；使用既有公開非販售QA照片，實際瀏覽器核對原圖成功1200×1600、原圖失敗保留240×320縮圖、兩張失敗顯示提示、縮圖失敗仍顯示成功原圖。繁中／英文與390px畫面共七份原JPEG／DOM／geometry；no-referrer、原來源連結及單一設定入口保持。照片失敗是實際load/error及naturalWidth=0證據，沒有注入事件或冒稱真實外部供應。
- 隔離API快照23個GET：21個200、兩個未掛載的marketing/availability 404如實保存；六次來源詳情GET200涵蓋四個fixture。快照先於最後另行公開index讀取；mounted router日誌是suffix path，不稱完整原URL或遠端照片網路追蹤。沒有資料寫入、訊息、檢舉或面交提案。QA分頁已關閉、viewport還原、API與Vite停止、PG停止，5272／5273／55472皆關閉，合成資料及證據保留。
- 正式原567分頁使用原檢查／ready／明確「我已保存，重新載入」更新570；另存ready與確認證據，不將初次check截圖命名當成preparing證明。正式探索地圖、8筆站內商品清單八張240×320照片、聊天收件匣一張240×320照片均載入成功；1280×720原畫布無橫向溢出、只有一個設定入口，圖片已視覺檢查。正式外部來源顯示未開放及0件，未為驗收開啟。沒有清cache／storage、強制worker或送出訊息。
- 公開版號、主bundle與探索／聊天等chunks200、原worker activation1／claim1、legacy registerSW.js200且非HTML替代核對。全部原始證據與限制在wishlist-web-audit72-evidence-20261003.json及hash索引；不以HTTP401冒充已登入流程，不以隔離資料冒充真provider、跨端聊天送達或OS PWA驗收。完整目標仍active，最近首頁／設定評分仍553各90，原129其他workspace改動保留。

## 2026-10-03 第七十二批：外部商品詳情原圖與失敗替代

- Native ExternalDetailPhoto與externalPhotoPresentation對照：只有真正original onLoad後顯示原圖；thumbnail先成功可預覽，original失敗仍顯示縮圖並如實說明；兩圖失敗明確placeholder，不能將空白或破圖当載入完成。Web加入相同狀態，沒有在清單或地圖預抓所有原圖，只在fresh身份／有效期已核對的外部詳情使用原imageUrl與thumbnailUrl。
- 原來源price／title／description／AI補充／canonical link與行政區中心限制不改，no-referrer保持，不加Authorization或私人API要求。原圖成功優先、單一失敗等待另圖、晚到事件、不同id／URL換圖時reset、切語言維持狀態及source link保持，以原生image load/error事件測試。載入／失敗status位在role=img之外可被輔助科技讀取，單一照片ARIA包含原商品文字與明確状態；輸入中的模板符號保持literal。
- v570依HEAD569＋1；focused4files59passed之後更換tuple key為JSON保證照片pair不混淆，必要完整Web／Server／三CI与瀏覽器驗收另驗。正式外部開關維持原狀；合成來源fixture與現有公開非販售QA照片只能證明網頁及真compiled API，不冒稱真实provider新增或交易。首頁／設定最近評分仍553各90，完整provider／兩方跨端／OS PWA／不可逆GUI與完整矩陣仍active，APP與migration不改。

## 第七十一批正式發布與探索雙語驗收

- v567 PR103精確headdbedba7312150d31e77f37e306332ad1d8e00d5b、CI37046524019三項成功；normal merge6d35547131db2f2fa608efdcffa785e334d4bff3、empty trigger25534432f1f84ee2c97ee2909d731903412e73aa。Gitc8f1b630-20e5-4793-ae11-f4357a7bef79 WAITING後同乾淨checkout上傳原service，部署58f51da7-c69a-4576-ad88-508914e12ff1 SUCCESS，uploads與client/server/mobile Runtime樹符合精確CI。原129其他workspace改動逐檔保留；APP與migration不改。
- Web112files1789passed、focused3files37passed、Server58suites930passed+3skipped與兩端build通過。原filter enums／原商品與願望文字／NT$／raw品牌／price／UUID保持；切語系、map/list與定位移動不自動query，失敗不當empty，closed known recovery維持手動恢復。私人權限、fresh detail、自己刊登preview不能自己購買與有限cursor／MAX_LOADED保持。
- 原IAB564以英文Settings原控制ready／明確saved確認更新567。正式Map與Item list八筆；原中文三國演義＋books／USED／MEETUP＋1–100明確Apply得四筆，500／100英文錯誤保留四筆與輸入，Clear filters恢复八筆。原非販售QA商品NT59、南門書局、原description、Used／Available、行政區、交付與台灣時間以DOM與真桌面／390px原圖核對；詳情垂直捲動，不宣稱每張截圖都看得到全部欄位。Escape關閉，還原繁中map/list／詳情及Chat照片240×320已載入；每頁一個Settings入口、documentWidth不超viewport，viewport reset並handoff原tab。沒有發訊息、檢舉、面交提案、改商品或profile。
- 中間證據如實保存：首次ready locator尚無匹配，fresh DOM為preparing；下一張名update-preparing-initial已是ready，不把命名當preparing證據。filters-applied原圖有lazy照片仍loading，invalid-price後四圖均loaded；chat-current初為0photo，chat-loaded才是完成圖。原JPEG／DOM／geometry與HTTP／worker及PR回讀在wishlist-web-audit71-evidence-20261003.json與hash索引。不用HTTP401代替已登入GUI，不宣稱真正送出或實際provider成功。下一批外部原圖／thumbnail/failure，本批正式外部开关不改；完整provider／跨端／OS PWA／不可逆GUI與完整矩陣仍active，最新相似度仍553各90。

## 2026-10-03 第七十一批：探索控制、詳情與已知恢復雙語

- 正式v564及原ExplorePage證實English preference下主要搜尋／篩選／map/list／詳情正文仍中文。現在補齊原124個控制與已知copy key、7個分類、配對score／reason／own preview／currency unknown／台灣時間及地圖失敗的清單提示；原商品／願望／品牌／來源內容、UUID、NT$與category／condition／delivery原enum不翻譯。配對keyword文字只插入一次，不解讀其中模板；原server match code及限制如實對照。
- 顯示語言換讀與地圖/list移動不查詢；定位只動原視野，須Search this area才查詢。原fresh details identity／expiry／account-key／abort fences、private願望選單、cursor loop／MAX_LOADED及optional外部開關不改；未知底層diagnostic受限、已知validation／401／429可恢復，不把失聯當empty。原報告destination／ProductActions及owner不能自己購買保持。
- focused3files37passed，含9個新增：原文字與四種filter值切語系後不dispatch、explicit apply同query；真match原因的currency／distance／seller-verification限制；未知讀取失敗与explicit recovery；invalid價格／距離0HTTP；fresh details／NT$／原文／Escape與report原入口；external host／canonical URL只導原來源；定位拒絕與成功均不查詢；真render failure仍可用list；locale inaccessible English且guest private reads0。初輪34passed／3個新增fixture失敗（測試價格寫590而原fixture為250、jsdom無geolocation、共用storage為自訂object非Storage.prototype），修正fixture後原HTTP／權限／payload斷言保持，產品未因fixture失敗改動。transform的兩次assert在寫出ExplorePage前停止，原頁不曾半寫。
- v567依HEAD566＋1；完整Web／Server build、精確三CI及正式雙語Explore實際操作另驗。APP ExternalDetailPhoto原圖／thumbnail與failure提示在Web目前只有縮圖，是此次源碼對照新增且尚未處理的真缺口，列為下一項；外部正式开關本批維持原狀，不能用mock宣稱真实外部供應或delivery。首頁／設定最近正式評分仍553各90；完整provider／兩方跨端／OS PWA／不可逆GUI與完整矩陣保持active。

## 第七十批正式發布與檢舉雙語驗收

- v564 PR102精確head9f4e805d95c0d633a83f95f11d8dad6c3a9ebf9e、CI37043462754三項通過；normal merge4471b0bf3d35fe5d87b0373ff6ec2e199ef3e2e2、empty trigger50c83158d213e3ffda8ad154253dd9ce66cc5ed3。Git0efd9c40-a2a0-4ba2-8846-555d9e5a7092 WAITING後同乾淨checkout上傳原service，部署60a4331a-8c8a-44bc-aba0-f34f5671e90c SUCCESS，uploads及client/server/mobile Runtime樹符合通過CI的版本。原129其他workspace改動保留；APP沒有修改。
- Web112files1780passed／Server58files930passed+3skipped及兩端build通過。原5個reason enums、3個review states、UUID、exact-body replay、encrypted pending store、CAS清理、401回復、lookup-only與hash-only明確放棄規則保持。未知診斷受封閉字典限制，真正PendingStoreError禁止新送出並可明確恢復；檢查保存文字／不自動POST及切語言不改待確認內容。focused4files82passed後補真PendingStoreError案例由完整1780檢查涵蓋，不冒稱focused83。
- 原IAB561经原ready控制與明確已保存確認更新564；本人原QA商品檢舉表單及私人紀錄英文、390px窄畫面、還原繁中與Chat收件匣原照片實際查看，保存raw DOM／geometry／viewport screenshots並檢視圖片。只切原瀏覽器端偏好，5個reason values及預設FRAUD保持，補充欄空白／1000限制保持；沒有新增訊息、檢舉、放棄或面交提案。真收件／審核結果和儲存失敗以單元檢查為證，本批沒有冒称正式送出或刻意破壞正式儲存。
- /reports當前頁及chunk200，未登入mine／receipt／operation三個GET均401；首頁版本metadata／主bundle／Explore與Chat等原chunk200及worker bytes核對。不用公開HTTP401證據代替已登入GUI工作流。最新首頁／設定相似度仍553各90；Explore正文英文另批完成，真provider／兩方跨端／OS PWA／不可逆GUI及完整矩陣仍active。

## 2026-10-03 第七十批：商品檢舉與私人紀錄雙語恢復

- 正式v561公開頁檢舉按鈕已English，nested dialog及reports history仍中文。此批補齊雙語原因／review狀態／關閉／guest返回登入／待確認原回執查核／explicit replay／hash-only安全放棄、empty／讀取失敗與台灣時間；原商品title／details／UUID及不可變payload不翻譯。
- error／notice保存封閉copy key而不是當時語系文句。已知receipt與input提示有明確對照，未知底層錯誤不直接呈現；pre-HTTP保存失敗不冒稱journal已保存。原store CAS、只有明確操作才POST、hash-only fence、已收件不稱撤回／下架、account／departure保護與private projection均保留，server／APP／migration不改。
- focused四檔82項通過，包含英文401 pending切語系仍同原內容且POST0、explicit same-body replay成功、三種真實review status與原文／台灣時間、storage fault保留文字且POST0／raw diagnostics不顯示、locale inaccessible English且讀失敗不冒稱empty、English兩步abandon僅hash與guest route0 private reads。舊繁中fixture明確選zh-TW並restore；原storage failure斷言由直接顯示raw錯誤改bounded恢復提示，HTTP0斷言不變。
- 候選依HEAD563＋1為v564，完整Web test/build與精確三CI、正式read-only雙語report dialog／history及既有PWA更新另驗。Explorer正文English仍為下一單獨功能發布；真provider／跨端、不可逆GUI與完整矩陣保持active，不以本批或局部mock當全100%完成。

- 第70批追加真正PendingStoreError恢復案例：提交停用、原頁文字保留、明確恢復後可用但POST0；最新完整Web112檔1780項／build與worker版號通過、Server58檔930項＋3skipped／build通過，精確三CI接續。

## 第六十九批正式發布與公開商品驗收

- v561 PR101精確headf7ed4ca8239648f020487cbb9c18706961aac781，CI37040569831三項通過；normal merge200641ab80381d546bfb7dbca8b78115d540ecb1、empty trigger0b6c0efb6d93c2c4bef6c0062dca9d66961e5dba。Git9c7235ce-56b8-4542-b7d1-a81bbed04096 WAITING後同乾淨checkout上傳原service，部署b45de240-2ab1-4ef2-8ca6-2b6fe082abd0 SUCCESS，uploads mount與client/server/mobile runtime樹對齊CI，APP無修改。原129其他workspace變更hash保留。
- 同QA公開商品v1原照片／名稱／NT$59保留，兩個預覽URL均?v=1；任意v999999仍回實際v1，no-store及invalid404、縮圖200核對。公開GET不送帳號cookies／Authorization，失聯／429不宣稱下架、不自動重送；完整Web1772／Server930+3skipped與兩端build通過。
- 原IAB557明確檢查／ready／已保存確認更新561；英文公開商品欄位、share及原探索map deeplink驗收，繁中恢復及既有探索／聊天唯讀回歸保存raw DOM／geometry／viewport screenshots。語系切換使用原瀏覽器端偏好保存，具體回讀及源碼確認無帳號API寫入保留；無訊息／檢舉／面交提案提交。語系驗收不改原商品／賣家內容。
- 首次8秒定位ready button未就緒，下一fresh DOM ready後才確認更新；英文及繁中公開頁首張capture照片尚未載入，raw保留而不當照片成功。另一early en-loaded圖736×414與DOM viewport736×1400不同，保留排除；固定画布後EN／ZH各736×1366完整畫面及同照片1200×1600成功、deep link選中同QA商品及附近6件、原繁中Explore範圍8件、Chat原QA對象照片載入，沒有新會話／訊息／提案。Settings首次餘額仍unverified，後續讀到本人永久餘額0，不把中間態當成功。正式share只核對可見控制及公開metadata，不把單元cancel／double-click當作真正分享送出或native sheet取消。
- 最近已評分首頁／設定仍553各90，本批不新增相似度分數。nested檢舉dialog仍繁中；實際English preference的Explore正文／主要控制仍中文，map ARIA／footer已English，此新發現另外待修。全部真provider／兩方跨端與不可逆GUI及完整矩陣驗收仍active，不以本批代替全目標。

## 2026-10-03 第六十九批：商品分享預覽版號與公開頁雙語讀取

- 原v557正式商品分享連結帶v1，但og:url及twitter:url均未帶版號，唯讀before證據已保存。現在metadata以後台目前version產生?v，不採用stale或任意query；同一真實照片／名稱／TWD價格、no-store、未公開或停售404保持。無APP／migration或公開權限變更。
- 公開頁及聯絡／管理／分享控制使用繁中／英文，原商品名稱／說明／賣家／地區不翻譯，價格仍NT$、日期固定台灣時間；saved locale故障fallback English、未知後台訊息不直接呈現。分享進行中只接受一次原payload；取消不稱失敗。nested檢舉dialog的中文仍為另待完成項，不冒稱整條檢舉英文完成。
- 公開GET使用共享data cooldown但不送Authorization／cookies；拒絕caller提供憑證、寫入方法與body，既有private api簽名與授權不改。Retry-After未到按重讀不fetch，到期也不自動讀或重送；須下一次明確重讀。404與429／失聯保持不同提示，原嚴格公開投影、切帳號／abort及失效時間保護保持。
- 候選依HEAD559＋1為v560。新API／頁面操作與metadata測試初輪15個舊繁中locator因fixture未選語系而失敗，原log保留；fixture明確zh-TW，英文與storage故障另測，原身份／未知投影／取消／permission斷言不弱化。focused Web3檔45項與Server metadata12項通過；完整Web／Server build、精確三CI及正式新版／雙語瀏覽器／預覽回讀接續。全功能目標仍active，不以本批代替真provider／跨端或不可逆GUI驗收。

- 第69批完整Web首輪1765項成功、ProductActions六個原繁中locator因獨立fixture未選語系失敗；原log保留。補明確zh fixture及真正English未知contact outcome，原防重建／錯身份／expiry／切帳號斷言不變。最終Web111檔1772項、Server58檔930項＋3skipped、兩端build及generated worker/version proof通過；新精確CI及正式回讀仍接續。

## 第六十八批正式發布與既有分頁更新驗收

- v557 PR100精確head130b68d1605fd0ee2295669fdda0857a8914b642，CI37035319484三项completed/success；正常merge6d799073b1f5fb9602137214f4219e2cea5e8ce0、空觸發c123945828e1e2d1b4b4cf3b0db1b1671da86151。Git552a89d7-aa9f-4b06-a1fb-d852fc23c38d WAITING後以同一乾淨checkout部署原service，b74b2fe2-89aa-4fe2-b967-ae0af129205e SUCCESS；client/server/mobile樹精確比對CI，uploads mount保留。原129workspace變更逐檔hash仍一致。
- metadata/index/bundle557、四feature chunks200、health200、未登入private401；公開worker activation1/claim1及legacy入口200原bytes核對。正式少量無憑證唯讀序列，三個更新GET之間再讀一次data，data counter只減1；各header limit仍500。僅此觀察，不宣稱各客戶端、GUI出口IP、跨replica持久計數或正式500筆飽和測試。
- 原IAB553設定先明確重試讀回本人資料及永久餘額0；手動檢查首次8秒定位更新button未就緒，下一次fresh DOM已ready553→557，保留此中間狀態而不放寬測試。只按已保存確認，之後同一tabfooter557、設定與餘額0正常；未清storage/cache、未強制worker message、未重送pending。736×952 raw Home/Settings已檢視，docWidth721、唯一Settings與header44px以上；90/90相似度仍以553最近正式評分為準，本批不冒稱新評分。
- 正式探索地圖／列表讀到相同8件，外部來源未開放如實顯示；Chat同QA對象、空history、空輸入與disabled Send，面交dialog無預約。未傳訊／提约／封鎖／商品／帳號寫入。手機390×844room原fullPage可讀，desktop viewport inbox及loaded room可讀；手機viewport inbox可讀但截圖仍有更新／照片載入中，不當最終圖片成功證據。
- 本批desktop room/inbox與一張mobile inbox的fullPage截圖仍窄列，與實際DOM section/header768px及h1 width280px矛盾。相同頁面改用fullPage:false，desktop viewport及mobile viewport讀到正常佈局；raw異常及尺寸全部保留、排除通過。沒有為截圖改產品CSS，不能由此確定所有capture內部原因。viewport reset／繁中保持、原tab保留；GUI leases全已釋放。完整provider品質／實際跨端送達與雙方預約、mixed-version PWA、憑證與不可逆GUI及矩陣未完項保留active。

## 2026-10-03 第六十八批：網站更新與資料讀取各自計算額度

- v553實際Chat限流／Settings安全讀取失败證據保留；server原global limiter在靜態檔之前，因此本版PWA約95個預快取資源的實際下載也會消耗500/IP/15分鐘的同份資料額度。這是程式確認的共用額度設計，沒有推定所有既有失敗都由更新造成或GUI與CLI共用出口。
- 改為兩個獨立process-local stores，每個仍500/IP/15分鐘。只有實際published build檔的GET／HEAD進入build額度；其餘全部維持data額度，原auth／security／chat／upload各細項限制不改。data用完仍可下載恢復shell；build用完也不能堵住本人資料讀取。各自仍會回429與Retry-After，不移除限制。
- allowlist於啟動讀取實際client/dist，僅明確root檔／workbox及assets／icons／images；不跟symlink、不收missing／encoded／private uploads／API／non-read。build目錄讀取失败fail-closed，所有请求仍受data限制；沒有新增公開資料路由／權限／APP或migration改動。
- 真loopback HTTP依原500額度驗證：95個更新GET後仍有完整500筆data，501拒絕；data拒絕時index仍可讀，build到501亦拒絕。POST／private／API query／missing／encoded仍扣data，HEAD扣build；fixture及伺服器都為合成local，非正式大量請求。
- v557完整Server首輪1項saturation fixture收到非預期401而非合成200，925項通過／3skipped，失敗log保留。fixture改為整個測試持有同一明確127.0.0.1 listener，finally關閉，避免逐請求重建短命server；原500／501、全部HTTP status與header斷言保持。不推定此為正式429根因；產品runtime未因401改動，完整Server重新驗收。
- 初候選依HEAD555＋1為v556；實際worker95預快取清單驗出9項未分類路徑（logo重複一次），补明確logo／feature插圖及analytics bridge的既有public檔，未擴大到API或private。保留初次失敗並強化fixture；最终依HEAD556＋1為v557，完整Web111檔1765項、Server58檔926項＋3skipped與兩端build通過；精確CI、正式新版／資料恢復接續；原失敗与未完矩陣保留，目標active。

## 第六十七批正式發布與目前驗收

- v553 PR99 exact head a47783dcabecd43607068f7729e37468ece824b7，CI37031346501三項全部success；正常merge5231268e8ddb8ca8dbf19c60ff3c907c8b409687、空觸發c265d6feb39b87a836217a5dbcd83e20ee7bbed0。Git2a5f161a-7ff1-41a6-b3b6-0ac95633e02d WAITING後同乾淨checkout直接發布原service，7a8929a9-3aba-44b7-abc9-809f5885a281 SUCCESS。client／server／mobile樹與精確CI一致，uploads mount保持；原129workspace變更逐檔hash保留。
- 正式metadata／index／bundle553、四feature chunks200，健康200、私有API401；public worker實際activation1／claim1及legacy bootstrap200核對。原IAB550進階check實際ready553，明確已保存確認後同tab553，帳號／Settings／永久額度0正常；沒有清storage／cache或強制worker訊息。先前547→550 fresh-proof失敗仍為歷史，不推定原因已確定。
- 最新736×952 raw Home／Settings與核准concept重新人工審查：Home31＋24＋18＋12＋5＝90；Settings33＋24＋18＋10＋5＝90。單一Settings、header44px以上、docWidth721≤736；原商品件數／照片／金額／個資不計入，原願望metadata、地圖來源與私人權限／頁長差異保留扣分。這是553本批人工review，不冒稱pixel similarity或全部手機頁通過。
- Explore同8件map／list、Chat同QA對象／空history／disabled傳送、面交无預約均實際讀取，沒有傳訊／提約／封鎖／帳號或刊登異動。390×844 Chat inbox原图實際可讀、docWidth390、Settings入口1；viewport reset／繁中保持。兩張IAB desktop Chat截圖仍窄列且與DOM geometry矛盾，raw保留並排除視覺通過；面交dialog與mobile可讀，不能因此抹除矛盾。
- 後續持續唯讀遇正式Chat限流提示，原room保留且自動讀取停止；Settings轉為安全讀取失败，原圖／DOM保存。這是新增的正式限流情境，不將先前正常畫面當最後所有data皆正常。已讀到server global500／15分鐘套用所有請求，網站更新檔也耗用同份資料額度；第68批將分開兩份各500額度。原失敗原因與GUI／CLI出口IP仍不猜測。完整provider／跨端／不可逆GUI及矩陣未完項保持active。

## 2026-10-03 第六十七批：帳號重讀與全站限流一致、雙語恢復

- v550原IAB帳號／設定失敗保留為歷史；新自有診斷分頁僅觀察Network response／failure，users/me、ai-usage、marketing availability與版本GET均200。原tab先明確重試設定，再明確重新核對帳號，最新個人資料與永久餘額0可見，帳號未確認提示消失。沒有清cache／登入／journal或提交資料；最初失敗原因未確定，不以恢復後200推定原因。唯讀observer關閉、自有診斷tab關閉、原tab保留。
- AuthProvider原直接fetch繞過第66批shared Retry-After等待。現在同API純記憶deadline，等待期間重按帳號核對也不fetch，期限到達沒有自動request／mutation；需下一次明確核對才讀。只有已核實current401／404或身份不符才登出；離頁、切帳號及晚到JSON仍由原generation／sequence／abort fence保護，未知讀取保留身份與原pending。
- 帳號恢復、跨分頁、儲存失敗及重新核對按鈕依既有繁中／英文偏好，locale讀取失敗fallback English。closed notice key不存後台diagnostic，姓名／journal／session原值保持。候選依HEAD552＋1進版v553，APP／server／migration不改。
- focused4檔70項通過，新增英文恢復／404保留pending／locale fault及跨chat-account cooldown實測。401 mock改成真Response以驗HTTP status；原嚴格identity／return／cache／late-body斷言保持。完整Web111檔1765項、TypeScript／Vite build及真worker postbuild已通過；精確三CI及正式UI依增量發布授權接續，未冒称已部署或全目標完成。

## 第六十六批正式發布與新版畫面驗收

- PR98 exact head35d1a8be909c360e7e2010191b64a2fde7d3aa2e，CI37026478391三項all success；正常merge34a69f57e94dbc8bada7104ae0ddf4cb9c31e72a、空觸發65e7c1af1c2c136424817ba030a069f18966d96a。Gitce9de029-6824-4abd-b9f7-eeb8fa3f1e9c WAITING後同乾淨checkout直接部署既有wishlist-app production，031c9159-e390-4721-ac1a-bf719b62b33e SUCCESS。uploads mount、環境、DB service、APP及server／migration程式樹保持；1761 Web／build／worker postbuild與精確三CI均已完成。
- 正式metadata／index／bundle550一致，Explore／Chat／SourceLeadMap／Settings四chunks200、健康200與未登入私有API401，公開marketplaceApi真正bytes含RATE_LIMIT_COOLDOWN／Retry-After／global code。公開worker入口activation1／claim1、legacy bootstrap200同原JS SHA。v544／547各96precache真URL歷史proof保留；此批只驗改動相關資源及實際新畫面，沒有再次大量讀取96URL去耗用正式額度，也沒有假寫成550全96重測。
- 原生Chrome547設定透過內建check→ready547→550、明確已保存reload→550，繁中語言還原。Chat收件匣1既有QA room，原中文商品／QA聯絡人／NT165／台灣時間保持，空history／disabled傳送及無預約readable。Explore地圖／列表8件正常，手機390×844Chat inbox實際畫布正常；未建立room／傳訊／提約／封鎖／修改帳號或刊登。429 cooldown由回歸驗證，不因部署重啟後讀取成功冒稱正式端已重現並走完429等待期限。
- v547原Settings429後明確Retry reading已恢復，再還原繁中；不需要清storage或登入資料。全目標保持active；最新Home／Settings相似度仍引用534既有人工90/90，沒有重新審查550。
- 手機390×844原生同QA room已讀到空history／disabled Send，面交詳情亦讀到無預約，原AX／JPEG另存。自有單分頁Chrome視窗關閉，原App Store Connect多分頁視窗未操作；device toolbar／DevTools收起，正常Actual Size與繁中還原。
- 原IAB547 ready550後明確確認及重試fresh proof仍提示「暫時無法核對更新」，安全留547。無未保存輸入下正常reload後可見550，但帳號／Settings資料明確重試仍失敗，不能算IAB safe update或profile成功；原錯誤DOM／PNG保留，原因尚未確認，不把它推定為與Native同429。viewport reset、繁中還原、原tab維持active goal handoff。此缺口與全部未完矩陣持續處理。

## 2026-10-02 第六十六批：聊天長時間開啟後的限流等待

- v547原生Chrome390×844畫布正常顯示英文Chat／Meetup，但持續讀取後遇429，設定讀取也429；原生DevTools可見 `/api/chat/conversations/...` 與 `/api/users/me` Too Many Requests，未操作Console程式／storage／安全開關。production既有限制每IP全路由500次／15分鐘，每個資源讀取都計入其出口IP額度；沒有比對GUI與HTTP驗收出口IP，不宣稱兩者必定同額度，更不能歸因為正常單一聊天輪詢必定超限。公開metadata在15:24:18讀到remaining182／reset452，作為當時HTTP端額度證據保存。
- Web API收到429即依Retry-After秒數或HTTP-date記住純記憶deadline，其他route／account亦不再發出請求，無有效header時保守等60秒；期限到達不會自行重送任何mutation。只保留期限、不存token／response／journal；原訊息及預約pending identity／body保持。Chat／Meetup顯示中英文等待提示，不把失敗說成空紀錄。未放寬或移除伺服器限制。
- 面交詳情開啟時由對話與詳情重複讀取meetup，移除parent重複呼叫，仍讀最新room／messages及詳情appointment。回歸涵蓋跨route／account cooldown、期限前零fetch、原操作明確重試、日期／非JSON／缺header、401不誤暫停、原草稿保留與一次輪詢僅一筆meetup read。
- 第一次新輪詢測試因fake timers在render後才啟動而未攔既有interval失敗；改在render前只攔interval，不改timeout／不略過斷言。候選HEAD count549＋1為v550；完整Web／build／精確CI及正式更新另驗收，不以本機通過代替正式流程。全目標保持active。
- 第一輪完整Web另抓到Marketing月額度429被當全站限流：保留失敗log，runtime改只對global RATE_LIMIT_EXCEEDED或無product code的429等待，MONTHLY_LIMIT／CHAT_RATE_LIMIT／PHOTO_UPLOAD_BUSY仍走各自原恢復，不阻止無關帳號讀取。新增隔離回歸，原月額度顯示／原request留存斷言不放寬。
- 最終focused7檔195項、完整Web111檔1761項與TypeScript／Vite build／實際worker postbuild均退出0；metadata／index／bundle550一致，既有private cache policy與bridge保持。精確三項CI、正常合併及正式讀取另記錄。

## 第六十五批正式更新與雙語验收

- PR97 exact head b2aa7541a95f97353830121e3d3775ab97951217，CI37023141766三項all success；merge45c1dffb3a9f4e65c3eabe90e1a6b3baacba9475、空觸發997d82622e99dd575a9cca97d4cc5ff28b52beed。Git部署WAITING後同乾淨checkout直接部署原service，d20f3b2c-0f9b-4e90-9b59-01c230727617 SUCCESS，volume／環境／DB／APP不改。metadata／index／bundle547、四feature chunks200、健康200／private401、96 precache URLs正確；public worker實際入口skipWaiting1／clientsClaim1，v544同測0／0。
- 真Chrome541→547 ready保留合成未傳送文字 `雙語更新驗收，未傳送 250.7500 USD {version}`，取消仍541原文未改。只清本agent合成文字後明確確認reload，同一QA room547、原中文商品／聯絡人／NT165／空歷史與disabled Send。英文面交表單合成地點／備註原文不變，清空後關閉，無POST／預約／封鎖／帳號異動。這個桌面驗收不取代雙方真正送達或手機429後恢復。
- IAB原534兩次正常reload後547，沒清cache／登入資料或強制skipWaiting。390×844手機圖視覺窄列但DOM main390／section358／scrollWidth390，矛盾raw圖與geometry保留，不計視覺通過；以另存原生Chrome390×844實際畫布確認排版，資料429待第66批正式恢復。完整目標與最終逐頁90驗收仍active。

## 2026-10-02 第六十五批：已下載新版仍等待啟用的實際更新缺口

- 第64批v544已正常合併／三項CI成功／部署SUCCESS，HTTP metadata、index、bundle與四個feature chunks一致，96個真precache URLs含Workbox revision都200且content type／index version正確。但既有英文Chrome v541多次正常check、reload及返回前景仍preparing。只用原生DevTools讀到#221 activated／#222 waiting to activate、received22:44:07，沒有按skipWaiting／Update on reload／Bypass／Unregister或清storage。此結果保留raw AX／JPEG，不能把v544 HTTP通過當聊天英文正式UI已通過。
- 安裝的vite-plugin-pwa1.2.0 `resolveOptions` 只有injectRegister auto/null且autoUpdate才設workbox.skipWaiting／clientsClaim；第63批injectRegister false因此關掉預設，生成worker只保留SKIP_WAITING message listener而無直接啟用／claim。修正以explicit workbox兩旗標準備新shell，由既有UI查核同版proof並經使用者確認reload，未導入virtual自動reload／未保存輸入不宣稱跨reload保留。
- 新build postbuild執行實際生成worker入口，未發任何synthetic message／未關clients即要求skipWaiting1與clientsClaim1，原private image cache policy／bridge／version JSON排除仍核對。修正前v544 generated worker實測skipWaiting0並退出1；產品配置補齊後再跑完整Web／build／三项精確CI，正式v541→新版本與聊天雙語另回讀。來源：[Vite PWA更新設定](https://vite-pwa-org.netlify.app/guide/auto-update)、[Workbox generateSW選項](https://developer.chrome.com/docs/workbox/modules/workbox-build)。以本機已安裝源碼條件與真worker驗收為準，不照文件概述推定已啟用。
- 一張原生390×844中間診斷圖保留，實際頁面沿用異常放大，不能當手機responsive驗收；已用正常Actual Size還原，正式手機最終圖另取。完整目標持續active，v544已完成功能依指示直接部署，發現阻礙可見新版的缺口接續修正並立即再次部署。
- 新候選HEAD count546＋1為v2.0.547，完整Web110檔1745項及TypeScript／Vite build退出0；postbuild實際generated-worker activation1／claim1、原policy／bridge／metadata exclusion通過。沒有修改UI reload confirmation／wire／APP／後台／migration；新的精確CI與既有541頁面實際載入547另回讀。

## 2026-10-02 第六十四批：聊天與面交雙語介面

- Chat收件匣／商品對象／訊息與面交詳情、預約表單、同意／改期／完成／取消及原操作恢復控制使用既有繁中／英文偏好，locale storage失敗仍可用英文。時間固定Asia/Taipei並明示台灣時間，價格保留NT$／TWD，不作匯率轉換。
- 原商品／姓名／訊息／地點／備註與不可變journal／wire body不翻譯；只有listingId為null的generated封存標題翻譯。固定closed dictionary與strict雙版本模板不把原使用者內容當模板，未知diagnostics顯示bounded查核提示。APP／server／migration／API權限不改。
- 新驗收確認英文原訊息POST回覆遺失後，切繁中GET-only恢復同一原文及ID；英文舊版面交原操作explicit retry保留原expectedVersion／body，不把現在v2當舊v1同意；更新時未提交地點不覆蓋，須明確載入新版。訊息pre-dispatch validation原會被finally refresh立即清掉，現只在confirmed成功後更新，繁中／英文錯誤與原輸入保留且zero POST／journal。
- 初輪新增fixture有完整商品標題後綴不符、錯spy Storage prototype；更正實際原標題與測試storage instance。第二輪仍抓到產品validation被refresh清空，修正runtime且保留原嚴格assertions，不放寬timeout／skip。完整Web／build、精確三項CI與v544正式雙語手機／桌面驗收待發布後回讀；全目標仍active。
- 發布候選依HEAD count543＋1進版v2.0.544，focused6檔179項、完整Web110檔1745項及TypeScript／Vite正式build全退出0，metadata與index／bundle版本一致；version JSON不precache，原worker cache policy／legacy bridge保留。既有map1088.52KB及PWA96entries6120.51KiB警告記錄。精確CI／正式部署／畫面回讀尚待完成，不把本機通過當正式驗收。
- v544正式發布：PR96 exact head f03c1dbb04964561036cdb71b110ee3d5176b4f3，CI37021144334三項all success，merge74cd3c97bd3fff05860b2c4bf0a8eee22896fdde、空觸發ff64bb99cac951d4891b168467df0c5f4823af5d。Git581bbecc-e48a-4a14-93a4-3a0a33b152d7 WAITING後同乾淨checkout直接部署原service，1c9d40a3-a6cb-4815-b7de-251097c7c0ce SUCCESS；uploads mount保留，APP／server／migration／環境及DB service不改。正式v541英文仍顯示中文Chat／Meetup的before原圖保存，v544瀏覽器未因HTTP成功冒稱通過，接續第65批worker修正。

## 第六十三批正式更新驗收：兩個真實正式版本

- v541最終發布回讀：PR95精確head `ac24645f0d7804d9bed49a9f1a0ab3414514ffa3` 的CI37017333955三項全部success，Web109檔1736項及build通過。正常合併 `32975099f8cddf397d7d72dee7350ac2c113883a`，空觸發 `1e953b37dfff15b147598ac993aededc6bf9e33d`；Git WAITING後以同一乾淨checkout直接部署原production，deployment `6c57c8ff-555c-4f62-ad3a-cf6cc0f87f05` SUCCESS。原uploads mount、環境、DB service、APP與runtime migration保持，public metadata／index／bundle541一致，四個feature chunks200，私有API401。
- 正式registerSW.js現在200 JavaScript，原bytes SHA256核對，沒有HTML fallback；它是相容入口可取用的證明，不能單獨推出所有舊分頁已啟用。原IAB534頁正常reload後仍534，不清storage／cache／登入資料強制達標。
- 真Chrome538→541：原QA空聊天室保留合成未傳送文字，回到前景後提示ready538→541；取消回原頁仍538且文字不變。只清除本agent合成文字，明確按已保存重新載入；同一room載入541、空歷史與disabled傳送保持，無產品訊息、預約、封鎖、帳號或商品異動。新版設定手動檢查顯示目前已是可用版本，探索原地圖與8件商品列表可切換。
- 原始Chrome JPEG／完整AX保存：ready-draft-v538-to-v541、cancel-kept-draft-v538、confirmed-chat-v541、explore-map-v541、explore-list-v541、settings-current-v541，各以 `wishlist-web-live63-chrome-` 前綴與20261002日期保存。總證據 `wishlist-web-live63-evidence-20261002.json`、transition proof與SHA256 artifact index在既有outputs。自有單分頁Chrome視窗關閉，原使用者多分頁視窗未操作；129份原workspace變更逐檔hash保留。
- 這輪正式驗收限桌面Chrome的真版本更新及探索／聊天讀取；没有541新手機／英文升級、全install／offline／mixed-version、正式注入已保存journal、真傳訊／雙方預約／provider品質或新Home／Settings90評分聲明。以下未完成／待另回讀文字是當時歷史，已完成項以上面正式證據為準；完整目標仍active。

- PR94精確head `6b9cedfa981b12318a580fad6b16a8187afd4a54` 的CI37014922457三項全success；完整Web1730及build通過。v2.0.538正常合併後空提交觸發，Git部署WAITING改用相同乾淨checkout／既有wishlist-app production直接部署，deployment `bb55de96-5308-4e59-b686-81115fbe3f20` 為SUCCESS，原uploads volume保留、環境／DB service未改。
- 正式HTTP538已回讀：version JSON、index meta與main bundle一致，Explore／Chat／Settings／SourceLead資源200，原cache policy保留，私有API未登入401。自有Chrome新視窗載入538並查核目前已是可用版本，首次同版沒有banner。IAB舊534分頁三次reload及新分頁仍534，實際DOM仍引用registerSW.js，而538不生成此舊入口；此相容缺口待修，沒有把Chrome新開成功當IAB舊頁已升級。
- 正常發布下一個build `2.0.541`，補回舊bundle所需的registerSW.js入口並阻擋換頁後的晚到確認重載，server／APP／migration不再變更。保持自有Chrome538頁面與未送出的「更新驗收草稿，未傳送 250.7500 USD」，核對真worker準備／提示、取消保留草稿、清空自有測試文字後明確確認reload與版號。訊息紀錄仍空，沒有傳送訊息／提出預約；第二个真實正式版本的驗收未完成前不把538→下一版標通過。完整Web／精確CI與本次正式手機／雙語／視覺另回讀。
- 換頁後確認核對晚到的回歸，先在未修runtime重現reload1（`/tmp/wishlist-live63-route-before-fix-20261002.log`），再以路徑／query／hash／history key的layout effect取消確認及counter fence，原輸入／marker保留且reload0。最初selector同名兩個check按鈕，改保留原設定control參照；未放寬時間。舊入口在load未完成時只註冊一次、load已完成時立即prepare，unsupported／denied／offline保持可用，storage與reload不觸碰。focused27、完整Web541的109檔1736項及build通過；公開bridge原bytes保留、worker precache含bridge、new HTML不注入、版本JSON不cache且meta同541。正式538的舊bridge HTTP確為200 HTML fallback，原HTTP proof保留；最初測試import.meta被Vite重寫HTTP URL，改讀實際cwd public檔，產品碼與assertions不改。

## 2026-10-02 第六十三批：可見且由使用者確認的網站更新

- 第62批正式瀏覽器兩次仍524、第三次才534，證明發布成功不能代替既有頁面更新。現有autoUpdate只注入原生registerSW，沒有UI回呼；官方與已安裝套件的virtual autoUpdate會自動reload並可能失去表單，因此保留worker自動準備相容舊版，只由新的WebUpdateProvider註冊、監測controllerchange／返回前景／online及5分鐘檢查，不使用會強制reload的virtual模組。
- build產生public `web-version.json`，明確排除precache；`index.html`加入本次build版本meta。以credentials omit、no-store、redirect error的兩個GET核對新鮮server版本與實際控制worker所提供的shell版本，一致才ready。legacy無meta或尚未裝完維持preparing；錯誤、外部／redirect／重複／無效metadata不當current或ready。允許只帶合法Workbox revision的index回應URL，無帳號／token／header／body。
- 設定進階新增中英文「檢查網站更新」，ready時全站顯示目前／可用版本與更新入口。必須看過保存／未存內容可能失去提醒並明確確認，隨即再讀完整版本proof，仍ready才reload；取消、離開、10秒deadline、晚回覆與準備中均不reload。update不清理storage／journal、不重送產品請求、不保存input，也不宣稱未存內容跨重載保留。首次同版安装不提示；worker metadata取自實際precached HTML而非只看controllerchange或server JSON。
- 尚未含這個入口的舊bundle無法事後注入UI，需先保存工作後重新開啟網站載入本版；保留原生成worker與圖片cache policy，不改native APP／API權限／付款／migration。正式兩版間更新、真browser保留未存文字與已保存journal、使用者確認重載、手機／英文與Home／Settings正式90需發布後另驗證，不能以單元mock或新檔名宣稱。
- 新focused21：準備／ready／同版／rollback／舊meta／revision／bad metadata，以及首次安裝、保留draft／marker、明確確認／繼續操作、server更新競爭、取消中晚回、失敗恢復、hung update deadline／departure與中英文storage fallback。首輪重複狀態文字斷言改限定dialog，原意不變；typecheck抓到Navigator型別的always-defined條件，改用實際typeof能力判定，未放寬strict。完整Web v2.0.537：108檔1729項及TypeScript／Vite正式build退出0，公開版本JSON與index meta同537、JSON不precache、原cache policy import保留；主JS357.51KB、既有map1088.52KB與PWA95entries6104.55KiB警告保留。精確CI與正式升級另回讀。
- 參考已安裝vite-plugin-pwa1.2.0來源及[官方自動更新說明](https://vite-pwa-org.netlify.app/guide/auto-update)；不引入新依賴或強制關閉使用者分頁。原完整目標仍active，每個完成增量通過必要檢查後直接部署既有Railway。
- 首輪精確CI37014216631（head ae83fac44af01ed24c3a02a62a146372741f442d）Web1728通過／1個既有MyListings到期案例失敗，原DOM有上一例的待查核STATUS journal，沒有放寬timeout或重跑同提交。上一例曾只等比較區出現就結束，現在等待原回執流程完成且GET恢復可用，另確認POST1／journal1；runtime sendManagement補上非同步journal核對後、storage保存前的active fence，離開後不再發起晚到保存。新增控制hash晚到的回歸確定零保存／清除／POST，focused51通過；版本依新HEAD count更新為538，完整Web108檔1730項及正式build退出0、metadata checks通過；新的精確CI與發布另回讀。原失敗log `/tmp/wishlist-live63-ci-first-web-failure-20261002.log` 保留。

## 前次正式發布：v2.0.534 導覽與來源输入修正（2026-10-02）

- PR93正常合併，精確head `c054a2084dfc57de45639a64583cc506f20d5820` 的CI37010038047三項全部成功。Web1708及build通過；原Auth返回路徑與SourceLead初始化失敗log保留，沒有skip／重試／放寬timeout。合併 `e81dc3f9796f24ff6639791dcea0cd613bc3df4d`，空觸發提交 `735db4ee3049faf7489383dc719609d5a85ed100`；Git部署WAITING後由相同乾淨checkout直接部署，deployment `d365d8cd-fc0e-4387-9844-b56d5ab93153` 為SUCCESS。原uploads volume保留，環境變數／資料庫服務未改；server、mobile、migration樹與前版一致，沒有冒稱本輪重新查核所有生產DB件數。
- 正式ZH736原圖：header由101→57px，首頁全高1280→1236、設定1228→1184；原style／單一Settings及全部功能保留。重新查看核准concept及原始實際圖後，Home90＝31＋24＋18＋12＋5，Settings90＝33＋24＋18＋10＋5，權重35／25／20／15／5。原願望metadata、聯絡公開權限、地圖controls／來源與頁長差異保留扣分；動態商品件數／照片／個資／範例餘額不計入。不宣稱像素90%或獨立評分。
- Home／Settings中英文736及390、英文768／1024，以及Explore／Chat繁中390，沒有橫向溢出；六導覽與登出／help皆至少44px，Settings入口1。會員完整badge從1024顯示、以下保留既有crown及title。英文頁長不同不硬套中文分數；未宣稱全站全部controls或全Chat英文已驗收。
- 正式SourceLead頁讀到30來源／2公共地點；以未提交合成文字核對原小數輸入保留、切換明確新來源清空旧草稿、新來源可輸入／保存可用，最後清空文字。沒有按保存或同意、配置inquiry或傳訊。原文保存／consent502／GET恢復契約由Web回歸驗證，不把本次正式未提交操作說成真送達。
- 正式Explore仍讀8件站內商品；這輪先在524驗證套用書籍／二手／面交／50–60篩至3、無效70–60保留3並提示、清除恢復8、不存在品牌0、距離200.1拒絕／200通過與原願望4含1自有預覽。自有detail保留原照片／品牌／約略地點／期限及管理入口，沒有自購／檢舉action。分享頁原title／NT55／OpenGraph URL與thumbnail200已回讀；最初驗證腳本錯要求未實作的canonical link，核對原SSR契約後改為og:url並明記，不宣稱第三方實際預覽或跨端送達。
- 534 Chat收件匣現在有1個既有QA room，於本輪期間出現，未歸因為本agent建立。實際開啟後原商品／價格／QA對象／空訊息紀錄與未填寫面交表單均可見；沒有傳訊、提出邀約、封鎖、同意／取消預約。本次不能替代真訊息／雙方預約異動驗收；524當時空收件匣保留為歷史。
- 舊登入瀏覽器前兩次重載仍524，第三次才534；沒有宣稱自動PWA升級成功，安全可見的更新流程列下一缺口。語言已還原繁中，viewport reset，自有IAB tab7標為active goal的handoff供後續升級驗收；原Chrome兩視窗／DevTools未宣稱清理。語言重載中的手機圖與一次dialog關閉後異常完整圖，保留intermediate並排除驗收，補以載入完成的原圖及fresh Chat viewport；沒有加工截图。
- 總紀錄 `wishlist-web-live62-evidence-20261002.json`、原圖／DOM／geometry及sha256索引 `wishlist-web-live62-artifact-index-20261002.json` 均在既有outputs；原129其他workspace改動逐檔hash保留。完整目標仍active，每個完成功能依Hank指示通過必要檢查後部署。

## 前次正式發布：v2.0.524 探索／聊天已上線（2026-10-02）

- PR82 已正常合併；release HEAD `7ba285c403bdfa2816de34e0e17a56256b2ea84c` 的 CI37006705477 三項全部成功。納入 main 後續 App Review 文件檢查腳本修正，其30項測試通過，client／server／mobile 的程式樹與已驗證 release 完全一致；APP 仍為2.0.12。
- Git 空提交觸發停在 Railway WAITING，改由乾淨整合 checkout `258fef85cedb7eb9993f47436938cd109929b4dd` 直接部署既有 wishlist-app／production，deployment `3b4c63fc-c60d-420d-9ef5-dd778e7451d1` 為 SUCCESS。上傳 volume `/app/server/public/uploads` 保留；沒有修改環境變數或重新部署資料庫。
- 正式站既有登入狀態實際開啟上方「探索／聊天」入口：探索底圖與原照片可見，讀取8件站內商品，切換列表顯示8張卡；聊天收件匣及重新載入正常，本帳號目前沒有對話，沒有建立聊天室或傳送訊息。因此不宣稱真實訊息送達或面交異動已驗收。
- 手機390×844兩頁沒有橫向溢出，六個導覽目標皆至少44px。實際瀏覽器第一次載入仍遇既有舊快取，第二次正常重新載入才顯示524；不宣稱第一次重載或PWA完整升級已通過。
- 正式健康檢查200、探索／聊天程式資源200，未登入的聊天與願望私有API回應401。升級後45項migration已套用、0待套用／失敗／checksum差異；users10、wishlists5、items30、listings8與升級前相同，legacy識別碼檢查皆0異常。
- 證據與原始桌面／手機截圖位於既有outputs，索引 `wishlist-web-release61-artifact-index-20261002.json`，總紀錄 `wishlist-web-release61-evidence-20261002.json`。完整對齊目標仍active：首頁／設定正式視覺、完整操作／權限、真provider／跨端、訊息／面交、PWA／效能及矩陣未完項持續驗收。

以下各批的「未部署／draft」是該批當時的歷史狀態；累積程式已包含於524，正式發布狀態以上述紀錄為準，原本未完成的功能驗收不因此自動通過。

## 2026-10-02 第六十二批：正式尊榮會員導覽與來源問題初始化修正

- v524正式首頁與設定在736×952真實尊榮會員狀態下，完整會員徽章擠出登出／協助第二行；header101px，首頁全高1280、設定1228。當時本機第59批使用非尊榮fixture，不能代替這個正式狀態。依同一35／25／20／15／5設計權重，這輪正式人工比較首頁89、設定89，導覽各扣1，不沿用舊90分作正式通過。
- 會員在640–1023px改用既有皇冠縮略徽章，完整標籤從1024px顯示；中等寬度六導覽間距／內距更紧凑，保留44px目標、原中英文名稱、全部路徑、會員資訊、登出／協助及唯一設定入口。手機仍保留完整第二行導覽；不改backend、APP、權限、付款或資料。
- 排版復用完整Web測試／build及required CI；部署與更新後正式736／390及英文狀態、兩頁90門檻需另回讀，不能以CSS class或未發布截圖宣稱完成。全功能矩陣未完項持續active。
- 第一個精確head96f9625的CI37008828142，Server／Native成功、Web1707成功與1個既有AuthContext測試失敗：signed-out先完成，而MemoryRouter的返回路徑稍後才提交。測試改為在同一有界waitFor內同時核對signed-out及原精確chat room返回路徑，原pending保留／session清除斷言不變，沒有skip、重試或放寬timeout；runtime AuthContext未改。另納入最新main3ca6ba的App Review欄位檢查，僅腳本／測試變動。
- 合併後完整Web另抓到來源清單首次載入的scope被動初始化可能在新輸入後清空問題；失敗DOM為空textarea／disabled保存，focused16單獨通過不能代替修正。scope重設改在layout effect完成，確保新來源可操作前清除舊scope；原公開／私有隔離、原文payload及未知結果只GET恢復不變。既有英文保存／同意502／GET恢復回歸增加立即原文與保存可用斷言，沒有延長timeout、人工delay或重試。所有失敗log保留，新完整gate另回讀。

## 最新目標修正：僅網頁、核准示意圖相似度至少90%（2026-10-01）

- 本次最新指示再次確認採90%門檻：首頁與設定分別審查，不再沿用99%；只調整網頁視覺驗收標準，既有完整功能目標保持active。
- **現行目標摘要（Hank 最新指示）：網頁首頁 ≥90/100、設定頁 ≥90/100；以核准 AI 示意圖及實際網站截圖逐頁人工審查，不以兩頁平均分替代。沿用原網頁風格、僅一個設定入口；APP 不改。功能對齊仍為100%，視覺目標值不代表已驗收或已上線。**
- 執行與交付目標統一為：**網頁首頁與設定頁各自通過核准 AI 示意圖至少90/100的人工視覺審查，完整可適用功能對齊100%，部署後以正式網站實際截圖與操作再驗收。** 舊99%不再作為本次網頁交付門檻；本機通過不能代替正式網站驗收。
- Hank 已核准「首頁｜沿用原網站風格／設定｜沿用原網站風格」AI示意圖，並指出頂部重複設定齒輪；實作基準須移除無標籤的多餘齒輪，只保留一個「設定」入口。2026-10-01要求取代本次網頁視覺的舊99%門檻，以至少90%為目標；APP既定設計、原生程式與商店素材不在本次風格改造範圍。
- 基準圖：`/Users/hank/.codex/generated_images/01a0e2b1-99bb-7ae3-a9fe-51cb8aa65488/exec-5d99a706-56c1-4263-a9f4-5e605920305b.png`。這是兩頁並排的概念板，不是正式站截圖，也不是可宣稱的像素級規格。
- 保留原站白／淺灰背景、深灰主按鈕、無襯線字體、細框白卡片、適度圓角、淡粉節日／淡藍好友生日提示。首頁採願望最匹配／多件展開優先，再保留節日生日、快捷選用、搜尋與地圖；設定採單欄語言、我的功能、大頭照暱稱、通知、安全收合、隱私、權益與進階功能。
- 視覺審查採可追溯的人工加權評分，非自動像素相似度或AI正確率：版面與資訊順序35分、原站配色與字體25分、卡片／按鈕／圖示20分、間距與比例15分、導航一致性5分。首頁、設定頁各自至少90/100，附實際瀏覽器截圖、各項得分、差異與理由；未審查不得宣稱已達90%。
- 在相同桌面畫布下分別比較概念板的左右頁區域；排除概念板標題、示例商品／價格／餘額、照片內容、當前日期、帳號個資與狀態文字。不得把範例餘額10次、已儲存或付款狀態硬寫成真實資料。功能與無障礙所需的提示、錯誤／恢復區塊保留並列明差異。
- 手機以390×844網頁獨立驗收：單欄重排、導航與標籤可辨認、無橫向溢出、鍵盤／觸控可操作，不拿不存在的手機基準圖硬算90%。不加入原生APP底部介面。
- 視覺達90%不替代完整功能、錯誤／恢復、權限、CI與正式站回讀門檻；所有未完成項目繼續保留。不得以一張示意圖核准或本機截圖宣稱網站已部署或全功能對齊。

基準：`mobile/App.tsx`、`mobile/src/*Screen.tsx`、批次刊登與行銷模組、相同 server 路由。2026-09-30 正式 `/settings` 瀏覽器回讀已確認生日重複、缺少所有裝置撤銷、永久行銷額度與 APP 商品入口。進度欄「本機」不是「正式完成」。

## 2026-10-02 第六十一批：改版帳號／資料說明的網頁替代（仍未部署）

- 補齊 `ProductNoticeScreen` 的 Weesh → Wishlist.ai、獨立帳號系統與舊資料不自動匯入說明。登入／註冊共用繁中／English、可鍵盤重新展開的說明；既有 Wishlist.ai 帳號與願望不需重建。確認不建立帳號、不匯入資料、不接受條款。Web 保留原登入／註冊操作，以可收合說明替代 native 安裝啟動 gate，未新增全站阻擋或改動 APP。
- 只有明確確認才保存版本／revision／credential-free service 三個 metadata 欄位，獨立 notice key 不含帳號／token／私密 journal。服務、版本或多餘欄位不相符時重顯示；HTTP 只允許明確 DEV loopback，含 credentials／query／hash 或非標準 API path 在保存前拒絕。寫入後必須讀回同一份 metadata 才收合；儲存失敗或讀回不符顯示未確認提示及「這次繼續，不記住」。寫入已成功但讀回失敗時，下一次依實際儲存紀錄核對，不虛稱紀錄一定不存在。
- 新 Web 4 個案例涵蓋跨登入／註冊記住、原輸入／auth record 保留、零提交、寫入失敗、visit-only、讀回失敗及服務隔離；focused 13 全過。初次兩個 fault case 對 `Storage.prototype` 注入，而本測試環境使用 own-object storage，故沒有觸發；改為對實際 storage 注入，不移除斷言。第一完整 gate 僅既有 BirthdayReminders 一案 5 秒逾時，單獨 7 案全過，第二完整 gate 退出0：Server56檔913＋既有3skip、HTTP40檔631、Web106檔1708＋build、Native42檔852＋typecheck／Expo、45migration schema diff0／required cleanup0。既有 warnings 保留。
- 真 IAB 隔離訪客頁：英文確認／reload 收合、鍵盤 Enter 重開、切 Register 共用同 metadata；寫入失敗保留合成名稱與可用表單，visit-only 後下一頁重新展開、原 metadata null／guest auth 未改。繁中確認、讀回故障時實際 metadata 已寫但 UI 不冒稱成功、恢復讀回後收合及繁中 Register 共用確認均已核對。沒有輸入新 credentials、註冊提交、真 mail 或產品 API 請求；API trace 是0筆，不把此證據當註冊成功。測試入口最初誤把 `/api` 同時加在 VITE base 與 config suffix，造成 scope warning；僅修隔離入口後重驗，產品 config 未改。
- 390×844 的英文初展開、失敗及 visit-only，繁中初展開／讀回故障，document width375無橫向溢出；展開的 summary／確認／visit-only controls44px。桌面736×952的繁中 document721×1368。7組原 JPEG／DOM／geometry、1張早期 sticky-header 歷史圖、storage proofs／request state及sha256 index在 `wishlist-web-notice61-evidence-20261002.json`；最終 capture 真點標題回 scrollY0。早期 geometry 的 identifier selector 錯誤且 value API 有 redaction，不能把 false 當輸入遺失；原合成 identifier 由確認後截圖核對、合成名稱由前後 DOM 核對。自有 IAB／viewport、API／Vite／PG 已清理，證據保留；舊 native Chrome 視窗未冒稱已關。
- 新增 [逐欄來源對照](web-app-field-audit.md)，整理 native 原欄位、Web 入口／替代、權限約束及尚待驗收；來源比對不代替全功能成功證據。首頁／設定未改，本機最新人工各90仍採第59批；正式端、cross-device／provider、credential／permanent UI及完整矩陣門檻保留，goal active／PR82 draft。精確本批 HEAD CI 另回讀。

## 2026-10-02 第六十批：來源詢問双語與正常保存／同意恢复（仍未部署）

- 保留main原來源線索功能，頁面固定labels、地圖說明、count、詢問／未知／錯誤與delivery描述繁中／English；原來源title／summary／公共地址／public facts／問題與receipt state bytes不翻寫，stock／rights／transaction待確認及未送賣家仍明示。原inquiry GET-only、scope／minimal marker、同意問題hash重新核對及withdrawn target規則保留；未新增來源資料模型、native商品達成率或outbound sender。
- 地圖點由小SVG g改原生44×44 HTML button，依原mapPoint百分比定位、同座標只一組count，native Enter／Space可操作；select／links／READ／ASK／CONSENT／CANCEL至少44px、textarea96px。原OSM來源／原source link保留。手機真Space把withdrawn id明確改成public原id；不是自動fallback。English390×844 doc375×1868、Chinese375×1728，無橫向溢出；真測map44×44、select44、read/save/consent/cancel44及textarea96，未宣稱其他全站controls。
- 新Web1涵蓋英文保存原中文question／同意commit502→GET-only恢復同WAITING_ROUTE、exact原ASK text／CONSENT hash／single allocation與minimal marker不含私密text；focused16全過。最初原15個固定中文測試未設locale導致13失敗，補明確zh-TW baseline並保留原斷言，English case自行選語系；沒有移除或放寬。完整隔離gate两次退出0，最後包含英文count文字校正：Server56檔913＋既有3skip、HTTP40檔631、Web105檔1704＋build、Native42檔852＋typecheck／Expo、45migration schema diff0／required cleanup0。APP／server／migration未改，原warnings保留。
- 全新loopback5241／API5242及UTF8合成DB，compiled真routes，2owners／3leads／原withdrawn1room。A空READ不配置，明確ASK配置一次並真寫中文問題後QA502；reload明確GET恢復同1902b565-16e3-410e-946f-1042e5ec6f51、原question bytes不变。再明確CONSENT真commit後QA502；reload GET同WAITING_ROUTE／原問題，未重送且不能新增ASK／CONSENT。B讀原withdrawn／public都null、不見A問題或建room；A繁中原withdrawn仍保留原問題且newASK／CONSENT disabled，再回English讀同WAITING_ROUTE。35product requests＝32GET200＋1配置POST200＋原ASK502＋原CONSENT502；真DB仍2users／3leads／2rooms，其中原seed room未改、新room只有1ASK＋1CONSENT、inventory0、sellerRoutes0／deliveryReceipts0／external mutations0，無真credentials／mail或賣家訊息。沒有把WAITING_ROUTE稱已人工送達。
- 原JPEG／DOM／手機geometry／state与DB proof及sha256 index保留於wishlist-web-source60-evidence-20261002.json；沒有後製。部分fullPage圖因locator自動捲動讓sticky header位在capture中間，原圖保留；最終Chinese mobile与English desktop實際點標題回scrollY0後另保存完整raw圖。Control+Home嘗試仍scrollY745，未誤稱成功；native map Space真正改選有URL／select核對。只關自有IAB／resetviewport，API／Vite／PG停；合成DB與證據保留，原Chrome两視窗／DevTools仍未清理。
- 第59批精確CI37002500186三項success、PR82 draft／head／body已回讀。Home／Settings未改，最新本機人工各90證據仍為第59批，正式端未驗收。功能矩陣其餘逐欄／權限／流程、來源原seller路由及人工delivery真證据、provider／跨端、PWA正式升級／mixed-version／安裝、credential／permanent browser及最終migration preflight／merge／Railway／live門檻仍保留；goal active、PR82 draft，本批精確新HEAD CI另回讀。

## 2026-10-02 第五十九批：首頁比例與手機操作尺寸重驗（仍未部署）

- 首頁地圖caption縮成中英文約略位置提示；完整原綠／橘來源、群聚、列表及底圖說明保留在既有願望交叉比對details。原無願望filter的browse入口也保留在details，空願望時仍在外顯示。真鍵盤Enter展開中英文、ArrowRight選原漫畫並維持原listing深連結；商品匹配／radio／分頁／搜尋／原資料不變。桌面完整ready首頁1356→1284px，縮短72px。
- Settings只在手機提升nickname／private inputs、語言buttons與avatar-toggle關聯label至44px；原checkbox本體20px、隱藏file不算可見尺寸，desktop compact32px保留。地圖來源links44px後實際手機160px出現與zoom重疊42px，原counterexample截圖／geometry保留；preview手機改224px、desktop仍160px，最終來源與zoom22px間距，完整Explore480px未改。縮小按鈕實際click後的原畫面亦保存，不把DOM截圖當地圖內部zoom值證據。
- 同核准concept逐頁人工加權審查：Home90＝31/35版面＋24/25配色字體＋18/20卡片按鈕＋12/15間距＋5/5導航；Settings90＝33＋24＋18＋10＋5。原ready完整截圖同736×952 viewport、document721×1284／721×1184；保留原功能造成高度與concept差異，不宣稱像素／獨立review。手機390×844的Home375×2550／Settings375×1824，無橫向溢出，沒有不存在的手機concept分數。兩張最早map-loading attempt與原160pxoverlap圖排除評分、原bytes保留。
- 重用第57批原6users／3follows／3wishes／4listings合成DB，未reseed；compiled真handlers／loopback API與Vite，70 product GET全部200、product writes0／external mutations0，原資料件數不變。英文完整map notice／browse、空owner第一願望提示與browse實際核對，沒有真credential或provider品質聲明。26 raw JPEG／DOM／geometry／state artifacts及sha256 index保留於wishlist-web-visual59-evidence-20261002.json；檔名.jpg與實際JPEG一致，無加工。原native Chrome兩視窗與DevTools仍未清理；本批自有IAB tab關、viewport reset，API／Vite／PG停，DB與證據保留。
- 既有focused67／6檔及調整後map8全部通過。第一完整gate抓到兩個仍要求所有preview h-40的舊尺寸斷言；改為手機h-56／sm:h-40並保留原map生命週期／資源及full480px斷言，未移除測試。第二完整gate退出0：Server56檔913＋既有3skip、HTTP40檔631、Web105檔1703＋build、Native42檔852＋typecheck／Expo、45migration schema difference0與required cleanup0。原依賴／bundle warnings保留；件數不代表功能覆蓋率。沒有APP／server／migration修改，原129他人workspace改動完整保留。
- 本機視覺兩頁各90不代表full goal完成；功能矩陣其餘逐欄／權限／流程、來源正常ASK／CONSENT與English／觸控、provider／跨端、PWA安裝／正式升級／mixed-version、credential／permanent browser及最終migration preflight／merge／Railway／live仍待，PR82維持draft／goal active。精確新HEAD CI另回讀。

## 2026-10-02 第五十八批：最新來源詢問整合與原目標恢復（仍未部署）

- 獨立乾淨integration55工作區先fast-forward第五十六／五十七批，再整合main7db05da原GET inquiry／不配置新receipt／跨裝置問題變更後重新確認的修正；client版本2.0.445及changelog／lock原更新保留，沒有APP或新migration修改。整合原版完整gate1699Web／631HTTP通過；本批另修正原網址id不在public items時錯誤fallback第一筆、public refresh可能失去原selected的缺口。
- 明確id與初始目標維持同scope／journal key；來源撤回、expired或public read failed時顯示原選擇目前不在公開清單，沒有推測原公開資料、沒自動改選另一筆。保留owner實際GET原inquiry與撤回；新增問題／同意轉交在原來源不在清單時disabled。初選也記入網址供reload保留；仍公開的另一筆只能明確選擇。未知空收件GET不配置receipt、不清除原marker；另一筆／晚到回覆仍依scope隔離。
- 新Web4：撤回deep link另有public lead不誤選、empty public list的unknown原marker保留、初選refresh後原撤回、late private reply不污染明確新選擇；focused15全過。第一個新refresh反例抓到query更新前仍可瞬間fallback，修正同步保留初始目標後通過，未放寬斷言。最後完整隔離gate退出0：Server56檔913＋既有3skip、HTTP40檔631、Web105檔1703＋build、Native42檔852＋typecheck／Expo、45migrations／schema difference0與required cleanup0；主JS351.00KB、PWA95entries6089.56KiB，原warnings保留。
- 內建瀏覽器／新5239與API5240／獨立UTF8 DB／compiled real handlers：2合成owner、1public與2withdrawn leads、A原問題1receipt。撤回deep link保持原id，A GET原問題、ASK／CONSENT disabled；B GET同lead為null，不見A問題或配置receipt；A unknown empty marker讀兩次含reload仍未知、無POST。最後明確CANCEL原room真commit後QA502，reload明確GET原room回CANCELLED且原問題仍在、不重送。20product requests＝19GET200＋1原CANCEL POST502；真DB仍2users／3leads／1room、2events原ASK＋77b8639d-9e7e-4e15-a954-b7cda728ff60 CANCEL、inventory0／orders0／external mutations0。Source inquiry元件仍只存最小request marker，不冒稱原body encrypted歷史或immutable history。
- 6原browser完整截圖／DOM與state-final保留；檔名為.png但capture原bytes實為JPEG，metadata明示，未轉檔或加工。trace為mounted router相對path，沒token／headers。QA Vite初config直接import套件版本不合，改沿原base config後啟動，失敗log保留；未放寬Vite限制或重建seed。自有IAB tab關／viewport reset，自有API／Vite／PG停，DB／原素材保留；原Chrome兩無痕視窗與DevTools仍未清理，未宣稱全GUI關閉。
- 同輪第五十七批後續IAB：桌面736×952／DPR1、手機390×844原full PNG及DOM geometry；首頁1356px、設定1184px（與較早native raw不同時點），手機document width375≤390，生日128px region的240px完整內容PageDown由0→112。Header/footer及4生日links符合44px，Settings手機部分inputs／語言buttons40px、map attribution14px保留待處理；geometry可能含closed-details children，不當成全visible-target審計。人工加權Home88＝30/35＋24/25＋18/20＋11/15＋5/5，Settings90＝33/35＋24/25＋18/20＋10/15＋5/5；原圖／產品與人名／日期／餘額排除，homepage map附加操作與頁長差異仍扣分。這是本agent設計審查，非獨立或像素相似度；仍無兩頁90/90，未部署。57精確CI36999460113三項success及body/head已回讀。
- 全native欄位／permissions／功能、source-lead English／觸控與正常ASK／CONSENT真UI、完整來源與人工送達證據、provider跨端、PWA／效能、credential及permanent browser、Home≥90与Settings持續回歸、migration／merge／既有Railway／live仍待；PR82 draft／goal active、精確本批HEAD CI另回讀。

## 2026-10-02 第五十七批：首頁生日區與保留完整入口的頁尾（仍未部署）

- 重新用核准概念板與Chrome同736×952 CSS畫布檢查；原完整首頁1552px、設定1228px，舊90/90不能代表現版。生日資料僅在ready且非空時進入有名稱、可聚焦的128px捲動區，loading／failed／empty不裁切；全部朋友原name／nickname／日期及個人頁／願望兩入口保留。卡片grid為長名稱留空間，兩個44px圖示按鈕改直排，原生日不再因橫排按鈕擠出孤立「日」。不刪朋友、隱藏名稱或改查詢、owner／UTC契約。
- 頁尾保留6原policy／support／deletion／partner／changelog links及feedback按鈕，各自原44px最小target；一般畫布導覽一列、copyright與版本下一列，xl三欄同列。單一有標籤設定入口與原navbar保留；不改shared元件預設、APP／server／schema。
- 新增1項Web實測20位原名與40個正確目的地、region可focus且只GET一次；focused15／3檔通過。第一輪完整gate新test誤用標題大寫，修成原實際label；第二輪有5個既有刊登等待assert失败，原檔未改，focused78／2檔全過；停止自有browser listeners後第三輪完整gate退出0，沒有延长timeout或刪斷言：Server56檔913＋既有3skip、HTTP40檔630、Web105檔1696＋build、Native42檔852＋typecheck／Expo、45migrations／schema difference0及required cleanup0。主JS351.00KB、PWA95entries6088.29KiB，原map／worker warnings保留；全部attempt logs保留，系統load高不能單獨證明失敗原因。
- 新獨立UTF8 DB與真compiled handlers、6合成users／3follows／3wishes／4listings；native Chrome自有無痕在736×952／DPR2保存原PNG及完整AX，不加工照片或截圖。中間版首頁完整高度1356px，較原1552px少196px；該圖仍是生日按鈕橫排的中間版本，不當作最終日期或90分證明。最終直排生日只有原native window screenshot與AX，核對日期完整；最終純viewport／完整Settings／390×844／實際鍵盤捲動尚未完成，DOM focus測試不當成真browser捲動或geometry證據。地图最後有載入失敗替代提示，沒有正式provider品質聲明。
- 重啟後listener的39產品GET皆200，product writes0／external mutations0；最終fixture仍6／3／3／4。初listener在使用者中斷後消失，該trace未保存，故39次不宣稱涵蓋重啟前。照片為repo公開插圖fixtures、非真商品provider，real credentials false。原圖、完整AX、state-final與visual57 evidence保存；最終兩個自有incognito仍在，DevTools／736×952尚未還原，因native input回讀無效果，未冒稱GUI清理完成。自有API／Vite／PG已停，DB／原素材／他人改動保留。
- 本批完整gate通過，精確新HEAD CI另回讀；PR82 draft／goal active、未部署。main後續source-lead提交另待整合驗證；全feature／逐欄權限、真provider跨端、PWA／效能、credentials／permanent browser、最終Home／Settings各90與正式migration／merge／Railway／live仍待。

## 2026-10-02 第五十六批：保留朋友功能的原生日與照片恢復（仍未部署）

- APP社交入口是ChatInbox；本批核對並保留既有Web朋友搜尋／追蹤／公開個人頁，不虛構APP朋友欄位。SocialPage搜尋及追蹤卡片直接顯示已嚴格驗證的原YYYY-MM-DD，與FriendProfile一致；原2000-01-01在America/Los_Angeles曾被local Date顯示12/31/1999，新中英文回歸保留原曆日。server公開旗標／最小投影、電話／birthday／avatar null遮罩、原追蹤契約與加密journal不改，search Input局部min44px，不改shared Input預設。
- SocialAvatar只讀既有驗證URL，維持no-referrer；失敗明示繁中／English並有原URL明確重試，不拼query或改原個資、不從隱藏欄位／第三方fallback推測。每原URL／attempt獨立元件生命週期，舊圖片error不能污染新URL或retry；null沿原未提供／未公開fallback，未把讀取失败說成隱私設定。新增Web7，focused31共4檔；最初新增assert誤寫未公開，改核對原已隱藏3欄，沒有刪除或降斷言。
- 完整隔離pre-push退出0：Server56檔913＋既有3skip、HTTP40檔630、Web105檔1695＋build、Native42檔852＋typecheck／Expo、45migration schema diff0與required cleanup0。主JS350.92KB、PWA95entries6087.27KiB，原map／worker warnings保留；APP／server／migration未改。
- 新loopback5235／API5236／獨立UTF8 DB45migrations／三synthetic users與compiled handlers，native CUA Chrome自有無痕實測：英文搜尋原birthday與另一人mask、追蹤兩人、公開profile生日／nickname／phone及私密realName／address；照片404→原頁保留→輔助fixture恢復同URL→明確Retry成功，沒有profile／follow write。390×844下search503→原query重試成功；Following確認取消A→B真commit後QA502，reload GET原APPLIEDv1／Not following，B只見自己的1人且無A marker；返回A繁中GET同回執→明確CAS清理，中文原生日保留／following剩maskC，Cprofile birthday／phone／photo仍遮罩。公開profile503不稱不存在，explicit retry回原欄位與照片。
- 最終31產品請求：30GET含28×200、2注入503；只有1原POST502，原b4c2d29f-d4c6-42f7-8a4b-4c770cfa2421回執GET2×200。真DB follow3→2／receipt1 APPLIEDv1 wanted=false、原三人name／nickname／birthday／avatar／visibility逐欄不變；photo7讀含3×404及4×200的本機合成PNG，外部mutation0／real credentials false。Trace path是mounted router相對路徑，攔截503保留完整/api/users，沒有完整URL/query／headers/token紀錄。14原PNG／完整native AX／trace保存；native不是full-page、birthday時區反例由Intl／React證明，未覆寫browser timezone，照片不是真Flickr／持久服務。没有DOM geometry、新全controls44px實測或fresh90/90聲明。
- DevTools初AX width typeText變9999，當即由可見欄位貼上390並讀回；不把該attempt當手機驗收。最後尺寸1301×627 visibly還原、device mode off／DevTools關、只關自有window及輔助tab，bookmark bar未改；自有API／Vite／PG停、DB／原素材／他人工作保留。精確新HEAD CI另回讀，PR82 draft／goal active、未部署。全逐欄權限、source-lead新增Web語系／browser、真provider跨端、avatar持久／unknownFlickr、PWA install／production update／mixed-version CAS／效能、真credentials／permanent browser、freshHome／Settings各90及migration／merge／Railway／live仍待。

## 2026-10-02 第五十五批：願望介面雙語與原始價格精度（仍未部署）

- `/wishes` 的清單、表單、照片、AI狀態、pending／local-cleanup／未知更新及刪除警示提供繁中／English，157項typed display copy；固定已知errors翻譯，未知診斷採bounded fallback。原name／notes／photo bytes／request ID-body／placeholder及原API契約不翻譯，分享入口正名願望詳情，沒有新增APP不存在的editable tags。原valid HTTP/HTTPS商品link保留，帶帳密或不安全link不建立可點連結但editor原值仍保留；主要details／links／checkbox label44px、dialog close明確語系及busy gate，name排序依目前display locale。
- 原網站currency formatter保留原decimal string及trailing zeroes，250.7500不再變251；零與超過Number精度的字串原值保留。估算使用既有固定rates，繁中English明示2026-01-02日期，不冒稱即時；localCurrency參數確實使用目標rates，prototype keys／malformed partial price／nonfinite／conversion overflow拒收，unknown currency只顯示原價。APP／後台／schema未改。
- 新Web21，focused47／2檔及原26全部通過；完整隔離gate退出0：Server56檔913＋既有3skip、HTTP39檔622、Web103檔1679＋build、Native42檔852＋typecheck／Expo、44migration schema diff0／required cleanup0。主JS350.63KB、PWA94entries6077.62KiB與既有warnings保留。AST重複摘要翻譯在新build前修正，原中文assertions保留，beforeEach明確zh-TW，不降斷言。
- 新loopback5233／API5234／獨立UTF8 DB、真compiled GET與兩合成owner，native CUA Chrome獨立無痕：English private default、照片／手動表單與invalid1.234保留中文原輸入且無HTTP write；503不稱空清單→explicit GET恢复；原create8919639b-763f-4515-b61e-9d464b6aeb47加密保存後English reload／繁中／另一帳號返回共4GET404，無autoPOST且新建立disabled。B只有自己的私人清單，原notes標籤及budget0不變，FAILED不露raw403；原網站中英文250.7500 USD／approx8024TWD日期與native AI原价／budget500.5核對。全部29product GET：23×200、2注入503、4原receipt404；product writes0／external mutation0、2users／1follow／4lists／4items不變。首次503已在HTTP trace但未保存error screenshot，第二次有failure/recovery完整proof；沒有lost-create真commit或provider／clipboard聲明。
- 原PNG／完整native AX及wishlist-web-wish-language-price-evidence-20261002.json保存；DevTools visibly390×844後還原1301×627、device mode解除／DevTools關、只關自有incognito，bookmark bar未變。fixture無viewport metadata使nativeAX click有未完成attempt，以新screen coordinate／Space和可見session feedback核對；繼承clipboard QA文字未操作，本批未inject clipboard stub。沒有DOM geometry、新90/90或全controls44px實測声明。自有API／Vite／PG已停，DB／證據／他人worktree保留。
- 全feature／social／逐欄權限、avatar／unknownFlickr／真provider-mail跨端、PWA install／production upgrade／mixed-version CAS／效能、真credential／permanent browser、diagnostics IDs及fresh Home／Settings各90、正式preflight／merge／Railway／live仍待。PR82 draft、goal active、未部署；精確新HEAD CI另回讀。
- 同日整合最新main66191f9705f87ac6074f9fb13340dbe49e8dbd1c：保留獨立/source-leads、私密詢問、兩個資料模型及additive migration；source-leads沿用lazy recovery shell，深連結query與返回首頁新增真App regression。上游refresh的Response明確型別修正TypeScript循環推導建置錯誤，runtime與詢問契約不改；APP原始碼未改。整合後完整隔離gate退出0：Server913＋既有3skip／HTTP630共40檔／Web1688共104檔＋build／Native852＋typecheck及Expo，45migrations schema diff0、required cleanup0；主JS350.74KB、PWA95entries6086.09KiB。最初symlink依賴超出Vite允許範圍，改獨立依賴副本；原失敗logs保留，未放寬設定或刪除assertions。前述Chrome願望證據在main整合前，願望與價格component未再改；不宣稱新來源詢問已真browser/provider驗收。精確整合HEAD與CI另回讀，正式feature flags及環境未變。

## 2026-10-02 第五十四批：舊願望清單雙語與分享恢復（仍未部署）

- WishlistDashboard／WishlistDetail的搜尋排序、建立欄位、private captions、未知原操作、照片／AI狀態與guest註冊CTA繁中／English，安全locale read fallback；原路由、payload、容量、visibility／送禮／clone及encrypted原操作協定保留。長清單標題完整換行；主要buttons／搜尋排序／inputs含portal及原操作links設44px，checkbox label44px，guest註冊只保留單一Link，未改全站Button預設。
- 分享同步ref gate涵蓋兩個按鈕，支援navigator.share但沒有canShare；canShare失敗仍有clipboard替代，native AbortError取消不另copy。每個await以departure／account lifetime檢查，成功才顯示copied／analytics，tracked timer卸載清理；失敗只顯示ephemeral readonly可選網址與目前权限提示，隱藏／換帳號不保存URL，不露raw diagnostics。URL只有origin與原wishlist ID，不含query／JWT；已開始的clipboard write不能撤回，沒有atomic OS clipboard聲明。
- 新Web11，focused114／5檔；四次完整隔離gate最後退出0：Server56檔913＋既有3skip、HTTP39檔622、Web102檔1658＋build、Native42檔852＋typecheck／Expo、44migration schema diff0／required cleanup0；主JS350.63KB、PWA94entries6062.22KiB及既有warnings保留。Partial localization mock保留原t-key assertions，locale storage fault注入修為實際localStorage instance；沒有弱化原公開件數／導航／帳號assertions。最後恢復link44px後再跑全gate；一次PG重開漏explicit55441，preflight失敗log保留，改回自有55441後final gate成功，不碰他人5432。
- 新loopback5231／API5232／獨立UTF8 DB44migrations、兩合成owner；browser provider unavailable改原生CUA Chrome獨立無痕視窗。英文搜尋absent→clear、選Name與建立private default，actual encrypted未知privacy marker重開保持、explicit current GET提示不是receipt；share QA stub失敗readonlyURL、成功copied；B訪客兩公開清單、book件數1與無hidden願望／ownercontrols，詳情原250.75／500.5及備註讀回；繁中清單／詳情、0價格預算、failed AI無raw403、手機長標題已核對。final36個產品GET全200，product writes0／external mutation0，2users／1follow／4lists／4items不變；clipboard是明示QA stub，沒有OS copy／native sheet或真provider聲明。一次非秘密loopback網址輸入少字導向Google搜尋後修正，external0不代表無外部read。
- 原PNG與完整native AX、state journal及wishlist-web-legacy-localization-evidence-20261002.json保存。DevTools visibly390×844，最後還原1301×627、device mode解除／DevTools關，bookmark bar還原、只關自有incognito；圖含browser UI及部分DevTools，非full-page。Console paste受self-XSS阻擋，未繞過，沒有DOM geometry／實測全controls44px或新90/90聲明。最後新增44px恢復link不在本批browser fixture可見狀態，但已包含final complete gate。
- 標籤逐欄audit：Prisma Item無tags，APP WishScreen／native wishManagement無可編輯分類；EClaw preview最多5tags，queue append「標籤：…」至notes，既有備註與選用preview保留，不虛構持久editable tags。舊price card仍沿既有匯率工具250.75→251，detail modal原值不變；完整幣別／欄位與來源估值audit續作。
- 自有API／Vite／PG已停，fixtures／證據及他人worktree保留。全feature／social／逐欄權限、avatar／unknownFlickr／真provider-mail跨端、PWA install／production upgrade／mixed-version CAS／效能、真credential／permanent browser、diagnostics IDs及fresh Home／Settings各90、正式preflight／merge／Railway／live仍待。PR82 draft、goal active、未部署；精確新HEAD CI另回讀。

## 2026-10-02 第五十三批：首頁語系、好友生日恢復與正式路由順序修正（仍未部署）

- Home／WishHome／embedded map介面繁中／English及安全locale fallback；原願望匹配、分頁、擴展、跳轉、搜尋與資料規則保留。原四張guest feature cards、淡粉節日／淡藍生日、公開API介紹保留，移除CTA nested Button。主要links／map zoom與來源toggle44px；map preview128→160px避免重疊，來源圖示no-repeat置中，完整地圖480px未改，地名仍原繁中。
- 生日獨立loading／failed／retry／confirmed empty，不把HTTP／schema失敗稱無生日；嚴格六欄、UTC日期／next occurrence、安全avatar／長名稱／anonymous、不顯示phone fallback，30s private GET／abort／account-token remount與late-response fence，不持久保存。後台僅select必要公開欄，依目前follow與birthday/avatar flags，UTC today到inclusive30日／跨年與Feb29→Mar1非閏年、同日ID排序，bounded failure／query spoof400；原array與personal-key讀取保留。
- 正式index先mount socialRoutes再userRoutes：舊Social全域authenticateToken會攔住User已刪除後的原JWT專用回執／重試／abandon恢復。23項刪除HTTP改用真production順序先重現6fail／17pass，修為十個Social端點各自authenticateToken、仍在寫入rate limit前；global private no-store保留。原刪除original-session verifier及identity/version receipt binding不變；十個Social端點對deleted-user JWT皆401。修後刪除／social privacy／birthday focused39全通過，最後完整gate含修正，沒有弱化assertions或豁免。
- 新Web24／HTTP7；四次完整隔離gate最後退出0：Server56檔913＋既有3skip、HTTP39檔622、Web102檔1647＋build、Native42檔852＋typecheck／Expo、44migration schema diff0／required cleanup0。主JS350.63KB、PWA94entries6056.78KiB及既有warnings保留。APP／schema未改；最初focused config路徑／fixture assertion與FK清理問題原logs保留，修runner／fixture／cleanup後通過。
- 真Chrome新5227／API5228／獨立UTF8 PostgreSQL、兩owner與四friend：實際compiled birthday／matching，英文三group及Sony多件expand/collapse，birthday QA503→explicit retry僅增加一birthday GET，不重讀matches/profile；anonymous不露phone／hidden birthday與avatar不顯示，long name換行。profile及friend wishes原路由、B中文empty／返回A、中英文guest四cards與API CTA已核對。final browser全部97個GET（96×200＋1QA503）、product writes0／external mutation0，6users／3follows／3wishes／4listings不變；OpenFreeMap公共tile讀取可能發生，照片是repository feature-art QA fixtures，不冒稱真商品或provider。
- 完整AX／原JPEG／geometry／failure-retry-final journals與wishlist-web-home-birthday-evidence-20261002.json保存；手機390×844 doc375、desktop1024×900 doc1009無overflow，登入唯一Settings、nested0、測量controls≥44，third-party版權文字links排除touch measurement。初recovered手機full-page固定header在當時scroll位置中段，原圖保留；最終scroll0手機／桌面已檢視，來源圖示正常。一次capture evaluation timeout後實際讀回viewport/style並重新保存final desktop。這不是新版完整90/90視覺評分。
- Browser API在最終Social auth-scope修正前載入；valid-user birthday/matching handlers不變，正式刪除恢復以最後production-order HTTP／full gate證明，沒有browser permanent delete。Request logger於Express finish捕捉handled route suffix、QA503 fullpath，非原完整URLtrace。自有API／Vite／PG已停、tab關與viewport還原；fixtures／他人worktree保留。下一缺口包含英文friend legacy WishlistDashboard搜尋排序仍中文、全feature／social及逐欄權限、avatar／unknownFlickr／真provider跨端、PWA安裝與正式升級／mixed-version CAS／效能、真credential／permanent browser、diagnostics IDs及fresh Home／Settings各90、正式preflight／merge／Railway／live。PR82 draft、goal active、未部署；精確新HEAD CI另回讀。

## 2026-10-02 第五十二批：PWA 舊私人圖片快取清理與真 worker 離線驗證（仍未部署）

- 證據限制：最初數份AX保存是「無變動」差異而非完整snapshot；原before／after／private-offline／docs JPEG已逐張實際檢視，工具完整狀態亦已讀取。image probe部分JSON保存完整snapshot，不把先前差異字段當作自動布林證明；所有原紀錄保留。
- 舊 catch-all `images` runtime cache 與 Workbox precache 是不同儲存區；現有 Workbox cleanup 不會淘汰該 runtime cache。新的 classic script 由真 generateSW 的 importScripts 載入，在 activate／navigate waitUntil 清除整份 `images`，不遷移任何舊 response，包括看似公開 logo 的內容。新 `wishlist-public-artwork-v1` 僅容許同源、無query、八個精確公開 artwork 路徑；清理注入的私人／外站／未知feature項目，保留真正 precache／無關cache，不碰session／IDB／加密journal／request body，不重送或reload。
- 清理工作共用pending promise；拒絕或未刪除會傳遞 bounded failure，後續導航重試。已在途舊worker仍可能晚到重建舊cache，下一navigation再清除；新worker不讀舊cache。controllerchange通知可能早於activate waitUntil完成，瀏覽器最初讀仍見舊cache，清理完成後明確再讀已不存在。這不是atomic erase／mixed-version journal CAS保證；已解碼同URL圖片可留在既有頁面，不聲稱撤回已顯示圖片或清理HTTP cache／所有舊版本資料。
- 新7項Web回歸執行實際public script：整份舊cache淘汰、精確allowlist、不建立空cache／不replay、晚到導航、並行共用、拒絕／false刪除與retry。完整隔離pre-push退出0：Server56檔913＋既有3skip、HTTP38檔615、Web100檔1623＋build、Native42檔852＋typecheck／Expo、44migration schema diff0／required cleanup0；主JS350.59KB、PWA93entries6049.36KiB，既有map/worker warnings保留，APP／後台／migration未改。最初node environment測試因全域window setup失敗，修正常jsdom fixture及Node URL，不弱化斷言。
- Chrome新loopback5226，真dist/sw.js／Workbox／policy／公開assets，合成舊worker重現舊image規則；四legacyentries含私人JSON／image／外站／stale logo，另新cache注入uploads與無關cache。升級後整份legacy消失、注入項目消失，precache／無關cache保留；真privatePendingStore API-integration marker與deletion vault marker逐字不變，未送出textarea不變，無自動reload／POST。vault只使用合成儲存marker，不冒稱完整帳號刪除回執恢復；有效HTTPS synthetic scope僅用於實際加密儲存，不送往外站。
- CDP真正offline：私人JSON／image fetch均network unavailable，公開API docs連同lazy module完整呈現。image destination online時public logo／feature1各1024px、private合成PNG1px可讀，CacheStorage沒有私人圖。首次同頁同URL離線仍復用已解碼圖片，如實保留trace；QA private src加入新的非秘密probe UUID後，online可讀、offline新請求失敗，公開圖仍可讀。晚到images注入在次navigation移除，無關cache仍在。五張原JPEG＋browser-proof JSON保存並檢視代表升級圖；provider frame為明示inert QA stub，built API base未配置因此docs顯示不可用，不當成正式API／外部provider／全站離線寫入證據。QA server增補probe曾重開，未以重開後counter冒稱整段request trace。
- 自有server／PG已停、tab已關、offline override已還原；DB／fixtures／證據與他人worktree保留。精確新提交CI另核對。仍待PWA安裝／正式升級／mixed-version deletion CAS與效能、全feature/social/Home語系／逐欄權限、avatar／unknown Flickr／真provider跨端、真credential／permanent browser、diagnostics production IDs核對、fresh Home／Settings各90及正式preflight／merge／Railway／live。PR82 draft、goal active、未部署。

## 2026-10-02 第五十一批：AI 指令與金鑰復原、API 文件契約（仍未部署）

- 原POST/GET apikey與POST ai-prompt的個人金鑰／JWT能力、原prompt/apiKey/userName回覆及既有JSON指令保留。以User FOR NO KEY UPDATE同一gate序列化首次建立、明確輪替及密碼／撤銷操作；middleware後重新核對實際憑證與authVersion／owner存在。12並行首次請求只取得同一有效key；明確rotation才換key，也能修復舊格式錯誤key。新增GET ai-prompt只讀目前指令，無key時精確available:false，不建立、不冒充歷史回執。private no-store在auth前設定，錯誤只bounded code；配置先驗證credential-free /api base並保留loopback HTTP。
- Settings advanced展開才讀本機marker，不自動POST或copy。既有AES-GCM／owner/API隔離／immutable CAS只保存version、local UUID與時間，不存JWT／key／prompt。送前保存核對，strict完整prompt schema／固定role、API methods/paths/descriptions、key/header/base一致，取回後再核對原marker。sync gate、owner/token generation及每個await fence防晚到copy／清理較新操作；busy凍結語言reload。剪貼簿失敗保留提醒並只GET目前指令；明確手動顯示readonly文字且不冒稱已複製，切帳號／隱藏／離頁不持久保存秘密。已確認清理失敗只清理；未知清理需勾選理解不取消原request。已開始的clipboard write無法撤回，不宣稱atomic logout／clipboard。
- 原API showcase卡片風格與入口保留，繁中／English、安全locale fallback、原URL包含實際scheme、不補假https；copy失敗可選取原網址、sync busy及departure guards。CTA／返回Settings只有單一≥44px Link，無nested Button。API docs校正必填email、verify/resend、email reset token/newPassword及base+relative path避免double/api；逐端點JWT／personal-key與owner／visibility／mutual-follow約束，不假稱所有server API同權限。付款/UCP自動購買與配送未開通，保留送禮使用場景與原商家連結替代，不承諾付款或送達。
- 新actual HTTP/PostgreSQL12與Web36，focused72／4檔；final完整隔離pre-push退出0：Server56檔913＋既有3skip、HTTP38檔615、Web99檔1616＋build、Native42檔852＋typecheck／Expo、44migration schema diff0／required cleanup0。第二完整gate包含明確輪替修復malformed舊key，未降權限或弱化斷言；主JS350.54KB、PWA92entries6047.32KiB及既有map/worker warnings保留，APP／migration未改。
- Chrome新5223、獨立UTF8 DB44migrations、兩syntheticowners既有key、真compiled handlers：POST成功後QA502→reload同marker不POST→GET目前指令／clipboard stub failure→GET verified copy cleanup；A第二unknown跨B帳號與B中文manual recovery後返回仍同40235bf5-c508-431b-9856-f879fa4d8a50。B無A內容，明確手動GET顯示readonly structured prompt，僅保存布林驗證、不序列化或截图key，隨即Hide。final39API requests：36GET200、3POST（2QA502＋1×200），8次AI操作中5GET；keys unchanged／other writes0／external0。剪貼簿為明示QA stub，不碰OS clipboard／不保存prompt，非真OS複製證據。
- 手機390×844 doc375≤390，integration三controls各44px／Settings1；API copy44px、CTA48/50px；docs mobile/desktop1024×900 doc1009無overflow。保存13原JPEG、3geometry＋manual-proof、journal及wishlist-web-ai-integration-evidence-20261002.json，已實際檢視恢復與docs截圖。暫時Vite proxy誤攔api-showcase direct reload已只修harness，重驗成功；初supertest null型別失敗修JSON literal fixture。Browser compiled在最後malformed-key explicit-rotation例外前載入；browser未操作rotation，valid-key標準流程沒改，最終rotation只由第二full HTTP證明，不冒稱browser rotation完成。
- 自有API／Vite／PG停止、tab關閉及viewport還原；DB、fixtures與他人worktree保留。最新精確提交CI另回讀。仍須全feature/social/Home語系、逐欄權限、avatar/unknownFlickr/真provider跨端、PWA/private cache/效能、真credential/permanent browser、diagnostics production IDs核對、fresh Home/Settings各90及正式preflight/merge/Railway/live驗收；PR82 draft、goal active、未部署，本批不代替全功能完成。

## 2026-10-02 第五十批：保留交易與送禮紀錄的權限及獨立讀取（仍未部署）

- 原GET users/me/transaction-history與purchases、array路由及personal API-key capability保留；帳號交易只select原display欄位，原amount／currency／status／同時刻ID排序不改。送禮認領依目前purchasedById、repeatable-read snapshot投影；本人仍可看自己的私人／隱藏願望，他人目前private／hidden則僅id／updatedAt／unavailable提醒，不因過去認領取得持續權限。保留筆數但不洩漏notes／AI error／proxy／private parent／隱藏avatar。清單刪除或取消認領可能不再列出，不冒稱durable ledger／付款／送達。private no-store在auth前設定、故障bounded。
- Web兩區分別loading／failure／retry／confirmed empty，任何HTTP／network／schema失敗不再冒充空清單；未確認區不混用另一區結果。GET用no-store／redirect error／30s；user/token key remount＋abort／sequence擋late JSON、不保存history至瀏覽器。原金額精度、0／negative refund、unknown type/status保持，只有真正COMPLETED用success styling；LIMIT_FOLLOWING有正確追蹤人數標籤。繁中／英文＋安全locale fallback、mobile cards／desktop table、完整長名稱／無600px強制寬，unsafe links／photos無target。Settings原API／history Link保留，移除nested Button為唯一44px target，未改全站Button預設。
- 新HTTP11（真routes／PostgreSQL，105筆不截斷、私密／隱藏／本人／他人／personal key／revoked／query spoof／資料庫fail）與Web23；focused59／3檔。最新完整隔離pre-push退出0：Server56檔913＋3skip、HTTP37檔603、Web96檔1580＋build、Native42檔852＋typecheck／Expo、44migrations schema diff0／required cleanup0。JS350.51KB、PWA91entries6029.93KiB、既有warnings保留，APP／migration未改。
- Chrome新origin5220、獨立UTF8 DB44migrations、三syntheticowners／真compiled GET：原Settings→history，3transactions／4claims（2 unavailable），USD123.4567／negative1.125／TWD0保留、Failed非綠。手機390×844 doc375／full name；desktop1024×900 doc1009真3-row table。一次合成accountGET503時claims仍可閱覽；failure trace11→retry trace12仅增加account GET200，沒有重讀claims。第二空帳號中文正確empty、无舊內容、doc390；return Settings唯一入口44px／無nested、logout→guest login-return且沒有新private GET。最终20GET（19×200＋1synthetic503）／product write0／external0，fixture3transactions／4claims未改。
- 六原JPEG、四幾何JSON、full／failed／retried traces與wishlist-web-purchase-history-evidence-20261002.json保存，功能證據不重新宣稱Home／Settings90/90。client initial build的erasableSyntaxOnly拒絕parameter property已改explicit field；語系測試初用錯storage key/prototype，修fixture而非改產品或弱化斷言。自有API／Vite／PG結束、tab關閉及viewport还原；DB／fixtures／他人worktree保留。
- Browser在最後Object.hasOwn status guard之前保存，標準fixture狀態／layout及server handlers未改；__proto__／constructor以新增Web回歸驗證，不宣稱另有未知status browser證据。新回歸通過後重新跑完整gate退出0（最新1580）；原先1579及失敗fixture logs保留。
- 下一工作保留AI指令的copy/departure／get-or-create key競態、API介紹／文件的語系／URL／契約與paused UCP文案，全feature／social／Home語系、完整逐欄權限、avatar／unknownFlickr／真provider跨端、PWA／效能、credential／permanent browser、管理diagnostic正式config核對、fresh Home／Settings各90及正式preflight／merge／Railway／live回讀。PR82 draft、goal active、未部署；精確HEAD CI另核對。

## 2026-10-02 第四十九批：管理郵件診斷權限與未知結果（仍未部署）

- 修正既有POST feedback/test只有註解宣稱Auth Required、實際沒有驗證的缺口；要求live JWT與當前authVersion，不接受personal API key、frontend電話、JWT role或request欄位作管理權限。後台EMAIL_DIAGNOSTICS_ADMIN_USER_IDS嚴格解析與EMAIL_DIAGNOSTICS_ENABLED=true雙條件，缺失／錯誤設定預設不可寄。正式enable前須核對當前帳號ID；本批不改正式env、不授權真實寄信。
- 新private no-store GET僅回精確userId/canSend，表示角色及設定、不表示歷史／quota／in-flight結果。POST保留固定原收件人、主旨、內容與empty-body舊wire，拒絕query及任意body fields，按使用者每分鐘1次；8秒timeout後provider未settle仍保留process-local in-flight guard，晚到reject不洩漏或二次回覆。dispatch前再次核對revocation及設定；已dispatch無法被logout撤回，無跨replica或durable歷史保證。strict provider acceptance回ACCEPTED，不回ID／log／stack／recipient、不冒稱inbox delivery。
- Settings移除phone-only顯示與raw alert，進階展開才讀真正capability；雙語44px controls。POST前以既有AES-GCM/API-owner scope保存僅version／原local UUID／startedAt的immutable marker，不保存JWT。Unknown重開無POST、不把讀權限當歷史查核；手動清理需明確勾選已核對郵件服務且了解不取消原request。verified ACK cleanup失敗只清理；sync gate、離頁／帳號generation、fresh capability及exact CAS拒絕覆蓋較新分頁；busy擋語言reload。
- 新15項actual HTTP/PostgreSQL及31項Web，focused94／4檔；完整隔離pre-push退出0：Server56檔913＋3skip、HTTP36檔592、Web94檔1557＋build、Native42檔852＋typecheck／Expo、44migration schema diff0／required cleanup0。主JS350.51KB、PWA91entries6025.36KiB，既有map/worker warnings保留；APP與migration未改。
- Chrome390×844／document375、Settings入口1，獨立UTF8 DB44migrations、三位合成owner、真compiled handlers：owner1 stub接受後QA502，重開與明確reread仍同一ad4e53ea-0c1b-4b1b-998a-9692868abbd3、原POST1；owner2中文POST200後明確ACCEPTED且清理；普通owner無diagnostic／send／他人marker；回owner1仍原unknown且清理未勾選。完整32requests：30GET200，其中capGET5，POST僅502／200兩次；stub mail2、external mail0、其他product writes0。五原JPEG／三幾何JSON與wishlist-web-email-diagnostics-evidence-20261002.json保存；功能證據不代替新版90/90。
- 自有API／Vite停止、PG正常stop、tab關閉及viewport还原，DB／fixtures／原未知marker／他人worktree保留。觀察到既有advanced API／purchase link內nested Button，保留記錄供下一流程審核；仍須其完整回歸、其餘全功能逐欄／權限／語系、avatar與unknownFlickr、真provider／跨端、PWA／效能、credential／permanent browser、fresh Home／Settings各90及正式preflight／merge／Railway／live readback。PR82 draft、goal active、未部署，精確HEAD CI另回讀。

## 2026-10-02 第四十八批：合作介紹語系與共用觸控區（仍未部署）

- 原合作介紹頁的標題、合作原則、五個必要資料欄及既有兩個inquiry入口支援繁中／英文，locale storage故障仍可英文使用。必需資料在render才翻譯，重開切語言不保留module-level舊文字。原授權、競標不是固定價、售出／撤回、3–10件樣本及不索取密碼等意義與CSS保留。FAQ補合作收件與非授權說明。
- 只在Layout擴大brand／登入／登出／協助及六個footer目的地與回饋的觸控區至至少44px，未改全站Button預設。Chrome新origin5216、真compiled GET handlers與獨立UTF8 DB44migrations、合成owner、write/mail disabled：英文landing→原inquiry、繁中原內容、header/footer feedback開關及logout均實測。手機390×844／document375；所有shell控制≥44×44，nav48高；Settings mobile與736×952 desktop皆唯一有標籤Settings入口，資料讀取成功。
- 保存7原JPEG、4份幾何JSON及wishlist-web-partner-landing-evidence-20261002.json。desktop Settings頁長1228／footer121，mobile1840／footer177；放大footer確實增加頁長。空願望Home只有正常GET／無main alert，沒有配對卡與地圖，不能替代示意圖相似度驗收；本批不沿用歷史90/90作新版通過聲明，完整Home／Settings各90仍须重新計分及正式回讀。
- 新3項Web回歸／focused7；完整隔離pre-push退出0：Server56檔913＋3skip、HTTP35檔577、Web92檔1526＋build、Native42檔852＋typecheck／Expo、44migration schema diff0／required cleanup0。重用已清空的專用full47測試DB，未動browser47或其他fixture。主JS350.48KB／PWA91entries6018.16KiB；既有地圖／worker警告保留。沒有APP／後台契約／migration修改。
- 初始QA漏掛socialRoutes使生日handler未匹配，只修本機harness並fresh session重啟；最終journal自restart後開始，8次GET皆200／product POST0，不宣稱涵蓋重啟前。Settings等待selector初選不存在的「個人設定」，改核對可見「個人資料」，不是product defect。自有API／Vite／PG及tabs正常結束、viewport還原；DB與他人worktree保留。
- 下表更新已完成的107件完整分頁、舊願望／照片／clone與partner landing；APP WishScreen／wishManagement實際無分類欄，不再虛構APP分類缺口，legacy標籤仍另保留。仍須逐欄／權限審核並完成全feature／social／advanced入口、feedback test-mail權限、avatar／unknownFlickr／真provider與跨端、PWA／private cache／效能、credential及permanent browser、正式migration／merge／Railway與新版視覺驗收。PR82 draft／goal active／未部署；新提交精確CI另回讀。

## 2026-10-02 第四十七批：合作表單持久恢復與語系（仍未部署）

- 既有PartnerInquiryPage在POST前以public API-isolated AES-GCM保存原表單／UUID／canonical hash／language，與feedback及owner feature分開；不存token。Strict receipt核對原ID/hash／receipt UUID／status，不呈現raw errors/provider details。Unknown重開只GET，明確retry原body；storage失敗保留可複製文字／freeze、sync gate防duplicate、departure fencing不處理late ACK／不clear原證據，newer CAS後先reread，confirmed cleanup failure只清理。聯絡同意是原operation內的原提交意圖；success後新表單unchecked，不自動再次送出。
- 表單／receipt／recovery提供繁中English，保留原「不構成商品圖文或AI授權」文案／欄位及honeypot；補實際後台optional active count、0/null分明。文字與原journal language不隨display翻譯；44px inputs／48px send，網址／email／長度及consent在persistence前驗證。後台Error僅等效field宣告以便direct actual server parser cross-check，不改normalization或authority、無migration／APP改動。
- 新Web34（protocol22／page14含原2擴充）、focused64及final full0：Server56檔913＋3skip／HTTP35檔577／Web92檔1523＋build／Native42檔852＋typecheck-Expo，44migrations schema一致／required cleanup0。涵蓋actual server canonical/hash、原Unicode／0/null、多類別order、real public IndexedDB crypto/CAS隔離、ACK mismatches／invalid inputs、persist-before-POST、初read、unknown/retry、store faults、新journal／late response/unmount、cleanup-only、locale failure／StrictMode。初64 tests pass但server parameter-property與client erasable compiler不合；兩次dynamic import失敗logs保留，改等效field/direct import後tests＋types全通過；首次full提早停止，最後完整重跑通過。JS350.07KB／PWA91entries6013.17KiB，原map/worker warnings保留。
- 真Chrome390×844、新5214 origin／獨立UTF8 DB／compiled partner handler，明確synthetic contact及mail stub：原b82cda0c-fbfe-4ad5-9a47-19f13f9d83f6 real record commit後QA502，unknown原文字保留，reload只有GET原receipt b125fc66-3cb1-4ff0-b819-e642230f8022、FAILED通知如實、不稱inbox delivery；POST1／GET1／record1／receipt1／stub mail1／external0。中文原內容、BOOKS／CSV／active0及HTTPS normalization真DB一致；clear後繁中空表單／unchecked consent、無再GET/POST。4原JPEG／DOM／HTTP journal及wishlist-web-partner-form-evidence-20261002.json保存，英文receipt document390、中文form375。Guest header feedback40px／footer feedback16px仍是shared既有控制，未冒稱全站44px；landing語系及shared touch-target review另待。
- 自有API／Vite／PG停、tab關及viewport reset，DB／他人worktree保留。矩陣更新已驗證表單項；partner landing、全matrix／feature-social、shared touch targets、mixed-version PWA／provider-cross端／credential-permanent browser／正式migration-merge-Railway與Home-Settings各90正式回讀仍待，PR82 draft／goal active／未部署，新commit精確CI另回讀。

## 2026-10-02 第四十六批：合作意向原收件查核後台（仍未部署）

- 保留既有Web合作表單，APP沒有此表單；新增private no-store GET partner-inquiries/submissions/:clientSubmissionId，以原隨機ID＋header canonical hash查原receipt，僅回received／clientSubmissionId／requestHash／inquiryId／notificationStatus，不回organization／聯絡email／內容／provider ID或診斷。Missing／wrong hash-kind-record／deleted record均unconfirmed；malformed query／URL hash拒絕。POST201保留既有fields並加original ID／hash，optional false claimed hash在write前拒絕；global transactional winner／mail-only-winner、3次每小時POST limit、honeypot202、原admin listing／status authority保留。
- 新real HTTP／PostgreSQL15、focused15及full0：Server56檔913＋3skip／HTTP35檔577／Web91檔1489＋build／Native42檔852＋typecheck-Expo，44migrations schema一致／required cleanup0，未加migration、APP／Web source未改。驗證canonical trim-email-URL及0、不帶hashlegacy201、commit502→只GET恢复、12同ID獨立rate-limit clients→record1／stub mail1、同IP3次後429且GET可查、PENDING→ACCEPTED、mail exception保留PENDING、unbounded stored diagnostics拒絕、wrong kind/hash/deleted/unknown、原admin允許／拒絕。郵件明確stub／無真外部訊息，不冒稱投遞。
- 僅這個後台契約有證據；PartnerInquiryPage仍只有in-memory ID／弱ACK與raw errors，encrypted原表單journal／strict receipt／GET-only重開／語系及真browser仍須接上，沒有宣稱合作流程已完成。wishlist-web-partner-receipt-evidence-20261002.json及完整logs保存；自有PG停、DB及其他worktree保留。PR82 draft／goal active／未部署，精確新commit CI另回讀；全功能／真provider-跨端／PWA／credential-permanent browser／正式migration-merge-Railway與Home-Settings各90正式回讀仍待。

## 2026-10-02 第四十五批：刪除恢復加密與分頁交易保護（仍未部署）

- 原刪除journal改用獨立AES-GCM IndexedDB vault，僅開放get/save/clear，以可信API隔離，一個API／browser保留一個原操作；immutable transaction CAS讓兩分頁／兩帳號同時publish只有一個winner、不覆寫原UUID／owner／session。原session僅在此purpose vault加密，用於帳號刪除後查原receipt；普通feature journals仍不得保存token，owner scope erase不先摧毀恢復證據。無password／typed confirmation、無plaintext fallback，非硬體Keychain／XSS保護，原server JWT expiry／identity權限不改。
- 舊localStorage journal嚴格解析→加密保存→round-trip→核對仍是原record才移除明文；失敗、mid-migration newer legacy或encrypted／legacy衝突保留原證據並凍結。首次安全read完成前不開form／不network；明確safe reread恢復winner，dispatch前再核對原journal／generation；finish僅原CAS成功且沒有newer才離開，confirmed cleanup failure只重試cleanup、不DELETE。已在執行的舊PWA bundle無法參與新IndexedDB交易，mixed-version legacy窗口仍須upgrade驗收，沒有宣稱跨版本localStorage atomic lock。
- 新Web24、focused78，final full gate0：Server56檔913＋3skip／HTTP34檔562／Web91檔1489＋build／Native42檔852＋typecheck／Expo，44migrations schema一致、required cleanup0。真IndexedDB／WebCrypto涵蓋simultaneous winner、API與normal scope隔離、非可匯出key／ciphertext、legacy save/readback/remove失敗與conflict、newer CAS保留；page涵蓋initial gate、安全reread、publish loser、不送late dispatch及confirmed cleanup retry。最初新wait測試早於hash完成釋放mock，補等vault read開始後全通過，原失敗log保留。JS349.87KB／PWA91entries6001.35KiB，原map／worker warnings保留，APP/backend source未改。
- 真Chrome、新5212 origin／獨立UTF8 DB／compiled user-deletion routes：原4e964985-d38f-4a97-ba46-215dea280a8c legacy移入加密、明文不存在、cipher不含token／key extractable false／未存password；原open、reload、第二分頁GET404共3次，同ID未冒成功。Terminal actual safe-abandonment fixture後，browser只GET200原receipt共3次，finish encrypted record清理，表單空白／DELETE disabled／owner仍存在，所有14 API GET／POST-DELETE0／外部0。6最初desktop originals及2實测390×844／document375、Settings1的product JPEG保留；先設定viewport再建tab未生效，已據實改名desktop-original並重新測mobile，不冒稱所有圖手機。原HTTP journal／非secret DOM／wishlist-web-deletion-recovery-evidence-20261002.json保存。Browser未輸入credential、未永久刪除。
- 自有API／Vite／PG停、兩tab關及viewport reset，DB與他人worktree保留。矩陣更新僅已驗證項；mixed-version PWA／完整matrix和feature-social-partner、avatar／unknownFlickr／真provider與跨端、credential-permanent browser acceptance、正式migration／merge／Railway及Home-Settings各90正式回讀仍待，PR82 draft／goal active／未部署；精確新commit CI另回讀。

## 2026-10-02 第四十四批：刪除頁語系與登入離開保護（仍未部署）

- AccountDeletionPage提供繁中／English：公共登入與恢復、影響盤點／時間、原operation receipt、unknown／abandon／ERASED、外部asset與backup限制、scope cleanup及controls。English確認文字為DELETE ACCOUNT、繁中保留刪除帳號；phrase在session初始固定，backend confirmation仍DELETE_MY_ACCOUNT，不保存password／typed confirmation，也不新增自動DELETE。
- Page用實際user／token作session邊界，mount/departure generation在fresh profile／JSON完成後、DELETE回覆及manual check／abandon回覆再次核對。切帳號／token rotation／unmount於proof等待期間，沒有journal／DELETE；已dispatch的late ACK不更新新帳號、不清除原未確認journal。Busy時credentials／confirmation鎖定且同步gate防double submit／confirm。Unknown proof／storage errors採fixed notice，避免raw診斷或憑證回顯。已在其他分頁publish的journal不覆寫，finish exact original比對防移除newer journal；這個localStorage檢查不是跨分頁atomic lock，儲存設計與race仍另審，沒有宣稱完成全部刪除安全窗口。
- 新Web14，focused26；full isolated gate退出0：Server56檔913＋3skip／HTTP34檔562／Web90檔1465＋build／Native42檔852＋typecheck／Expo，44migrations schema一致及required cleanup0。測試包含EN typed phrase／original wire contract、locale failure／corrupt journal／GET404不冒成功、3個departure時點、late DELETE fencing、newer publication／finish preservation、raw fault、duplicate/input lock與StrictMode取消。Full後English punctuation／spacing微調，最後完整Web1465＋build再驗；JS349.35KB／PWA91entries5999.09KiB，原map／worker warnings保留。APP／backend source未改。
- Chrome390×844／document375／唯一Settings1，新5210 origin避免碰前批browser storage，獨立UTF8 DB44、compiled真user/deletion handlers。公共English routes、本人real impact counts0及46px空白password／confirmation、disabled DELETE核對；未知4bd2b6fc-2c7a-448c-ac67-2dd84e1b0c29開／reload只GET404共2次，不顯示成功；actual safe-abandonment fixture197b9677-1c2f-44f5-ba5f-22cb51eb84c2只GET200，顯示帳號未刪除。原own帳號仍存在、receipt abandoned true／erasedAt null；browser所有11 API requests均GET、POST/DELETE0、credential entry0、external0。6原JPEG／DOM／HTTP journal及wishlist-web-deletion-language-evidence-20261002.json保留；初public圖CJK full stop留，final圖已修正。不以這次readonly驗收代替實際永久刪除或credential handoff。
- 自有API／Vite／PG停、tab關與viewport reset，DB及他人worktree保留。矩陣刪除列更新局部證據；剩餘全功能／social／partner語系流程、刪除journal atomic concurrency/storage audit、avatar server/provider／unknownFlickr、真provider-mail與跨端、PWA/private cache/效能、credential／permanent deletion browser acceptance、正式migration／merge／Railway及首頁／Settings各90%正式回讀仍續作。PR82 draft／goal active／未部署、100%可適用功能門檻不變；新提交精確CI另回讀。

## 2026-10-02 第四十三批：支援回饋持久回執與政策導覽（仍未部署）

- Feedback送出前以AES-GCM保存原UUID／內容／回覆email／userId／原language／canonical hash；匿名feedback使用獨立API scope，登入者沿用本人scope，無token／無plaintext fallback。同步gate防double submit，storage failure保留可複製文字且不POST；回覆未知重開只GET原receipt。明確retry只送原body／ID／hash，不因顯示語言切換生成新操作。嚴格核對received／ID／hash／receipt UUID／notification enum；不呈現raw message、AI或provider diagnostics。已確認但cleanup失敗僅清理；CAS發現另一分頁journal先凍結並安全重讀其內容，不能盲目送新journal。Auth／unmount generations阻止舊回覆污染新帳號／清除未知原journal，StrictMode只有目前GET。
- 後台新增GET feedback/submissions/:clientSubmissionId，私有no-store；hash必須放header，不在URL，kind／有效record／當下owner或原anonymous均核對，只回5個minimal receipt fields。錯帳號／hash／kind／已刪record／不存在均不洩漏內容／email。POST201原message／aiAnalysis／inquiryId／notificationStatus保留，新增received／原client ID／hash及optional hash check；無ID/hash原相容入口仍可用，既有canonical hash和transaction/mail-only-winner保持不變。沒有migration或APP修改。MailFAILED或PENDING不否定已存record，ACCEPTED不等於inbox送達。
- 公開Support及Feedback控制繁中／英文，已找出的English feedback.* keys補齊；移除沒有對應實作的10分鐘cooldown說法。具名focus dialog／busy-close保護／44px按鈕／label／5000內容與254mail上限，anon mailbox提前採後台同規則拒絕。Privacy與Terms只修safe locale read及具名44px返回，原法律正文不變。FAQ更新現有self-service刪除、外部／備份分階段及原操作恢復，不再要求先找開發團隊或保證所有資料立即消失；avatar及各browser安装說明對準現有控制。
- 新Web40／real HTTP-DB15，包含persist-before-HTTP、重開GET-only、exact retry、wrong ACK、read/save/cleanup faults、CAS-newer、auth/unmount／StrictMode、mailbox與anon-account/API crypto隔離、account erasure late fences、legal storage fallback；後台12同UUID並發record1／mail1、owner/hash拒絕、legacy201、PENDING→ACCEPTED、原commit502與GET恢复、刪record不復活。第一輪16 UI failures來自缺English keys，補真文字／保留斷言後20及61focused通過；額外邊界加入後最後full pre-push0：Server56檔913＋3skip／HTTP34檔562／Web90檔1451＋build／Native42檔852＋typecheck／Expo，44migrations schema一致與required cleanup0；主JS349.35KB／PWA91entries5991.24KiB及原map／worker警告保留。
- Chrome390×844／document390／modal366×424／buttons44px，獨立UTF8 DB＋compiled feedback routes，synthetic text與example.invalid email、mail明確stub。原POST提交真record／receipt後QA502；reload重開只GET原1c09d01f-5437-4d90-9bc0-8e3cf3747277、確認收件83545ad8-77fc-47e9-b800-e7e579c55340、FAILED notice如實、encrypted cleanup；再開中文空表單，POST總1／GET1／record1／receipt1／notification attempt1／external0。公開support／feedback繁中英文及English Privacy返回Support／Terms均真browser核對，7原JPEG與中文DOM／原HTTP journal及wishlist-web-feedback-evidence-20261002.json保存。QA finish paths是mounted relative paths，未冒稱完整URL。自有API／Vite／PG／tab關與viewport reset，合成DB及他人worktree保留。
- 矩陣政策客服列已更新上述本機證據；其他feature／social／deletion／partner語系與流程、avatar server/provider安全耐久性、unknown Flickr、真MiniMax-Flickr-mail與跨端、PWA／效能／private cache、完整憑證／永久刪除browser acceptance、正式migration／merge／Railway與Home/Settings各90%正式回讀繼續。PR82 draft、goal active／未部署、100%可適用功能門檻不變；精確新CI另回讀。

## 2026-10-02 第四十二批：設定英文介面與安全語言切換（仍未部署）

- Settings profile／avatar／privacy／app entries／advanced、原profile／avatar恢復notice、AccountBenefits及AccountSecurityPanel提供繁中／英文。使用者文字、原payload／ID／hash／encrypted journal／notice狀態不變；付款保持paused，TWD90/月及USD1/10次是原價格的英文標示，不換幣。iOS／Android／desktop安装說明補齊，沒有安裝選項仍可使用網站；不是PWA實際安裝或offline驗收。
- 語言偏好write failure不再卡在changingLang，安全顯示錯誤並保留目前語言。Profile／avatar／security在同步gate未釋放前禁止語言reload；未保存或invalid draft亦保留本頁／阻擋切換。已保存於原journal的unknown操作允許語言切換，重開只讀原回執、不重送；另一欄未保存草稿仍阻擋。Reload等待期間profile／avatar／security輸入鎖定，unmount清理timer。Optional locale read failure採英文render，其他儲存契約不變。未知pre-persist failure不顯示raw Error，冻结autosave保留文字，安全重讀後才能再送。
- 新Web17項：完整English privacy／readonly聯絡與原功能入口；locale read/write failure、未保存draft／invalid nickname、persist-before-HTTP gate及unknown原journal跨語言GET-only恢復、另一欄unsent draft、未知store failure不送；avatar active／unknown、security等待／拒絕清除credentials；English confirm取消不送、benefits GET-only retry与payments保持停止；desktop／Android／iOS語言分支。初次AST重複包contact-status翻譯導致5測試失敗及3render errors，移除double call且原斷言保留；後focused40／44／最後49全通過。最後完整isolated pre-push0：Server56檔913＋3skip／HTTP33檔547／Web88檔1411＋build／Native42檔852＋typecheck／Expo；44 migrations schema一致與required cleanup0。主JS332.88KB／PWA93entries5984.32KiB，既有map／worker warnings保留。
- Chrome390×844／document375／Settings navigation1，compiled production handlers＋batch42独立UTF8 DB由41合成fixtures複製，41原資料未改。實際zh nickname「中文草稿42」保存APPLIEDv1後QA回502；UI切English reload只GET原9d3e7b37-9f5e-4d9a-9eb6-e6717b1bca75回執、journal清理，原POST1／GET1／receipt1、內容保持原文及version1。Invalid6nicknames保留，切繁中被阻擋且沒有POST；手動修回原值只顯示No changes。另明確synthetic local avatar真Multer／handler POST200一次，重新載入真320×240；Flickr明確stub、avatar寫入独立/tmp sandbox，未寫repo public/uploads。最初QA Vite缺/uploads proxy造成broken preview，僅重啟Vite補proxy，API全程未重啟；失敗及修正圖均留。進階區真browser發現English pwa.* keys，補字典及5分支測試後reload可讀，初期圖／DOM留作歷史。總POST2／DELETE或PUT0／外部AI-mail-Flickr0；security僅展開空白欄位、付款未操作。
- 10張原JPEG／DOM／單一synthetic HTTP journal及outputs/wishlist-web-settings-language-evidence-20261002.json保留，初期失敗圖不冒稱成功。僅自有API／Vite／PG停、browser tab關／viewport還原，DB與素材／他人worktree保留；APP／backend未改。新commit精確CI與PR讀回另記JSON／roadmap。
- 全矩陣、其他feature／feedback／policy-support語系、avatar server安全及provider耐久性、Flickr unknown reconciliation、真MiniMax／Flickr／mail／跨端、PWA upgrade/offline／效能、憑證及正式migration audit／合併Railway／首頁與設定各90%正式驗收仍續作。PR82 draft／未部署、goal active及100%可適用功能門檻不變。

## 2026-10-02 第四十一批：共用導覽與行銷操作英文介面（仍未部署）

- 共用六項導覽、accessible descriptions、header登入／登出／feedback與premium、footer六個原目的地及feedback依saved locale顯示繁中／英文；兩種語言都保留唯一帶標籤Settings navigation與原routes／CSS。locale storage無法讀取時上述控制仍可用英文。Settings正文、其他features、feedback回執細節與政策客服正文仍待逐項驗收，沒有全站英文完成聲明。
- nested Marketing Beta入口、paused／unknown availability、四圖選用、keyboard／pointer排序、原文案／原操作內容、免費調整期限、原receipt／同ID retry／safe stop／cleanup提示提供英文。內部notice原值及比較不變；只翻譯presentation，不改encrypted journal、client IDs、hash、server payload、permissions或payment gate。使用者原copy／prompt包括中文字與花括號均保持原文。私人thumbnail default alt與loading／failure翻譯，caller自訂label原樣保留；bearer／no-store／redirect拒絕／MIME／5MB／object URL cleanup不變。
- 新Web14項：English navigation／active route／single gear／storage failure；Layout原footer destinations、help／logout及public／Chinese shell；Marketing paused approval＋keyboard cover、原APPLIED GET-only recovery、unknown同ID/body只POST1、CAS replacement cleanup、storage failure無write／rawdetails、monthly limit不冒稱付款開放、revision polling交付提示與original prompt；English thumbnail safe transport／cleanup與invalid MIME保留caller label。首輪focused兩項因測試Storage mock未對準專案testStorage及等待notice後尚未完成copy effect而失敗，修正實際storage spy與await display value，原assertions保留；首輪工具輸出保留。原CJK fixtures明確zh-TW。完整第一輪Web1392 passed後補thumbnail兩項，最後完整pre-push退出0：Server56檔913＋3skip／HTTP33檔547／Web88檔1394＋build／Native42檔852＋typecheck／Expo，44 migrations schema一致及native／erasure cleanup全0；主JS332.14KB、PWA93entries5969.44KiB，既有map／worker warnings保留。
- ChromeDEV／compiled handlers／獨立UTF8 DB44：DB與原physical photo由batch40合成fixture複製至batch41專用DB／media root，原batch40證據未更改；再準備四份distinct本機合成photo＋明示synthetic REVIEW job，沒有外部AI／Flickr／mail。英文paused still permits delivered approval，four images320×320真loaded；keyboard封面順序2／1／3／4，原copy保持一致。明確Confirm後後台APPLIED v4、COMPLETED，而QA回覆502；reload再開editor只GET原approval receipt並CAS cleanup，該原ID approval POST總1、receipt GET1、原job1／receipt1／selected images4，readonly順序仍2／1／3／4。未新增generation／revision工作、沒有DELETE，沒有真provider品質聲明。
- 手機390×844／document375、設定navigation1。由實際Settings language controls切繁中及回English，header／footer保持對應語言及單一入口；Settings內仍有待翻譯正文，列為剩餘。5張原截圖及DOM、synthetic HTTP journal與`outputs/wishlist-web-english-marketing-evidence-20261002.json`保留；本機完整checks／原DB素材／其他worktree變更保留。APP未改，本批只修改Web及文件，CI精確head回讀另記JSON／roadmap。
- 全功能矩陣、Settings與其他feature／feedback／policy語系、unknown Flickr upload reconciliation、真MiniMax／Flickr／mail／跨端、PWA／效能、憑證與正式migration audit／merge／Railway以及首頁設定各90%正式回讀繼續。PR82 draft／未部署，目標active與100%可適用功能門檻不變。

## 2026-10-02 第四十批：完整商品管理分頁與英文核心操作（仍未部署）

- 原 `/listings/mine` 的 items／nextCursor、預設50及原生limit100保留；游標須屬於登入帳號，foreign／missing／deleted同一400、不默默移動本人分頁邊界。owned cursor lookup與createdAt／id keyset在同一RepeatableRead snapshot，全狀態可讀，owned REMOVED亦可當boundary；查詢、驗證失敗及成功均private,no-store。跨頁新增的front row需reload才顯示，不承諾多個請求具有同一永久snapshot。無新migration或APP修改。
- 原50件／載入更多 UI 加all-seen cursor cycle及無新row防護、overlap去重並保留較高已核對version；分頁400／失聯保留已載入資料與原cursor，提供明確reload。mount generation保護management reads、receipts、mutations／finally與editor restoration，StrictMode舊回覆不覆蓋新畫面或釋放新請求gate。原encrypted owner/API journal、CAS、original receipt、禁止自動POST及conflict比較保留。
- 商品頁、六種狀態、卡片、編輯／本機草稿、expiry、confirmation、分享、錯誤與原操作比較提供繁中／英文；未知Error不直接顯示provider／storage details。DateField依相同locale顯示英文month／weekday／controls，ISO及Taiwan min、只選擇後套用、keyboard/focus不變。這只涵蓋核心商品管理；Header／Footer、nested Marketing Beta與其他頁面的全語系／政策仍待逐項驗收，未宣稱全站英文完成。
- 新Web10項：107 records／all tabs、失效cursor保留並reload、A→B→A、overlap最高version、StrictMode舊頁面與editor回覆、English edit失聯remount只GET／exact draft cleanup、Taiwan expiry calendar及storage failure保留文字。新8 real HTTP／PostgreSQL cases覆蓋107件50／50／7及100／7、同createdAt排序、全七種server狀態、foreign／missing／deletedcursor、owned removed、insert／delete跨頁、revoked JWT及malformed query。完整pre-push退出0：Server56檔913＋3skip、HTTP33檔547、Web87檔1380、Native42檔852、44 migrations schema一致、typecheck／Expo／QA cleanup gate全0。首輪新server test修ES target／typed response；舊CJK test fixtures明確固定zh-TW、原斷言不放寬，首輪失敗log保留。主JS330.97KB、PWA93entries5955.71KiB，map／worker既有警告保留。
- 真Chrome DEV／compiled handlers／獨立UTF8 DB44：107件實際50→100→107，六tabs18／18／18／18／18／17，partial提示消失；English local draft close／reload恢復時POST0。初始合成published fixture缺必要photo等欄位，真handler回CONFLICT且原修改保留；用本機合成320px physical image補齊fixture，不放寬production policy，明確Keep my changes再保存才新operation。EDIT commit後502→reload只GET原APPLIED v2、CAS清理、price0／title一致；此原operation POST1。API因補fixture重啟，conflict前journal及後EDIT／EXTEND journal分開保留，無完整單一trace宣稱。
- 英文calendar實際Oct2100→Jan2101、min2100-10-31，選2101-01-15後confirm；browser dialog transport停住時native CUA可見同一英文confirm才按確定，後台EXTEND APPLIED v3與UTC15:59:59.999一致。最終107listings、1CONFLICT＋2APPLIED receipts、target TWD0／ACTIVE／v3，post-restart POST2（EDIT失聯1＋EXTEND正常1）、無DELETE／外部AI／mail／Flickr。最終390×844 document375、單一設定navigation、private thumbnail真loaded320×320；初期proof viewport390×1050另列，不冒稱全為844。原截圖、DOM、journal及`outputs/wishlist-web-management-evidence-20261002.json`保留；僅自有API／Vite／PG停止、tab關／viewport還原，DB照片保留。
- 全矩陣、Header／Footer與nested Beta等語系政策、真MiniMax／Flickr／mail／跨端、Flickr unknown-response reconciliation、PWA／效能、正式migration audit／合併Railway與首頁設定各90%正式回讀繼續。APP與其他工作區刪檔／.gitignore未納入；PR82 draft／未部署、目標active、完整功能100%門檻保持。新提交精確CI記錄於JSON／roadmap。

## 2026-10-02 第三十九批：舊相容照片入口與複製圖片所有權（仍未部署）

- 原 multipart／JSON entry、201 row、無 key text、verified agent 自己的 publicCode 及 user tagging live verification 保留。改 memory parser，JPEG／PNG／WebP、5MB／單檔／7欄／欄位位元組與12秒界限、20次每分鐘及 bounded decoder；已dispatch後client disconnect仍保留decoder slot直到原handler完成，避免提前釋放；拒絕 forged bytes／重複或額外欄位／物件proxy／不安全價格。共用 typed name／notes／參考價與幣別／獨立預算及幣別，0明確保留，optional image不再假造外部placeholder。已驗證身份才處理照片；actor／parent鎖後再讀owner／capacity，與native新增共用容量鎖；user JWT／APIkey在最後交易重驗，避免上傳期間撤銷仍寫入。原無keyAPI沒有歷史create receipt，不冒稱可安全自動重送。
- 舊disk／回覆後背景Flickr路徑移除，改既有受控LOCAL／Flickr provider、metadata stripping及opaque image API。先保存exact MediaErasureTask，再在鎖外儲存；migration44增加notBefore，5分鐘準備lease在commit under task lock重驗，成功同交易item／owned media attachment／清理lease；失敗／過期保留exact cleanup task，由worker處理、不可刪仍owned media。worker在task鎖後重讀lease與provider identity，expired abandoned allocations亦可清除；未知Flickr upload response或process crash在photo ID返回前仍需opaque tag reconciliation，不宣稱此窗口已完全解決。準備task在owner鎖下保存opaque auth-version identity，帳號erase同鎖納入原cleanup receipt；provider完成後晚到create401、不附加，cleanup pending1→0真回讀。
- clone改短交易preflight→鎖外copy→短交易commit；最後重讀session、source visibility／hidden、image snapshot、target owner／capacity及原CLONE／CLONE_STOP receipt，safe stop勝出時410且只清staged copy。受控圖片與已知legacy producer圖片保存distinct physical asset／media UUID及target owner；source item／account erase不會破壞clone，原wisher刪帳歸零。新照片upload真COMPLETED，AI穩定FAILED／SKIPPED／COMPLETED沿來源、不偽造新辨識工作；source image消失503且無wish／receipt。同UUID並發只commit一份，losing allocations有exact durable cleanup。clone照片讀取／decode同時最多4份；任意第三方產品image URL仍為external reference，不由server任意fetch、不是永久可用承諾。
- 43項新real HTTP／PostgreSQL／physical storage cases，包含parser與payload拒絕、native capacity競爭、revocation、expired lease／abandoned cleanup、source item及source account erasure、privacy／hidden／image／capacity／session在copy期間改動、stop競爭、same-key多copy、in-flight account cleanup與新upload／舊AI失敗區分。Flickr成功／orphan lifecycle僅stub；未作真provider證據。完整pre-push退出0：Server56檔913＋3skip、HTTP32檔539、Web87檔1370、Native42檔852、44 migrations schema一致、typecheck／Expo／QA通過。最初mock res／transaction補介面、isolated owned erasure receipt清理缺口修正，Settings test fault由first get改精確profile key，避免avatar scope hash競態，原無mutation斷言保留；失敗logs與原DB保留，final新UTF8 DB清理gate全0。
- 真Chrome DEV／compiled routes／獨立UTF8 DB44：QA可見form以file chooser實際POST舊multipart201（0USD／25.5TWD／upload COMPLETED），fixture明示AI SKIPPED。另一合成帳號用原網頁target picker clone commit後502→reload只GET原CREATED→CAS清理，POST clone總數1；CLI QA calls真DELETE source200及erasure worker完成1，browser沒送永久刪除。source media／file消失，target仍一份distinct owned media／wish／CLONE receipt，fresh GET image200；API restart＋fresh synthetic session後320×240圖仍loaded。390×844 document375、設定1，6張原圖與outputs/wishlist-web-managed-photo-evidence-20261002.json保存；restart前完整synthetic HTTP journal與後GET journal分開保留。
- 本機照片／provider lifecycle局部證據不代替真Flickr／MiniMax／四圖／mail／跨端。全矩陣／管理全部分頁／語系政策／PWA／效能／憑證與正式migration／合併Railway／首頁設定各90%正式回讀繼續；APP未改、其他工作區刪檔／.gitignore保留，PR82 draft／未部署、目標active與功能100%門檻不變。新commit精確CI另記JSON／roadmap。

## 2026-10-02 第三十八批：舊網址／文字與受控照片新增（仍未部署）

- 舊URL entry／201 row及無key相容保留，改為typed持久交易：名稱／notes／參考價格／幣別／獨立預算／幣別正規化、0與null明確保存；public named HTTP(S)來源驗證，HTTPS直接進既有持久辨識佇列，文字手動SKIPPED，HTTP保留參考且明示HTTPS／截圖替代。移除該URL路徑回覆後直接scrape／暫存圖片工作；不把已排隊冒稱辨識完成。驗證代理仍綁自己publicCode，foreign claim拒絕、驗證失聯fail closed，未改為merchant key。
- 新LegacyWishCreateReceipt migration43，owner／UUID唯一、kind／parent／canonical hash驗證；actor NO KEY UPDATE、parent與media鎖後重讀owner／容量／unused歸屬，與native新增共用容量鎖。PHOTO只附本人未使用且非AI_MARKETING媒體，wish／媒體附加／receipt同交易。重送只回原item；原item／parent刪除仍有tombstone且410、不重建；GET原receipt，明確abandon先留下停止墓碑、晚到410，已建立時只回原歷史不刪。LINK／PHOTO共享新namespace；native／clone既有receipt表的namespace分開，不宣稱跨表UUID全域去重。
- 原詳情兩個新增入口接同parent encrypted gate：具名／focus／44px dialog，來源type=text支持文字，獨立價格／預算欄位與notes；送前保存最小ID／hash marker，逐欄／原ID／parent／kind核對ACK，不先顯示未確認item。失聯reload只查原建立或安全停止，CAS明確清理後才恢復；storage failure不送出、account departure不接受晚回覆。照片沿現有listing-media受控上傳／原upload receipt，以明確MANUAL_PHOTO使用相同協定，batch預設仍嚴格BATCH_ITEM；上傳確認才允許願望保存，private preview、album／camera替代、metadata／resize與owner受控媒體生命週期沿現有後台。最小photo／removal envelope綁原list並分API／owner加密，不存bytes／filename／credential。重開不自動POST；可查／safe stop／同一照片明確重試，已附加不能再用，unused移除先保存原marker、回執與CAS防清新照片；已確認但清理失敗不降為未知。
- 真Chrome／Vite DEV／compiled handlers／新UTF8 DB43 migrations：文字201保留0 USD與預算900.25 TWD；網址commit後502→reload GET原CREATED再清理；未接收請求502→GET404保留→safe stop→釋放原POST410。兩次明確合成PNG實際local upload／private preview；一份photo wish正常201、另一份commit後502→reload查原create／upload attachment，沒有替代上傳。最終4items／2LINK CREATED＋1LINK ABANDONED＋2PHOTO CREATED／2MANUAL_PHOTO media附item3／4／2STORED uploads，重啟後兩圖仍載入。unused photo移除框只取消，實際removal HTTP／React驗證沿既有contract；browser未送永久刪除。390×844／form document390／final375、設定1、focus／44px；11張原圖與outputs/wishlist-web-legacy-create-evidence-20261002.json保存。QA-only select owner field錯誤修正曾restart，保留journal僅重啟後GET，核心flow由UI／持久DB／工具410佐證，不宣稱完整pre-restart HTTP trace。
- 新Web29項／HTTP31項。完整pre-push退出0：Server56檔913＋3skip／HTTP31檔495／Web87檔1368／Native42檔852／43 migrations schema一致；preview／已確認removal cleanup補驗後末次Web87檔1370＋build、verified agent case後末次HTTP31檔496。主JS330.97KB／PWA93entries5943.13KiB／map及worker警告保留，件數不是全功能覆蓋率。新commit精確CI另記JSON／roadmap。
- 本批照片provider為本機，沒有外部AI／Flickr品質／跨端／正式部署證據。旧multipart相容API的capacity／limits／disk-upload lifecycle、clone圖片來源刪除後独立持久性、完整管理分頁／語系／政策／PWA／憑證／真provider與正式migration／合併Railway／首頁設定各90%仍接續。APP未改、其他工作區刪檔／.gitignore保留，自有QA／PG已停、DB與素材保留；PR82 draft／目標active／未部署、功能100%門檻不變。

## 2026-10-02 第三十七批：願望複製權限、回執與詳情操作（仍未部署）

- 原POST /api/items/:id/clone保留舊row／201及無target的本人預設清單相容；新增明確target與可選clientRequestId。交易鎖actor、依ID排序來源／目標parent及source item，再讀公開／隱藏／本人權限與目標容量；他人私人／隱藏404、 他人目標403、容量或處理中來源409。與native新增共用容量鎖，保留參考價格／幣別、獨立預算／幣別、最初許願者、notes／link／image reference／priority及實際穩定AI狀態；不繼承認領、隱藏、proxy reference或provider診斷，不把processing工作複製成完成。
- 可重查複製使用既有WishCreateReceipt的CLONE／CLONE_STOP種類與source-target hash，無新migration。相同owner／UUID重送只讀原clone，換來源／目標或native種類409；原願望後來刪除提供tombstone，不再建立。新增本人GET clone-receipts及POST abandon；先停止留下墓碑、晚到POST410，已建立時stop只回原結果、不刪願望。private,no-store、輸入及錯誤內容有界。原DELETE item移到typed transactional handler、保留photo-erasure queue及舊message，commit後新增id／deleted ACK。
- ItemDetailModal改為純顯示／表單，共用parent同步gate與最小加密操作標記；逐欄核對名稱／備註／URL／參考價／幣別／預算／幣別，0／null可明確保存，不先顯示未確認欄位。兩個複製入口同一具名target dialog， fresh本人清單及容量驗證、明確選擇、只呼叫來源clone endpoint。失聯／reload不重送；原clone查receipt或safe stop後明確CAS清理，其他舊操作只能明示讀目前狀態、不冒充歷史。只讀詳情在storage failure時仍可看、所有modal寫入鎖定；unsafe link不顯示，真正搜尋fallback不冒稱AI連結，保留403圖片替代提示與原許願者profile。
- 真Chrome／Vite DEV／compiled handlers／新UTF8 DB42migrations：來源編輯確認345.67 USD與900.25 TWD；另一合成帳號從詳情入口clone201。第二次明確clone commit後502，reload只GET原receipt200／CREATED再清理；第三次明確clone先延遲502，GET404不清，stop200／CLONE_STOP後釋放原POST410，目標仍2筆。最終3items／2CLONE＋1STOP、兩份clone保留原許願者1、AI SKIPPED／未認領／未隱藏；新journal clone statuses201／502／502／410，receipt GET2、stop1、DELETE0。最初編輯後QA-only select錯誤修正曾restart，journal只涵蓋重啟後，先前edit以UI／DB值佐證、不虛稱完整journal。390×844／document390、設定1、dialog focus／44px，刪除確認只取消；8張原始圖及outputs/wishlist-web-legacy-clone-evidence-20261002.json保留。
- 新增Web27項與HTTP DB18項；完整pre-push退出0：Server56檔913＋3skipped／HTTP30檔465／Web85檔1340／Native42檔852／42migrations schema一致；browser抓建立清單未翻譯key，補中英及English picker回歸後最終Web85檔1341及build再次通過。主JS330.92KB／PWA92entries5925.16KiB，既有地圖／worker預載警告保留。focused初次2項重複DOM query修正不降低原斷言，測試件數不等於全站覆蓋率。新提交精確CI回讀另記JSON／roadmap。
- 本批不是舊照片／URL create、媒體provider／來源刪除後圖片持久性、管理全部分頁、真provider／跨端、全語系／PWA／正式驗收完成聲明；這些續作。APP未改、其他worktree刪檔／.gitignore保留；只停止自有QA服務／PG、合成DB未刪。PR82 draft／未部署／目標active，首頁與設定各≥90/100、功能100%門檻維持。

## 2026-10-02 第三十六批：原願望詳情編輯與送禮契約（仍未部署）

- 修正舊詳情清單編輯把無items的ACK當完整清單、造成render崩潰；核對id／owner／名稱／說明／公開值後合併已確認子項目。送禮改用真PUT /api/items/:id與isPurchased boolean、接受公開最小id／isPurchased ACK，不再把AI COMPLETED當送禮；隱藏核對id／isHidden。三種操作先保存API／帳號隔離最小加密標記，唯一local ID只防晚到CAS清理，不送後台、不冒充歷史回執；同步gate、no-store／拒絕redirect／30秒期限、未知ACK保留標記，reload不重送，只提供目前GET＋明確閱讀後清理。已確認但清理失敗只重試清理，儲存失敗不送出、切帳號晚到回覆不清原標記。
- 詳情依ID／帳號／token重建session，嚴格讀取ID／children／公開DTO、序列阻止舊讀取覆蓋；403／404與讀取未知分開，失敗可重試、停止輪詢／新操作。私人AI狀態只有本人顯示，公開未提供AI不假稱傳統模式／失敗；原403截圖替代提示保留但不傳provider診斷。最高預算與AI價格分開，TWD750.75不四捨五入到751；未知public上限不猜100。手機卡片名稱完整換行、44px具名按鈕、編輯dialog焦點／忙碌Escape保護；分享使用無query／hash的清單路徑、使用者取消不自動複製。原網址／照片新增、複製、詳情／刪除等入口仍保留，其完整mutation／provider驗收續作。
- 真Chrome＋Vite DEV＋compiled handlers／UTF8新DB42migrations：清單編輯PUT200且子項目1保留，隱藏／恢復PUT200；另一合成帳號認領200、取消交易完成後502；reload仍pending且purchase PUT總數2，GET目前false不當歷史回執，明確清理不重送。第三合成帳號真handler認領後，原帳號再次認領與撤銷各409、DB仍第三帳號／isPurchased true、AI COMPLETED／isHidden false／TWD750.75。共清單PUT1＋item PUT7，DELETE0。390×844、document375、設定1、本人可見按鈕均具名≥44px；公開無owner編輯／假AI文字。7張原始截圖及outputs/wishlist-web-legacy-detail-evidence-20261002.json保留，本機資料未刪。
- 新增25項頁面案例＋1項真加密store隔離／CAS／erasure；最後完整pre-push退出0：Web84檔1313／Server56檔913＋3skipped／HTTP30檔447／Native42檔852／42migrations schema一致。末次保留403替代提示後Web84檔1314及build再次通過；entry／PWA數據保留於JSON，不解除既有地圖／預載警告。第一focused20項中預算精度1項失敗促成修正，未弱化斷言；首輪工具輸出及原始截圖保留。末次另抓既有刊登回執測試在notice顯示後、awaited本機草稿清理前即斷言pending=0；改waitFor真清理完成，原POST1／receipt GET1／pending0／無明文斷言均保留，失敗log存wishlist-detail36-client-cleanup-race-20261002.log，完整重跑通過。新提交精確CI另回讀更新JSON／roadmap。
- 此批不提供舊API歷史回執，也不宣稱全站語系、舊照片／URL／複製／詳情編輯與標籤、管理全部分頁、真provider／跨端、PWA及正式驗收完成。APP未改，其他工作區改動未納入；PR82 draft／未部署、目標active，首頁／設定各90%與功能100%门檻不變。

## 2026-10-02 第三十五批：既有清單操作查核與手動願望（仍未部署）

- Dashboard公開切換／刪除加入同步gate及送出前的API／帳號隔離加密標記；只保存清單ID、動作／公開值與唯一localOperationId，不保存名稱／憑證。唯一ID只防止晚到清理刪掉後續相同意圖，不是後台回執。privacy ACK核對id／owner／目標boolean；delete增加id／deleted、保留舊message，交易完成才回覆。本人清單讀取／更新／刪除private,no-store，明確拒絕不当成功，未知／不完整回覆保留標記與鎖定，reload不重送。
- 舊API沒有歷史回執，明示只能讀取目前清單；讀取成功也不能證明原操作成功。明確閱讀目前狀態後才可清理此份標記，已確認ACK的本機清理失敗只重試清理。切帳號晚到回覆不改新畫面／清理原標記；儲存失敗不送出。修正disabled按鈕點擊冒泡導航，標題Link與正常卡片入口保留。刪除dialog帶清單名稱、焦點／Escape，送出中不關閉、按鈕44px。上限不預設100或從本機premium猜10000，核對own profile後採nativeWishController的1–10000建立規則，失敗未知／可重讀，舊profile不覆蓋新讀取。
- Chrome＋Vite DEV＋compiled真handlers／新UTF8 DB `wishlist_marketplace_test_legacy_browser_20261002_35`：公開PUT200，私人transaction完成後故意502；reload／切另一帳號／切回PUT總數仍2，原標記恢復，另一帳號清單0／無原標記。明確GET目前私人值再清理才恢復操作；刪除框僅取消，browser DELETE0。390×844，dialog document390／另一帳號375、設定1、dialog焦點及44px。實際手動建立私人清單與願望各1／201，名稱／備註／預算650.50→725.25→750.75、隱藏／恢復及完成／取消完成共6次PUT200。SQL核對TWD750.75／備註／名稱一致、未隱藏／未完成／AI SKIPPED；原網站同清單詳情讀取相同ID／名稱。沒有真照片provider、郵件或APP裝置證據。
- 願望編輯補逐欄ACK核對，清單名稱／公開欄位、願望名稱／備註／連結／預算／幣別及隱藏／完成值不一致不假稱保存；新表單不沿用上一筆成功提示。新增Web20／HTTP DB3項：完整pre-push退出0，當時Web1283／Server56檔913＋3skipped／HTTP30檔447／Native42檔852／42migrations／schema一致；最終Web83檔1288及build再驗、最後focused3檔79。初次測試抓卡片點擊缺陷已修，兩個selector改明確刪除按鈕；首輪真browser新storage feature未列白名單，補精確scope及真IndexedDB隔離／CAS／erasure回歸，沒有繞過或明文fallback。首次browser舊成功提示促成ACK比對及4項回歸，真handler再編輯／toggle成功；失敗log保留，件數不是覆蓋率。
- `outputs/wishlist-web-legacy-wishlist-evidence-20261002.json`及8張原始手機圖保留，主JS330.86KB／PWA91entries5912.08KiB／地圖警告保留；新提交CI另記入JSON／roadmap。永久刪除UI最終送出、原詳情未命名圖示／分享送禮標籤／獨立AI價格欄位整體回歸、管理分頁、全語系、憑證輸入、真provider／跨端、PWA與正式preflight／合併／Railway回讀仍待完成。APP及其他工作區改動保留，PR82 draft／未部署、目標active；首頁／設定各90%、功能100%不變。

## 2026-10-02 第三十四批：帳號明確確認與恢復（仍未部署）

- 對照APP AuthScreen／authFlow：驗證信不再開頁即POST或使用回傳JWT切換帳號，載入後明確確認才送出；提供web／APP weesh連結及64位碼的手動入口，不跳到其他app。新增/resend-verification，保留忘記密碼、註冊、登入、政策入口。所有帳號頁有繁中／英文標籤、alert／status、44px操作；新密碼8–72字元、英數與允許符號／再次確認，註冊姓名改為顯示名稱、09開頭台灣手機，原web生日保留為選填且驗證日期。
- 登入先GET /api/users/me確認回傳user ID一致，再允許原子session保存／安全next返回。註冊嚴格核對user及expected email／required／sent，不保存未驗證JWT；未寄成信仍顯示已建立且提供重新寄信，不誘導重複建立。忘記／resend採中性「已收到請求／符合條件才嘗試寄送」，不依raw server文字透露帳號存在或假稱送達。
- 同步dispatch gate涵蓋登入與profile兩階段、所有表單輸入busy鎖定；同頁多次點擊只送一次。離頁／query token變更會取消並忽略晚到回覆，已切帳號頁不被改寫；no-store／redirect:error／期限保留。只有完整verification／password revocation ACK才成功，5xx／斷線／不完整回覆顯示未知；註冊／驗證／重設此頁未知時不再提供原操作重送。沒有redirect timer、沒有password／link本機草稿；未知鎖是頁面內狀態，reload仍需明確操作，原auth API沒有歷史回執，不能把使用過的token400當成原操作成功證据。確認reset只重查現有session，不直接登出不相關帳號。
- Chrome production建置＋compiled真auth／user handlers＋新UTF8 DB wishlist_marketplace_test_auth_20261002_34。QA明確標示合成帳號、emailService失敗stub、正式寄信0；CLI register2／201且sent=false。原合成帳號1登入後，另一帳號2驗證開頁POST0、點確認POST1／200，資料庫isEmailVerified=true；Chrome /api/users/me最小讀回仍id1／原名稱，不序列化raw JWT／完整profile作證據。帳號3verify真transaction完成後故意502，UI未知／submit0，reload不增加POST；DB true但UI不假稱成功。resend429保留輸入、明確重按才200中性請求；最終建置另實際貼weesh合成失效碼、明確POST400並顯示申請新信。手機390×844 document375，登入時header設定1個、password欄44px／min8且保持空白。最後文案／weesh支援改動後依要求reload核對註冊及失效碼；正常／失聯驗證核心未變。HTTP production pending scope仍安全拒絕Settings讀取／修改，不把此頁當設定成功。
- 新增37項契約／實際React頁面案例；focused4檔48、最新Web83檔1268及TypeScript／Vite build通過，完整pre-push退出0（Server56檔913＋3skipped／HTTP DB30檔444／Native42檔852／42 migrations／schema一致）。首輪marketingRequest原200／409 mismatch、第二輪externalIntake15s逾時／Jest不退出、第三輪marketingAssistant socket hang up均保留；停止的是自有失敗Jest。原transport ephemeral listener改九suite的owned IPv4 listener，setup原queued200／hash亦明確assert；25 focused與完整444通過。沒有變更production後台、原斷言／15s期限，沒有假稱已証實生產HTTP根因。最後前端重跑發現舊marketing controlled finish尚未初始化的測試競態，兩項晚到／pending測試先等待實際mock dispatch，原斷言保留後全1268重驗。初次erasableSyntaxOnly constructor語法及重複privacy link查詢改明確class欄位／原footer範圍，沒有放寬驗收。
- 原outputs保存 `wishlist-web-auth-flow-evidence-20261002.json`及verified／verification-unconfirmed／email-request／reset-fields／register-fields手機原圖。本批主JS330.87KB／PWA91entries5905.23KiB／地圖警告保留；新提交CI另精確回讀記入JSON／roadmap。原生程式未改、其他工作區改動不纳入；實際瀏覽器沒有輸入新密碼或提交註冊／重設，真mail收取、完整憑證輸入／跨端／正式端仍待驗收。完整管理／舊願望／全語系／真provider／PWA／正式preflight／合併／Railway回讀繼續，目標active／PR82 draft／未部署；首頁與設定各90%、功能100%、原站風格／單一設定及APP不改均保留。

## 2026-10-02 第三十三批：網址參數與分析隔離（仍未部署）

- 原先index全域SDK及RouteTracker的pathname＋search可能讓query進入預設分析metadata；本批改為只送白名單頁面類別／登入方式／至多100項件數。商品／願望／帳號ID、願望名稱、商品URL、query／hash及任意custom參數不跨分析邊界，RouteTracker不再console輸出網址。驗證信／重設密碼仍保留原query供原auth流程使用，不把移除分析參數誤做破壞登入連結。
- Google SDK只在hidden iframe執行，sandbox僅allow-scripts、不給allow-same-origin，固定同源frame URL與no-referrer；private MessageChannel僅送往該frame。實際public bridge嚴格驗證parent source／origin／握手／白名單欄位，空referrer、通用title、粗粒度page_location，停用預設pageview及廣告signals；DNT=1／GPC不初始化，主文件不再全域載入未使用TapPaySDK。iframe沒有主頁DOM／history／session存取權，不能只依賴send_page_view:false冒稱Enhanced Measurement已停用。官方依據：[GA頁面檢視](https://developers.google.com/analytics/devguides/collection/ga4/views)、[metadata設定](https://developers.google.com/analytics/devguides/collection/ga4/reference/config)。隱私政策繁中／英文與FAQ／README同步。
- Chrome原設定DNT=1／GPC=false不修改，production建置原樣載入時frame0、主script僅self。明確黃色標示的本機fixture僅在測試document模擬DNT=0／合成SDK，驗證真sandbox讀parent.location產生SecurityError、referrer空字串，config／page_view僅/analytics與/reset-password／verify-email；query及hash仍保留在原主頁。合成verify token確實到原POST /api/auth/verify-email，fixture回400無效token、沒有DB／帳號修改，不冒稱信箱已驗證。合成SDK故障情境重設頁／隱私導覽仍能使用；queue與provider error停用由實際bridge VM測試補驗。SW只在此fresh transport fixture回503以免旧cache掩蓋，並非PWA升級驗收。
- 手機390×844隱私document375≤390，DNT框架0、meta no-referrer；原始截圖 `web-parity-analytics-privacy-390-20261002.jpg`、`web-parity-analytics-isolation-desktop-20261002.jpg`、`web-parity-analytics-provider-failure-20261002.jpg`與`wishlist-web-analytics-privacy-evidence-20261002.json`留在原outputs。合成SDK證據不代表Google正式收件／所有環境相容，opaque frame可能影響cookie持久化；URL仍存在地址列／歷史，infra日誌與歷史分析未處理，不推定過去已外洩或已刪除。
- 完整pre-push更正測試locale查詢後退出0：Web81檔1231／Server56檔913＋3skipped／HTTP DB30檔444／Native42檔852／42 migrations與schema一致。首輪App privacy test在繁中頁找英文heading失敗，改查實際「重設密碼」且原參數斷言保留；focused6檔19與完整重跑通過，初次logs保留。主JS330.68KB／PWA92 entries 5898.40KiB，地圖及預載警告保留。本批新提交CI另精確回讀，證據JSON及roadmap記錄；APP程式未改、其他工作區改動未納入。完整管理／舊願望／auth與全語系／真provider／跨端／PWA upgrade／正式preflight／合併／Railway回讀仍待完成，PR82 draft、目標active。

## 2026-10-02 第三十二批：各頁分開載入與資源故障恢復（仍未部署）

- 所有頁面改由穩定的 `createLazyPage` 載入；Router／Auth／Layout及導覽仍在頁面boundary外。正常rerender／query改變不重建lazy身份、不清掉欄位；拒絕的lazy promise只在明確重試或失敗後的新navigation重建。載入與render錯誤分開提示，不向頁面暴露原例外，焦點移到錯誤標題，按鈕44px，繁中／英文都有文案；不加自動reload／重送API。
- 本機production主JS由761.80KB降至約328.78KB（約57%）；地圖仍約1089.08KB／worker507.81KB，PWA完整預載91entries／5892.97KiB仍大。這是入口拆分，不宣稱整站下載量／PWA效能達標；預載總量甚至略增，相關警告與升級／舊快取隱私缺口保留。
- 真Chrome使用production建置、同源代理至隔離UTF8 DB `wishlist_marketplace_test_routes_20261002_32` 的已編譯handlers；載入首頁／Login／Dashboard／Settings／Sell模組。臨時asset transport只對刊登chunk回503，為避免PWA預載掩蓋故障而在此fixture拒絕SW；未改產品SW。錯誤畫面與導覽維持，點重試仍回錯誤，能進Settings的既有安全拒絕畫面，再返回Sell。恢復資源後Chrome保留失敗module，新React promise也不能清除；點「重新整理網站」才真正收到原chunk200並顯示刊登標題。mutation attempts全0、未新增照片／願望／刊登／管理回執。390×844：錯誤document390、恢復document375、設定導航1個、錯誤標題取得焦點／按鈕44px。HTTP production build會拒絕私人pending scope的非HTTPS API，Settings及Sell如實停用修改；本批沒有繞過此保護，也不把模組恢復當成商品功能成功。
- 截圖：`web-parity-route-load-failure-390-20261002.jpg`、`web-parity-route-recovered-390-20261002.jpg`；同outputs的 `wishlist-web-route-loading-evidence-20261002.json` 保留metrics、transport、限制與最新CI。測試服務首個root403、瀏覽器ERR_BLOCKED_BY_CLIENT及缺少production相對API代理造成的「Invalid session response」已留下初次state，修正臨時fixture後重新核對；沒有改production API來源／安全驗證。
- `LazyPage.test.tsx` 新增6項：pending／retry／重複失敗／shell保留／form及query／失敗新navigation／English及render containment；舊App的永真smoke改成等待Home內容、點Login及驗證shell。完整pre-push重跑退出0：Web78檔1216／Server56檔913＋3skipped／HTTP DB30檔444／Native42檔852／42 migrations與schema一致。首輪既有externalIntake integration的單項HTTP Parse Error保留在 `/tmp/wishlist-route32-prepush-20261002.log`，完整重跑 `/tmp/wishlist-route32-prepush-retry-20261002.log` 通過，未刪斷言／放寬期限。
- 本批精確新提交CI另回讀；原生程式未改、其他工作區刪檔／.gitignore未納入。完整功能矩陣、真provider／跨端、舊願望／註冊／全站英文／政策客服／PWA與正式preflight／合併／Railway驗收繼續，首頁／設定各90%與功能100%門檻不變。PR82 draft／目標active／未部署。


## 2026-10-02 第三十一批：穩定網頁日曆與新協定延長期限驗收（仍未部署）

- 刊登共同設定與本人商品延長共用`DateField`網頁日曆；保留原生type=date手動輸入、minimum及後台驗證，隱藏重複browser indicator。月份由元件保存，切月與父頁rerender不更新日期或回跳；只有點日格／清空才更新原欄位。dialog／月份公告、Tab循環、Escape／背景關閉、焦點進入／返回及方向鍵跨週／月／年保留；延長期限禁止早於minimum的日格／月份。APP與後台協定不改。
- 新增6項元件案例：跨年返回及父頁重繪、實際點日格、閏日／清空、最小日期、方向鍵／取消、焦點循環及disabled鎖定。原管理跨年送出與刊登確認重置案例改為真正點日格／清空，原POST內容、確認文案及未刊登斷言保留。
- Chrome真UI刊登：先勾公開同意／review，日曆依序2026年10→11→12→2027年1→返回2026年12，實際點12月1日；日期2026-12-01、兩確認均false。reload日期仍相同；再勾確認後日曆清空，日期空字串且兩確認重置（預設30天入口，未公開刊登）。不是DOM改值或只切月的證據。
- 新管理協定補真UI延長：合成漫畫原v1／10月31日到期，日曆最早11月1日且上一月disabled；11→12→隔年1→返回12，實際點12月1日。確認框明示「確認延長至 2026-12-01？」；工具被原生確認框阻擋時真後台POST0，Chrome原生AX確認同一框一次後，原交易commit且故意回502。reload僅原回執GET恢復APPLIED v2／同日期；已讀清理不增加POST。真API為`2026-12-01T15:59:59.999Z`／CUSTOM_DATE，management POST1／GET1／lost ACK1、legacy extend0／新公開商品0。初證據斷言誤期待.000，依後台實際.999更正後精確通過，未改產品日期。
- 390×844、documentWidth375≤390、單一dialog／焦點在內、31日格均44.14×44px；已檢視原始`web-parity-calendar-december-390-20261002.png`、`web-parity-calendar-extension-recovered-390-20261002.png`及`wishlist-web-calendar-evidence-20261002.json`在原outputs。合成DB／圖片保留，沒有正式商品、provider／付款／原生實機；新網頁替代流程驗收不推定OS picker根因或所有瀏覽器完成。
- 最新完整pre-push退出0：網頁77檔1210及TypeScript／Vite build，後台56檔913＋3skipped、HTTP／DB30檔444、42 migrations／schema一致、原生42檔852／typecheck／Expo與QA。首次focused3項失敗因新日曆按鈕亦符合舊regex輸入查詢，改明確input selector且原斷言保留；focused4檔86及完整回歸通過。主JS761.80KB、地圖1088.99KB／worker507.81KB、PWA5875.53KiB警告保留。
- 第三十批提交`b72f2c657acadbf8f548c48f39fa7967ffaa585e`的[CI36905534974](https://github.com/HankHuang0516/wishlist-app/actions/runs/36905534974)已精確回讀3/3 completed/success（網頁1204／後台913＋3skipped／HTTP444／原生852）；本批另查新提交CI。日曆與新協定延長有上述證據，移除／草稿發布／全部分頁管理、真provider／跨端、舊願望／註冊／全站英文／政策客服／PWA效能及正式preflight／合併／Railway回讀繼續。首頁／設定各90%、功能100%、原站風格／單一設定入口及APP不改，目標active、PR82 draft／未部署。

## 2026-10-02 第三十批：刊登未送出文字與共同設定的本機恢復（仍未部署）

- 批次刊登新增API／帳號隔離的AES-GCM本機文字草稿與共同設定；名稱、說明、品牌、分類、新舊、未完成售價及欄位修改標記在失焦之前即保存。每張照片保留原後台版本／內容作比較，mutable form使用序列CAS，原server-operation journals維持不可變。已刪帳號scope的墓碑阻止晚到寫入；不存token、照片或URL。這不是跨裝置同步或XSS／硬體Keychain防護。
- 重開恢復本機文字，先GET私人清單；後台版本或內容變更須明確比較並選擇保留本機或採用後台，選擇本身不POST。私人草稿已確認後更新本機基準，保留送出期間的新修改；本機寫入失敗不把已證實後台結果倒退成未知。照片已不在私人清單時，文字備份仍可唯讀複製，不重建照片或商品；確認刊登／移除後只CAS清理相符本機草稿。
- 共同設定恢復縣市、區域、交付、議價、日期與約略網格地點；有效座標先約略化，未填完仍可編輯。公開同意與逐件確認一律不恢復。儲存故障／另一分頁修改時保留本頁文字為唯讀，暫停送出並提供先複製再明確重讀；新AI／行銷、草稿保存、刊登及移除先核對本機保存與版本，不以local saved冒充後台saved。
- 新增22項單元／實際頁面案例（library10、頁面11、store1）：未失焦／空欄／不完整售價、共同設定及確認重置、版本與同版不同內容、原ACK晚到保留新文字、CAS跨分頁、missing photo、quota／壞資料、帳號隔離、已證實後台保存但本機ACK寫入故障，以及scope發現與帳號刪除墓碑。件數不表示全網站覆蓋率。舊mock新增storage契約；既有恢復測試改為等候原本的清理／啟用完成，原安全斷言保留。
- Chrome＋compiled真handler＋獨立UTF8 DB `wishlist_marketplace_test_composer_browser_20261002_30`：實際合成照片上傳1；既有失焦送出草稿1次成v1（只有名稱），說明與`1.`仍未送出。reload後完整恢復未送出說明／售價及25.05／121.53，draft POST仍1。雙分頁修改時舊頁自己的文字仍唯讀、新文字未被覆蓋；CLI以真舊PUT模擬另一裝置更新v2，重開顯示六欄比較／420，選保留本機不增加POST。UI再儲存350及第一頁新說明，commit後502；reload僅原receipt GET1恢復v3、已儲存，POST總2／lost ACK1／歷史APPLIED2／公開新商品0。切買家看不到賣家照片或欄位，切回賣家恢復文字及共同設定。沒有真MiniMax／Flickr、正式資料或永久捨棄確認操作。
- 390×844、documentWidth375≤390、設定導航1個，原始截圖已檢視：`web-parity-composer-recovered-390-20261002.png`、`web-parity-composer-storage-conflict-390-20261002.png`、`web-parity-composer-server-conflict-390-20261002.png`、`web-parity-composer-settings-390-20261002.png`及`wishlist-web-composer-draft-evidence-20261002.json`均在原outputs。第二分頁初次桌面畫布造成空白裁圖，確認真390畫布後重拍覆存，不把初圖當手機證據。這不是首頁／設定90分的正式重審。
- 最新完整pre-push退出0：後台56檔913＋3skipped、HTTP／DB30檔444、42 migrations／schema一致、網頁76檔1204、TypeScript／Vite build、原生42檔852／typecheck／Expo及既有QA全部通過。早期全網頁4項舊mock／異步等候失敗及新故障案例的key名稱斷言錯誤均保留logs，修正後完整重驗；沒有降低斷言或取消測試。主JS756.67KB、地圖1088.99KB／worker507.81KB及PWA5870.08KiB警告保留。
- 前批最終提交`5f74d8689f60033a57bc97ee1178e512043915e1`的[CI36900732764](https://github.com/HankHuang0516/wishlist-app/actions/runs/36900732764)3/3 completed/success已精確回讀；本批新提交另查CI，不能沿用。PR82仍draft；其他人的刪檔與.gitignore未納入。本機草稿主缺口已有上述證據，其餘日曆完整選日、新商品管理動作、真provider／跨端、舊願望／註冊／全站英文／政策客服／PWA效能、正式migration preflight與合併／Railway回讀繼續完成。目標active、未部署；首頁／設定各90%、功能100%、原站風格／單一設定入口及APP不改條件維持。

## 2026-10-02 第二十九批：私人批次照片移除的持久回執（仍未部署）

- 新增第42份migration及`PhotoRemovalReceipt`，保存owner、原操作UUID、SHA-256、照片／草稿版本及REMOVED／CONFLICT／UNAVAILABLE／ABANDONED終態。照片與工作刪除不釋放原鍵，帳號刪除cascade；SQL CHECK拒絕空版本、錯誤終態／hash及非法移除ID。owner交易鎖內重新驗證JWT／API key，照片／使用中行銷檢查、刪除、清理outbox及回執同交易；寫回執失敗全部回滾。原生舊DELETE仍204／404，APP介面不改。
- 網頁先保存API／帳號隔離AES-GCM原照片、版本、操作ID與hash，無法保存就不送HTTP；重開只GET原回執。明確重試原鍵、兩步hash-only安全停止、衝突比較與已確認僅清理分開。較新草稿、商品／願望綁定及PENDING／PROCESSING／REVIEW行銷照片均不能移除。已確認清單同步或本機清理失敗保留成功證據，沒有再次POST；跨帳號晚到及CAS較新journal保護保留。不可編輯照片的本頁文字可複製，不誤稱已刊登。
- 新增21項真HTTP／PostgreSQL案例及17項前端契約／頁面回歸，涵蓋12並行同鍵只移除一次、晚到送出／停止競態、權限撤銷、綁定保護、原生相容、inactive生成圖清理、constraint、cascade、transaction rollback、重開GET-only、存儲故障、較新版比較及連續清單讀取失敗不倒退為未知。
- Chrome／compiled真handler／獨立UTF8 DB驗證：實際上傳合成檯燈，透過可見的臨時QA頁使用產品library保存加密journal（不POST）；CLI對同一合成照片送原移除，交易提交後故意回502。瀏覽器reload只GET恢復REMOVED，原POST仍1、照片清單0；SQL確認清理task仍1，畫面如實顯示檔案清理待後台。這不是永久刪除確認按鈕的真UI證據，未宣稱點過該按鈕。
- 再真UI上傳合成照片，GET404時透過兩步安全停止回ABANDONED；CLI晚到同鍵POST仍ABANDONED、照片保留。實際UI儲存草稿（blur及明確儲存共2次）成v2，再以原v0合成操作得到CONFLICT。重開顯示v2／原名稱、說明及350，按核對後關閉不增加POST。最終回執3份（REMOVED／ABANDONED／CONFLICT各1）、移除POST3（含晚到與衝突）、GET4、停止POST1、照片1、私人草稿v2、公開新商品0、legacy DELETE0。初診斷誤預期v1而失敗，保留紀錄；以實際v2及browser比較為證據，沒有改產品行為或放寬測試斷言。
- 390×844 documentWidth375≤390、設定導航1個。已檢視原尺寸未後製截圖：`web-parity-private-removal-recovered-390-20261002.png`、`web-parity-private-removal-conflict-390-20261002.png`，以及`wishlist-web-private-removal-evidence-20261002.json`均在原outputs。僅本機合成圖片、無MiniMax／Flickr／正式資料變更；頁面未送出文字跨reload持久保存仍待補，不能以本批比較取代該項。
- 完整pre-push首次既有照片公開／過期測試15秒HTTP逾時，443/444，保留失敗log並停止本次未退出Jest。該suite改用一個自有loopback listener並於結束關閉，原斷言／期限不改，focused19項通過；這是測試連線穩定修正，不推定正式服務根因。第二輪完整pre-push退出0：後台56檔913通過＋3skipped、42 migrations／schema一致、HTTP DB30檔444項、網頁74檔1180項與build、原生42檔852項／typecheck／Expo及QA安全檢查。追加連續清單失敗與重開已確認回執的清單失敗回歸，修正重開錯誤提示仍保留已確認結果；最新完整網頁74檔1182及TypeScript／Vite build通過。
- 主JS742.55KB、地圖1088.99KB／worker507.81KB及PWA5856.31KiB警告保留。新提交CI另精確回讀，不沿用6eb0061成功；PR82仍draft／未合併部署，完整目標active。剩餘刊登未送出草稿、日曆完整選日、新商品管理動作、真MiniMax／Flickr／跨端、舊願望／註冊／全站英文／政策客服／PWA效能、正式migration preflight及Railway正式回讀依矩陣完成。首頁／設定各90%、功能100%、原站風格／單一設定入口與APP不改條件維持。

- 首輪實作提交`abc99b73abc5348b6087b613c07e55e36adb1b3d`的[CI36900162379](https://github.com/HankHuang0516/wishlist-app/actions/runs/36900162379)已精確回讀completed/success，Client／Server／Native 3/3，網頁1181、後台913＋3skipped、真HTTP／DB444及42 migrations／schema一致。後續重開提示修正須另讀其提交CI，不以此成功代替。自有API／Vite／PG已停止、viewport還原、QA tab關閉，臨時QA HTML移除，合成照片／DB與證據保留；其他人的刪檔／.gitignore未stage。

## 2026-10-02 第二十八批：頭像未知回覆與只讀查核（仍未部署）

- 原頭像API無原操作回執。網頁改為先保存API／帳號隔離的加密提醒（只含版本與隨機ID，不存照片、URL或token），再POST；未確認時鎖住再次上傳，重開讀取提醒與目前profile，不自動POST。持久保存失敗不送出；30秒期限、no-store／redirect拒絕、有效avatar URL驗證、同步防重點击與帳號生命週期隔離已加上。
- 明確查核只GET目前profile，顯示目前大頭照且明示「此查核無法證明原上傳是否完成；原請求仍可能稍後完成」，不將目前值當成歷史回執。查核成功後才提供兩步清除本機提醒；清除不取消後台請求或撤回照片，再次上傳可能覆蓋目前值。已收到有效成功回覆但本機清理失敗仍顯示回覆成功，不倒退為未知。跨分頁CAS清理不能刪掉較新提醒；晚到舊帳號回覆不能改新帳號或清理舊紀錄。
- Chrome接隔離真uploadAvatar handler及PostgreSQL：單次圖片上傳後DB提交即回502，畫面未知；reload保留提醒並顯示目前照片、上傳入口鎖住，明確GET後仍保留原上傳未知說明；取消清理保留提醒，再次確認只清除提醒，入口恢復。最終avatar POST1／提交後lost ACK1，不重送。fixture僅測試圖片，harness強制Flickr stub為null並以temp目錄提供本機照片；這不是Flickr或真照片品質驗收。第一輪Vite誤把`/api`放進base URL造成`/api/api`登入404，已修正QA環境後重新登入，未改產品config或沿用失敗結果。
- SQL另回讀合成買家3頭像null／賣家4已保存本次本機URL，兩者profileVersion0，清理提醒不更改資料庫。
- 手機390×844、documentWidth375、設定導航1個，正確捲動座標原尺寸截圖已檢視。證據：原outputs的`wishlist-web-avatar-current-20261002.png`、`wishlist-web-avatar-cleared-20261002.png`、`wishlist-web-avatar-evidence-20261002.json`。新增8項實質回歸：失聯重掛不重送、保存失敗、無效URL、跨帳號晚回覆、GET失敗、清理失敗、同一輪連點、較新分頁提醒不被清理。網頁72檔1165項与TypeScript／Vite build通過；完整pre-push與新提交CI結果另追加。
- 完整pre-push第一輪後台913＋3skipped通過，但既有HTTP／DB照片隱私測試超時及追蹤測試socket hang up，421/423，不能稱通過；Jest未退出，停止的是本次自有驗證程序。未放寬15秒期限或斷言，兩個原suite focused25項均通過，根因未重現／未假稱已修。停止自有瀏覽器測試服務後完整重驗，保留兩份原紀錄。
- 第二輪完整pre-push退出0：後台56檔913通過＋3skipped、41份migration／schema一致、真HTTP／DB29檔423項、網頁72檔1165項／build、原生42檔852項／TypeScript／Expo及QA安全檢查成功。自有loopback API／Vite已停止，viewport還原，QA tab關閉，合成DB／照片／截圖保留；其他人的刪檔與.gitignore不納入。
- 第二十八批精確提交`3fbd6c2f44fa2e6c8888899a03748f4766c646e1`的[CI36894575966](https://github.com/HankHuang0516/wishlist-app/actions/runs/36894575966)已回讀completed/success，Client／Server／Native 3/3。前批提交`6c915cb`亦單獨通過CI36892597373；未用前批成功替代本批驗證。PR描述已改為最終功能、驗證與未達門檻摘要，詳細歷史保留在本文件。
- 不擴張旧API能力：頭像原操作結果仍無持久回執，不宣稱可安全重試同一上傳或取消原請求。其餘刊登未送出草稿、批次照片移除、真MiniMax／Flickr／跨端、舊願望／註冊／全站英文／政策客服／PWA效能與正式部署仍依完整矩陣驗收。APP程式／風格不改，首頁與設定各90%及功能100%條件不變；PR82仍draft，目標active。

## 2026-10-02 第二十七批：尚未送出的商品編輯草稿（仍未部署）

- 商品管理編輯現在逐次保存名稱／說明／價格到API、帳號與商品範圍的加密IndexedDB草稿；空名稱與未完成價格如`1.`仍可恢復，送出時才依既有商品規則驗證。畫面明示本機草稿與後台保存的差別；關閉／切狀態／重開保留草稿，儲存中離開有提示。這不是跨裝置同步或硬體Keychain／XSS防護。
- 新`replaceDraft`只允許尚未送出的`listing-edit.UUID`，加密且以原文字與revision在單一交易內CAS；既有待確認操作的`save`仍不可覆寫。多分頁競態時保留較新草稿，舊分頁文字轉成可選取的唯讀，保存失敗不送後台。捨棄需確認且只清理同一草稿，不更改商品；帳號刪除的scope墓碑仍阻擋晚到寫入。
- 後台版本變更後重開會並排顯示草稿與最新商品；未明確保留草稿並採用最新基準前不能送出。送出先等本機保存、再次核對另一分頁，再用原管理回執協定。APPLIED回執核對後只清理與該次原內容／版號一致的草稿；未知回覆重開仍只GET，不能自動POST。行銷批准等待期間維持元件掛載、鎖住欄位，實際回讀後才更新文案；未保存編輯仍阻止批准。
- Chrome連隔離真handlers與PostgreSQL：未送出的名稱／兩行說明／`1.`在reload後恢復，POST0；兩分頁讀同一草稿後第一分頁更新，第二分頁修改被CAS拒絕，原文字留在畫面且不覆寫。改成有效NT$320後，一次管理EDIT後台提交即回502，reload恢復APPLIED v2；兩分頁分別GET確認，POST總數1／原回執GET2／lost ACK1，legacy PATCH0。SQL回讀單一商品ACTIVE／320／v2及單份EDIT APPLIED原版1→2，沒有重送。
- 手機分頁實際`innerWidth390`、`scrollWidth375`、設定導航1個；原尺寸CDP截圖390×844已檢視。Browser viewport只套用當下作用分頁，早期第一分頁仍為1873px，沒有將該截圖當成手機證據；改用真正390px分頁与原尺寸截圖。證據在原outputs：`wishlist-web-edit-draft-conflict-20261002.png`、`wishlist-web-edit-draft-receipt-recovered-20261002.png`、`wishlist-web-edit-draft-recovered-mobile-20261002.png`與`wishlist-web-edit-draft-evidence-20261002.json`。此fixture縮圖是明示替代圖，並非商品照片來源、Flickr或AI正確率證據。
- 帳號隔離首輪因重用QA API5183及已重設DB的user ID而讀到前批合成journal，未把它當成隔離通過。harness新增嚴格loopback測試port參數（預設相容），另用全新瀏覽器5184／API5185及UTF8 DB`wishlist_marketplace_test_edit_fresh_browser_20261002_27`重驗：seller1保存私人文字後登出，buyer2商品0且無賣家草稿／回執；切回seller1原草稿與提示恢復，管理POST0／回執0。手機390×844、documentWidth390，正確截圖`wishlist-web-edit-draft-account-isolation-20261002.png`及`wishlist-web-edit-draft-seller-restored-20261002.png`已檢視；先前錯誤捲動座標截圖已由正確原尺寸截圖覆寫，不列為證據。
- 第二十七批精確提交`6c915cbe2b467f5bf18b4071075cff3f3c20a01e`的[CI36892597373](https://github.com/HankHuang0516/wishlist-app/actions/runs/36892597373)已回讀completed/success，Client／Server／Native 3/3，完整HTTP／DB及migration／schema檢查成功。這只證明本批提交，不能沿用到後續頭像修改或當正式部署證據。
- 本機新增17項回歸，最新網頁72檔1157項通過，TypeScript與Vite建置通過。首輪原有兩項管理測試需等待編輯草稿讀取完成，未刪斷言；全套發現行銷元件在busy時被卸載，已修正掛載條件與重驗真父頁6項。一輪既有面交測試未等資料讀取失敗，focused19項及下一輪完整1157通過，未假稱已修根因。完整pre-push已成功；精確新提交CI仍須另回讀後追加證據。
- 完整pre-push初次隔離PG因預設SQL_ASCII，NFKC配對查詢失敗，與正式或本批前端變更無關；改另建UTF8測試DB，保留原DB及失敗紀錄。新完整validation退出0：後台56檔913通過＋3skipped、41份migration／schema一致、真HTTP／DB29檔423項、網頁1157項及build、原生42檔852項／typecheck／Expo，原生QA／清理／iOS輸入白名單均通過。未把初次行銷取消單項未重現推定為已修正式缺陷。
- 正式health回讀ok／2.1.0，唯一爬蟲紀錄是2026-02-24的Gemini暫時503，屬歷史記錄，保留未清除。本機隔離DB`wishlist_marketplace_test_edit_browser_20261002_27`與全套驗證DB`wishlist_marketplace_test_edit_20261002_27_utf8`使用55441／parity；正式資料與APP未改，其他人的刪檔／.gitignore不納入此提交。
- 主JS729.24KB、地圖1088.99KB／worker507.81KB與PWA5843.30KiB警告保留。頭像未知回應、刊登頁未送出私人草稿、批次照片移除、真MiniMax／Flickr／跨端、完整舊願望／註冊／政策客服／全站英文及PWA效能等其餘矩陣缺口仍待完成；首頁／設定各90%、100%功能與正式部署驗收條件不變。PR82仍draft，未合併／部署，完整目標active。

## 2026-10-01 第二十六批：持久追蹤回執與公開個人頁恢復（仍未部署）

- 新增第41份migration及同帳號追蹤版本／不可變原操作回執。新協定採原ID、內容雜湊、expectedVersion；關係與回執在同一交易完成。新舊追蹤端點共用排序鎖與原子額度檢查，原回執重播不覆寫後續取消結果；ABANDONED只保存雜湊墓碑，不送原對象內容、不撤銷已完成的關係變更。JWT／API key在交易內再次核對；公開頁只讀最小資料，private/no-store與公開旗標繼續適用。
- 朋友搜尋頁與個人頁共用API／帳號隔離的加密journal。保存失敗不POST、跨reload僅GET原回執；未知結果鎖住新寫入，明確原操作重試／兩步安全停止／讀過回執後CAS清理。歷史回執與查核時狀態分開顯示，晚到舊帳號回應不改新帳號或清掉舊紀錄。這不是硬體Keychain或XSS防護的宣稱。
- 公開個人頁新增严格ID／最小資料驗證、登入返回、取消過期讀取及錯誤恢復。503不能當不存在，404與資料不符分開；私密欄位保留清楚標題，HTTPS照片不拼錯API網址，隱藏或缺少照片使用中性說明。取消追蹤採具role=dialog／焦點管理／Escape的共用對話框；本人頁不出現追蹤自己。新版追蹤狀態不被晚到舊profile回應覆蓋。
- Chrome連隔離真handlers驗證：合成買家1→賣家2追蹤commit後502，reload只GET確認APPLIED v1；個人頁503顯示可重試未知，重試恢復遮罩資料並沿用同一journal。明確清理本機標記後，取消追蹤commit後502、reload只GET確認APPLIED v2及未追蹤。SQL確認兩份相反wanted的歷史回執保留、Follow為0；HTTP新POST2／lost ACK2／原回執GET3／state GET4，legacy POST0／abandon0，無自動重送。確認框實際有單一dialog與焦點位於dialog。
- 390×844實際手機：documentWidth375≤390、設定導航1個、沒有私密照片請求，本頁清理／追蹤按鈕44px。原始截圖`wishlist-web-follow-receipt-unknown-20261001.jpg`、`wishlist-web-follow-profile-recovered-20261001.jpg`、`wishlist-web-follow-unfollow-recovered-20261001.jpg`、`wishlist-web-follow-profile-mobile-20261001.jpg`留在原outputs，手機图已實際檢視。這不是首頁／設定90%重審或正式站證據。
- 本機網頁71檔1140項、後台56檔913項＋3skipped、真HTTP／DB29檔423項及client/server build通過；41份migration與schema一致。包含同key並發去重、不同對象容量競態、舊API版號、歷史回執不重寫、hash-only停止、零額度及premium旗標、跨帳號晚回應與儲存失敗。測試件數不是覆蓋率；未把交易內撤銷競態／帳號刪除級聯等尚未專項實測的細節當成全部完成。首次PG啟動誤選預設5432而失敗，改用既定55441；舊UI mock仍用legacy契約及TypeScript mock型別造成首輪失敗，按真實協定修正後完整重驗，未停其他PG或放寬斷言。
- 隔離DB為`wishlist_marketplace_test_follow_20261001_26`及`wishlist_marketplace_test_follow_browser_20261001_26`，使用原loopback55441／parity；合成DB／照片／截圖保留，自有HTTP／Vite停止、viewport還原及QA tab關閉。正式資料、APP風格、商店及其他人的刪檔／.gitignore未改。本批新提交CI另回讀，PR82仍draft／未合併部署，目標active。
- 主JS722.74KB、地圖1088.99KB／worker507.81KB、PWA5836.95KiB及既有依賴／act警告保留。完整矩陣其餘缺口、頭像未知回應、批次照片移除／新編輯持久草稿、舊願望／其他管理動作、真MiniMax／Flickr／四圖及跨端、全站英文／政策客服／PWA效能與正式部署仍須完成。首頁／設定各90%與完整功能100%不變。

## 2026-10-01 第二十五批：朋友搜尋隱私與可恢復讀取（仍未部署）

- 搜尋、追蹤清單與生日提醒改為最小明確投影；隱藏手機、真實姓名及信箱不參與搜尋，公開信箱仍須完整比對。顯示名稱／暱稱維持公開語義，大頭照旗標只控制照片。照片、電話及生日依本人公開旗標遮罩；所有社交讀取及公開個人頁使用private/no-store，不回傳憑證或行銷同意。
- 朋友頁加入API／帳號隔離、取消過期查詢、嚴格資料驗證、Unicode查詢編碼及失敗重試。搜尋／追蹤清單未成功不顯示假空清單或0人；上限未讀取顯示未知並可重試，真實0不改為預設100。公開HTTPS大頭照不再錯誤拼接API網址；連結不嵌套按鈕、圖示有操作名稱、卡片操作44×44。將「偷窺」改為「單向追蹤」，取消追蹤說明不誤稱刪除帳號或商品。
- 追蹤／取消追蹤在本頁同步防重點擊；回覆未知只提供GET目前狀態、不自動重送，也不把目前狀態冒充歷史回執。**原追蹤API尚無持久原操作回執／跨reload待確認紀錄，額度競態及重新核對session仍待補；本批不宣稱全部社交流程已完成。** 公開個人頁仍須補嚴格資料驗證、切帳號／錯誤恢復與照片URL處理；通用取消確認框鍵盤焦點／dialog語義亦保留為缺口。
- Chrome連隔離真handlers驗證：合成買家2搜尋賣家1的公開名稱成功，隱藏完整信箱搜尋確定0筆，沒有載入隱藏照片。刻意503後顯示未知＋重試，重試恢復原結果；追蹤commit後502鎖住操作，GET確認目前已追蹤，socialFollow POST1／lost ACK1／profile GET1，未重送。追蹤清單503不顯示0，重試為1人；SQL確認僅買家2→賣家1。取消追蹤確認選擇取消，關係保留。
- 實際手機390×844：documentWidth390、單一設定導航、無照片請求、三個卡片操作均44×44；全域登出／協助仍40×40，不能當成全站觸控驗收。瀏覽器畫布已還原、自有QA tab關閉。原始截圖：`wishlist-web-social-privacy-20261001.jpg`、`wishlist-web-social-follow-unknown-20261001.jpg`、`wishlist-web-social-follow-current-20261001.jpg`、`wishlist-web-social-mobile-20261001.jpg`，存於原outputs；最後手機圖已實際檢視。這不是首頁／設定90%重審或正式站證據。
- 新增網頁社交資料3項／實際頁面14項、後台隱私規則3項與真HTTP／DB9項。最新網頁68檔1116項、後台55檔903項＋3skipped、真HTTP／DB28檔417項及client/server build通過；40份migration及schema一致。初次全套商品編輯測試點擊尚未啟用的按鈕，改為等待恢復完成，保留實拍與行銷來源斷言；外部匯入首次未取得items的失敗尚未重現，新增狀態診斷斷言，focused及完整DB回歸通過，不宣稱根因已解決。曾用錯Jest配置檔名，已依現有marketplace配置執行。
- 隔離DB為`wishlist_marketplace_test_social_20261001_25`與`wishlist_marketplace_test_social_browser_20261001_25`，使用已建立的loopback55441／parity；沒有正式帳號／資料改動或外部寄信。合成DB／照片／截圖保留，自有HTTP／Vite正常停止。工作區其他人的刪檔與.gitignore變更不納入本批。
- 主JS709.95KB、地圖1088.99KB／worker507.81KB、PWA5825.33KiB及既有依賴／測試警告保留，件數不是覆蓋率；精確新提交CI須另回讀，PR82仍draft／未合併部署，目標active。完整功能100%與首頁／設定各90%正式驗收門檻不變；其餘功能矩陣缺口及真MiniMax／Flickr／行銷四圖／跨端、PWA效能與正式部署仍待完成。

## 2026-10-01 第二十四批：通知偏好真實保存與恢復（仍未部署）

- 前一回合已更新90%視覺完成條件，屬於規格進展；本批接續完整功能目標，沒有改APP或將目標縮成通知頁。
- 移除通知頁setTimeout假儲存。User新增`marketingEmailsEnabled`，第40份migration預設false／既有用戶不自動同意；僅own-profile明確投影讀出，更新採既有版本化profile回執、API＋帳號隔離加密journal、原ID／雜湊核對及重開GET查核。其他尚未確認的個資操作不被通知開關取代；安全取消仍為兩步、僅hash墓碑。
- 開關顯示後台確認值，只有正確APPLIED與內容一致才顯示已儲存；未知回覆鎖住變更，提供原回執查核／同操作重試／安全取消與本機清理。CONFLICT明示本次未套用、畫面是後台目前偏好，不假稱保留未存在的通知草稿；晚到舊帳號ACK不改新帳號、不清掉原帳號journal。缺失或非boolean偏好不猜成false。
- 真實服务範圍：本批只保存行銷同意，**行銷郵件及瀏覽器推播未開通**，頁面明示且不請求推播權限；主動信箱驗證／密碼重設不受此同意影響，不虛構所有安全事件自動郵件。APP無通知偏好頁，本次是修復應保留的網頁舊功能，不是新建寄送平台。
- Chrome／隔離真handlers：合成買家1（賣家2未變更）保存opt-in v1後刻意502；重新開啟恢復勾選，POST1／receipt GET1、1份APPLIED，無重送。關閉成功v2，另一分頁開啟v3，舊頁提交CONFLICT後顯示最新值。修正文案導致HMR重掛載，重新以另一分頁關閉v4／舊頁CONFLICT驗證並保存最終畫面。SQL最終買家false v4、賣家false v0，4份APPLIED＋2份CONFLICT；HTTP profile POST6、receipt GET1、lost ACK1。
- 第一張名為mobile的捕捉實際仍1873px：viewport套用到目前選取的另一個QA tab，未把此圖當手機證據。改由該分頁確認390×844、documentWidth375、1個設定導航、label觸控高76px，覆存正確mobile圖並實際檢視；viewport已reset、兩個QA tabs關閉。
- 未後製實際截圖：`wishlist-web-notifications-pending-20261001.jpg`、`wishlist-web-notifications-recovered-20261001.jpg`、`wishlist-web-notifications-conflict-20261001.jpg`、`wishlist-web-notifications-mobile-20261001.jpg`，位於原outputs目錄。這不是首頁／設定90分重審或正式網站證據。
- 新增10項通知頁測試及boolean規則／3項真HTTP-DB測試；最新client66檔1099項、server54檔900項＋3skipped、27檔408項真HTTP／DB及client/server build通過；40份migration成功、schema與隔離DB無差異。初次UI測試因繁中既有字串是「已儲存！」而非「已儲存」失敗，修正精確文字後全套重驗；舊PG角色參考缺失及初次VITE網址重複`/api`亦如實修正，未動正式環境或重送成功操作。
- 測試cluster是新建loopback55441、角色parity，DB分別`wishlist_marketplace_test_notifications_20261001_24`與`wishlist_marketplace_test_notifications_browser_20261001_24`；前批55439無可用角色，僅停止本批啟動的listener並保留其檔案。沒有刪前批資料；本批自有HTTP／Vite正常停止，合成DB／照片／截圖保留。
- 主JS701.13KB／地圖1088.99KB／worker507.81KB、PWA5816.88KiB與既有測試／依賴提示仍保留；測試件數不是覆蓋率。本批新提交CI需精確回讀，PR82仍draft／未合併部署、目標active。
- 尚未完成：通知英文／全站語系完整回歸、頭像未知回應、註冊／驗證／重設、舊願望／分類／分享／刪除、批次照片移除及未送出編輯持久保存、其他管理動作／日期／分頁、真MiniMax與Flickr／行銷四圖及免費修改／跨端、PWA效能、全站響應式、正式migration／Railway部署與逐頁90%視覺回讀。檢索社交search亦發現既有回應未依`isPhoneVisible`遮罩電話，須加入下一批隱私回歸／修正，不能把本批consent不洩漏測試誤當全部社交隱私通過。

## 功能對照與缺口

| 功能 | APP 基準／後台 | 網頁狀態 | 必要驗收 |
|---|---|---|---|
| 我的商品入口與完整閱覽管理 | MyListingsScreen；GET listings/mine | 第40批Chrome真DB107件50→100→107、六tabs完整數量及loaded-only提示核對；8個HTTP分頁／游標／owner／revoked-session案例，加密草稿及失聯GET-only恢復、真private thumbnail已本機驗證；第91批原APP12 Android與Web同一DRAFT完整讀回／編輯／stale版本保護及owner隔離已實際核對；第94批正常往返保持，第95批完整ACTIVE／RESERVED／SOLD同商品原APP12與615Web、Web真commit503→同Chrome reload只GET原回執、真10-19日曆與雙照片／全欄位保持已驗；其他狀態／多頁與正式端待驗 | 各狀態、新增／刪除跨頁及較新版overlap不誤覆蓋；多請求非永久同一snapshot |
| 刊登入口、連拍／批次選照、AI 草稿 | ListingBatchComposer；listing-media | 本機刊登、照片上傳及私人草稿均有持久回執、加密隔離紀錄、內容核對與重開只讀查核；實際commit後502恢復原草稿，較新版本比較不覆蓋；照片移除新增持久回執、真DB提交後502的GET恢復、安全停止與版本衝突真UI核對；未失焦文字／共同設定的加密恢復、CAS雙分頁保護及後台版本比較已真UI驗證；公開同意／逐件確認不恢復。第98批真Flickr私人upload／原縮圖／清理與not-found通過；第99批既有QA帳號正式API upload201、owner200／anon404、AI queue202→真COMPLETED／MINIMAX_CODE_VISION草稿、同media204及DB／Flickr清理通過，原synthetic橘燈觀察與保守估價説明保存；沒有這筆native／browser display或一般照片accuracy聲明。第100批真四圖／一次第二張免費調整、私人與5圖公開權限、API commit503原回執、child批准後root不變／月用量1已補；去背漏電線品質與root／child cutout bytes差異保留。第101批正式wish圖片綁定→真PROCESSING／COMPLETED與null售價／budget0、原current receipt／清理／not-found已驗；本筆native／browser display未驗。永久移除確認按鈕、舊紀錄來源、行銷native／browser跨端及品質仍待補；第102批618已發布保守遮罩外細節拒絕／完整照片fallback與Mac installed worker同步，六offline／同尺寸實際漏線mask／真四圖與一次slot2完整API流程及人工原圖保留檢查通過；非普遍保真保證，原APP與browser真圖跨端仍待；第103批原iOS12 DEBUG與同618 source DEV用同一installed-worker真四圖完成閱覽→Web鍵盤3/1/4/2→唯一APPLIED2真commit503／同tab reload只GET原receipt→APP冷重開cover3與位置／四解碼一致；源hash與五圖順序／月1／五remote清理已驗，QA環境失敗保留，非正式故障或新90分驗收 | 逐張排隊、失敗重試、上傳恢復、公開確認 |
| 手動商品欄位／失效日期 | ListingComposer、ListingBatchComposer | 本機欄位定位／高亮、逐件勾選、自訂日期清空及後台預設30天已驗證；刊登與管理共用網頁日曆，Chrome跨年切月／返回、點日格、reload及清空已驗證；選日／清空取消公開確認，管理日期與新協定回執／後台一致；第89批正式609補手動商品DRAFT入口，名稱即可save（不是私人media sellerDraft），可選欄位／MANUAL_PHOTO／日曆2026-10-15與原回執GET恢復已本機真UI／DB驗，四DRAFT匿名404、完整公開一ACTIVE；正式表單與375手機DOM核對；第90批612已修正實拍白底白字缺陷，真built與正式桌面／375手機各核對兩CTA文字可見、46px與無root橫溢出；第91批name-only DRAFT原APP12往返及v2 stale／v3明確rebase→v4實測補齊；第94批正常完整資料與双照片保持，第95批真日曆2026-10-19／CUSTOM_DATE台灣日末、全手動資料／雙MANUAL_PHOTO原hash順序、原APP價格分類說明縮圖與四版狀態往返已驗；iOS與正式寫入仍待 | 日期切月穩定、預設30天、未填欄定位高亮 |
| 商品編輯／保留／售出／移除／延長 | MyListingsScreen；PATCH listings/id、status、extend | 新增不可變管理回執及API／帳號隔離加密原操作；Chrome／真DB驗證編輯與售出commit後502→reload僅GET恢復、跨端衝突保留比較及明確新版本儲存；尚未送出名稱／說明／不完整價格的加密草稿恢復及跨分頁CAS已真UI驗證；前批延長／保留／恢復在售保留為舊協定證據，新協定延長已真UI點日格＋commit後502→GET恢復v2／日期一致；完整多頁已第40批實測；新協定移除真UI仍待補；既有APP12 MyListings沒有發布已保存DRAFT按鈕，先前草稿發布驗收要求不符原UI；真正缺口為ListingComposer手動DRAFT新增，已第89批實作發布609，第91批原APP12與Web DRAFT編輯兩次native PATCH／Web CONFLICT→explicit APPLIED、兩端v4及owner隔離實測補齊；第94批原APP正常reserve1→2／Web新協定release2→3／原APPsold3→4及Web原回執3與最新4比較已實際通過；94的ACK-loss未生效保持原失敗；95新正確nested receipt fault真APPLIED3後503、原待查核UI→同session reload與明確GET-only恢復、Web原回執3與最新APP SOLD4及單POST已核對；第98批移除前全欄位／雙照片不變與管理401／404／400三拒絕通過；最終不可恢復確認未於harness到期前取得、管理成功POST／receipt0，真UI移除及503恢復不計通過。新協定移除真UI、其他狀態／iOS及正式寫入仍待 ；第118批641已发布：639新手動地圖顯示／停止納入原加密管理操作與不可變MAP回執，完整UUID／body hash／原expectedVersion保存，reload只GET、不自動續一小時。隔離真後台與DEV Web正常cancel／check-in／stop、真commit503後原APPLIED4和較新legacy停止5分開顯示、未commit503→reload404→明確同UUID完整body重試6→正常stop7；五回執、六UI POST狀態200/200/503/503/200/200，其餘欄位／旁觀帳號保持。原APP12沒有新runtime操作，legacy PUT不是原native真UI。正式641原地圖確認窗一小時／约2km／非即時位置／不自續與44px、Escape／取消讀回已驗；正式地圖成功／故障寫入與跨端仍待 | expectedVersion 衝突、失聯查核而非盲目重送 |
| 商品手動地圖顯示／停止／隱私 | 外部PR128新增Web／upstream功能；原APP12相容性仍須對照，不修改原APP | 第118批641：約2km非即時商品位置、一小時人工同意、不自續；已納入owner／API scope原加密操作與不可變MAP deadline回執。隔離真後台＋DEV Web正常／commit503原GET-only恢復／較新legacy停止／未commit503原UUID完整body明確重試通過；正式確認窗Escape／取消與44px已核，未提交正式MAP寫入 | 正式成功／失聯／恢復、原APP12與較新端混用隱私行為及permission仍待；不把legacy PUT當原APP12真UI |
| 已刊登商品額外選項行銷助手 | MyListingsScreen | 原真實漫畫入口唯讀；第40／41批合成商品真browser編輯與4圖批准commit後502→reload只GET原receipt、v4與cover排序2/1/3/4一致，nested中英文已驗證；真provider品質仍待；第100批真provider四圖及第二張免費調整／不可變回執／五公開圖原照保持已補API實證，仍有去背漏電線與真圖跨端display缺口；第102批618已發布保守遮罩外細節拒絕／完整照片fallback與Mac installed worker同步，六offline／同尺寸實際漏線mask／真四圖與一次slot2完整API流程及人工原圖保留檢查通過；非普遍保真保證，原APP與browser真圖跨端仍待；第103批原iOS12 DEBUG與同618 source DEV用同一installed-worker真四圖完成閱覽→Web鍵盤3/1/4/2→唯一APPLIED2真commit503／同tab reload只GET原receipt→APP冷重開cover3與位置／四解碼一致；源hash與五圖順序／月1／五remote清理已驗，QA環境失敗保留，非正式故障或新90分驗收 | 原來源圖、先儲存、人工確認、版號衝突；合成四圖不當MiniMax品質證明 |
| 行銷4圖、1次免費修改、排序、話術、批准 | MarketingAssistant；marketing/jobs | 共用元件、原版／免費調整queue及不可變批准回執、加密原選圖／文案／版本紀錄已實作；實際批准commit後502→reload只GET恢復，child套用後root歷史證據不變且月次數1；能力關閉時仍可查看／批准既有結果，新生成及免費調整停用、明確只讀重查，Chrome暫停期間實測同樣成功恢復；第100批真MiniMax四背景／四private JPEG與一slot2免費調整、owner200／other及anon404、root commit503僅GET APPLIED2、child APPLIED3後root不變、月用量1與付款關閉、五公開圖原照與指定順序通過；品質漏電線／兩cutout bytes不同明確保留。上下文變更、舊紀錄與native／browser真圖片跨端及品質仍待補；第102批618已發布保守遮罩外細節拒絕／完整照片fallback與Mac installed worker同步，六offline／同尺寸實際漏線mask／真四圖與一次slot2完整API流程及人工原圖保留檢查通過；非普遍保真保證，原APP與browser真圖跨端仍待；第103批原iOS12 DEBUG與同618 source DEV用同一installed-worker真四圖完成閱覽→Web鍵盤3/1/4/2→唯一APPLIED2真commit503／同tab reload只GET原receipt→APP冷重開cover3與位置／四解碼一致；源hash與五圖順序／月1／五remote清理已驗，QA環境失敗保留，非正式故障或新90分驗收 | 4圖完整交付、只扣原任務、拖曳與鍵盤可操作、未知回覆只讀恢復 |
| 商品分享連結與商品預覽 | listingShare、PublicListingPage；SSR metadata | 第69–70批正式預覽／雙語回讀；第76批補手動分享文字及明確重新GET，合成v3→v4／v6、503恢復、SOLD／private照片404與手機真browser核對；真native分享及第三方社交card仍待 | 商品縮圖、名稱、TWD價格、非網站通用圖 |
| 首頁所有願望最匹配商品／多件列表 | WishHome；listings/match-wishes | 本機實作；真實帳號6個願望、漫畫3件第三方匹配已唯讀核對；第53批繁中English／expanded group／mobile／guest及生日獨立503→單GET恢復真Chrome核對 | 全願望／匹配分頁、最多3個並行、跨頁排序、失敗明示、不混入自己商品 |
| 今天想找什麼、單件結果地圖定位 | WishHome、ExploreScreen | 本機實作；單件zoom13、窄屏與漫畫詳情已驗證 | 同願望漫畫正反例、单件深連結最新狀態核對、鍵盤願望選擇 |
| 地圖縮圖、列表、搜尋、過濾、目前位置 | ExploreScreen、listingSearch | 正式583底圖及8件清單照片正常；第70–72批雙語篩選／外部恢復保留；第77批真browser同cursor429等待→明確恢復、定位不可用／未授權與手動移圖零查詢→明確新bbox200；精確OS拒絕及完整跨端仍待 | 同邊界／條件、地圖移動不自動重查、群聚只顯示實際葉節點、圖與列表一致 |
| 保留既有Web來源線索地圖／委託詢問 | main7db05da獨立Web功能；不冒稱APP已驗證商品或付款 | 第58批原target／撤回／unknown／late scope保留；第60批中英文與native44px point／Space真UI、空GET不配置、ASK與CONSENT各真commit502→reload GET同room／原中文問題／WAITING_ROUTE、B null不建room，35requests只有原配置／ASK／CONSENT3POST；新Web1／focused16／HTTP9通過、45migration diff0；第83批593已發布加密原ASK／CONSENT與CANCEL完整body journal、owner／UUID／CAS fences與30秒bounded GET-only重開恢復，三組本機失聯流程及精確CI通過 ；第86批原593真UI補切帳號／來源撤下／kill-switch三組ASK／CONSENT／CANCEL原操作恢復、GET-only且無重送；596增量發布來源收件匣七狀態繁中／英文與明確read retry，fresh真GET503→按新Retry GET200原room／ASK保持、無新action POST，桌面三狀態與390手機實際通過，精確三CI及正式新Reload按鈕操作／原四筆來源保持 | 完整來源／核實原賣家路由／人工delivery證據／正式端仍待；第60批舊最小marker不當原body history；新durable journal的browser storage實體生命週期／其他混合紀錄與真delivery仍待，不把來源線索算已驗證商品達成率 |
| 願望交叉比對／外部來源／自有商品預覽 | ExploreScreen、wishMatch、externalListingSearch | 本機實作；漫畫地圖4件含1件自有預覽；正式後台外部來源仍未開放 | 回傳分數及來源不混淆；外部頁／來源詳情與跨站HTML縮圖標記有合成測試，不把失敗顯示0件 |
| 商品檢舉與聊天入口 | ExploreScreen、ListingReportSheet | 探索及公開商品入口本機實作；本人商品進管理，重複／失聯建房與登入返回測試通過 | 對象正確、重複點擊不重建對話；檢舉非立即下架 |
| 商品聊天收件匣／未讀／分頁／發送恢復 | ChatScreen；chat/conversations | 正式583收件匣照片與QA空聊天室實際核對；原繁中／390手機、英文、隔離發送／未知回應／121則Web分頁與第73批限流明確恢復證據保持；第80批同一隔離room iOS→Web→iOS實際往返，單次seq6／7、Web3未讀→read6、iOS1未讀→read7，雙方最後0；Web写入為本機DEV代理。第84批fresh84b原12 Android→Web→Android實際往返通過，各單次seq6／7、正常更新後收件匣及DB雙方read7／未讀0；初次84未讀1失敗保留。第85批原12 Android commit後503→冷重開GET原回執零重POST、Web未commit503→reload GET404零POST→明確同UUID／完整body重試皆通過，各只seq6／7一列、雙方正常更新後read7／未讀0；受控loopback，非正式故障。第97批同一原iOS12實際commit503→冷重開只GET原receipt200零重POST、Web未commit503→同tab reload只GET404→明確同UUID完整body重試、原iOS回讀reply及雙方read7／未讀0補齊；外部測試白名單首失敗保留與精確常數修正，不改APP／產品；六安全native圖與5Web圖保存，受控loopback非正式故障。其餘iOS衝突／大history與正式双端寫入仍待 | clientMessageId、單次發送、重連、不跨帳號洩漏 |
| 封鎖／解除／面交預約 | ChatScreen；chat/blocks、meetup | 正式577QA空面交詳情已核對；隔離雙方確認／改期／封鎖／取消／重開證據保留，完成有UI／HTTP測試；第74批commit502→reload→只GET原receipt、POST1、不誤同意新版本已驗證；第80批同一隔離room iOS提出原v1、Web實際同意、iOS再讀双方已確認，id／時間地點不變，單PROPOSE＋CONFIRM及兩回執核對。第84批fresh84b原12 Android提出原v1、Web正常同意、Android再讀双方已確認，id／全部terms保持且PROPOSE＋CONFIRM各一次。第85批訊息恢復後同原v1／全部terms正常雙方確認、PROPOSE與CONFIRM各一次；本批未注入面交故障。跨端面交衝突／恢復及正式双方面交異動待 | 雙方權限、提案／接受／取消／完成、狀態衝突；實際APP與後台沒有訊息檢舉操作，不能虛構此能力 |
| 保留既有Web朋友搜尋／追蹤／公開資料 | Social／public-profile／follow-operations；APP社交以ChatInbox為基準 | 第25／26批server privacy及原回執保留；第56批雙語原生日／photo failure-retry／公開與mask欄位、真取消commit502→reload及換帳號返回GET同回執／CAS清理、profile503恢復已Chrome本機驗證，原users逐欄不變；第108批正式630 friends search／profile null遮蔽／target948公開空清單與following只讀回讀及normalAPI核對，錯誤owner suffix400／anonymous401與同valid projection保持；9錯誤編號原handler失敗→15focused真HTTP通過，strict正32位ID已發布；原helper429保持，不稱原627formal alias已觀察，不代替follow異動／formal故障／native social／其他待項；第109批正式630 same QA928／synthetic948正常UI follow APPLIED1→同原receipt reload GET-only→unfollow APPLIED2→reload与已讀marker清理，normalAPI同UUID／hash核對、following0→1→0／version0→1→2、原history APPLIED1 currentfalse保持；兩單次POST及兩fresh reload無POST有實際trace；target public DTO不變與anonymous receipts401；舊cursor capture gaps及autoexpired未完phase保留，不當完整失聯寫入／限額／其他待項證明 | 原HTTPS照片provider／跨端及其餘正式站分支仍待；null不提供隱藏個資，calendar原值不依browser timezone換日 ；正式正常追蹤異動及原回執reload已由109補 |
| 願望清單與願望建立／編輯／刪除；AI標籤備註 | WishScreen／wishManagement及Prisma Item無editable tags欄；AI preview及notes行保留 | `/wishes` 共用原生契約；第35–39批真browser手動／網址／照片、名稱備註、參考價與獨立預算0/null、隱藏／完成、原clone回執／safe stop及來源刪除後distinct圖片核對。legacy list/privacy/delete有加密標記；舊API只讀目前值不冒稱歷史。第54批Dashboard／Detail雙語、未知原操作重開／只GET、分享stub及訪客權限真Chrome核對；AI tags由queue附notes並原值讀回，非獨立分類；第55批native-contract願望UI雙語／GET-only跨語言恢復／原decimal及dated fixed-rate estimate真Chrome核對；完整逐欄／永久刪除UI最終submit／跨端仍待；第104批新的正常正式辨識wish818／private list57，原iOS12 DEBUG read-only QA代理與正式compiled618正常session均實際讀同照片／完整notes／COMPLETED／TWD預算0與reference price null，native1/1及Web真1086×1448解碼通過；只清新IDs與Flickr not-found。QA原wrapper teardown exit1保留，獨立外部修正smoke0正式寫入，非原wrapper全pass或store binary／永久刪除UI證據；第106批正式621的既有照片編輯被AI圖片validator阻擋已修為624並部署，同筆五欄真Websave与原APP12只讀1/1成功，原照片bytes／AI欄位保持；只有此缺陷與列明跨端讀取，編輯名稱提示文字已由第107批對齊、不代替全部edit／hide／share／delete／未知恢復；第107批正式627必填名稱／唯讀圖片提示與aria-required對齊，繁中正式空白拒絕保留／成功保存回讀、繁中英文component通過；未取代其他edit／hide／share／delete／未知恢復 | 同帳號兩端與原許願者、私人／隱藏／容量權限、價格幣別；不增造不存在的APP分類 |
| 願望照片拍攝／上傳／AI queue／恢復 | WishScreen、wishPhoto* | 瀏覽器真實照片上傳／建立／失聯重開／狀態回讀、未使用照片移除回執與防重建已在隔離後台驗證；第101批既有QA帳號正式Flickr source與正常native-contract願望建立201、兩status讀PROCESSING→COMPLETED、synthetic檯燈名稱／notes依據／待確認、price null與零元TWD budget、原current receipt ID保持、精確本輪item／list／media清理与not-found通過；attached opaque照片仍依原APP disclosure可由已知URL查看，不稱owner-only。辨識worker身分有pilot routing／格式與兩installed source／running證據，未观察provider wire。本筆跨端／native／browser display仍待補；第104批新的正常正式辨識wish818／private list57，原iOS12 DEBUG read-only QA代理與正式compiled618正常session均實際讀同照片／完整notes／COMPLETED／TWD預算0與reference price null，native1/1及Web真1086×1448解碼通過；只清新IDs與Flickr not-found。QA原wrapper teardown exit1保留，獨立外部修正smoke0正式寫入，非原wrapper全pass或store binary／永久刪除UI證據 | 同照片正確識別、私密圖、價格說明不稱保證 |
| 帳號安全合併展開 | AccountSecurityScreen | 本機已實作 | 欄位標籤、預設收合、安全確認與busy gate |
| 修改密碼／撤銷所有裝置 | accountSecurity；users/me/password、sessions/revoke | 本機已實作 ；第116批既有Web19／原APP12 security30／真隔離HTTP19通過，另同636 real backend正常PUT password401→me200保持→正確PUT200→原兩次login JWT及舊personal key401／舊密碼400新密碼200／reset OTP key清空；browser只完成正常login和Settings展開，原window.confirm由工具無法處理而未送security request，wrong／success／lost ACK真UI仍待。原host因未完成recovered guard exit1保留，own cleanup與正式636正常read另驗 ；第120批647已補可存取確認dialog與正確登入結果導頁；真隔離wrong401、cancel／Escape零write、正常revoke200與commit503→已有密碼重新登入皆通過，原JWT撤銷及APIkey不變已核對。新密碼本人browser handoff仍待，不再把已完成revoke真UI列為未完成。| 錯誤密碼401保留登入、失聯不假稱成功／不自動重送 |
| 登出／帳號刪除 | AccountSecurityScreen、AccountDeletionScreen | 原刪除路徑保留；本機中英文影響／回執／cleanup與account/token departure fence、原GET404及ABANDONED真browser核對；加密deletion vault／新分頁immutable CAS／legacy round-trip與GET-only真browser核對；第53批真production-order HTTP修正Social全域驗證攔截，原JWT after-delete回執／retry／abandon及十個Social端點401已通過；mixed-version PWA／credential及permanent browser submit仍待驗 ；第121批補齊原APP12完整23類影響與明確重新盤點，exact v2 parser／取消舊帳號response／失敗保留未確認數字並封鎖刪除；Web1998、real impact HTTP8、isolated實際23全非零／503與額外count負值拒絕→各自明確GET恢復均通過；原永久submit與mixed-version等待項保持，已部署650且正式23類與明確刷新回讀通過，永久submit／mixed-version待項保持 | 影響預覽、密碼、原操作收據恢復；保留原頁路徑 |
| 贊助／尊榮／行銷加值與永久餘額 | AccountSecurityScreen；marketing/availability、users/me | 第111批正式630同QA928與原APP12 DEBUG真UI1/1：會員true／免費3已用0／永久0與三方案／原平台／不限期copy一致；Web真success→單一GET browserinspector失敗顯示餘額未知→明確Retry兩GET200恢復，原APP不改、profile前後不變，失敗attempt均保留；正式非會員／月用完runtime仍待，非正式後端outage驗收；第112批原APP12同928local-only受控marketingGET503→會員／餘額未知→離開後重新進入My，真正式兩GET200／原狀態恢復，native1/1。原host marketing429exit1与manager toolerror保存，獨立normalread200full-responsebytes保持與資源清理另驗；不稱原wrapper全部pass或formalbackendoutage ；第115批同隔離user5的原APP12真SDK兩case各1/1與同636 source Web DEV：非會員used0→三正常marketing POST202→used3／第四POST429，付款仍暫停；Web read故障顯示未知→明確Retry兩GET200恢復。不是正式非會員／production-build UI驗收；native MCP返回error，实际Node與Python各0、SDKpass及資源0分開記錄，不稱manager整體成功 | NT$90/月、US$1/10次、同後台、失敗不虛構0 |
| 付款暫停／原平台管理訂閱 | APP目前未開通驗單 | 第111批正式630與原APP12同928真UI／同後台paidPurchasesAvailable false，原平台管理／購買與訂閱暫停／無收款與永久次數說明核對；Web受控權益read故障不虛構零次或付款可用、Retry成功；沒有付款或商店驗單、正式native非會員分支仍待；第112批原APP12受控讀取故障／重進恢復中付款持續暫停，membership／balance未知與恢復正確；原整體收尾錯誤保存，不假稱付款驗單或全部wrapperpass ；第115批同隔離user5的原APP12真SDK兩case各1/1與同636 source Web DEV：非會員used0→三正常marketing POST202→used3／第四POST429，付款仍暫停；Web read故障顯示未知→明確Retry兩GET200恢復。不是正式非會員／production-build UI驗收；native MCP返回error，实际Node與Python各0、SDKpass及資源0分開記錄，不稱manager整體成功 | 不出現可付款假按鈕、既有會員不推算付費行銷權益 |
| Weesh 改版／帳號與資料說明 | App.tsx、ProductNoticeScreen／productNotice；非條款確認 | 第61批登入／註冊可重開雙語說明、明確三欄 service metadata／寫入讀回、failure／visit-only與跨頁記住真 IAB 核對；0產品 API，APP不改。Web以可收合提示替代安裝 gate，原auth表單仍可用 ；第117批既有Web說明4／原APP12說明14測試通過；fresh正式最新已是外部合併128的639，provider SUCCESS與exact merge三CI、entry與六lazy JS及五SPA／health200，notice與原auth四source bytes對636不變。真settings已載入，但自有QA識別未確認，所以未登出或記住說明，正式notice跨頁／reload操作仍未驗，不把資源200當UI成功 ；第119批正式641→642的guest notice實際記住、正常reload、login/register跨頁保留、手動重新展開與再次reload通過，原登入2／註冊6欄空表單及44px正常；642同HEAD說明四測試成功，storage failure／visit-only只有元件證據，真browser仍待。原聯絡field false比對經唯讀診斷有遮蔽字樣，不證明不同帳號或正式browser928；只normalAPI928前後profile不變，無正式個資／安全寫入| 既有Wishlist帳號／願望不重建；不冒稱已匯入Weesh、不接受條款；正式正常記住／重開已驗，真browser storage failure／visit-only待驗 |
| 登入／註冊／驗證／密碼恢復／session恢復 | App與AuthScreen | 本機原子session、損壞／跨帳號／分頁隔離與登入返回保留；登入補fresh profile身分核對，註冊／確認密碼／選填生日及嚴格ACK、新resend入口／中性寄信、手動web／weesh／64位碼／明確驗證、不自動切換帳號、晚到／未知回覆安全处理已測試；真Chrome驗證另一帳號成功與commit後502、原帳號1讀回、resend429→200及失效APP碼400。第81批真登入成功但完整方法失敗保留；第84批fresh84b原12 static Android正常登入200／profile200 buyer1、五tab／探索／聊天／面交完整成功及原APP source／binary保持；第85批同原12正常登入與三phase訊息失敗／冷重開恢復成功，非mail驗收。新密碼與註冊實際瀏覽器完整憑證輸入、真mail收取、跨端／正式端仍待完整驗收 | 登入後回原功能、失效、切帳號清理；不以使用過的token或中性寄信ACK冒充原歷史結果／信已送達 |
| 政策／客服／通知／社交朋友 | APP policies + 網頁增額功能 | 通知已本機接上版本化偏好／失聯GET恢復／跨頁衝突，寄送與推播未開通明示；社交隱私、追蹤持久原操作／原子額度與公開個人頁恢復已本機驗證。Support／Feedback繁中英文、原回饋加密journal與minimal owner/hash receipt、真commit502→reload只GET及policy返回已本機驗證；第53批生日六欄privacy／UTC calendar及Home語系真HTTP／Chrome已核對；第54批friend legacy WishlistDashboard英文搜尋排序與訪客清單核對；真mail、其他社交流程／feature／正式端仍待回歸 ；第122批補通知完整中英說明與原操作查核／重試／取消提示；653 Web2004／real profile HTTP12及真DEV七snapshot成功／ACK503重開GET-only／CONFLICT／read503明確GET恢復通過，正式回讀待補。| 連結與表單可用、不刪既有功能；不可把偏好保存當寄送已開通或目前追蹤狀態當歷史回執 |
| 既有Web供給合作意向 | APP無合作表單；partnerInquiryRoutes／submissionReceipt | 原Web保留；後台minimal ID/hash receipt及HTTP15；前端public加密原表單／strict ACK／明確原retry／cleanup-only／繁中English與真commit502→reload GET-only已本機驗證；第48批landing中英文／安全locale讀取／原form入口真browser已核對 | encrypted原表單、strict ACK、reload GET-only、語系／browser及admin权限不變 |
| 共用頁首／頁尾導覽与操作尺寸 | WebNavigation；保留Web六個footer路由及回饋 | 第41／48／77批原證據保留；第85批正式593与第92批正式612各90歷史保持，第96批最新完整正式615Home與Settings各自人工90分，736×952 DOM／721×933原圖及真scroll284／232下半部核對；六導航44×48、唯一Settings。390×844 DOM／375×812原圖的Home上下／Settings上半部root375；Home14矩形均在收合wish strip，Settings原一DIV疑點未判根因，不冒稱全descendant零溢出。錯名scroll0下半圖排除；第96批615上下原圖、手機安全／聯絡／進階／手動日曆／辨識說明／探索篩選展开与Chat實測補齊；早期Settings DIV原因未診斷，整站響應式與效能仍待；第105批正式618的320語言標題擠成兩行已修為621並部署，正式320／390／1280單行與手機44px、320／390安全／聯絡／進階真UI展開無橫向溢出；唯一Settings與正式探索／聊天入口正常。早期未知DIV原因未追認、非全站或新全頁90分、未做個資／APIkey／OS等其他待項；第110批最新完整正式630Home與Settings各自fresh人工90／100，以原核准板與736×952 DOM／721×933原JPEG top和實際bottom核對，Home1236／Settings1184實際額外結構與空白扣分，初Home載入圖排除；390兩頁上／下root375、singleSettings及六48px導航，閉合狀態限定，不稱手機90／全站；Explore與Chat正式導覽真click／1280reset、selectedprofile正常GET前後不變；4檔61測試，無產品source或新部署 | 不刪原路由／功能、手機無水平溢出、Home與Settings各≥90正式驗收 |
| 既有管理郵件診斷 | Web獨有保留工具；APP無此功能 | 第49批live JWT／server allowlist＋enable旗標、固定原郵件、bounded acceptance、加密unknown marker及CAS cleanup；15真HTTP及三owner真Chrome已核對，無真mail | 缺配置預設不可寄；正式管理者ID需核對；capability不是historical proof、limits為process-local、ACCEPTED不是inbox delivery |
| 既有帳號交易與送禮認領紀錄 | Web既有功能；APP沒有此頁 | 第50批actual HTTP11／Web23與Chrome populated／empty／single-read503→retry／guest；105筆完整、private current claim minimal reminder、原amount／0／refund／status、雙語mobile／desktop及single44px Settings entry核對 | Current claims不是付款／送達或durable history；對方私人／隱藏立即依新讀取遮蔽；正式端待驗 |
| 語言／個資／生日／PWA／API指令／交易紀錄 | 網頁獨有既有功能 | 保留；本機生日清空、信箱草稿、版本化保存及失聯回執已實測；大頭照未知回應已本機加密提醒／只讀目前值／明確清理實測（舊API無原操作回執）；交易／送禮已第50批實際回歸；API copy／key lifecycle與雙語文件已第51批實際回歸；第52批真built worker upgrade淘汰legacy private image cache，保留加密marker／unsent文字，公開docs／image offline可讀且private新請求不可讀；第87批根層安裝機會跨頁保留、取消／失敗／逾時可用替代與pending語言保護已自動／受控真browser核對，正式596→601正常更新及桌面／手機手動安裝說明已核對；第88批真192／512與Safari180PNG、主題／manifest／precache gate已發布604，本機與正式browser成功解碼、根安裝identity未變、601→604正常更新核對；真OS安裝、mixed-version CAS／credential仍待；第105批正式618的320語言標題擠成兩行已修為621並部署，正式320／390／1280單行與手機44px、320／390安全／聯絡／進階真UI展開無橫向溢出；唯一Settings與正式探索／聊天入口正常。早期未知DIV原因未追認、非全站或新全頁90分、未做個資／APIkey／OS等其他待項 | autosave真實回執、隱私切換；個人指令含金鑰僅明確複製／手動顯示，不寫入持久journal／log／artifact；已解碼圖片不聲稱立即撤回 |

## 平台替代策略

- 拍照使用瀏覽器相機／檔案輸入，批次上傳提供連續加入；不宣稱所有桌機具備相機。
- 地圖位置使用瀏覽器定位，拒絕時保留手動區域搜尋。分享使用 Web Share API，無支援時複製商品連結。
- 網頁不得呼叫 Apple／Google 原生付款。当前 APP 付款與驗單未開放，三端均如實顯示暫停；會員旗標不等於已驗證付費行銷額度。
- Web與APP共用相同後台資料，不導入另一份商品或願望資料庫。每個 private API 都綁定當下帳號並防止切帳號後舊回應污染。

## 完成門檻

1. 上表待實作／待比對全數完成，寫明具體測試及正式端證據；不可只以元件存在當作通過。
2. 各功能覆蓋成功、拒絕、失敗、未知回執、恢復與切帳號；無破壞性測試針對 Hank 真實帳號執行。
3. client／server／mobile 現有回歸與新增測試、build通過；CI全部必要檢查通過後才合併。
4. 本機瀏覽器桌機／窄屏驗證，再部署現有 Railway；回讀相同正式站功能與資料確認。
5. 審查所有入口、欄位標題、單位、空／錯誤狀態、鍵盤操作、照片隱私、付款措辭；完整交付結果與未達項目，不誤稱100%。
6. 網頁首頁與設定頁逐頁依最新核准基準完成有證據的至少90%視覺審查；APP風格不變，重複設定入口不得出現。

## 2026-09-30 本機驗收紀錄（尚未部署）

- 安全合併元件、舊 change-password 路徑復用、同後台永久額度、商品管理、版本化分享、草稿／刊登商品共用行銷助手，均已進入本工作分支。
- 測試帳號以本機Vite頁面連接正式後台登入，確認真實尊榮會員狀態、永久餘額與月額度狀態，未執行付款、密碼更改、帳號／商品刪除或任何真實商品變更。
- 「我的商品」正確讀取三件在售商品及實拍縮圖：來自北極的禮物、存回去賺更多、漫畫版三國演義；編輯框名稱、說明、NT$單位、額外選項／Beta入口可見。未按生成／儲存／狀態變更。
- 390×844瀏覽器窄屏讀取：商品卡片無水平溢出（documentElement.scrollWidth未超過innerWidth）。這只證明本頁，不代表其他頁面已完成響應式驗收。
- 已通過 client 全套24個測試檔／140項測試與production build（最新完整回歸）；包含同APP商品資料契約、owner隔離、安全未知回執、管理衝突、分享、行銷雙重送出與拖放／鍵盤排序。這不是100%分支或功能覆蓋率聲明。
- 預留下一階段：行銷任務未知回執的可恢復識別、真正四圖queue／單次免費修改、商品完整DB狀態遷移、首頁匹配、探索地圖、聊天／面交、願望照片與資料共用、全部頁面的UX與正式部署驗收。

## 2026-09-30 第二批本機验收（仍未部署）

- `/explore` 已加入路由及桌面／手機導航。首頁保留節日與好友生日，同時把願望匹配放在上方；好友生日也加上當前session隔離與讀取失敗提示。
- 原生listingSearch、wishData、externalListingSearch、exploreMapView資料契約及測試移植至網頁，保留同範圍、TWD、expired排除、原因／分數、外部來源授權／新鮮度和私有欄位投影規則。
- 首頁完整讀取願望與每個願望的所有匹配分頁，最多3個願望同時查詢。後頁更高分能取代前頁，部分失敗明確顯示不完整；未讀完不假稱已完成，自己商品只在地圖預覽。
- 真實帳號唯讀驗證：漫畫願望有3件已保留的QA測試賣家商品；展開顯示中山、新莊、板橋縮圖及價格。地圖比對有4件，包含本人原來刊登的漫畫，清楚標示自有預覽。未新增／更改任何真實商品或測試刊登資料。
- 地圖採同APP的OpenFreeMap繁中Liberty底圖與公開粗略位置。单件zoom13，多件框選；地圖移動不會自動重新查詢，只有搜尋／套用／擴大範圍才提交。群聚展開上限19，仍重疊則查看實際群聚的最多500個葉節點；每來源最多載入500件，未載入的結果明示。
- 實際瀏覽器发现並修復MapLibre v6 worker載入與元件重建時的資料來源生命周期問題。worker由Vite自包含打包；地圖故障時可用列表，不讓地圖錯誤造成整站白畫面。
- 站內縮圖不傳token給底圖或照片提供者；外部縮圖使用可鍵盤點選的HTML圖片標記，避免要求外站CORS／汙染canvas，並在設定無referrer後才指定圖片URL。外部商品依來源標示價格／行政區中心，詳情會重新核對，再提供原網站連結，不冒充站內賣家。
- PWA新的圖片快取路由只允許本站靜態插圖／圖示，不快取商品／個人照片。尚須整體驗證既有PWA升級、帳號切換與舊快取的清理行為，不能據此宣稱既有裝置的資料已清除。
- 390×844瀏覽器：四件商品照片全部讀取成功，documentWidth375 <= viewport390；商品詳情的NT$、品牌、交付方式與台灣失效時間已唯讀核對。這不是全站所有頁面的響應式驗收。
- 本機網頁全套33個測試檔／330項測試通過；production build通過。地圖分包與worker輸出已驗證，仍有大於500KB分包的效能提示，後續需評估。第二批commit `b496418` 的CI run `36720548931`：client／server／native全部成功（含隔離PostgreSQL的HTTP／DB測試），仍未合併／部署。
- 驗收圖片保存於工作輸出目錄：`wishlist-web-parity-explore-20260930.jpg`、`wishlist-web-parity-product-detail-20260930.jpg`。
- 待完成：商品檢舉／聊天／面交、願望建立與照片queue恢復、行銷queue未知回執、管理狀態的隔離DB操作驗證、共用auth恢復／個資autosave真實回執、原有社交／通知／政策回歸，最後才合併並部署正式站。

## 2026-09-30 第三批：檢舉與私密操作恢復（仍未部署）

- 探索商品詳情新增「檢舉此商品」；自己的商品改為管理入口，外部來源不冒用站內檢舉。檢舉畫面取代詳情對話框，不嵌套焦點圈。設定新增 `/reports` 本人紀錄入口；登入返回路徑採明確白名單。
- 與APP共用檢舉原因、嚴格資料投影、狀態／分頁／原回執及最小操作回執契約。未取得回執不能顯示成功；404／401／斷線不代表取消。重開只GET查核，只有使用者明確重試才POST原識別碼／原內容；原待確認檢舉未解決時不能另建。
- 安全放棄需要第二步確認，只傳原內容SHA-256，不重送證據；伺服器若已收件，畫面不假稱撤回或下架。已確認的結果不因本機標記清理失敗被降級成未知，仍保留查核入口。
- IndexedDB儲存採AES-GCM與非匯出的CryptoKey，證據不使用明文localStorage。API＋帳號＋功能隔離；原子CAS防止其他分頁覆蓋待確認操作，以及舊回執誤清新操作。儲存不可用／損壞時阻止HTTP送出，不能靜默降級。
- 此加密是同源瀏覽器保護，不是硬體鑰匙圈，也不防同源XSS或使用者清除網站資料。尚需最終跨瀏覽器／PWA升級整體驗收，不能宣稱所有環境均已完成。
- 帳號刪除只有在後台ERASED回執確認後才清理原帳號私密待確認資料；刪除scope保留寫入柵欄，晚到操作不能重新保存。若本機清理失敗，保留刪除回執、提供重試、不假稱帳號刪除失敗，也不自動重新DELETE。登出或一般取消不清除未知操作。
- 已移植APP聊天／面交資料契約與116項邊界測試，涵蓋參與者／封存、訊息排序／合併、預約版本／同意與放棄回執。這是後續介面的基礎，不代表聊天或面交UI已交付。
- 本機真實帳號唯讀確認設定／本人檢舉紀錄與測試賣家商品的檢舉表單；不送出檢舉、封鎖、聊天訊息或面交預約，不修改現有QA刊登。
- 本批全套39個測試檔／540項測試及production build通過。私密儲存16項、檢舉UI7項、檢舉資料／操作回執合計68項；加上帳號刪除清理與探索入口回歸。這是測試件數，不是100%分支或功能覆蓋率。
- 實際390×844窄屏表單可正常選擇原因，補充說明及送出按鈕具有標籤，只有一個對話框，documentWidth390 <= viewport390；未提交。驗收圖片：`wishlist-web-parity-report-20260930.png`，尺寸核對後已恢復正常桌面顯示。
- 本批code commit `4c7b7d8` 的CI run `36725200229` 已回讀client／server／native全部成功（server包含隔離HTTP／DB測試）。公開商品頁檢舉／聊天入口、聊天／面交畫面及上列其他缺口仍待補齊。全部驗收前不合併、不部署、不標示100%。

## 2026-10-01 第四批：商品聊天與面交（仍未部署）

- 新增 `/chat` 收件匣、商品聊天室及面交畫面，桌機／手機導航与設定入口對齊APP；好友／原有社交功能保留。公開商品重新讀取狀態、價格及照片，無登入返回該商品；本人商品只進管理，外部來源不冒充站內賣家。
- 發送訊息先保存原識別碼／原內容到帳號及API隔離的加密IndexedDB。重開僅讀取訊息／原回執；只有明確重試才送相同內容。切帳號或離頁後晚到的保存／回應不再觸發發送、不污染新帳號。已確認回執不因本機清理失敗被降級。
- 聊天歷史50則分頁、收件匣25筆分頁、可見且停留後才標記已讀；頁面隱藏或面交對話框開啟時不把未見訊息標為已讀。封存／封鎖保留可讀歷史但禁止新訊息；封鎖回應未知時只能先GET確認，不能自動重送或反向解除。
- 面交採台灣時間、版本化提案／改期／同意／取消／完成，雙方確認与完成各自記錄。條件改版需重新同意；尚未到面交時間不出現完成按鈕。原待確認操作凍結其他變更；未知提案不宣稱「邀約尚未成立」。
- 使用現有Homebrew PostgreSQL 15建立獨立loopback測試叢集與UTF8測試資料庫；29份遷移部署，明確相同的DATABASE_URL／TEST_DATABASE_URL通過防呆。真實編譯後的chat路由、Prisma与登入／公開商品處理器搭配 `.invalid` 合成買賣家，未連正式DB／Flickr／AI或寄信。
- 真實隔離PostgreSQL上的chat與meetup HTTP整合共38項通過。另新增loopback瀏覽器驗收工具，其4項安全測試證明缺少／錯誤／不同測試DB設定時在啟動前拒絕；工具不含正式凭證，照片明確為合成替代圖，不能當作Flickr驗收證據。
- 實際瀏覽器驗證兩方傳訊、面交改為第2版后重新取得雙方同意、封鎖／解除及取消。另以「後台提交後回傳502」驗證未知回應：訊息由GET歷史確認，未自動重送；面交重新載入仍保留原操作且POST次數維持1，明確重試後POST次數2但仍同一筆第1版預約，沒有重複提交結果。
- 分頁資料在隔離DB直接建立120則合成訊息，加上原先1則實際HTTP訊息。瀏覽器實際讀取50→100→121則，序號1至121完整、嚴格遞增且不重複，最後移除較早訊息按鈕。這是實際GET分頁驗收，不冒稱121次HTTP發送測試。
- 390×844窄屏聊天：documentWidth375 <= viewport390，私密商品縮圖64×64實際載入；面交畫面只有1個對話框。保存最新 `wishlist-web-parity-chat-pagination-20261001.png` 與雙方確認／待確認恢復畫面；暫時viewport已還原。
- 本批本機完整回歸45個檔案／641項與production build再次通過。code commit `91ac17f` 的CI run `36792391506`已回讀client／server／native三道檢查全部成功；641是測試件數，非100%程式／功能覆蓋率。全部驗收前不合併、不部署。
- 仍待完成：願望建立與照片queue恢復、批次刊登完整流程、行銷4圖／免費修改及未知回執、管理狀態隔離DB操作、共用登入session恢復／個資autosave真實回執、原有社交／通知／政策、PWA舊私密快取清理與全站響應式／效能、最後CI与正式Railway回讀。

## 2026-10-01 第五批：共用登入資料恢復（仍未部署）

- 修復原AuthProvider直接JSON.parse造成壞資料白畫面，以及旧帳號／旧請求回應覆盖新帳號、登出後復活、同帳號讀取先後顛倒等問題。每次登入／登出／跨分頁切換使旧請求失效，回應及JSON解析後都重新核對scope，離頁後不寫回。
- 登入資料改為單筆versioned記錄、API scope及最小身份欄位；舊token／user只在尚無新記錄時讀取，相同身份GET確認後遷移。新記錄壞掉或API不同時不回退到舊資料。登出保存明確空session，即使旧鍵清理失敗也不能重新登入旧帳號。這沿用瀏覽器bearer儲存，並非硬體鑰匙圈，也不宣稱可防同源XSS。
- 登入新記錄保存失敗不假稱成功；已取得的最新帳號資料若快取失敗可在本頁使用，但明示重開後需要再核對。斷線／500不是401：保留上次身份並顯示未確認狀態；真正401／帳號404及身份不吻合則清除當前session，保留加密待確認操作。
- 登入失效可返回驗證過的商品／聊天室／願望清單與原有安全頁面，不接受外站、重複查詢、雜湊或路徑穿越。Login同步busy gate阻止連點，離頁時取消请求且晚到登入結果不再生效；既有支付元件改用同一當下AuthContext，不讀已淘汰的legacy token鍵，沒有開通支付。
- 自動化包含真实Provider、StrictMode replay、跨分頁事件、API scope、損壞與儲存失敗、200／401晚到、解析後晚到、登出不清待確認操作、回頁及重複登入。這是模擬HTTP／儲存事件的自動化，跨分頁尚未宣稱多瀏覽器實測。
- 實際loopback瀏覽器驗證：舊紀錄遷移後聊天仍讀取；登出再重新載入沒有復活；重新用另一合成賣家登入、打開正確買家收件匣、再重開仍為賣家視角，聊天室可輸入。窄屏documentWidth390 = viewport390；圖片 `wishlist-web-parity-auth-inbox-20261001.png`。正式帳號／DB未改動。
- 本機最新47個測試檔／691項及production build完整通過。code commit `cb68b68` 的CI run `36793670547`已回讀client／server／native全部成功（包含真實隔離DB整合）；仍不等於100%功能或分支覆蓋率，不合併／部署。
- 願望清單在隔離後台未暴露該路由時會把讀取失敗顯示成0份，且空狀態顯示兩個未翻譯鍵；已記為願望模組回歸必修，不能把本次聊天驗收當作清單驗收。個資autosave仍未取得真實保存回執，其他上列缺口與最終正式驗收繼續保留。

## 2026-10-01 第六批：願望資料與照片恢復基礎（部分驗收，仍未部署）

- 新增 `/wishes`，使用 APP 相同 `/native-wishes` 與願望資料契約，不新增資料庫。手機／桌機導航及設定新增入口；原 `/dashboard` 清單分享、送禮、社交及 `/wishlists/:id` 標籤保留，不宣稱舊流程已全部驗收。
- 清單預設私人，清單25筆／願望50筆分頁、已載入搜尋排序、編輯／隱藏／完成／刪除、最高預算幣別、AI參考價格與狀態，以及附近商品匹配入口已實作。新畫面不把讀取失敗描述成空清單；舊 dashboard 的同類問題仍待修復。
- 相簿／相機為清楚標示的快捷選用，可留空名稱交給AI；照片與HTTPS圖片網址擇一，保存後才進入AI排隊。共用 listing-media 上傳與後台去除位置資訊、產生縮圖；未使用舊 `/ai/analyze-image`。照片仍有公開不透明網址限制，已提示勿上傳個資，不冒称端到端私密儲存。
- 建立前保存原clientRequestId／原JSON內容到加密、帳號與API隔離的恢復標記。新增只讀建立回執GET：重新開頁不POST，僅明確重試才使用原內容。回執區分未知與已建立後刪除，後者不重新建立替代資料；已確認建立但本機清理失敗只重試清理。
- 照片標記只保存clientUploadId與準備後檔案SHA-256，沒有在瀏覽器資料庫另存照片副本。上傳失聯只查原照片GET；換不同檔案／409衝突、無法安全保存、帳號離頁時不盲目重送或採用他人照片。不同分頁的建立ACK不能清掉無關照片標記。
- 真實隔離PostgreSQL與實際native-wish路由22項HTTP／DB整合通過：回執所有權、無token／其他帳號拒絕、UUID大小寫、當前AI欄位、明確刪除墓碑、並行12次只建立1筆、容量限制、同識別码內容／父清單衝突、分頁及使用者刪除等。AI完成欄位由合成fixture更新，並非實際MiniMax識別準確度證據；圖片網址排隊測試也不等於模型已辨識照片。
- 網頁照片／建立／頁面／登入返回／加密儲存測試包含失聯、同內容重試、損壞紀錄、原子清理、已確認不降級、離頁與無關照片保護；此次是自動化操作與模擬上傳ACK，尚未進行真實瀏覽器拍照到模型完成的驗收。測試件數不等於功能或分支覆蓋率。
- 待解決：本機HTTP圖片與原生契約HTTPS要求的安全測試環境安排、照片移除失聯／重開的明確回執、真實瀏覽器相機／上傳／跨端資料回讀、舊願望頁錯誤及分類回歸。其餘刊登、行銷4圖／免費修改、商品管理真實寫入、profile保存、註冊／驗證／重設、社交／政策／PWA及正式部署缺口仍保留。
- 先前doc commit `a445948` 的CI run `36793933926`已回讀三道檢查全成功。本批code commit `a28180a` 的CI run `36796276817`已回讀成功；本機client50個檔案／768項完整回歸及production build成功，server49個檔案／854項單元回歸及build成功，原生願望HTTP／DB22項成功。後續改動需另行CI回讀，不沿用此批成功。

## 2026-10-01 第七批：實際願望照片／失聯恢復與舊清單回歸（仍未部署）

- 擴充既有隔離smoke工具，使用真正已編譯native-wish／listing-media／legacy清單路由及Prisma。啟動先拒絕不明／非測試DB，強制loopback API、本機私有照片臨時目錄，不使用正式volume、Flickr或啟動外部AI worker；防呆4項再次通過。測試不取用或寫入正式帳號。
- Chrome實際選擇 `mobile/qa-fixtures/synthetic-used-orange-desk-lamp.png` 上傳，後台Sharp編碼成1086×1448、64,974bytes的WebP與縮圖。故意於上傳提交成功後回傳502：網頁GET查回原照片、照片可顯示。重新載入再開表單仍為同一個upload ID；沒有自動重傳。
- 同照片留空名稱、最高預算TWD100，保存願望後再故意提交成功回502。原建立凍結替代操作，重新開頁只GET回執，正確恢復照片與PENDING願望。測試後台回讀確認photo POST1次、wish POST1次、各1筆資料且wishItemId正確關聯；重開沒有新增POST或第二張照片。
- 只為測試状态呈現，以隔離fixture將該原願望更新成COMPLETED，名稱與備註明確寫「非AI辨識結果」。可見頁面poll讀到完成、TWD59參考價格、原TWD100預算及相同照片；這不是MiniMax已辨識、判斷正確率或正式Flickr傳輸的證據。未聲稱模型驗收完成。
- 在390×844瀏覽器驗證照片實際naturalWidth1086、documentWidth375 <= viewport390。保存 `wishlist-web-parity-wish-photo-recovered-20261001.jpg`。返回原清單頁仍見同清單1個願望；原建立表單實際建立另1份私人合成清單，使用native-wish原識別碼機制並有後台確認。
- 修復 legacy `/dashboard` 讀取失敗誤報0／空清單、重複空畫面及未翻譯鍵；嚴格最小清單投影與件數、同帳號最新讀取序號、切帳號／StrictMode生命週期隔離、30秒超時與no-store。訪客空清單不顯示建立按鈕，欄位／排序／相片入口／隱私按鈕具清楚標籤，清單名稱能鍵盤導航，隱私按鈕不觸發整張卡片導航。
- 舊建立表單也預設私人，使用與 `/wishes` 相同加密journal與native POST。連點只送一次，帳號離開後保存完成不再POST；原建立或損壞／不可讀標記阻止替代新建立並提供原回執查核入口。保存及清理失敗不虛構成功或靜默丟棄原識別碼。舊隱私／刪除操作的完整失聯驗收仍待補，不把建立回歸當作所有legacy操作完成。
- 在測試後台已明確停止後，Chrome真正重新載入舊清單：顯示「清單讀取失敗，不代表沒有願望」與件數「尚未確認」，沒有「還沒有願望清單」。保存 `wishlist-web-parity-wishlist-read-error-20261001.jpg`；已還原viewport、關閉驗收tab並停止Vite／後台／隔離DB。保留小量合成資料與臨時照片，未刪除使用者照片。
- DEV-only本機圖片轉接只允許當前loopback API精確UUID `/image` 路徑，拒絕外站／其他埠／帳密／query／hash／thumbnail；production仍沿用native HTTPS-only驗證。此安排讓真實本機照片驗收可進行，不放寬正式端安全規則。
- 最新client51個測試檔／781項全套與production build通過；新增舊清單12項、DEV圖片契約及既有所有願望／照片／聊天／auth回歸。server build與隔離smoke防呆通過；本批CI尚待提交後回讀，測試件數不是覆蓋率百分比。
- 全目標仍未達：實際MiniMax照片識別、照片移除失聯回執、分類／舊detail與私密連結回歸、完整sell與行銷4圖／免費修改／未知回執、owner真實狀態遷移、profile保存回執、註冊驗證重設、社交通知政策、PWA舊快取、全站響應式／效能，以及最後CI／合併／Railway部署與正式回讀。不得以本批通過代替全功能100%。

## 2026-10-01 第八批：未使用願望照片的持久移除回執（仍未部署）

- 專用 `/native-wishes/photo-removals/:clientUploadId` 以原上傳ID作為移除識別碼；GET只查核、POST明確移除，綁定當下owner與精確media ID。持久墓碑不依附已刪除的照片資料列；未知404不等於移除成功。回執只投影ID、移除時間與實體檔案是否待清理，no-store，不輸出Flickr/provider憑證。
- User gate、照片鎖、刪除資料列、清理outbox與回執在同一交易中。12個並行重試只有1份原回執與1個清理任務。不同media ID、別人照片、已附願望、批次草稿、seller edits、AI任務與行銷來源／輸出照片不得以此入口移除；使用者刪除時回執cascade，身份無關的清理任務保留。
- 上傳在provider寫入前及資料庫commit前檢查墓碑。大小寫UUID變體及已進入provider寫入的晚到上傳，均不可重建原照片；晚到新檔案回滾只清理其獨有UUID目錄。回執寫入失敗會完整回滾照片移除與outbox，不留下假成功。
- 網頁先保存加密、API／帳號隔離的原移除journal，再POST。移除有二次確認及取消；重開只GET，新上傳／建立凍結至取得有效原回執。已確認但本機標記清理失敗只重試清理；另一分頁的新照片journal不被舊回執丟棄。移除待確認時不顯示已失效的照片預覽，也不沿用上一個操作的成功提示。
- 合成帳號227的Chrome實際選照上傳1次。為避免UI永久刪資料的確認限制，瀏覽器的移除請求由隔離工具在進入handler前固定503拒絕，後台照片仍存在；二次確認／取消、原journal保存、重开未知回執與停用新建立均實際驗證。不是一次成功刪除的UI證據。
- 然後以獨立測試API對同一合成原照片真正提交移除，刻意在commit後回502；Chrome重開只GET，清理原journal並恢復新增與相機／相簿入口。後台回讀：photo POST共1次，removal POST共2次（第1次無寫入拒絕，第2次真實commit後丟失ACK），只有1份原回執、0份照片資料列，沒有自動重送。
- 回執實體清理當時為pending，網頁如實顯示；之後用ListingMediaStorage精確移除該合成UUID的image／thumbnail並清理其outbox，原路徑不存在，authenticated GET同一回執為cleanupPending=false。這是隔離本機儲存驗收，非Flickr實體刪除或正式worker運行證據。其他使用者照片未改動。
- 窄屏390×844：待確認清單documentWidth375 <=390；恢復後新增願望dialog documentWidth390 =390，相機與相簿enabled且無舊照片。保存 `wishlist-web-parity-photo-removal-pending-20261001.jpg`、`wishlist-web-parity-photo-removal-recovered-20261001.jpg`、`wishlist-web-parity-photo-removal-ready-20261001.jpg`，viewport已還原、tab與隔離HTTP／Vite已關閉。
- 前端最新本機52個測試檔／797項及production build通過；後台49個單元檔／854項、build通過。新增照片移除17項真實HTTP／DB／本機檔案整合；包含整體願望與媒體／帳號刪除的70項回歸通過。
- 全套整合第一次在保留瀏覽器fixture的舊隔離DB因4件既存合成商品而失敗10項；未清掉保留資料或修改測試預期。另建明確loopback全新UTF8測試DB，完整30份migration後，18個檔案／284項HTTP／DB整合全通過。最新小幅前端整理與CI仍需重新完整回讀，不沿用前批CI成功；PR保持draft，未合併／部署。
- 全目標仍保留：真正MiniMax照片識別／跨端、分類／舊detail／隱私分享與刪除回歸、完整sell／失效日期／批次恢復、行銷4圖／免費修改／未知回執、owner狀態實際網頁操作、profile保存、註冊驗證重設、社交通知政策、PWA舊快取、全站響應式／效能、最後CI／合併／Railway正式回讀。不以本批回執恢復代替所有功能對齊。

## 2026-10-01 第九批：核准網頁風格基礎與90%驗收門檻（仍未部署）

- 依 Hank 核准的原站風格概念板整理首頁與設定，並將網頁視覺門檻由99%改為至少90%。APP原生程式與商店素材未改；完整功能對齊目標及未完成項目沒有取消。首頁、設定須各自完成上列加權評分，目前尚未評分，不宣稱已達90%。
- 頂部採單一共用帶文字導航：首頁、禮物、探索、聊天、朋友、設定。移除重複導航與原生式網頁底部列；桌面與390×844手機瀏覽器皆只有1個設定連結及1個頂部齒輪。
- 首頁保留原站深灰按鈕、粉／藍提醒；願望匹配改為大縮圖卡片，每願望先顯示最匹配1件，多件以縮圖堆疊按鈕展開。快捷功能明示選用；搜尋會實際提交到探索，不只是裝飾；小地圖用已讀取的去重商品及公開粗略座標，30秒失效檢查不重置地圖視角。
- 設定改為語言、我的功能、大頭照與暱稱、通知、安全收合、隱私、權益、進階收合。原有好友送禮、檢舉、AI/API、交易紀錄、PWA與管理功能仍保留。付款暫停與永久餘額維持真實後台狀態，不套用概念板的10次示例。
- 修復暱稱失焦立即假顯示已儲存：只有實際PUT回執後出現保存訊息；斷線顯示結果未確認。隔離買家經瀏覽器保存暱稱、重新載入後讀回同值。這不等於個資autosave完整完成：並行整包回應、生日清空、email草稿、嚴格驗證、未知回執恢復與全欄位帳號隔離仍待修復／驗收。
- 隔離loopback後台透過真实編譯handlers與本機PostgreSQL提供3個合成願望／4件合成商品，實拍替代圖取自repo合成fixtures，再由Sharp和實際照片儲存器處理。Chrome展開3件吻合、搜尋藍色杯得到1件TWD60商品並打開最新詳情；未修改正式帳號／商品，未呼叫Flickr或AI，不把測試fixture稱為模型辨識成果。
- 桌面1280×1500與手機390×844的首頁／設定皆無橫向溢出、商品縮圖真實載入；安全展開、進階原入口可見，未執行付款、API憑證操作、密碼／帳號／商品刪除。手機搜尋与詳情實際可操作；暫時viewport及驗收分頁已還原／關閉。
- 實際畫面存於原工作輸出目錄：`wishlist-web-style-home-desktop-20261001.jpg`、`wishlist-web-style-settings-desktop-20261001.jpg`、`wishlist-web-style-home-mobile-20261001.jpg`、`wishlist-web-style-settings-mobile-20261001.jpg`。桌面截圖未與概念板調成同畫布，因此不作90%得分證據；這是本機功能／排版證據，非正式網站已部署。
- 最新前端53檔／803項全套及production build通過；後台build及隔離smoke防呆4項通過。仍有大於500KB分包效能警告；首頁舊節日資料採近似固定日期，須另以可靠來源修復與驗證，不能把示例節日日期當真實證據。code commit `b82cfef` 的CI run `36810449497`已回讀client／server／native全部成功；後續新改動另行驗證。
- 所有前批完整功能缺口、逐頁90%視覺審查、效能／響應式、最終CI、合併與Railway正式回讀繼續保留。PR維持draft；本批沒有部署、不完成全目標。

## 2026-10-01 第十批：個資保存／生日清空／信箱草稿與持久回執（仍未部署）

- 前一目標回合為有進展：完成核准風格實作、提交 `b82cfef` 並得到新瀏覽器證據；本回合重新讀取當前分支與CI，確認三道檢查全部成功，未把前批成功當作本批完成。
- 個资更新使用同一User與後台，而不是另一套資料。新增profileVersion及hash-only ProfileUpdateReceipt；owner＋UUIDv4唯一。回執僅存請求雜湊、APPLIED／CONFLICT／ABANDONED、套用版號與時間，不另存生日、地址、暱稱、信箱原文或憑證。帳號刪除cascade只刪該owner回執。
- 在User交易鎖下重新核對目前JWT版本或既有API key，再檢查期望版號；更新與回執同一交易。12個並行同ID只套用一次；不同內容同ID拒絕，版本衝突留下終態回執。舊PUT介面仍可使用，但嚴格驗證且遞增同一版號，不繞過新網頁的樂觀衝突檢查。
- 生日清空明確寫NULL；日期須有效且不晚於今天。姓名、地址、暱稱及信箱有型別／長度／控制字元限制；暱稱最多5個、每個50字。拒絕會員旗標、憑證欄位及字串冒充布林。第一個信箱在鎖下設定，之後不能被競爭更新替換；設定不等於完成Email驗證或寄信。
- 網頁先把原ID／版號／正規化更新內容寫入既有帳號＋API隔離的AES-GCM IndexedDB，儲存失敗不HTTP送出。重開只GET查核，不自動POST；明確重試才用原ID／原內容。未知、損壞、儲存不可用均凍結新修改，不清掉原操作。這不是硬體Keychain，也不防同源XSS或使用者自行清除網站資料。
- 只有有效APPLIED回執才顯示已儲存。較新資料已取代原更新時明示差異；CONFLICT保留本頁尚未提交草稿，不用整包回應覆蓋其他欄位的草稿。電子信箱不再輸入第一個字就變成唯讀；只以後台已確認信箱判定唯讀。StrictMode及切帳號／離頁後的舊生命週期回應不能污染新資料或晚到POST。
- 安全取消為兩步確認，再由後台原ID寫ABANDONED墓碑，晚到原提交不能套用。若原更新已APPLIED，取消回讀仍明示已儲存而不假稱撤回。已確認但本機標記清理失敗只提供清理，不降級重送；另一分頁的新journal不被舊ACK清掉。帳號安全／通知入口不因profile未知而被一起停用。
- 真實Chrome＋隔離handlers／PostgreSQL：買家232儲存合成暱稱，後台commit後故意回502。網頁顯示未確認，重新載入只GET，恢復同暱稱及可編輯狀態；工具計數profile POST1、receipt GET1、lost ACK1，DB版號1且只有1份回執。未使用正式帳號或外部服務。
- 真實日期欄位先保存1993-05-16再清空；DB確認birthday IS NULL、版號3。保留本頁暱稱草稿，另一個合成同帳號API寫入較新暱稱（版號4），舊頁失焦得到CONFLICT並保留草稿、無自動重試；DB仍是較新暱稱且只有1份CONFLICT回執。這是實際衝突證據，不只前端模擬。
- 390×844恢復頁documentWidth375 <=390、頂部1個設定連結。保存 `wishlist-web-profile-pending-20261001.jpg`、`wishlist-web-profile-recovered-20261001.jpg`、`wishlist-web-profile-conflict-20261001.jpg`；尺寸已還原、驗收分頁已關閉。這些不是90%視覺評分或正式部署證據。
- 最新前端54檔／817項全套及production build成功；後台50個單元檔／873項及build成功。獨立UTF8 loopback DB完整31份遷移，schema與DB無差異，19檔／294項真實HTTP／DB全套通過，包含新增profile10項（並行、取消競爭、回滾、跨owner、刪除cascade、middleware後撤銷session等）。件數不是分支／功能覆蓋率百分比；本批CI提交後須重新回讀。
- 仍待完成：大頭照上傳的未知回應／重試完整流程與其他進階設定回歸、原有語言／註冊驗證重設／社交通知政策、真正MiniMax及跨端／provider證據、分類／旧detail／隱私分享與刪除、完整sell與日期／批次恢復、行銷4圖／免費修改／未知回執、owner狀態實際操作、PWA舊快取、全站效能／響應式、逐頁90%視覺審查及最終CI／合併／Railway部署回讀。全目標仍active，不以個資回執代替全部對齊。

## 2026-10-01 第十一批：逐件核對、批次刊登與欄位定位（仍未部署）

- 前一回合已將90%門檻明確加入文件頂部完整目標；本批保留完整功能對齊、APP風格不變與尚未評分的90%視覺審查。未把局部刊登驗收當成全網站完成。
- 比對原生 `ListingBatchComposer` 後，網頁補上每件「我已逐欄確認…」及「刊登已逐件確認的商品（N）」。只送出勾選項目；共用一次最終公開確認，依序送出，遇到失敗或未知結果即停止後續商品。單件發布也不能跳過逐件核對。
- 核對與實際發布共用 `firstListingPublishIssue`，商品名稱／說明／品牌／售價／照片／新舊／分類／縣市／行政區／緯度／經度／交付／公開同意／失效日期都有可操作的欄位。錯誤自動滾到該欄、聚焦、有限次閃爍及持續紅框，並用 `aria-invalid`／`aria-describedby`連結錯誤；減少動態偏好不閃爍。
- 商品欄位、AI內容或辨識依據、共同地點／交付／日期／公開同意改動後取消舊核對；相同AI輪詢不取消。共同設定在送出及待確認時鎖住；同步操作鎖防快速重複點擊。切帳號或卸載後停止下一張上傳／下一件刊登，已送出照片保留原帳號查詢紀錄。
- 實際瀏覽器发现失焦背景儲存會暫停下一欄編輯，導致連續輸入可能漏掉；移除背景儲存期間的欄位停用，保留較新表單內容為dirty。單件同步鎖避免重疊PUT，送出前仍要完成保存；未知保存回應與多分頁衝突恢復尚未完成，不能聲稱此處具備完整回執協定。
- 以loopback真實編譯handler與既有隔離DB、新建合成帳號234／233驗收：實際相簿選2張自製橘燈／藍杯PNG，私密縮圖均載入；勾選時缺名稱則聚焦且紅框、內容補齊後缺縣市則定位到共同欄位。原生日曆鍵盤輸入與清空都取消核對及公开同意；自動化工具直接fill日期不足以證明React接收，最終以原生鍵盤變更及重繪後保留／清空狀態為證據。日曆彈窗跨月尚未驗證，不記為通過。
- 一次確認後，後台attempts.listing=2、createdListings=2、每件各綁1張原照片及不同clientListingId；DB核對兩件status ACTIVE、expiryMode DEFAULT_30_DAYS、expiresAt-publishedAt正好30 days。網頁「我的商品」在售2件，名稱、照片、NT$350／NT$60與2026-10-31期限正確；改登入合成帳號233後只見其原有1件漫畫，不顯示234的2件管理資料。未碰真實Hank帳號或正式DB。
- 批次確認曾因背景分頁的原生confirm使瀏覽器操作逾時；先回讀隔離後台attempts.listing=0，再用Chrome本任務分頁的實際確認視窗完成原操作，沒有重點發布或重啟後台。尺寸390×844、documentWidth375 <=390；保存 `wishlist-web-batch-missing-field-20261001.jpg`、`wishlist-web-batch-published-20261001.jpg`、`wishlist-web-batch-my-listings-20261001.jpg`、`wishlist-web-batch-account-isolation-20261001.jpg`。驗收分頁／Vite／loopback API／隔離PG已關閉，viewport還原；測試資料及私密照片只保留在隔離環境。
- 完整client回歸曾出現PublicListing前景失效檢查的時序失敗：ready重繪後新effect尚未安裝，舊閉包仍為null。改用從mount持續存在的單一listener讀取最新ref，原斷言保留並補上聯絡／分享／定位全部移除及只註冊1次的證據。最後54檔841測試全部通過、TypeScript／Vite build通過；仍有主要JS／地圖chunk大小警告，效能門檻尚未通過。新提交CI需另外回讀，不借用前一提交的綠燈。
- 此隔離驗收刻意關閉AI，並非MiniMax辨識／Flickr傳輸／跨平台完成證據。刊登原有plaintext、僅userId範圍的pending journal與POST重送式查核仍須改為加密API+帳號範圍、GET唯讀確認及明確重試／終止；上傳journal的scope／CAS／雜湊、私人草稿未知回執、照片移除恢復、真AI重試、行銷任務／四圖／免费修改、原生日期切月替代與完整公開ACK投影核對仍待完成。這些是部署前缺口，不因批次功能存在而刪除。
- 其餘完整矩陣、正式Railway回讀及逐頁90%視覺審查继续保留；PR保持draft，沒有合併、沒有部署、目標維持active。

## 2026-10-01 第十二批：同畫布第一輪視覺審查與預覽裁切修正（仍未部署）

- 前一目標回合已實際更新主Roadmap的90%門檻，屬於規格進展；本回合回讀乾淨分支 `51ce2d5`，不以文件修改代替介面驗收。完整功能對齊仍為目標，不改成只做兩頁外觀。
- 比較方式：核准1536×1024概念板左右頁內框各約736×952；Chrome實際viewport設736×952、頁首scrollY=0，直接保存未縮放、未後製的viewport畫面。正常垂直捲軸使可用documentWidth721；另保存下半部同畫布截圖查看地圖／方案。`settings-full`僅供完整內容查閱，不當作同高度視覺評分證據。排除概念板外框標題、示例照片／售價／日期／帳號資料，但不排除實作多出的結構與高度差異。
- 最初沿用保留fixture DB，推薦讀到舊測試商品，但對應前批本機暫存照片已不由本回合storage root提供；不把破圖當成正式Flickr故障，也不刪舊測試資料。明確停止原listener後另建 `wishlist_marketplace_test_visual_20261001_01`（loopback55439、UTF8、31份遷移），重新啟動同隔離真handlers。本輪只使用合成買家2／賣家1、3個願望及4件商品，照片由Sharp與本機storage處理，沒有外部AI、Flickr、正式帳號或真實庫存變更。
- 修正首頁736px時只有兩欄：640px以上改三欄、窄屏單欄。縮小卡片內距、字級、提醒卡片與快捷列；吻合數量按鈕移到照片下緣。照片與商品資訊各有可鍵盤操作的詳情連結，吻合按鈕是其外部同層元素，沒有巢狀button/link。兩連結均核對同wish與listing ID，替代商品仍只在展開後顯示。
- 設定正文縮至28.5rem、語言／功能／大頭照／通知／安全／隱私等間距收斂，通知補上Bell並移除原粗左框。方案以原生details可展開列顯示完整說明；價格、付款暫停与後台已核對的永久餘額保持可見，不硬寫概念板的10次或已儲存。合成非會員餘額確實為0；原生Enter實測可收合方案說明，沒有付款動作。電話／信箱與其公開權限、其他既有設定均保留。
- 下半部實際檢查發現首頁把480px的完整地圖裁成256px外框，裁掉底部署名及說明。新增預覽模式把實際MapLibre容器設為160px，外層不再裁切，完整地圖仍480px。真瀏覽器回讀預覽mapHeight160，OpenFreeMap／OpenMapTiles／OpenStreetMap署名在可見畫布內（下半部viewport y724），位置約略／群聚說明也可見。保留真實群聚，沒有為了像示意圖而虛構商品座標或固定照片標記。

### 第一輪加權評分：未達90%，不可发布完成聲明

以下為本代理的人工設計審查分數，不是獨立審查者、像素級自動計算或AI正確率。兩頁分開計分；不四捨五入成90。

| 類別／滿分 | 首頁 | 設定 | 得分與差異依据 |
| --- | ---: | ---: | --- |
| 版面與資訊順序／35 | 31 | 31 | 首頁有三欄最匹配、主操作、粉藍提醒、快捷搜尋與地圖；但今天想找什麼／願望選擇使地圖比概念板更靠下。設定順序一致；電話／信箱及贊助額外列使後段位置明顯下移。 |
| 原站配色與字體／25 | 23 | 24 | 中性白灰、深灰按鈕、藍色入口、粉藍提示一致；主標題／提示的行高與字重仍有差異，部分實際操作文字更密。 |
| 卡片／按鈕／圖示／20 | 18 | 18 | 細框白卡、圓角、縮圖堆疊與列式方案已對齊；首頁未新增不存在的愛心收藏操作，地圖是實際群聚非概念板固定縮圖；頭像公開勾選位置、安全盾牌仍不同。 |
| 間距與比例／15 | 8 | 10 | 首頁實際三卡約186×245；額外願望標籤、核對提示、觸控操作與選擇區推高頁面，最後map頂端仍在document y1041而概念板約y772。設定主欄寬已接近452px，但通知、安全、隱私及額外欄位累積高度仍偏大；頁尾在952px首屏不可見。 |
| 導航一致性／5 | 4 | 4 | 六個帶文字入口及單一設定已做到；原站保留協助圖示與active背景，探索用地圖圖示而非概念板放大鏡。多餘無標籤齒輪是已明確排除的概念板錯誤。 |
| 合計／100 | **84（未通過）** | **87（未通過）** | 尚未達兩頁各自90分的要求；未合併／部署。 |

- 必須保留的差異：完整願望選擇及單件定位、真假／型號提示、真實會員與付款狀態、電話／信箱公開權限、可見底圖署名與定位聲明、窄屏觸控與鍵盤入口。不用移除真功能或捏造資料來換取分數。下一輪需把仍偏大的間距、字級、頁尾比例及額外欄位的資訊分組收斂，再對相同畫布重審。
- Chrome390×844首頁／設定documentWidth375≤390，頂部各1個設定入口。首頁9張當前可見／已載入卡片縮圖naturalWidth均大於0；實際點開3件吻合可看另外2件照片／價格／地點。這只證明本輪兩頁，不是全站響應式完成，也不計手機90分。
- 截圖位置為原輸出目錄：`wishlist-web-visual-home-736x952-20261001.jpg`、`wishlist-web-visual-settings-736x952-20261001.jpg`、`wishlist-web-visual-home-map-area-20261001.jpg`、`wishlist-web-visual-home-mobile-20261001.jpg`、`wishlist-web-visual-settings-mobile-20261001.jpg`、`wishlist-web-visual-settings-full-20261001.jpg`。圖片皆為本機隔離頁面，不是正式網站。
- 首次回歸因新增照片／資訊兩個合法詳情連結而有2個原本單一link查詢失敗；沒有刪掉導向斷言，改成驗證恰好2個連結皆指同原wish/listing，並驗證展開button不在link內。新增預覽實際高度／署名未裁切回歸；最後全套與CI另行記錄，不能沿用上一提交的綠燈。
- 登入首頁的兩個主操作也改為可鍵盤操作的單一Link，移除原本Link包Button的巢狀互動，保留願望／刊登原路徑；新增首頁入口與生日讀取錯誤回歸。桌面操作保持至少36px、窄屏44px，不為了像示意圖而取消觸控區域。
- 好友生日未回讀前現在顯示讀取中，不再先假顯示沒有生日；讀取失敗為alert而非0件。空結果只在當前帳號的成功回應後顯示，新增未完成讀取／失敗回歸。
- 本批最新本機前端55檔845項全部通過，TypeScript／Vite production build成功；仍有主要JS633.54KB／地圖1088.99KB／worker507.81KB與PWA precache5749.23KiB的效能警告。件數不是測試覆蓋率百分比，效能門檻未達成；本批CI提交後須獨立回讀。
- 第十一批及完整矩陣所有尚未完成的恢复、真AI／provider／跨端、行銷4圖／免費修改、owner狀態、舊頁回歸、註冊驗證／通知社交政策、PWA舊快取、效能、全站響應式，以及最終Railway合併部署／正式回讀全部保留。目標active，PR仍draft。

## 2026-10-01 第十三批：功能保留的資訊收合與第二輪視覺審查（仍未部署）

- 首頁把完整願望選擇與交叉比對放入地圖下方「今天想找什麼？選願望交叉比對」原生展開入口，不刪除radio／方向鍵／單件定位連結。搜尋仍位於地圖上方，地圖先顯示；標題收斂為22px／28px。預覽實際MapLibre畫布改為128px，完整探索仍480px，不重新使用外框裁切。
- 設定電話／信箱移至隱私卡內「聯絡資料與公開權限」展開列；收合時仍直接顯示兩個欄位的公開／隱藏狀態。手機唯讀、首次email保存限制、公開權限及鎖定中恢復規則均保留，不藉收合取消功能或掩蓋未知保存狀態。通知與安全間距、隱私標籤行高及進階列縮小；付款暫停徽章、價格與真實永久餘額仍可見，較長的付款說明改放贊助展開內容。
- 修復額外發現的節日錯誤：原網頁把2025年農曆日期每年重複，會於2026年10月仍提示錯誤中秋。使用[人事總處2026日曆](https://www.dgpa.gov.tw/information?pid=12685&uid=55)與[2027日曆](https://www.dgpa.gov.tw/information?fid=9898&pid=12982&uid=30)核對移動節日；日曆只表示節日本日，不表示補假或法定休假資格。未核對年份僅列固定節日並明示農曆／清明資料待更新，不能偷偷套用舊資料。感恩節依[OPM規則](https://www.opm.gov/faq/payleave/what-are-federal-holidays.ashx)計算11月第四個星期四；整個節日當天仍顯示，不在午夜後提前跳過。
- 新建隔離UTF8測試DB `wishlist_marketplace_test_visual_20261001_1320`，31份migration、loopback55439；實際smoke handlers建立合成買家2／賣家1、3願望4商品及本機Sharp照片。沒有正式帳號、Flickr、AI、付款或郵件傳送；不刪前批合成資料。圖片內容不是模型辨識證據。
- Chrome桌面736×952：3張最匹配卡、9個載入縮圖naturalWidth>0、搜尋／收合入口可見。實際展開後ArrowRight從橘燈切至藍杯，checked與tabIndex0、鍵盤焦點均切到藍杯，單件連結包含正確wish=2及listing ID；Enter可收合。設定聯絡列Enter可展開／收合，手機／信箱公开按鈕均可操作，現有帳號兩個識別欄位按契約唯讀；本回合沒有切換公開權限或傳送真實個資。
- 最終首頁地圖頂端document y847（第一輪1041、概念板約772），實際mapHeight128；下半部署名viewport y683–697位於畫布585–713內，未裁切。設定閉合頁長1208；隱私179px、權益182px、進階62px仍使頁尾晚於概念板，不能把這個差異排除於評分。
- Chrome390×844兩頁documentWidth375≤390、各1個header設定連結；首頁單欄且沒有a包button，9個縮圖已載入。手機設定的聯絡列能展開且不溢出。這只證明兩頁，不表示全站響應式或手機相似度90%。

### 第二輪加權評分：首頁通過，設定未通過，整體尚未達標

仍為本代理人工設計審查，非獨立審查／自動像素百分比；相同736×952畫布及第一輪排除規則。不能因功能需要的差異而直接給滿分。

| 類別／滿分 | 首頁 | 設定 | 與第一輪相比及保留差異 |
| --- | ---: | ---: | --- |
| 版面與資訊順序／35 | 33 | 32 | 搜尋後直接看到地圖，願望選擇另有清楚展開入口；主要區塊順序接近基準。設定聯絡欄收合改善層級，但仍有聯絡摘要與贊助列等額外結構。 |
| 原站配色與字體／25 | 24 | 24 | 中性配色與粉藍提醒保留，主標題22px更接近基準；公開狀態與說明密度仍有差異。 |
| 卡片／按鈕／圖示／20 | 18 | 18 | 保留真實群聚而非固定照片標記、願望標籤與核對提示；設定公開勾選位置、盾牌、公開權限圖示仍與基準不同，不虛構愛心或付款。 |
| 間距與比例／15 | 11 | 11 | 首頁地圖上移194px且128px高度接近基準，但上緣仍偏低75px、額外署名說明／願望收合列／列表入口使頁尾下移。設定隱私／权益與頁尾仍偏高，不能宣稱整頁已相同。 |
| 導航一致性／5 | 4 | 4 | 單一有標籤設定入口持續成立，協助圖示、active背景與探索圖示差異保留。 |
| 合計／100 | **90（此頁通過）** | **89（未通過）** | 兩頁各自90門檻尚未全部通過；不四捨五入、不合併或部署。 |

- 最終未後製截圖在原輸出目錄：`wishlist-web-visual-home-v2-736x952-20261001.jpg`、`wishlist-web-visual-settings-v2-736x952-20261001.jpg`、`wishlist-web-visual-home-v2-map-area-20261001.jpg`、`wishlist-web-visual-home-crossmatch-open-20261001.jpg`、`wishlist-web-visual-home-v2-mobile-20261001.jpg`、`wishlist-web-visual-settings-v2-mobile-20261001.jpg`。crossmatch-open是操作附圖，不用作閉合版正式評分；桌面最終圖已實際檢視。
- 最後本機前端56檔861項全套與TypeScript／Vite build通過，含16個日期回歸；測試件數不是覆蓋率百分比。最新JS634.75KB、地圖1088.99KB、worker507.81KB、PWA precache5751.43KiB，效能警告及全站效能門檻仍未完成。新提交CI必須另行回讀，不能借用778ed99的36818143054綠燈。
- viewport已還原、驗收tab／Vite／隔離API／隔離PG均正常關閉；合成資料與少量本機私密照片保留，使用者檔案未刪除。全功能矩陣全部未完成項仍保留，尤其刊登／上傳journal範圍與唯讀回執、草稿恢復、真AI/provider／跨端、行銷四圖／免費修改、owner狀態、舊頁回歸、註冊／通知社交／政策、PWA舊快取、效能與最終Railway部署回讀。目標active、PR仍draft。

## 2026-10-01 第十四批：設定相機入口／鍵盤修復與第三輪視覺審查（仍未部署）

- 桌面設定卡片間距由12px統一為8px，區塊標題14px；只有設定頁桌面收合層級調整，不壓縮展開表單、錯誤恢復提示或手機操作。大頭照增加常駐相機角標及2px鍵盤焦點框，不再只在滑鼠移入時可辨認；隱私送禮標題增加貨車圖示，帳號安全改用鎖頭。APP程式及商店素材未變。
- 新增鍵盤測試先抓到實際缺陷：Enter／空白鍵呼叫hidden input.click時，其click又冒泡至外層role=button，造成每個按鍵兩次選檔。修正為hidden file input停止冒泡；測試確定focus不開選檔，Enter與Space各一次，不傳送HTTP變更。Chrome實際Shift+Tab聚焦大頭照，2px實線外框、24px常駐相機角標可見；Enter收到單張filechooser後取消，沒有選檔或照片上傳。
- 手機390×844，documentWidth375≤390，main無超出左右畫布的元素、header只有1個設定連結。五個公開權限按鈕44×44；聯絡summary Enter可開／關，既有手機與信箱依契約唯讀，公開權限按鈕可操作但本輪沒有切換。帳號安全Enter展開保留密碼、撤銷、登出、刪除入口；三個贊助／訂閱／加值summary Enter展開可讀真實暫停說明，未建立付款入口。
- 最初重用上一輪隔離DB時，首頁匹配包含舊賣家，但舊圖片在已停止服務的不同storageRoot，顯示載入失敗。因此該首頁結果不作通過證據，也沒有刪除／改動舊合成資料。改建全新UTF8 `wishlist_marketplace_test_visual_20261001_1400`、31份migration，使用實際compiled handlers與本機Sharp照片；全新買家1／賣家2、3願望4商品，9個article縮圖naturalWidth240、地圖128px／document y847，沒有縮圖失敗提示。初次設定鍵盤／展開驗證使用舊DB新買家4；最後正式兩頁及手機／下半部截圖均取自全新DB買家1。
- 相同736×952桌面畫布，設定scrollY0、headerTop0、details全收合；實際頁長1172，較第二輪1208少36px（不同合成帳號的狀態值不計分）。隱私179px、權益182px及完整頁尾仍使整頁比示意板長，差異保留並扣分；下半部scrollY220補圖證明永久餘額、進階入口、原有政策／支援／合作／日誌／回饋未刪或裁切。沒有為了分數隱藏權限或支付狀態。

### 第三輪人工加權評分：兩頁本機視覺達標，全功能目標仍未完成

仍為本代理人工設計審查，不是獨立審查、像素演算法或模型正確率；沿用35／25／20／15／5權重、736×952畫布及第一輪排除規則。不得把必要額外結構及頁長當作可排除資料差異。

| 類別／滿分 | 首頁 | 設定 | 理由與仍有的差異 |
| --- | ---: | ---: | --- |
| 版面與資訊順序／35 | 33 | 32 | 首頁實際重驗布局未變；設定仍多聯絡摘要與贊助列，不因收合而消除差異。 |
| 原站配色與字體／25 | 24 | 24 | 中性配色與原站字體保留，設定小標題更一致；狀態說明密度與示意板不同。 |
| 卡片／按鈕／圖示／20 | 18 | 19 | 設定比第二輪加1分：常駐相機角標、送禮货車及安全鎖頭已實際呈現並接近基準；公開勾選位置及可切換eye圖示仍不同，不給滿分。首頁保留實際群聚而非固定照片標記。 |
| 間距與比例／15 | 11 | 11 | 卡片8px間距改善，但完整設定頁仍長1172、權益／聯絡摘要與頁尾仍超過示意板；不僅因缩短36px就提高此項。首頁地圖位置等差異保持第二輪扣分。 |
| 導航一致性／5 | 4 | 4 | 單一設定入口成立；協助圖示、active背景及探索圖示差異仍在。 |
| 合計／100 | **90（此頁本機通過）** | **90（此頁本機通過）** | 只是本機人工視覺門檻，非正式網站已對齊100%或已部署。 |

- 原輸出目錄的未後製截圖：`wishlist-web-visual-home-v3-736x952-20261001.jpg`、`wishlist-web-visual-settings-v3-736x952-20261001.jpg`、`wishlist-web-visual-settings-v3-lower-20261001.jpg`、`wishlist-web-visual-settings-v3-mobile-20261001.jpg`、`wishlist-web-visual-settings-v3-mobile-contact-20261001.jpg`。桌面首頁／設定／下半部已實際檢視；手機不計不存在的示意圖相似度。
- 最新本機前端56檔862項全套與TypeScript／Vite build通過，測試件數不等於覆蓋率百分比；主要JS635.74KB、地圖1088.99KB、worker507.81KB、PWA precache5752.85KiB警告仍保留，效能門檻未完成。新提交CI須獨立回讀，不借用前一HEAD成功。
- 隔離state回讀確認沒有刊登、個資修改、照片上傳、訊息、面交或刪除變更；沒有Flickr／MiniMax、付款或郵件實際動作。完整矩陣的刊登／上傳journal範圍與唯讀回執、草稿恢復、真provider／跨端、行銷4圖／免費修改、owner狀態、舊頁回歸、註冊／通知／社交／政策、PWA舊快取、效能及最終CI／合併／Railway回讀全部保留。目標active、PR仍draft，沒有部署。

## 2026-10-01 第十五批：持久刊登回執與失聯重開恢復（仍未部署）

- 保持已核准網頁首頁／設定各至少90/100目標，APP風格與商店素材未動；本批刊登流程不是新的首頁／設定相似度評分，也不是全部功能完成。
- 新增 `ListingCreateReceipt`：以帳號＋正規化UUID為唯一操作鍵，保留原SHA-256與CREATED／ABANDONED終態。商品後來編輯、售出、過期、移除或實體刪除，都不會釋放原刊登鍵。建立／安全取消在同帳號交易鎖下序列化，鎖內再次核對JWT版本／API key，已撤銷的排隊請求不能寫入。原生POST回應形狀維持不變。
- `GET /api/listings/creation-receipts/:id` 只讀本人原操作回執與當前嚴格商品投影，private/no-store；查不到不能推定延遲請求不會成功。明確重試才POST完全相同刊登；兩步安全取消只傳hash，若先前已刊登便回報原商品，不下架、不刪照片；取消先成功時晚到POST不可重建。
- 網頁送出前以既有AES-GCM IndexedDB保存API＋帳號＋功能隔離的完整原請求；損壞／無儲存空間時阻止送出，不退回明文。重新開頁自動GET而非POST。核對原hash與owner、拒絕私密欄位／偽造回執／精確座標；清理使用原子相符值比對，其他分頁若更動就只允許清理／重新讀取，不重送。切帳號的晚到回應不能清新帳號紀錄。建立hash契約由前後端各自對共用3組固定JSON計算驗證。
- 舊版明文紀錄未帶API來源，不能安全猜測歸屬；目前只讀查核，不匯入、重送、取消或刪除。只有目前後台／帳號回執完全匹配才解鎖並保留原紀錄；不匹配／缺失仍隔離。這條舊版例外的完整可用恢復方案仍待解決，不把安全凍結當完整對齊。
- 第32份migration回填合法既有UUID／hash且保留原Listing鍵與時間，遇壞鍵、壞hash或同owner大小寫碰撞會整筆rollback。5項真PostgreSQL隔離schema測試證明成功回填、跨帳號鍵、後續刪商品保留回執、刪帳號cascade與4種壞資料不遺留DDL。正式資料尚未preflight或migration，不以合成資料代替正式安全核對。
- 刊登focused真HTTP／DB46項通過，包含原27項與新增19項：原生相容、唯讀無建立、owner隔離、重试內容衝突、後續狀態／實體刪除、create/cancel競態、transaction rollback及middleware後session撤銷。完整後台21檔318項通過；最初完整回歸遇到測試訪客累積觸發真120/min限流及並行Supertest临時listener解析失敗，改為各case独立合成訪客與同一自有listener，未提高正式限流或減少安全斷言。
- 隔離Chrome實際上傳兩張自製合成照片（不是市場真實庫存），逐件手動填寫／同意／review；每次先讓compiled後台成功commit再給前台502。確認提示曾阻擋背景操作，先以可見原生視窗核對再接受，未重點送出。每次重新載入確認後自動GET回復「原刊登已確認；目前狀態：在售」；最終state為兩個使用者明確刊登、2個不同client鍵／2個CREATED回執、POST2／GET2／drop2／abandon0／photo2，沒有第三次或盲目重試。此為受控commit後502，不冒稱真斷網或所有錯誤情境。
- 發現照片已綁商品後私人列表為空，原「我的商品」入口隨卡片消失；改為始終存在，新增回歸斷言。管理頁顯示藍杯NT$60與檯燈NT$350各1件，照片naturalWidth320。新驗收tab 390×844，documentWidth375≤390、main無右溢出元素；只證明本頁，不是全站響應式完成。
- 截圖：原輸出目錄 `wishlist-web-create-unknown-ack-20261001.jpg`（第一次待查核）、`wishlist-web-create-recovered-v2-20261001.png`（第二次真可見原生Chrome恢復提示，包含桌面上下文）、`wishlist-web-create-mine-v2-20261001.png`、`wishlist-web-create-mine-mobile-20261001.jpg`（390×844純網頁）。較早 `wishlist-web-create-recovered-20261001.jpg` 被HMR後畫面覆蓋，沒有恢復提示，不用作該訊息證據。瀏覽器擴充曾保留已接受confirm的舊狀態；新tab唯讀回讀同一帳號，沒有再次刊登。
- 最新網頁57檔901項、後台51檔876項單元、原生42檔852項及各TypeScript／build通過。新正規Prisma測試DB32份migration與schema agreement無差異。測試數不是分支／功能覆蓋率；main646.21KB、map1088.99KB、worker507.81KB、PWA precache5763.26KiB的效能警告仍保留。最新提交CI需另回讀，不借用7780590的綠燈。
- 本批僅loopback合成環境，沒有正式資料修改、真MiniMax／Flickr／付款／郵件或使用者檔案刪除。照片上傳舊journal的scope/hash/CAS／移除、私人seller draft未知回執、日曆切月、真provider／跨端、四圖／免費修改／queue恢復、owner狀態、舊功能、註冊／社交／政策／通知、PWA升級與全站效能、正式migration preflight及最終CI／合併／Railway回讀全部仍待驗收。目標active，PR draft，未部署。

## 2026-10-01 第十六批：照片內容核對、持久上傳回執與只讀重開（仍未部署）

- 網頁首頁／設定各至少90/100的核准基準不變；本批修改刊登上傳恢復，不重算視覺分數、不改APP介面與商店素材。完整功能矩陣仍未全部通過。
- 新增 `PhotoUploadReceipt`，保存owner＋正規化原UUID、原始上傳位元組與用途的SHA-256、STORED／ABANDONED及原media ID。照片綁到願望／商品、改用途或被實體刪除，都不釋放原上傳鍵；既有照片沒有原始位元組，migration不偽造回填hash。第33份migration拒絕壞UUID及同owner大小寫碰撞，整筆rollback；後續正式資料preflight仍必須另做。
- 上傳與安全取消在User交易鎖內再次核對登入／API key；provider寫入後commit前再核對。取消或撤銷登入競態阻止晚到建立，僅回滾該請求獨有照片目錄／provider物件。新上傳不更動原生POST的7欄回應；舊APP省略用途的重試只接受原始圖片內容摘要相符，不接受換照片。合法舊照片明確重試需編碼內容及用途相符才能建立回執，無provider重傳。
- 新GET只讀本人原回執＋當前照片的14欄最小投影，private/no-store，不輸出Flickr資訊、seller草稿或聯絡資料。找不到不代表未成功；hash-only兩步取消只阻止尚未完成的原上傳，已保存則回報同一照片，不刪除。移除後回報STORED／media=null而不復活照片。
- 網頁以API／帳號／功能隔離AES-GCM journal保存準備後圖片SHA-256、用途與原UUID，不另存照片位元組或檔名。POST前先原子保存，儲存不可用／紀錄損壞則凍結，沒有明文降級。成功ACK也需GET核對owner／hash／用途／圖片URL；失聯不自動第二次POST。明確重試要重新選回完全同內容照片；選錯照片不送HTTP。
- 已確認回執但草稿列表尚未包含該原照片、或本機相符值清理失败，保持「已確認，紀錄待清理」，只重讀／重試清理，不重傳。原紀錄未解決就停止後續照片及公開刊登；切帳號／離頁後的晚到結果不得清除另一scope。舊無API／內容hash的明文紀錄只隔離保留，不能猜測採用或刪除；完整可用舊紀錄恢復仍待補。
- 新照片helper22項（含真IndexedDB加密／scope／CAS）及批次頁35項通過，後者含5個新增恢復／錯照片／取消／舊來源／损壞案例。淘汰不安全的舊ID-only恢復helper及其舊測試，保留且擴強2項所有私密照片分頁驗證；測試數不是功能／分支覆蓋率。
- 後台新增10項真HTTP／PostgreSQL／Sharp／本機儲存整合，加原媒體19項共29項通過；3項新增真migration隔離schema案例通過。舊願望移除race測試原本故意利用大小寫迫使重複provider寫入，新的正規化回執不再走該路徑；改驗同鍵大小寫重試＋移除競態無provider重寫、無照片復活。另有真正未知上傳暫停provider後安全取消的競態測試，不增加逾時或放寬正式限制。
- 合成買家505在Chrome實際選擇自有橘燈fixture。真正commit照片後故意回502，首次回執GET先拒503；頁面凍結並明示待查核。重新開頁自動只GET，恢复同一私人照片，顯示「尚未公開刊登」。後台回讀：photo POST1／receipt GET2／abandon0、1份STORED回執、1份照片、公開新商品0；無額外POST。AI在此隔離帳號未開放，畫面如實說明；這不是MiniMax辨識或Flickr傳輸驗收。
- 390×844實際網頁documentWidth375≤390，原照片縮圖naturalWidth／Height320。登出改登入合成賣家506，再進 `/sell` 為無私人照片，沒有買家照片或待確認UI。桌面／窄屏與失聯畫面保留於原輸出目錄：`wishlist-web-photo-upload-unknown-20261001.jpg`、`wishlist-web-photo-upload-recovered-20261001.jpg`、`wishlist-web-photo-upload-mobile-20261001.jpg`；實際圖片已檢視，非AI概念圖。
- 最新client58檔923項、server51檔876項單元、mobile42檔852項、各build／TypeScript通過。全新UTF8測試DB33份migration及schema agreement無差異，完整22檔331項真HTTP／DB通過。中途誤用繼承SQL_ASCII的隔離DB造成中文匹配失敗，改建明確UTF8測試DB重驗，未改正式匹配行為或刪保留資料；更早external intake一次404重驗通過但尚無確證原因，不宣稱已消除全部測試不穩定。最新HEAD CI需另回讀。
- 主JS651.02KB、地圖1088.99KB、worker507.81KB及PWA precache5767.85KiB效能警告仍保留。批次私人照片移除未知回執、seller草稿PUT失聯／版本衝突、日曆切月、真MiniMax／Flickr／跨端、行銷四圖／免費重修／queue、舊功能與註冊／通知／社交／政策、舊PWA快取、全站響應式／效能、正式資料migration preflight、最終CI／合併／Railway回讀全部仍待驗收。PR仍draft，不部署、不把本批當全目標完成。

## 2026-10-01 第十七批：私人商品草稿保存回執、版本比較與只讀恢復（仍未部署）

- 核准網頁首頁／設定各至少90/100基準、原站風格與APP既定介面均不變；本批不是重新相似度評分，也不替代完整功能矩陣與正式站驗收。
- 第34份migration新增 `SellerDraftReceipt`：owner＋正規化UUID唯一、完整原內容SHA-256及APPLIED／CONFLICT／ABANDONED終態；APPLIED必須有1..1000001版號，其他終態不得帶版號，User刪除cascade。原照片改版、綁到商品或刪除不釋放操作鍵；舊PUT沒有操作ID，不偽造回填回執。
- 專用GET只讀本人原6欄回執及當前7欄私人草稿投影，private/no-store。新POST於User交易鎖內重新核對JWT／API key，照片鎖與更新版號／回執原子提交；同鍵同內容並行重試只保存一次，衝突不覆蓋。hash-only兩步取消先成功會阻止晚到保存；已保存則回報原結果，不能撤銷、刪照片。既有APP的PUT及ACK形狀維持，新增相同交易鎖／權限／版本保護。
- 網頁先保存API＋帳號＋功能隔離AES-GCM原操作journal，含原media、clientActionId、expectedVersion、全欄位與hash，沒有照片副本。損壞或無法記錄不送HTTP，重開只GET；明確重試才送原内容。較新版本／衝突／已取消須比較完整欄位，選擇採用後台或保留修改都不POST；只下一次明確保存建立新操作。清理使用原journal原子比對，已確認清理失败只清理、不重送；晚到舊帳號ACK不能清新帳號。
- 正常背景儲存期間可繼續編輯，晚到ACK不覆蓋本頁新修改；未知結果時凍結其他上傳／review／刊登／刪除。修復實際瀏覽器發現的衝突卡片持續顯示「儲存中」；比較分類／狀態以繁中顯示，所有名稱／說明／品牌／分類／新舊／TWD售價皆可比較。
- focused後台新12項＋原照片19項共31项HTTP／DB通過：12並行重試、原生PUT相容／較新版本、刪除及綁定後原回執、不同內容／media衝突、保存取消競態、真transaction rollback、middleware後撤銷與owner隔離。新增1項真PostgreSQL隔離schema測試驗證CHECK、跨owner鍵、unique及cascade。全新UTF8隔離DB34份migration及schema agreement無差異，完整23檔344項HTTP／DB通過。
- 前端新增23項契約／加密journal及7項真頁面操作案例，涵蓋嚴格回執投影與hash、GET-only、儲存前記錄、壞資料、存儲／清理失敗、較新版採用／保留、取消、帳號晚到及本頁背景修改。舊刊登故障注入移至新草稿步驟之後，仍保留「無法記錄則不刊登」「已確認不再POST」斷言，沒有刪安全測試。最新網頁59檔953項、後台51檔876項單元、原生42檔852項、TypeScript／build均通過；件數不等於分支或全功能覆蓋率。
- Chrome合成買家154真上傳橘色檯燈，compiled後台先保存草稿v1再回502，重新開頁GET恢复原名，原POST仍1、照片1。另以獨立同帳號測試API模擬另一裝置舊APP PUT保存v2（TWD350）；網頁v1修改再送得到持久CONFLICT，後台仍v2。重開仍保留原修改及比較區；按「保留我的修改，稍後再儲存」沒有新增POST，只有明確再保存才成v3。最終photo POST1／回執1、草稿POST3／GET3、2個APPLIED(v1/v3)＋1個CONFLICT、公開新商品0；不是實際斷網、真AI或Flickr證據。
- 390×844比較頁documentWidth375≤390、本人縮圖naturalWidth320；切換合成賣家153沒有買家的私人照片或草稿。原輸出目錄保存 `wishlist-web-seller-draft-unknown-20261001.jpg`、`wishlist-web-seller-draft-recovered-20261001.jpg`、`wishlist-web-seller-draft-conflict-20261001.jpg`、`wishlist-web-seller-draft-conflict-mobile-20261001.jpg`、`wishlist-web-seller-draft-saved-20261001.jpg`。較早desktop conflict截圖尚見舊「儲存中」標籤，修復以重開後mobile與最終保存截圖為準。
- 邊界仍揭露：本頁儲存期間尚未送出的新修改僅保留於頁面及離頁提示，重新載入journal恢復的是原已送內容，尚非所有新編輯的持久autosave。行銷批准的晚到callback與草稿競態、混合待確認紀錄恢復、照片移除／舊紀錄來源、日曆切月、真AI／四圖／跨端、其餘完整矩陣、PWA升級／全站響應式效能及正式migration preflight／CI／合併／Railway回讀仍待補。本批main661.74KB、map1088.99KB、worker507.81KB及PWA5778.32KiB警告保留，不調高警告門檻。
- 本批只使用loopback與合成資料，沒有正式帳號／資料、付款、郵件或外部provider變更；本機成功不等於部署。最新提交CI須精確回讀，不沿用第十六批bee6d81成功。PR82維持draft，整體目標active，未合併／部署。
## 2026-10-01 第十八批：行銷批准編輯保護、只讀查核與四圖調整操作（仍未部署）

- 網頁首頁／設定各至少90/100、沿用原網站风格、單一設定入口及APP風格不變；本批未重新評分。完整功能目標與正式部署門檻保留。
- 行銷批准先取得所在頁的編輯保護：私人商品草稿保存／待確認、未儲存修改、刊登中及本人商品編輯中不能被行銷回覆覆蓋；取得後同步鎖住父頁欄位，直到後台工作及本人商品重新讀取完畢。晚到回覆核對目前照片／商品與頁面生命週期，不任意覆蓋新修改。
- 區分「後台已確認套用但畫面讀取失敗」與「POST回覆遺失，結果未知」。保留原工作、原選圖順序及文案，凍結重送／選圖／調整，提供只GET的「查核原行銷套用結果」。未知結果須核對COMPLETED及原選图順序／文案；不一致或仍排隊不能誤報成功。已確認的工作照片與順序只讀；仍有免費調整機會時可另建一次調整。
- 新增9項行銷元件案例及6項真父頁保護案例；行銷元件合計13項、父頁6項。涵蓋未儲存阻擋、延遲回覆期間鎖定、雙擊只送一次、原結果只讀恢復、不一致／未完成拒收、卸載釋放、完成後只讀、刷新失敗不抹除編輯。最新完整網頁60檔968項＋TypeScript／Vite通過；後台51檔876項單元通過。件數不是覆蓋率百分比；本批未宣稱重新本機執行原生或完整HTTP／DB，精確HEAD雲端CI另驗證。
- loopback隔離harness新增明確opt-in的行銷候選素材交付與commit後502故障注入，仍先檢查隔離DB／localhost防護；只允許本次合成owner工作，不掛internalworker路由，callback token隨機且不輸出。素材是同一合成橘色檯燈的不同尺寸／編碼，不是MiniMax image-to-image四張創意成果，也未用Flickr或正式資料。
- 實際Chrome合成賣家156在「我的商品→編輯資訊→額外選項」產生四圖候選；批准前公開商品只有原實拍1張。父頁未儲存修改阻擋批准，後台POST仍0。首次批准commit後502，畫面保持未知結果，按查核恢復v2與原排序，POST仍1。重新開頁只讀，沒有第二次批准。
- 再調整槽2／4產生一個child，保留舊圖2、選新版圖4，鍵盤重排為2→1→4→3，明確批准後v3。回讀root／child各1個且COMPLETED，批准POST總2（原版與調整各一次），公開4張選用圖＋原實拍1張，舊圖2保留、新圖4替换、文案只一段。沒有再次免費調整入口；本批實際排序驗證是鍵盤，不宣稱實際滑鼠／觸控拖放已驗收。
- 390×844實際網頁documentWidth375≤390，候選／原圖縮圖7張全部complete且naturalWidth240。原輸出目錄保存 `wishlist-web-marketing-approve-unknown-20261001.jpg`、`wishlist-web-marketing-revision-mobile-20261001.jpg`、`wishlist-web-marketing-approved-mobile-20261001.png`，最終截圖已檢視。已還原viewport、關閉自有QA tab、停止自有API／Vite／PG；合成資料、圖片、證據保留，沒有刪使用者檔案。
- 仍待補：行銷建立／調整的持久原操作與恢復、批准原選圖快照跨reload持久化、嚴格工作投影與錯誤載入、非重疊polling／權限重新核對、真正MiniMax／Flickr四圖品質與跨端；私人新編輯autosave、照片移除未知回覆、日曆切月及其他完整矩陣、PWA升級、全站響應式／效能、正式migration preflight／最終CI／合併／Railway回讀。主JS664.75KB、地圖1088.99KB、worker507.81KB、PWA5781.26KiB警告保留，不調高門檻。PR82仍draft、整體目標active、未合併／部署。


## 2026-10-01 第十九批：持久行銷排隊／免費調整回執與正式網址恢復修復（仍未部署）

- 網頁首頁／設定各自至少90/100、原站風格及單一設定入口的核准基準不變；APP介面與商店素材未改。完整功能、權限、錯誤恢復及正式站門檻保留，本批不重新計視覺分數。
- 第35份migration新增 `MarketingRequestReceipt`，保存owner＋正規化UUID、原來源／內容SHA-256與QUEUED／ABANDONED終態；刪除工作或照片不釋放原鍵，刪帳號cascade。同owner交易鎖下再次核對JWT／API key，來源／商品版號鎖內取得；工作與回執同交易建立，回執失敗整筆rollback。舊APP路由與ACK保留，但不能用同UUID绕過新版取消記錄。
- 專用GET只讀本人原6欄回執及5欄工作投影，private/no-store。原版明確帶expectedVersion，免費調整保存原parent、prompt及排序過的slots，並只建立一個child、不重扣月次數；精確重試可在商品改版或功能關閉後查回原工作，沒有原記錄的新工作仍受權限／配額／版號控制。hash-only兩步取消不撤銷已排隊工作或刪照片，先取消可擋晚到POST。
- 網頁送出前以API＋帳號＋來源照片隔離的AES-GCM journal保存完整原內容、hash與UUID；儲存失敗或損壞就不送出，重開只GET。只有明確按重試才送同鍵同內容，查核／兩步取消／已確認僅清理分開。晚到舊帳號結果不清新帳號；嚴格完整工作投影核對來源／商品／四圖／槽位／選圖／狀態，錯誤讀取不再被吞掉或誤當沒有工作。
- 修正正式環境特有缺陷：PROD的API_URL為固定 `/api`，原pendingScope只接受完整URL，會讓正式站恢復失效。現在只允許將應用程式自己的 `/api` 按當前網站origin解析；其他相對網址仍拒絕，不跨網站或帳號。production-origin隔離單元測試與Vite正式建置通過，尚不是正式站部署證據。
- 輪詢由interval改為單次timeout：上一GET結束才排下一次，離頁取消請求及後續排程。新增元件測試核對in-flight期間無第二個排程／無3秒interval，完成後才排下一個、卸載Abort與清timer。測試初版錯把所有API預設timeout signal當成poll signal，導致初始化被故意卡住；已修正測試識別為第一次工作讀取與後續poll，不放寬正式邏輯或逾時。
- 行銷契約19項、元件21項（原13＋新增8）、production scope／feature儲存與父頁回歸通過。後台新增13項真HTTP／PostgreSQL，涵蓋12並行重試只一工作、配額、取消競態、owner隔離、原生相容、撤銷、hash／版號、原照片／工作消失、CHECK／unique與真rollback。最新全新UTF8隔離DB35份migration及schema agreement無差異；完整HTTP／DB本機356項加新增constraint focused13項通過，完整357項待精確HEAD CI回讀，不能把較早全套當最新全套。後台單元876項及build通過。
- 最新完整網頁61檔997項通過，TypeScript／Vite正式建置通過；件數不是分支／功能覆蓋率。前一全套失敗只在上述新增poll測試fixture識別，修正後重新跑完整61檔，不把focused通過當全套通過。
- Chrome合成賣家159實際root提交成功commit後502，頁面明示未知；明確reload只GET恢復同一PENDING工作，POST仍1。四張合成候選交付後對槽2／4提出免費調整，再commit後502；HMR引起元件重掛時自動GET恢復原child，其後明確reload讀到同一child沒有POST，不能把後者說成journal仍待確認時才恢復。選舊圖2、用新版圖4，一次明確批准成公開v2，4張選用图＋原來源1份，文案只一段、無第二次免費調整入口。
- 隔離state最終為root1／child1、QUEUED回執2、queue POST2／drop2／receipt GET2、approve POST1；另外合成登入的availability實際回讀freeUsedThisMonth=1，永久0、付費未開放。390×844 documentWidth375≤390，候選圖都讀取成功。這是受控commit後502與本機合成素材，不是實際斷網、MiniMax創意四圖品質、Flickr或APP跨端驗收。
- 證據於原輸出目錄：`wishlist-web-marketing-queue-unknown-20261001.png`、`wishlist-web-marketing-queue-recovered-20261001.png`、`wishlist-web-marketing-revision-queue-recovered-20261001.png`、`wishlist-web-marketing-queue-approved-mobile-20261001.png`。審圖發現harness主來源縮圖被舊logo fixture路由攔截，所以早期照片complete／240px不作「實拍來源正確」證據；四張候選是本機橘燈編碼。修復opt-in路由後另建合成賣家162，真媒體handler的原檯燈縮圖240×320、名稱／NT$350／額外Beta入口重新讀取，沒有再排隊；補圖 `wishlist-web-marketing-real-source-fixture-20261001.png`（fullpage固定header合成位置不可作版面評分）與 `wishlist-web-marketing-real-source-viewport-20261001.png`。不是把原run當重跑成功。
- 邊界仍待補：批准原選圖／文案跨reload的持久記錄與不可變回執、所有私人GET鎖內重新核權、草稿照片後來綁公開商品／商品實體刪除的queue上下文轉換、已取消／失敗恢復後能力關閉的UI、真AI／Flickr品質與跨端／觸控拖放；私人未送出新編輯autosave、批次照片移除未知回覆、舊紀錄來源隔離可用恢復、混合紀錄、日曆切月、owner狀態／舊功能／註冊／社交／通知／政策、PWA舊快取、全站響應式與效能、正式migration preflight、最終CI／合併／Railway回讀。主JS674.84KB、map1088.99KB、worker507.81KB及PWA5791.22KiB警告保留，不調高門檻。
- 自有API／Vite／隔離PG已正常停止，QA分頁關閉、viewport已還原；合成資料／照片與截圖保留，沒有刪使用者檔案、正式provider／商品／付款／郵件變更。PR82仍draft、完整目標active，未合併／部署；本批精確提交CI須另回讀。

## 2026-10-01 第二十一批：暫停生成時保留既有工作與查核入口（仍未部署）

- 前一目標回合完成第二十批及精確HEAD `3a9d9f0b55334fbdb3e4ca38ef86ff627595a905` 的CI36852279421（3/3），屬於實作／驗證進展，不是完整目標完成。本批保持首頁／設定各90%人工視覺門檻、原網站風格、單一設定入口與全部可適用功能100%；不改APP／商店，不沿用舊CI作本批證明。
- 修正生成能力關閉會隱藏整個Beta的缺陷：入口可顯示「新增生成暫停」，availability未知／失敗時不允許新CREATE或REVISION；既有排隊輪詢、四圖閱覽／選用／批准、原回執查核／同鍵重試／明確取消仍可操作。能力查核與原回執恢復分開，取消／清理不會誤把新生成重新開啟；暫停不延長既有免費調整期限。服務於讀取後才關閉而POST回MARKETING_DISABLED，也顯示暫停並保留原識別紀錄，不另建操作。
- 新增11項元件回歸（累計42項）：無歷史／FAILED／COMPLETED／REVIEW暫停狀態、已交付批准、能力查核失敗／畸形與明確恢復、取消及成功原回執、讀取後才暫停、上一帳號晚到不能啟用下一帳號。網頁最新完整64檔1064項及TypeScript／Vite建置通過；後台54檔899項＋3skipped及build通過。全套第一次新測試在完成通知出現後立即讀取textarea，但狀態effect尚未完成，失敗1項；改為等待實際原文案出現，再次完整1064通過，不刪斷言。一次額外合成登入讀取用錯identifier欄位被拒，按既有phoneNumber API契約修正後成功；不改登入API。
- 獨立新DB `wishlist_marketplace_test_marketing_paused_20261001_1911` 套用38份migration並確認schema no difference。Chrome合成商品`8c969d79-6e1f-4b67-9005-0aababebcd8c`：明確CREATE一次後暫停本機生成，reload仍看到PENDING；隔離harness交付四張編碼fixture，未呼叫AI。暫停時確認可用，approve commit後回502，reload僅GET原證據恢復v2；批准POST仍1、回執GET1、queue1、APPLIED1、公開5圖（4選用＋原實拍）、行銷標題1份，實際availability月用量1。重新開放本機能力並明確只讀查核後，免费調整欄位恢復可用，沒有新增queue或批准。能力切換僅本機listener環境，不改正式provider／用戶或照片資料。
- 390×844 documentWidth375≤390，設定導航1個；桌面恢復圖已實際檢視。未後製證據：`wishlist-web-marketing-paused-recovered-20261001.jpg`、`wishlist-web-marketing-paused-mobile-20261001.jpg`，位於既有outputs目錄。自有API／Vite／PG已正常停止、QA tab關閉、viewport還原；本批合成資料、照片及截圖保留，未刪使用者資料。
- 主JS688.00KB、map1088.99KB、worker507.81KB、PWA5804.06KiB與既有依賴／React act警告保留。測試件數不是覆蓋率，合成四圖不代表真MiniMax創意／Flickr／跨端品質。最新精確提交CI仍需回讀；PR82仍draft、未合併／部署、完整目標active。
- 其餘完整缺口繼續保留：舊無批准回執例外、私人→公開／SetNull上下文與父商品消失後可用pending入口、未送出新編輯持久autosave、批次照片移除未知回執、真MiniMax／Flickr／跨端／實際觸控拖放、日曆切月、owner狀態／舊頁／分享／隱私／刪除、個資／註冊／通知／社交／政策、PWA舊快取、全站響應式／效能、正式migration preflight及最後CI／合併／Railway正式回讀。未將完成的暫停UI等同所有功能完成。

## 2026-10-01 第二十批：不可變行銷批准回執與重開原選圖恢復（仍未部署）

- 前一目標回合已將90%門檻統一寫入驗收與Roadmap，屬於規格進展。本批仍保留首頁／設定各90/100、原站風格、單一設定入口及完整可適用功能100%；不改APP介面或商店素材、不重算視覺分數。
- 新增第38份migration及`MarketingApprovalReceipt`：原識別碼、內容hash、來源／商品／工作、APPLIED／CONFLICT／ABANDONED、當時版本、原選圖順序與文案不可變；SQL明確拒絕APPLIED空版本／空選圖等非法終態，部分唯一索引保證同一工作最多一份APPLIED。工作／照片／商品刪除不丟失原證據；帳號刪除仍cascade。沒有替舊已完成工作捏造回執。
- 新API先重驗JWT或API key並鎖住owner，在同一交易內套用與寫回執；衝突／不合規以savepoint撤回局部照片與文案變更後記錄CONFLICT。回執寫入失敗撤回整筆交易。原生舊approve欄位與ACK不改，新的原生成功也記錄不可變回執；原版舊重試不會恢復或覆蓋調整版公開照片。工作GET優先顯示該工作當時的選圖／文案，不把後來照片旗標當歷史證明。availability、job及latest讀取也在交易內重新核對已撤銷登入。
- 網頁沿用同一來源的加密pending key（不覆蓋未解決的CREATE／REVISION）；確認前保存完整原選圖、順序、文案、商品版本及隨機action ID。重開只GET原回執；未知時只有明確同鍵重試或兩步取消。CONFLICT／ABANDONED保留原文案供閱覽，使用者明確讀取後台才清理。已證明成功但父頁回讀或CAS清理失败時，不提供再次套用；切帳號／離頁的晚到結果不清除原帳號紀錄。重開查核中凍結按鈕，避免恢復本身並行。
- 實際Chrome／真編譯handler／獨立PostgreSQL驗收：本批合成賣家商品`e0c5a7ba-cd82-4bc7-abd5-137e9f647582`，原排序圖2→1→3→4、確認commit後502，畫面保存原內容；實際reload再開編輯，GET原回執一次，批准POST仍1次，商品v2、回執APPLIED v2、公開4張選用圖＋1張原實拍、文案標題只有1份。390×844 documentWidth375≤390，header設定入口1個。
- 隨後免費調整第四張，選用新版並改文案後商品v3；根／child批准各1、queue各1、總批准POST2、原回執GET1、drop1、實際月用量1。回讀root工作的目前照片旗標已有未選用，但不可變原選圖順序與原文案仍等於v2回執；公開v3文案／第四張已不同，不回滾。這是合成流程測試：四圖由隔離harness重編碼測試圖片，未呼叫MiniMax、不代表image2image品質或Flickr／跨端已通過。
- 最新本機驗證：網頁64檔1053項、後台單元54檔899項（另3項skipped，不當通過）、完整真HTTP／DB26檔385項、原生42檔852項，以及client/server build通過；38份migration於兩份獨立新DB套用，schema diff無差異。測試件數不是覆蓋率百分比。主JS687.09KB、map1088.99KB、worker507.81KB、PWA5803.18KiB警告保留，不調高門檻。
- 中間失敗如實保留：首輪新測試的合成worker token短於既有32字元能力門檻，故全數503，修正測試fixture後20項通過；新增私人草稿fixture初缺COMPLETED及型別錯誤已修正。首次完整DB照片讀取401、另一輪外部讀取／HTTP解析偶發失败；曾誤將瀏覽器fixtures放入同一DB，導致全表驗收受污染且清掉部分本批合成fixture。現改用各自獨立DB，最新完整385項通過。沒有改權限、放寬斷言或停用失敗測試，也未刪使用者資料；失敗回合不稱全綠。雲端新提交還須精確重新核對。
- 未後製證據位於原outputs目錄：`wishlist-web-marketing-approval-pending-20261001.jpg`、`wishlist-web-marketing-approval-recovered-20261001.jpg`、`wishlist-web-marketing-approval-recovered-mobile-20261001.jpg`、`wishlist-web-marketing-approval-child-20261001.jpg`。恢復桌面圖已實際檢視。自有API／Vite／PG已正常停止，QA tab關閉、viewport還原，剩餘合成資料、照片與截圖保留；沒有正式商品、真provider、付款、郵件或商店操作。
- 仍待完成：舊無批准回執工作的恢復例外、私人草稿轉公開／關聯SetNull等行銷上下文、能力關閉新操作UI、父商品消失後pending紀錄的可用入口、真MiniMax／Flickr四圖品質與跨端；未送出新編輯持久autosave、批次照片移除未知回執、日曆切月、owner状态实際操作、舊頁／分享／隱私／刪除、個資其他設定／註冊／通知／社交／政策、PWA舊快取、全站響應式／效能、正式migration preflight及最後CI／合併／Railway回讀。PR82 draft、目標active、尚未合併或部署；本批不代替全網站100%驗收。
- 第二十批首輪精確HEAD `f1c77d772b5c30131d6716dadecc66656f4d78b5` 的[CI36851945720](https://github.com/HankHuang0516/wishlist-app/actions/runs/36851945720)已回讀completed/success，3/3。雲端網頁64檔1053項、後台899＋3skipped、真HTTP／DB26檔385項、38份migration／schema無差異、原生852項成功；橋接／feed安全測試亦通過。新增排序測試曾提前在父頁refresh開始後結束，雲端有React act提示，已補等待實際完成訊息再檢查原操作，focused31項通過；未變更任何產品行為或斷言門檻。後續精確提交須另回讀CI，不沿用首輪成功；舊LoginReturnTo等act提示、效能及依賴警告仍保留。

- 第十九批首輪CI `36845724766`（HEAD `89b06be9a96aa82ee57515bd6d2b1615d6a3ed5c`）整體failure：後台899項（3 skipped）／37份migration／schema一致／HTTP DB362項及原生成功，但合併主分支後新增公開Wishlist consumer測試2項因數量文字硬寫繁中而失败，不能稱3/3。已將origin/main `a621277`四份既有聯絡／隱私修正以正常merge保留；不刪或弱化新契約測試。數量改走語系，補缺失的zh「個願望」／en「wishes」鍵與真正英文顯示回歸；整合後本機63檔1002項、TypeScript／Vite成功，主JS680.14KB／PWA5796.39KiB警告保留。合成35份DB證據仍為合併前歷史，最新正式資料preflight未做；新的完整提交CI另回讀，不沿用首輪成功的部分job。

## 2026-10-01 第二十二批：商品管理部分實際操作驗收（仍未部署）

- 最新目標仍是網頁首頁／設定各至少90/100人工視覺審查、完整可適用功能100%；沿用原網站風格，只有一個設定導航，不改APP。前批本機90/90不是正式網站已達標，也不是像素級比對。本批不重新計分、不刪既有缺口。
- loopback隔離工具掛載真正編譯後的商品編輯／狀態／延長／發布controller，GET商品採與正式路由相同的optionalAuthentication。新增獨立操作计數及commit後502故障種類；不改正式API／權限或開放公開測試endpoint。仍先拒絕非localhost、非專用測試DB及不同DATABASE_URL／TEST_DATABASE_URL；4項防呆通過。
- 獨立DB `wishlist_marketplace_test_management_20261001_1923`，38份migration成功、schema diff無差異。Chrome合成賣家2的商品`35205700-47d7-47f7-8170-143e5484a8a8`：延長v1→v2至2026-12-01，commit後502，頁面鎖定寫入、只GET原商品恢復；修改名稱／說明及NT$350→320成功v3；保留commit後502，原頁只查核恢復v4／已保留分頁，正常恢復在售v5。末次DB回讀ACTIVE、CUSTOM_DATE、到期`2026-12-01T15:59:59.999Z`、price320。extension POST1／drop1、edit PATCH1、status POST2（保留與恢復各1）／drop1，沒有把查核當重送。
- Chrome原生日曆的AX回讀可見11月→12月→2027年1月→2026年12月，沒有回朔到最初11月。日格AX點擊與日期fill曾出現DOM值與React確認文案不同；兩次不符的確認均取消，最終只在確認文案明確為12月1日後送出。尚未證明實際滑鼠點日／刊登日曆的完整行為，不以AX切月或元件測試當全日曆通過，也不推定使用者問題根因。
- 新增3項元件回歸：跨年受控日期／版號送出、空值與未延長日期先拒絕、延長失聯僅GET恢復不重送；管理頁13項、最新完整網頁64檔1067項與TypeScript／Vite build成功。日期fixture採2100／2101避免近日過期。後台build成功；沒有新增正式migration或APP變更。主JS688.00KB、map1088.99KB、worker507.81KB、PWA5804.06KiB警告仍保留，件數不是覆蓋率。
- 390×844實際管理頁documentWidth375≤390、header設定1個、照片naturalWidth240／height320。保存並檢視 `wishlist-web-owner-management-mobile-20261001.jpg`，另保存 `wishlist-web-owner-status-unknown-20261001.jpg`，都在既有outputs目錄，不是AI概念圖。自有API／Vite／PG正常停止、viewport還原、QA tab關閉；合成商品／圖片／DB及證據保留，沒有正式資料、付款、郵件、商店或使用者檔案刪除。
- 下一個明确管理缺口：`unconfirmed`目前只有頁內狀態，跨reload尚無持久原操作紀錄；只讀恢復會關閉編輯器，完整衝突比較／未送出修改保存亦待補。售出／移除／草稿發布／分頁的實際瀏覽器、其他完整功能矩陣、真MiniMax／Flickr／跨端、PWA與全站效能、正式migration preflight／最終CI／合併／Railway回讀全部保留。精確新提交CI須另回讀；PR82仍draft，整體目標active、未合併／部署，不把本批部分管理測試當全功能完成。

## 2026-10-01 第二十三批：商品管理原操作跨重開恢復與衝突比較（仍未部署）

- 前一回合為實作／驗證進展，不是等待或整體完成。本批保留首頁／設定各90/100的逐頁人工視覺門檻與全部可適用功能100%，APP既定介面不變；不重新計算或把本機90/90當正式站通過。
- 商品編輯、狀態與延長新增不可變、hash-only的管理回執；商品 mutation 與回執同一交易提交，12個並行同鍵請求只更新1次，取消／送出競態只產生1個終態，回執寫入失敗整筆回滾。原回執在後續修改／商品實體刪除後仍可查核，不重新建立商品；讀取／提交／取消皆在owner鎖內重新驗證JWT與API key，舊APP三個API的回應格式與他人404契約保留。
- 網頁先以既有AES-GCM／API及帳號隔離／CAS保存原名稱、說明、價格、動作及版本，再送出；重開只GET原回執與最新商品，不自動POST。明確重試原鍵、兩步取消與已讀清理分開，已套用的回執不能被取消冒充未執行。CONFLICT保留「您的原操作」與「後台最新」比較；保留修改不發POST，明確儲存才使用新鍵／最新expectedVersion。同一已套用版號若返回矛盾內容仍鎖定並保留紀錄，切換帳號後的晚到POST不顯示或清理另一帳號資料。本機加密不代表防XSS或硬體Keychain。
- Chrome／真編譯handler／独立DB `wishlist_marketplace_test_management_browser_20261001_2023`：合成賣家1商品`85c66daa-2240-4b67-bfc9-92cd52be5224`，編輯commit後502→reload找回原名称／說明／NT$320，POST1、GET回執1、APPLIED v2；同一合成帳號另一裝置用舊PATCH保存v3／NT$280，舊頁v2送出得到CONFLICT，reload仍保留原修改NT$310。按保留修改時管理POST仍2，明確再儲存才APPLIED v4。標記售出commit後502，reload與已售出分頁確認SOLD v5。中斷後再次SQL回讀4份回執：APPLIED v2、CONFLICT expected2、APPLIED v4、STATUS APPLIED v5；商品SOLD／price310。未把已停止listener的計數當最新證據。
- 手機390×844：documentWidth375≤390、header設定1個、合成實拍縮圖240×320，所有本頁按鈕高44px。未後製截圖已保存及檢視：`wishlist-web-management-pending-20261001.jpg`、`wishlist-web-management-recovered-20261001.jpg`、`wishlist-web-management-conflict-20261001.jpg`、`wishlist-web-management-conflict-mobile-20261001.jpg`、`wishlist-web-management-conflict-resolved-20261001.jpg`、`wishlist-web-management-sold-recovered-20261001.jpg`，位於既有outputs目錄。它們是本機功能證據，不是AI示意圖、90%視覺重新評分或正式部署證據。
- 最新網頁65檔1089項、focused55項、後台單元54檔899項＋3skipped、真HTTP／DB27檔405項與client/server build通過；兩份獨立新DB均39份migration，browser DB schema diff無差異。前期TS不支援Object.hasOwn／price nullable及日期fixture非標準ISO已修正，不降型別或斷言；測試曾早於最新資料查核就結束，改等待實際v3。原生未改，最新精確提交的雲端3項CI仍須另回讀。件數不是覆蓋率，主JS699.03KB、map1088.99KB、worker507.81KB、PWA5814.89KiB及既有警告保留。
- 原生confirm曾令CDP讀取逾時，未重送原操作；切回本次QA分頁，以Chrome可見確認框完成後回讀真DB。中斷後確認原API／Vite handle已不存在、原port不在监听，不另起相同fixture；QA分頁已不存在，viewport中斷前已還原。自有PG在確認無其他客戶端後正常停止，合成商品／照片／DB與截圖保留。新發現工作區其他檔案刪除及.gitignore修改不屬本批，未復原、未stage或納入提交。
- 尚未達全目標：新協定延長／保留／移除／全部分頁真UI、未送出新編輯autosave、日曆完整選日、私人照片刪除失聯／舊紀錄、真MiniMax／Flickr四圖與跨端、行銷舊工作與上下文轉換、舊願望／分享／隱私／刪除、個資其他設定／註冊／社交／通知／政策、PWA舊快取與全站響應式／效能、正式資料migration preflight及最後CI／合併／Railway正式回讀仍保留。PR82 draft／未部署，完整目標active；不以本批成功替代全部功能100%。

- PR101初次精確head ed17ec423828df5d529a6a27699c6dbad6e26059／CI37039955819保留：Web1771成功但原MyListings StrictMode stale-restore測試1失敗，尚未合併或部署。原因是兩個真WebCrypto scope-key promise完成順序不固定，mockImplementationOnce把刻意延遲的old失敗分配給current effect。此单案fixture改為有帳號／scope的deterministic key，仍驗兩次StrictMode restore、舊失敗不得改新表單／啟用／alerts，產品code不改、不放寬timeout。新候選依HEAD560＋1為v561，新候選完整Web111檔1772項／build及worker版號檢查通過，新精確三CI接續；Server runtime樹未改且前次完整930＋3skipped/build證據保留。
