import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import datasetRoutes from './routes/datasets.js';
import reportRoutes from './routes/reports.js';
import shareRoutes from './routes/share.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  }));
  app.use(express.json());
  app.use(cookieParser());

  // Rate limit login to prevent brute force (15 attempts per 15 minutes)
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip || 'unknown',
  });

  app.use('/api/auth/login', loginLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/datasets', datasetRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/share', shareRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(errorHandler);

  return app;
}
