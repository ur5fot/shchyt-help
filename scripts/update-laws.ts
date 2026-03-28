/**
 * Скрипт оновлення закону: парсить HTML з zakon.rada.gov.ua,
 * зберігає JSON у laws/, генерує ембеддинги та робить upsert в LanceDB.
 *
 * Використання: npm run update-law -- <url> <short_title> [output_filename]
 * Приклад: npm run update-law -- https://zakon.rada.gov.ua/laws/show/2232-12 "Про військовий обов'язок"
 */

import { writeFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { parseLaw } from './parse-law';
import { створитиЕмбеддинги } from '../server/src/services/embeddings';
import {
  ініціалізуватиБД,
  оновитиЧанки,
} from '../server/src/services/vectorStore';
import type { LawChunk } from '../laws/index';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(
      'Використання: npm run update-law -- <url> <short_title> [output_filename]'
    );
    console.error(
      'Приклад: npm run update-law -- https://zakon.rada.gov.ua/laws/show/2232-12 "Про військовий обов\'язок"'
    );
    process.exit(1);
  }

  const [url, shortTitle, outputFilename] = args;

  // 1. Парсимо HTML → JSON чанки
  console.log(`Завантаження та парсинг: ${url}`);
  const law = await parseLaw(url, shortTitle);
  console.log(`Розпарсено ${law.chunks.length} чанків: "${law.title}"`);

  if (law.chunks.length === 0) {
    console.error('Жодного чанку не знайдено. Перевірте URL та структуру сторінки.');
    process.exit(1);
  }

  // 2. Зберігаємо JSON файл у laws/
  const rawFilename =
    outputFilename ||
    shortTitle
      .toLowerCase()
      .replace(/«|»/g, '')
      .replace(/[^а-яіїєґa-z0-9]+/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  const filename = basename(rawFilename);
  const outputPath = join(__dirname, '..', 'laws', `${filename}.json`);
  writeFileSync(outputPath, JSON.stringify(law, null, 2), 'utf-8');
  console.log(`JSON збережено → ${outputPath}`);

  // 3. Генеруємо ембеддинги для чанків
  console.log('Генерація ембеддингів...');
  const чанкиДляВектора: LawChunk[] = law.chunks.map((чанк) => ({
    ...чанк,
    lawTitle: law.title,
    sourceUrl: law.source_url,
  }));

  const тексти = чанкиДляВектора.map(
    (ч) => `${ч.lawTitle}. ${ч.article}. ${ч.title ?? ''}. ${ч.text}`
  );
  const ембеддинги = await створитиЕмбеддинги(тексти, 'passage');
  console.log(`Згенеровано ${ембеддинги.length} ембеддингів`);

  // 4. Upsert в LanceDB
  console.log('Оновлення LanceDB...');
  await ініціалізуватиБД();
  await оновитиЧанки(чанкиДляВектора, ембеддинги);
  console.log(`LanceDB оновлено: ${чанкиДляВектора.length} чанків`);

  console.log('Готово!');
}

main().catch((помилка) => {
  console.error('Помилка оновлення закону:', помилка);
  process.exit(1);
});
