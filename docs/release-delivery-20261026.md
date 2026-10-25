# Wishlist2.0.17 發布回執（2026-10-26）

本輪功能與UIUX工程審查各項均達85，分開計分、不跨平台平均。原1–13保留逐畫面審查及本輪變更補驗；Golden14的功能／UIUX為Web桌面93/89、Web手機93/90、iOS95/86、Android95/87。這些不是像素相似度或商店核准機率，不冒稱完整實機／讀屏／平板驗收。

| 交付 | 版本 | 已確認狀態 |
|---|---|---|
| Web／後端 |2.0.820|已上線；公開產物符合核准輸出|
| Android內測 |2.0.17(38)|Play edit06542642754855904054已提交，既有測試者可更新|
| Android正式 |2.0.17(38)|Play edit11307012094291321243已提交；Google快速檢查／審查中，未宣稱正式公開|
| iOS正式 |2.0.17(20)|submission50821fc8-7136-4753-8549-209f97083060為WAITING_FOR_REVIEW；AFTER_APPROVAL|

[原Android內測連結](https://play.google.com/apps/internaltest/4700983374970816754)。商店分發可能尚在傳播；版本號以App設定及Play實際提供為準。

Android38 EAS build9f3c6cc7-3780-40f2-9f06-9412f0d89638，AAB SHA256 e7a2f9e2f42b8b127245786203cc1f6add4f18204152796e7ee53717e222000f。實際Play APK SHA256768d586cbc42b846aef1d04552b81831f6e6d86a52ba7f66448fe625096d44c1，Play簽章與既有E8C84E9D開頭憑證一致；JS位元組符合AAB。掃描0阻擋錯誤，兩個已說明警告為既有Firebase用戶端key與標準AGP metadata。

iOS20 EAS build2445d055-22a7-4a3d-b4fa-3b1ae70e8030，IPA SHA256 c78f1bb7ba25c117ac18dfbc0d387d52f61951781a3c1319d22229f5af0aefa6。ASC build8967dbcb-09b2-421a-8497-df5df0a30945已VALID並選入原版本，沒有建立重複submission。簽章、正式push entitlement、權限／privacy manifest、中英metadata、實際影片附件與測試帳號完整預檢通過。既有2.0.17歷史影片沿用授權從原19紀錄保留，另以確切20 build／source／IPA綁定並明示不是20實機影片；沒有創造新的人類授權回答。三項付費商品仍為MISSING_METADATA草稿、未送審，checkout保持停用。

源碼：PR203 merge5f3e08b5397244fc635f21deecd447216bc808e9已部署，Railway2afd1a2a-8f7e-4126-88f9-372bbedc5942成功。PR206 merge213578452f619b7e53713ad240caf59845203c23只補發版檢查與紀錄，mobile/client/server trees與已部署版本完全相同；主線CI40228414315三項全通過，87個發版檢查測試通過。EAS來源0a3674a的mobile tree亦完全一致，沒有用舊37／19冒充新功能。

證據保存在專案QA/golden-release-20261024：release-delivery-20261026.json、golden-integrated-local-review-20261026.json、android38-play-startup-v3-result.json、signed38-20-H-watermark-review.json、ios20-final-prepare-submission-receipt.json、ios20-final-submit-receipt.json及兩項Google commit回執。實際H原圖／包內各密度／32、48、64遮罩／Apple1024／Play商店與安裝圖示均已核對「浮水印存在／樣式正確」，沒有另設縮圖辨字門檻。

使用者本人三件草稿與照片未由代理刪除。完成私人AI REVIEW工作不再誤阻擋移除；新版在照片旁提供「移除這件草稿」、確認、原操作回執查核與重開不復活；已用生成額度保留。真正使用者裝置上的38草稿移除回饋仍可補充，不冒稱已取得。
