/**
 * Скрипт ініціалізації векторної бази LanceDB.
 * Завантажує всі чанки законів, генерує ембеддинги та зберігає у LanceDB.
 *
 * Використання: npm run init-vector-db
 */

import { loadAllLaws } from '../laws/index';
import { створитиЕмбеддинги } from '../server/src/services/embeddings';
import { ініціалізуватиБД, створитиТаблицю } from '../server/src/services/vectorStore';

async function main(): Promise<void> {
  console.log('Завантаження чанків законів...');
  const чанки = loadAllLaws();
  console.log(`Завантажено ${чанки.length} чанків`);

  console.log('Генерація ембеддингів (може зайняти кілька секунд при першому запуску)...');
  const тексти = чанки.map(
    (ч) => `${ч.lawTitle}. ${ч.article}. ${ч.title ?? ''}. ${ч.text}`
  );
  const ембеддинги = await створитиЕмбеддинги(тексти, 'passage');
  console.log(`Згенеровано ${ембеддинги.length} ембеддингів`);

  console.log('Ініціалізація LanceDB...');
  await ініціалізуватиБД();

  console.log('Створення таблиці...');
  await створитиТаблицю(чанки, ембеддинги);

  console.log(`Готово! Векторна база створена з ${чанки.length} записами у data/lancedb/`);
}

main().catch((помилка) => {
  console.error('Помилка ініціалізації векторної бази:', помилка);
  process.exit(1);
});
