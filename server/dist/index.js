"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dns_1 = __importDefault(require("dns"));
// Force IPV4 to prevent IPv6 connectivity issues with Gmail SMTP on Railway
dns_1.default.setDefaultResultOrder('ipv4first');
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const wishlistRoutes_1 = __importDefault(require("./routes/wishlistRoutes"));
const aiRoutes_1 = __importDefault(require("./routes/aiRoutes"));
const socialRoutes_1 = __importDefault(require("./routes/socialRoutes"));
const itemRoutes_1 = __importDefault(require("./routes/itemRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const feedbackRoutes_1 = __importDefault(require("./routes/feedbackRoutes"));
const paymentRoutes_1 = __importDefault(require("./routes/paymentRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = parseInt(process.env.PORT || '8000', 10);
// Security Middleware
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:", "http:", "*"], // Allow images from any source
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.tappaysdk.com", "https://*.tappaysdk.com"], // TapPay SDK
            styleSrc: ["'self'", "'unsafe-inline'"], // Required for TapPay inline styles
            connectSrc: ["'self'", "https:", "http:", "https://*.tappaysdk.com"], // Allow connecting to TapPay APIs
            frameSrc: ["'self'", "https://*.tappaysdk.com"], // Allow TapPay iframes for credit card fields
            childSrc: ["'self'", "https://*.tappaysdk.com"], // Allow TapPay child frames
        },
    },
}));
// Trust proxy (required for Railway/reverse proxy to work with rate-limit)
app.set('trust proxy', 1);
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 500 requests per windowMs (increased from 100 to account for polling)
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: { error: '請求過於頻繁，請稍後再試。(Too many requests, please try again later.)' },
});
app.use(limiter); // Apply rate limiting to all requests
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/api/auth', authRoutes_1.default);
app.use('/api/wishlists', wishlistRoutes_1.default);
app.use('/api/items', itemRoutes_1.default);
app.use('/api/ai', aiRoutes_1.default);
app.use('/api/users', socialRoutes_1.default);
app.use('/api/users', userRoutes_1.default);
app.use('/api/feedback', feedbackRoutes_1.default);
app.use('/api/payment', paymentRoutes_1.default);
app.use('/api/admin', adminRoutes_1.default);
app.use('/uploads', express_1.default.static('public/uploads'));
// Serve AI Guide JSON for external AI agents
app.get('/api/ai-guide', (req, res) => {
    res.json({
        meta: {
            title: "Wishlist.ai API Guide for AI Agents",
            version: "2.1.0",
            user_instructions: "👋 複製這整頁 JSON 內容給你的 AI 助手（如 ChatGPT、Claude），然後告訴 AI 你的手機號碼和密碼，AI 就能幫你管理願望清單了！",
            ai_instructions: "你是用戶的 Wishlist.ai 助手。請先向用戶詢問他們的 Wishlist.ai 帳號（手機號碼）和密碼，然後按照 authentication_flow 步驟登入並取得 API Key。不要使用範例中的 placeholder 值！"
        },
        authentication_flow: {
            important: "⚠️ AI 必須先詢問用戶的真實帳密，不可使用以下範例值！",
            step_1_ask_user: {
                action: "詢問用戶",
                prompt: "請提供您的 Wishlist.ai 帳號（手機號碼）和密碼，我會幫您登入並取得 API 金鑰。"
            },
            step_2_login: {
                description: "用用戶提供的帳密登入",
                method: "POST",
                url: "https://wishlist-app-production.up.railway.app/api/auth/login",
                body: { phoneNumber: "用戶的手機號碼", password: "用戶的密碼" },
                example: { phoneNumber: "0912345678", password: "user_password" },
                response: { token: "JWT token (有效期 7 天)" }
            },
            step_3_generate_api_key: {
                description: "使用 JWT 產生持久的 API Key",
                method: "POST",
                url: "https://wishlist-app-production.up.railway.app/api/users/me/apikey",
                headers: { Authorization: "Bearer <step_2的token>" },
                response: { apiKey: "sk_live_... (永久有效，直到重新產生)" }
            },
            step_4_use_api_key: {
                description: "之後所有請求使用此 header",
                header: "x-api-key: <step_3的apiKey>"
            }
        },
        base_url: "https://wishlist-app-production.up.railway.app/api",
        available_actions: {
            wishlists: {
                list_all: "GET /wishlists - 取得所有願望清單",
                create: "POST /wishlists - 建立新清單 (body: {title})",
                get_one: "GET /wishlists/{id}",
                update: "PUT /wishlists/{id}",
                delete: "DELETE /wishlists/{id}"
            },
            items: {
                add_by_name: "POST /wishlists/{id}/items - 新增項目 (body: {name, price?, notes?})",
                add_by_url: "POST /wishlists/{id}/items/url - 網址自動抓取 (body: {url})",
                add_with_image: "POST /wishlists/{id}/items - multipart/form-data (name + image file)",
                update: "PUT /items/{id}",
                delete: "DELETE /items/{id}"
            },
            user: {
                profile: "GET /users/me, PUT /users/me",
                delivery_info: "GET /users/{id}/delivery-info (需互相追蹤)"
            }
        }
    });
});
app.get('/api/swagger.json', (req, res) => {
    try {
        const swaggerPath = path_1.default.join(__dirname, '../swagger.json');
        const swaggerContent = fs_1.default.readFileSync(swaggerPath, 'utf8');
        res.json(JSON.parse(swaggerContent));
    }
    catch (error) {
        console.error('Error serving swagger.json:', error);
        res.status(500).json({ error: 'Failed to load API documentation' });
    }
});
// Serve static files from the client build directory
const clientBuildPath = path_1.default.join(__dirname, '../../client/dist');
app.use(express_1.default.static(clientBuildPath));
// Redirect /api to /api-showcase for user-friendly access
app.get('/api', (req, res) => {
    res.redirect('/api-showcase');
});
// SPA fallback - EXCLUDE /api/* routes to prevent API interception
// Note: Express 5+ requires '/*' instead of '*' for catch-all routes
app.get('/{*splat}', (req, res) => {
    // Only block actual API routes (paths starting with /api/ - note the trailing slash)
    // This allows /api-showcase and other frontend routes starting with /api-* to work
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    // Otherwise, serve the SPA
    res.sendFile(path_1.default.join(clientBuildPath, 'index.html'));
});
app.listen(port, '0.0.0.0', () => {
    console.log(`[server]: Server is running at http://0.0.0.0:${port}`);
});
