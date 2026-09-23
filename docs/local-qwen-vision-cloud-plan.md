# Wishlist.ai 本地 Qwen3-VL 圖片鑑識與雲端化

## 目前結論（2026-09-24）

原本的 EClaw 流程把圖片網址當文字交給 Bot；它可能在未看見像素的情況下生成貌似完整的商品 JSON。測試願望 805 的寶可夢公仔曾被寫成 iMac，806 的白糖粿招牌曾被寫成 Polaroid 相機。兩張圖片均可由 Wishlist 後端下載，故障點不是使用者上傳。

本機 Apple M5／24 GiB 使用 Ollama `qwen3-vl:2b-instruct`（Apache-2.0 開放權重，下載約 1.9 GB）讀取圖片位元組，不使用 Gemini 或 MiniMax API key。兩個已知錯誤案例都辨對主體：805 為寶可夢系列公仔模型；806 為白糖粿招牌，讀出「每份 2 入 40 元」。本機暖機後的初步回應約 2–6 秒／張，**這只是 2 張回歸測試，不代表 100% 準確率**。模型曾把系列名誤放在型號欄；現在型號必須有對應的可見文字證據才會採納。

另外用 MiniMax Code 電腦介面試讀相同兩張圖，也辨對主體與招牌價格。但該工具一開始無法直接讀 Railway 網址，需先下載與轉存圖片；該結果來自雲端視覺工具，不是本機 Qwen 模型，也不能證明目前遠端 EClaw Bot 有視覺能力。

## 本次程式行為

照片辨識：後端只從設定的圖片網域抓圖，限制 HTTPS、禁止轉址、8 MiB 大小上限，縮放後把圖片位元組送至受控 Ollama API。Qwen3-VL 回覆可見主體及證據，之後才把證據交給 EClaw 做價格估算；EClaw 若改寫已辨認名稱，流程拒絕寫入。圖片無法讀取、服務未設定、證據不足或回覆衝突時，保留使用者照片與原始名稱，標記辨識失敗供重試／人工確認。網址不是圖片時仍走原 EClaw 文字流程。

這個分支**未部署正式環境**。只在本機跑過真圖與自動測試。尤其價格由 EClaw 品類估算，不是已查證的即時市場成交價；招牌上的標價與二手市場價不得混為一談。

## 雲端版本

Railway 官方目前不提供 GPU，不適合直接在 Wishlist 現有 Railway 服務上跑模型。建議維持 Railway 的願望排隊及驗證流程，把同一個 Qwen3-VL 模型放在獨立 GPU 服務；Wishlist 後端傳入圖片位元組，雲端模型回傳 JSON。此分支的 `vision-gateway/` 是可容器化的入口：限定單一模型與單張圖片、限制請求大小、驗證 Bearer token，並轉送至內網 Ollama。雲端環境仍需架設 GPU 主機、持久化模型檔、用私網連接 gateway 與 Ollama、由平台入口提供 HTTPS。**不要將未加驗證的 Ollama 11434 埠暴露到網際網路**。低流量可考慮會閒置縮至零的 GPU 服務，但此 gateway 與 Ollama 的雙服務包裝須配合供應商部署模式，且要驗收冷啟動延遲與排隊逾時。高流量則評估常駐 GPU 與較大的 4B/8B 模型。

Gateway 使用 `VISION_GATEWAY_TOKEN`（至少 24 字元）、`VISION_GATEWAY_MODEL`（預設 `qwen3-vl:2b-instruct`）、`OLLAMA_BACKEND_URL`（私網 Ollama origin）與 `PORT`。只把 gateway 放在 HTTPS 入口之後；Wishlist 的 `OLLAMA_VISION_TOKEN` 設成相同的部署私密值，不可寫在前端或程式庫。先在 GPU 主機持久磁碟下載模型，再用 `/health` 確認模型已載入。該檔案不是已部署的雲端服務，沒有雲端可用性保證。

後端切換環境變數：

| 名稱 | 用途 |
| --- | --- |
| `OLLAMA_VISION_URL` | 本機 `http://127.0.0.1:11434`，或受 TLS 保護的雲端 origin；未設定則照片安全失敗，不會讓純文字 Bot 猜圖 |
| `OLLAMA_VISION_TOKEN` | 遠端必填；僅存部署平台私密變數，不寫入 Git |
| `OLLAMA_VISION_MODEL` | 預設 `qwen3-vl:2b-instruct`；雲端模型必須同名或明確設定 |
| `OLLAMA_VISION_IMAGE_HOSTS` | 額外允許的圖片主機清單；正式 Railway 主機亦由 `RAILWAY_PUBLIC_DOMAIN`／`RAILWAY_STATIC_URL` 帶入 |

尚未建立或租用雲端 GPU，也未切換正式用戶流量。這會產生主機／GPU 費用，需先確定預算與服務商帳號。以 2026-09-24 查詢的 Runpod 公開定價，16 GB GPU 的 Serverless Flex 約 US$0.58/小時使用時間，實際費用仍會受啟動、儲存、網路與所選規格影響，不能直接當每張圖片的固定報價。

## 上線前驗收門檻

1. 建立至少 50 張經人工標註的私有圖片集，涵蓋公仔、電子產品、衣物、食物／招牌、複數物品、模糊／非商品；用戶照片不提交到 Git。
2. 固定案例 805／806 必須 2/2 正確，並統計其他圖片的主體類別、名稱可接受率、品牌／型號誤報率、拒答率；誤報不能靠「自信度 80%」掩蓋。
3. 為價格建立獨立標註與來源規則，評估區間覆蓋率；沒有市場證據時只能標示品類估算。
4. 測試雲端冷啟動、逾時、故障、錯誤圖片類型、大圖、轉址、未核准主機、未授權請求、模型回覆衝突；均不得覆寫原始願望。
5. 用測試帳號實際新增照片，確認 APP／網頁可見圖片、狀態與結果，人工核對後才考慮正式切換。

本地驗證：`cd server && npm test -- --runInBand && npm run build`。本地真圖結果與單元測試不等於雲端或正式環境驗收。

參考：[Ollama Qwen3-VL 模型](https://ollama.com/library/qwen3-vl%3A2b-instruct)、[Ollama 視覺 API](https://docs.ollama.com/capabilities/vision)、[Railway AI API 指南](https://docs.railway.com/guides/ai-api-hosted-inference)、[Runpod 定價](https://www.runpod.io/pricing)。
