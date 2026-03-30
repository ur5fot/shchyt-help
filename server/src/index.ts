// Точка входу сервера — запускає Express
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });
import { createApp } from './app.ts';
import { ПОРТ } from './constants.ts';
import { logger } from './logger.ts';
import { звільнитиМодельЕмбеддингів } from './services/embeddings.ts';
import { звільнитиReranker } from './services/reranker.ts';

const app = createApp();

const server = app.listen(ПОРТ, () => {
  logger.info({ порт: ПОРТ }, `Сервер запущено на http://localhost:${ПОРТ}`);
});

// Graceful shutdown — звільняємо ML моделі
async function shutdown() {
  logger.info('Зупинка сервера...');
  server.close(() => {});
  await Promise.race([
    Promise.allSettled([звільнитиМодельЕмбеддингів(), звільнитиReranker()]),
    new Promise(r => setTimeout(r, 5000)),
  ]);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
