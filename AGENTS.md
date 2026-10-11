<!-- HANK_EXTERNAL_TARGET_CODEX_2T_20261011_BEGIN -->
## 最新外接儲存目標：codex_2T（Hank，2026-10-11）

Hank 直接指示：「因為那顆硬碟壞了現在目前都要改到 `/Volumes/codex_2T/`」。本節更新所有專案的外接儲存目標，覆蓋下方仍把 `/Volumes/codex`、`/Volumes/CodexData` 或舊 Hank-2TB 當成目前目標的說明；搬移／復原的資料保護與各專案最新授權仍須遵守。

- 新實體碟是 `/Volumes/codex_2T`，Volume UUID `4E209AF2-AF33-3CF7-8F47-54D26FE14F19`，目前 ExFAT。長期專案與資料的目標以此碟為準；Git、symlink、POSIX 權限與活躍 SQLite 使用此碟上經確認的 APFS 資料區。APFS 資料區的掛載名稱可能不同，須核對映像檔實際位於新碟，不能只看路徑名稱。測試執行、必要測試快取／暫存與模擬器留在本機 SSD，仍保留 20 GiB 系統空間。
- 舊 `/Volumes/CodexData` 是 `/Volumes/codex/CodexData.sparsebundle` 的 APFS 掛載點；它不是新碟。目前舊資料區未掛載，指向它的連結不能視為可用工程。不得把舊碟 UUID 當成新碟身分。
- 各專案須先找到可讀且完整的來源，保留未提交／未追蹤資料、Git/worktree 引用及檔案語意，確認新位置與來源一致並協調停止寫入後，才切換原入口。已有專案完成新碟切換時沿用其已驗證路徑；不要重複搬移。來源不可讀則記錄「待復原／未切換」，不能把連結改到空目錄、建立假的掛載點或用遠端 Git 宣稱原工程已恢復。
- 作品網站的編寫工程 `/Users/hank/Desktop/Project/app-showcase-site` 仍待復原；它與已搬移的部署工程不同。部署工程實際在 `/Volumes/codex_2T/codex_project/AiHankApps/EClaw-ai-hank-apps-route`，網站檔案在其 `backend/public/AiHankApps/`；原 `/Users/hank/Desktop/Project/EClaw-ai-hank-apps-route` 已轉接新位置。此工作副本的 Git 共用資料仍在 `/Users/hank/Desktop/Project/EClaw/.git`，保留其他 EClaw 工作副本的關聯。啟動前執行 `python3 /Volumes/codex_2T/codex_project/AiHankApps/check_storage.py`；測試留 SSD，現有未提交／未追蹤修改不得重置。最新位置及驗證紀錄查 `/Users/hank/.local/share/project-storage/storage-policy-20261011.json` 與新碟 `AiHankApps/workspace-location.json`。
- 全域 `project-storage` CLI 目前仍為 `internal`；本節只更新目標與已查明狀態，不宣稱整體切換完成，不重啟舊搬移程序、不搬動正在寫入的資料庫，也不恢復暫停目標。新專案／工作副本沿用本節與 H 浮水印發布前自檢規定，發布與清理仍按各自授權及檢查辦理。
<!-- HANK_EXTERNAL_TARGET_CODEX_2T_20261011_END -->

<!-- HANK_ICON_WATERMARK_POLICY_20261010_BEGIN -->
## 全專案 H 浮水印與每次更新發布前自檢（Hank，2026-10-10）

Hank 直接規定：「把浮水印Ｈ不能自成一排的限制規定放到每一個專案甚至是未來的專案內」及「任何專案發更新版之前都要自檢過icon 浮水印位置」。本節適用所有現有、未來專案及其工作副本，覆蓋舊的圖示底欄／縮圖留白方案核准；不得沿用那些核准放行。

- H 必須像浮水印自然融入原圖，**不能自成一排**、獨立底欄、色帶、頁腳或圖外徽章。禁止為容納 H 縮小、搬移、裁切原畫，增加畫布／padding／邊框，或把原圖推到上方。保持真正無 H 原圖的畫布、比例、位置及構圖；只合成已選定的 H 圖層，不重畫原圖，不擅改 H 色彩／alpha。
- H 不得遮住標題、主要文字、人物、武器或主要圖形；常用尺寸仍須完整且可辨識，不能變成彩點、殘缺筆畫或被平台裁切。逐語言、逐平台檢查實際輸出、32／48／64px 常用尺寸與各平台實際尺寸，涵蓋 iOS 圓角、Android legacy／round／adaptive 遮罩及實際適用的 Web／CLI 圖示。
- **每次更新版發布前都必須重新自檢 icon 的 H 位置，即使本次沒有修改 icon。** 在內測分發、商店提交／發布或網站／CLI 更新前，核對本次實際包內／發布產物圖示、各語言變體、商店圖示及可取得的安裝／執行後顯示；來源預覽或其他版本的通過紀錄不能代替本版自檢。
- 留存本版自檢紀錄：版本／build、真正原圖與 H 來源、使用圖示及包內資源路徑、實際小尺寸／遮罩對照、目視結論與未完成項。像素核對須以真正無 H 原圖為基準；不得把先縮圖／加底欄的圖當基準，以「H 外差異為 0」掩蓋整體構圖變動。自動檢查通過不能代替目視驗收。
- H 自成一排、遮圖／遮字、裁切、難以辨識，或本版自檢未完成，均為 **HOLD／不得發布**。修正後重新核對；不得為放行而放寬遮罩、弱化測試／gate 或冒稱已通過。沒有適用圖示的專案須如實記錄不適用及原因，不能靠移除應有圖示／H 規避。
- 建立新專案或新工作副本時，將本節帶入其根目錄 `AGENTS.md`；開始既有專案工作時核對本節已同步，遇到不可讀路徑記錄待同步，不建立替代目錄或假稱完成。此規定不自行恢復暫停目標，也不額外授權搬移、刪除、發布或變更 rollout。
<!-- HANK_ICON_WATERMARK_POLICY_20261010_END -->
