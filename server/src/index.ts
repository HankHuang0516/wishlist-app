import express, { Express, Request, Response } from 'express';
import path from 'path';
import dns from 'dns';

// Force IPV4 to prevent IPv6 connectivity issues with Gmail SMTP on Railway
dns.setDefaultResultOrder('ipv4first');

import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import wishlistRoutes from './routes/wishlistRoutes';
import aiRoutes from './routes/aiRoutes';
import socialRoutes from './routes/socialRoutes';
import itemRoutes from './routes/itemRoutes';
import userRoutes from './routes/userRoutes';
import feedbackRoutes from './routes/feedbackRoutes';
import paymentRoutes from './routes/paymentRoutes';
import adminRoutes from './routes/adminRoutes';

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app: Express = express();
const port = parseInt(process.env.PORT || '8000', 10);

// Security Middleware
app.use(helmet({
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

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs (increased from 100 to account for polling)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: '請求過於頻繁，請稍後再試。(Too many requests, please try again later.)' },
});
app.use(limiter); // Apply rate limiting to all requests

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/wishlists', wishlistRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/users', socialRoutes);
app.use('/api/users', userRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/uploads', express.static('public/uploads'));

// Serve AI Guide JSON for external AI agents
app.get('/api/ai-guide', (req: Request, res: Response) => {
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

app.get('/api/swagger.json', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../swagger.json'));
});

// Serve static files from the client build directory
const clientBuildPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientBuildPath));

// Redirect /api to /api-showcase for user-friendly access
app.get('/api', (req: Request, res: Response) => {
  res.redirect('/api-showcase');
});

// SPA fallback - EXCLUDE /api/* routes to prevent API interception
// Note: Express 5+ requires '/*' instead of '*' for catch-all routes
app.get('/{*splat}', (req: Request, res: Response) => {
  // Only block actual API routes (paths starting with /api/ - note the trailing slash)
  // This allows /api-showcase and other frontend routes starting with /api-* to work
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  // Otherwise, serve the SPA
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[server]: Server is running at http://0.0.0.0:${port}`);
});
