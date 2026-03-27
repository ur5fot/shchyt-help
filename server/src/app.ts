// Фабрика Express-застосунку (окремо від запуску сервера — для тестування)
import express from 'express';
import cors from 'cors';
import chatRouter from './routes/chat.ts';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api/chat', chatRouter);

  return app;
}
