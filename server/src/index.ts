// Точка входу сервера — запускає Express
import 'dotenv/config';
import { createApp } from './app.ts';
import { ПОРТ } from './constants.ts';

const app = createApp();

app.listen(ПОРТ, () => {
  console.log(`Сервер запущено на http://localhost:${ПОРТ}`);
});
