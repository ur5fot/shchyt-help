// Фабрика Express-застосунку (окремо від запуску сервера — для тестування)
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import chatRouter from './routes/chat.ts';

// Rate limiter: 20 запитів на хвилину на IP
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Забагато запитів. Спробуйте через хвилину.' },
});

export function createApp() {
  const app = express();

  // Дозволяємо будь-який localhost-порт — Vite може автоматично змінити порт якщо 5173 зайнятий
  app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/ }));
  app.use(express.json({ limit: '10kb' }));

  app.use('/api/chat', apiLimiter, chatRouter);

  return app;
}
