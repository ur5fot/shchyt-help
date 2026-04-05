// Фабрика Express-застосунку (окремо від запуску сервера — для тестування)
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import chatRouter from './routes/chat.ts';
import { RATE_LIMIT_ВІКНО_МС, RATE_LIMIT_МАКС_ЗАПИТІВ, JSON_ЛІМІТ } from './constants.ts';

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

  // Дозволяємо localhost та локальну мережу (192.168.x.x, 10.x.x.x)
  app.use(cors({ origin: /^http:\/\/(localhost|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/ }));
  app.use(express.json({ limit: JSON_ЛІМІТ }));

  app.use('/api/chat', createApiLimiter(), chatRouter);

  return app;
}
