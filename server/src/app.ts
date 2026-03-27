// Фабрика Express-застосунку (окремо від запуску сервера — для тестування)
import express from 'express';
import cors from 'cors';
import chatRouter from './routes/chat.ts';

export function createApp() {
  const app = express();

  // Дозволяємо будь-який localhost-порт — Vite може автоматично змінити порт якщо 5173 зайнятий
  app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/ }));
  app.use(express.json({ limit: '10kb' }));

  app.use('/api/chat', chatRouter);

  return app;
}
