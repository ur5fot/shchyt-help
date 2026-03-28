// Точка входу сервера — запускає Express
import 'dotenv/config';
import { createApp } from './app.ts';
import { ПОРТ } from './constants.ts';
import { logger } from './logger.ts';

const app = createApp();

app.listen(ПОРТ, () => {
  logger.info({ порт: ПОРТ }, `Сервер запущено на http://localhost:${ПОРТ}`);
});
