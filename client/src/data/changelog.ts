export interface ChangelogEntry {
    version: string;
    date: string;
    title: string;
    type: 'Frontend' | 'Backend' | 'Fullstack';
    items: {
        type: 'Fix' | 'Enhancement' | 'New' | 'Security';
        content: string;
    }[];
    verificationCase?: string;
    details?: string;
}

export const changelogData: ChangelogEntry[] = [
 {version:'2.0.681',date:'2026-10-07',title:'來源同步工具與私人回執保護',type:'Backend',items:[{type:'Security',content:'部署需逐次核准的受限來源同步工具與私人回執驗證；核准工作清單維持空，不執行商品匯入或新增公開操作入口。'}]},
 {version:'2.0.669',date:'2026-10-04',title:'全台合作招募與直接聯絡入口',type:'Fullstack',items:[{type:'Enhancement',content:'合作頁與表單歡迎全台來源洽談，先雙北小量試點；提供 Wishlist.AI 的 Hank、EClaw 合作名片及 Email，保留逐件授權與原收件流程。'}]},
 {version:'2.0.662',date:'2026-10-04',title:'帳號讀取與公開查詢限流隔離',type:'Fullstack',items:[{type:'Fix',content:'公開查詢受限時仍可核對已登入帳號；帳號讀取須先確認身分並保留有限額度，前端分開等待，不重送操作或清除上次確認內容。'}]},
 {version:'2.0.642',date:'2026-10-04',title:'買家搜尋、代售紀錄查詢與多輪詢問',type:'Fullstack',items:[{type:'Fix',content:'明確非販售QA商品停止買家推薦與新交易；搜尋、篩選及列表模式可透過網址保留。'},{type:'New',content:'只查本人已歸檔且同意代理詢問的代售來源，依商品ID引用原紀錄，自刊聊天排除；未知面交不猜測。'},{type:'Fix',content:'已交付詢問可逐次同意追問，保留各輪回執與賣家回覆，不把晚回或重試當作新的送達。'},{type:'Enhancement',content:'來源照片可查已收錄與實際載入狀態；無照片明確提示，不假稱未取得授權。'}]},
 {version:"2.0.641",date:"2026-10-03",title:"商品地圖顯示操作恢復",type:"Fullstack",items:[{type:"Fix",content:"手動地圖顯示與停止保留原操作結果；回覆中斷後重開先查核，不會重複續期。原期限與其他裝置後續狀態分開顯示，確認支援鍵盤及繁中／英文。"}]},
 {version:"2.0.639",date:"2026-10-03",title:"iOS 社群安全與手動地圖顯示",type:"Fullstack",items:[{type:"Security",content:"登入前呈現 18 歲使用條款；聊天可檢舉不當內容並取得人工處理收件編號。"},{type:"Enhancement",content:"商品刊登可拒絕地圖顯示，每次手動同意一小時後停止，不因重開或延長刊登自動續期。"}]},
 {version:"2.0.605",date:"2026-10-03",title:"台北縣市示意與原生來源契約",type:"Fullstack",items:[{type:"Enhancement",content:"原生來源識別概略位置，逐件保留照片、名稱與原帖標價；只知台北市時明示行政區未明示，不猜取貨點。"}]},
 {version:"2.0.597",date:"2026-10-03",title:"來源線索的縣市概略位置",type:"Fullstack",items:[{type:"Enhancement",content:"有原帖地區依據的來源可顯示縣市示意位置，明確標示非取貨點，不提供精確距離或導航；在售與交易仍待確認。"}]},
 {version:"2.0.593",date:"2026-10-03",title:"來源聊天完整原操作恢復",type:"Fullstack",items:[{type:"Fix",content:"完整加密保存原問題與同意內容，重新開啟先查核本人回執；可明確重試原操作或撤回，紀錄讀取失敗時先恢復再送出。來源聊天支援繁中與英文。"}]},
 {version:"2.0.589",date:"2026-10-03",title:"探索來源搜尋的明確重試",type:"Frontend",items:[{type:"Fix",content:"來源商品讀取失敗後停止自動更新，保留已讀內容與搜尋文字；等待結束後可按重新搜尋恢復，支援繁中與英文。"}]},
 {version:"2.0.584",date:"2026-10-03",title:"來源商品沿用探索與聊聊",type:"Fullstack",items:[{type:"Enhancement",content:"來源商品沿用原卡片、詳情及單次Agent收件；回覆綁定同商品與原收件，未核路由與照片權利時維持待確認。"}]},
 {version:"2.0.445",date:"2026-10-02",title:"讀取詢問不建立空白收件",type:"Fullstack",items:[{type:"Fix",content:"讀取改用唯讀 GET，沒有紀錄時明確提示；只有按保存問題才建立收件，保留既有詢問歷史。"}]},
 {version:"2.0.444",date:"2026-10-02",title:"來源詢問回執與帳號隔離",type:"Frontend",items:[{type:"Fix",content:"未知結果沿用原請求並讀回已存詢問，切換帳號清除私人狀態，刷新到期線索。"}]},
    {version:"2.0.443",date:"2026-10-02",title:"來源線索地圖與可撤回詢問",type:"Fullstack",items:[{type:"New",content:"公共地點来源線索獨立於商品與結帳，支援同意後人工轉交詢問；不代表庫存或授權已核實。"}]},
    { version: "2.0.442", date: "2026-10-01", title: "公開願望清單隱私修補", type: "Backend", items: [
        { type: "Security", content: "公開清單排除隱藏商品，僅回傳公開欄位，件數依可見商品計算並避免快取。" }
    ] },
    { version: "2.0.441", date: "2026-09-30", title: "收件通知回覆窗口", type: "Backend", items: [
        { type: "Fix", content: "合作與匿名意見通知使用已驗證聯絡信箱作為 Reply-To，拒絕無效信箱與標頭注入。" }
    ] },
    { version: "2.0.440", date: "2026-09-30", title: "合作與意見可靠收件", type: "Fullstack", items: [
        { type: "Fix", content: "合作使用專用表單，匿名意見亦先保存並提供收件編號，AI 失敗不阻斷收件。" },
        { type: "Enhancement", content: "記錄通知狀態並防止重複提交，供管理者查閱與聯絡回覆；合作說明支援多行。" }
    ] },
    {
        version: "2.0.0",
        date: "2026-09-22",
        title: "Wishlist.ai 二手願望地圖",
        type: "Fullstack",
        items: [
            { type: "New", content: "新增新品／二手商品地圖、搜尋、篩選與願望清單交叉配對。" },
            { type: "New", content: "新增商品刊登、實拍照片、選填失效日（未填預設 30 天）與刊登狀態管理。" },
            { type: "New", content: "新增買賣雙方聊天、面交提議與雙方確認流程。" },
            { type: "Security", content: "強化帳號工作階段撤銷、刪除復原、管理權限、檢舉與商品審核流程。" },
            { type: "Enhancement", content: "新增 iOS／Android 原生 App API、隔離整合測試與媒體清理機制。" }
        ],
        verificationCase: "server/src/__tests__/integration, mobile/src/__tests__, mobile/ios/WishlistNativeQATests",
        details: "完成 Wishlist.ai 原生雙平台 MVP 與正式後端所需的刊登、探索、願望、聊天、面交及安全基礎建設。"
    },
    {
        version: "1.1.0",
        date: "2026-02-04",
        title: "MCP Integration Phase 2",
        type: "Backend",
        items: [
            { type: "New", content: "Implemented MCP Tools: create_wishlist and add_item." },
            { type: "Enhancement", content: "Updated SKILL.md with new tool documentation." }
        ],
        verificationCase: "server/src/mcp/index.ts",
        details: "AI agents can now create wishlists and add items directly via MCP tools, improving agentic capabilities."
    },
    {
        version: "1.0.1",
        date: "2026-02-04",
        title: "Deployment Automation & Changelog Feature",
        type: "Fullstack",
        items: [
            { type: "New", content: "Added Changelog page to track version history." },
            { type: "Enhancement", content: "Automated Railway deployment via GitHub Actions." }
        ],
        verificationCase: "ChangelogPage.tsx, .github/workflows",
        details: "Implemented a dedicated page for users to see update history and automated the CI/CD pipeline to trigger deployments only after successful checks."
    }
];
