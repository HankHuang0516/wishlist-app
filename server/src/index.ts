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
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.tappaysdk.com"], // Required for some inline scripts
      connectSrc: ["'self'", "https:", "http:", "https://js.tappaysdk.com"], // Allow connecting to APIs
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
      version: "2.0.0",
      description: "This guide enables AI agents to autonomously authenticate and interact with the Wishlist.ai API.",
      instructions_for_ai: "Follow the authentication_flow to obtain API access. The user will provide their phone number and password."
    },
    authentication_flow: {
      overview: "AI agents should authenticate by logging in with user credentials, then generating an API key.",
      step_1_login: {
        description: "Login with user credentials to get a JWT token",
        method: "POST",
        url: "https://wishlist-app-production.up.railway.app/api/auth/login",
        body: { phoneNumber: "string", password: "string" },
        response: { token: "JWT token" }
      },
      step_2_generate_api_key: {
        description: "Generate an API key for persistent access",
        method: "POST",
        url: "https://wishlist-app-production.up.railway.app/api/users/me/apikey",
        headers: { Authorization: "Bearer <jwt_token>" },
        response: { apiKey: "sk_live_..." }
      },
      step_3_use_api_key: {
        description: "Use the API key for all subsequent requests",
        header: "x-api-key: <your_api_key>"
      }
    },
    base_url: "https://wishlist-app-production.up.railway.app/api",
    endpoints: {
      wishlists: {
        list: { method: "GET", path: "/wishlists" },
        create: { method: "POST", path: "/wishlists", body: { title: "string" } },
        get: { method: "GET", path: "/wishlists/{id}" },
        update: { method: "PUT", path: "/wishlists/{id}" },
        delete: { method: "DELETE", path: "/wishlists/{id}" }
      },
      items: {
        add: { method: "POST", path: "/wishlists/{id}/items", content_type: "multipart/form-data", body: { name: "string", image: "file" } },
        add_from_url: { method: "POST", path: "/wishlists/{id}/items/url", body: { url: "string" } },
        get: { method: "GET", path: "/items/{id}" },
        update: { method: "PUT", path: "/items/{id}" },
        delete: { method: "DELETE", path: "/items/{id}" }
      },
      user: {
        get_profile: { method: "GET", path: "/users/me" },
        update_profile: { method: "PUT", path: "/users/me" },
        get_delivery_info: { method: "GET", path: "/users/{id}/delivery-info", note: "Requires mutual friendship" }
      }
    }
  });
});

// Serve static files from the client build directory
const clientBuildPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientBuildPath));

app.get(/.*/, (req: Request, res: Response) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[server]: Server is running at http://0.0.0.0:${port}`);
});
