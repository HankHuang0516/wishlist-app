import express, { Express, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
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

dotenv.config();

const app: Express = express();
const port = parseInt(process.env.PORT || '8000', 10);

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
app.use('/uploads', express.static('public/uploads'));



// Serve static files from the client build directory
const clientBuildPath = path.join(__dirname, '../../client/dist');
console.log('Debug: __dirname:', __dirname);
console.log('Debug: clientBuildPath:', clientBuildPath);
if (fs.existsSync(clientBuildPath)) {
  console.log('Debug: clientBuildPath exists');
  console.log('Debug: contents:', fs.readdirSync(clientBuildPath));
} else {
  console.log('Debug: clientBuildPath DOES NOT EXIST');
  const parentDir = path.join(__dirname, '../../client');
  if (fs.existsSync(parentDir)) {
    console.log('Debug: parentDir exists. Contents:', fs.readdirSync(parentDir));
  } else {
    console.log('Debug: parentDir DOES NOT EXIST either');
    console.log('Debug: root contents:', fs.readdirSync(path.join(__dirname, '../../')));
  }
}

app.use(express.static(clientBuildPath));

app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[server]: Server is running at http://0.0.0.0:${port}`);
});
