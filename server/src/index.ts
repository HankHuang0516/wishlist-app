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
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Required for some inline scripts
      connectSrc: ["'self'", "https:", "http:"], // Allow connecting to APIs
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



// Serve static files from the client build directory
const clientBuildPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientBuildPath));

app.get(/.*/, (req: Request, res: Response) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[server]: Server is running at http://0.0.0.0:${port}`);
});
