// Точка входу сервера — запускає Express на порту 3001
import 'dotenv/config';
import { createApp } from './app.ts';

const ПОРТ = 3001;

const app = createApp();

app.listen(ПОРТ, () => {
  console.log(`Сервер запущено на http://localhost:${ПОРТ}`);
});
