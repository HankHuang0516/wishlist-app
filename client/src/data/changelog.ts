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
