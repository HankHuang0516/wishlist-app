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
