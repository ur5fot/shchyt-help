// Точка входу сервера — запускає Express
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });
import { createApp } from './app.ts';
import { ПОРТ } from './constants.ts';
import { logger } from './logger.ts';

const app = createApp();

app.listen(ПОРТ, () => {
  logger.info({ порт: ПОРТ }, `Сервер запущено на http://localhost:${ПОРТ}`);
});
