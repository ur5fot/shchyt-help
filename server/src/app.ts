// Фабрика Express-застосунку (окремо від запуску сервера — для тестування)
import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import rateLimit from 'express-rate-limit';
import chatRouter from './routes/chat.ts';
import { RATE_LIMIT_ВІКНО_МС, RATE_LIMIT_МАКС_ЗАПИТІВ, JSON_ЛІМІТ } from './constants.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApiLimiter() {
  return rateLimit({
    windowMs: RATE_LIMIT_ВІКНО_МС,
    max: RATE_LIMIT_МАКС_ЗАПИТІВ,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Забагато запитів. Спробуйте через хвилину.' },
  });
}

// Rate limiter: обмеження запитів на IP (для зворотної сумісності)
export const apiLimiter = createApiLimiter();

export function createApp() {
  const app = express();

  // Дозволяємо localhost, локальну мережу та Cloudflare Tunnel
  app.use(cors({ origin: /^https?:\/\/(localhost|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|.*\.trycloudflare\.com)(:\d+)?$/ }));
  app.use(express.json({ limit: JSON_ЛІМІТ }));

  app.use('/api/chat', createApiLimiter(), chatRouter);

  // Production: роздача фронтенду з client/dist (після npm run build)
  const clientDist = join(__dirname, '../../../client/dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(join(clientDist, 'index.html'));
    });
  }

  return app;
}
