// Фабрика Express-застосунку (окремо від запуску сервера — для тестування)
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import chatRouter from './routes/chat.ts';
import { RATE_LIMIT_ВІКНО_МС, RATE_LIMIT_МАКС_ЗАПИТІВ, JSON_ЛІМІТ } from './constants.ts';

// Rate limiter: обмеження запитів на IP
export const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_ВІКНО_МС,
  max: RATE_LIMIT_МАКС_ЗАПИТІВ,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Забагато запитів. Спробуйте через хвилину.' },
});

export function createApp() {
  const app = express();

  // Дозволяємо будь-який localhost-порт — Vite може автоматично змінити порт якщо 5173 зайнятий
  app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/ }));
  app.use(express.json({ limit: JSON_ЛІМІТ }));

  app.use('/api/chat', apiLimiter, chatRouter);

  return app;
}
