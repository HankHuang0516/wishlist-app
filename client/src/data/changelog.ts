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
