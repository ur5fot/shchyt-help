/**
 * Перевірка оновлень законів на zakon.rada.gov.ua.
 *
 * Порівнює sha256 хеші HTML сторінок з збереженими в data/law-hashes.json.
 * Якщо закон змінився — повідомляє або автоматично оновлює (з --auto).
 *
 * Використання:
 *   npm run check-updates          — показати які закони змінились
 *   npm run check-updates -- --auto — автоматично оновити змінені закони
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  computeHash,
  loadHashes,
  saveHashes,
  readLawFiles,
  type LawHashes,
} from './generate-hashes';
import { parseLawHtml } from './parse-law';
import { створитиЕмбеддинги } from '../server/src/services/embeddings';
import {
  ініціалізуватиБД,
  оновитиЧанки,
} from '../server/src/services/vectorStore';
import type { LawChunk } from '../laws/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAWS_DIR = join(__dirname, '..', 'laws');

/** Завантажує HTML за URL з таймаутом */
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`  ⚠ Помилка завантаження ${url}: ${response.status}`);
      return null;
    }
    return await response.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`  ⚠ Недоступно ${url}: ${message}`);
    return null;
  }
}

interface CheckResult {
  перевірено: number;
  змінено: number;
  оновлено: number;
  пропущено: number;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const autoMode = args.includes('--auto');

  console.log(
    autoMode
      ? 'Перевірка оновлень законів (автоматичне оновлення)'
      : 'Перевірка оновлень законів'
  );
  console.log('');

  const laws = readLawFiles();
  if (laws.length === 0) {
    console.error('Жодного закону не знайдено. Перевірте директорію laws/.');
    process.exit(1);
  }

  let hashes = loadHashes();
  const today = new Date().toISOString().slice(0, 10);
  const firstRun = Object.keys(hashes).length === 0;

  if (firstRun) {
    console.log('Файл хешів не знайдено — буде створено при першому запуску.\n');
  }

  const result: CheckResult = { перевірено: 0, змінено: 0, оновлено: 0, пропущено: 0 };
  let dbInitialized = false;

  for (const law of laws) {
    process.stdout.write(`  ${law.shortTitle}... `);

    const html = await fetchHtml(law.sourceUrl);
    if (!html) {
      result.пропущено++;
      continue;
    }

    result.перевірено++;
    const newHash = computeHash(html);
    const savedEntry = hashes[law.sourceUrl];
    const changed = !savedEntry || savedEntry.hash !== newHash;

    if (!changed) {
      console.log('без змін');
      // Оновлюємо дату перевірки
      hashes[law.sourceUrl] = {
        ...savedEntry,
        lastChecked: today,
      };
      continue;
    }

    if (firstRun) {
      console.log(`ініціалізовано (${law.chunksCount} чанків)`);
      hashes[law.sourceUrl] = {
        hash: newHash,
        lastChecked: today,
        chunksCount: law.chunksCount,
      };
      continue;
    }

    result.змінено++;
    console.log('ЗМІНЕНО!');

    if (!autoMode) {
      console.log(`    → Оновіть вручну: npm run update-law -- "${law.sourceUrl}" "${law.shortTitle}"`);
      continue;
    }

    // Автоматичне оновлення
    try {
      console.log('    → Перепарсинг...');
      const lawData = parseLawHtml(html, law.sourceUrl, law.shortTitle);
      console.log(`    → Розпарсено ${lawData.chunks.length} чанків`);

      if (lawData.chunks.length === 0) {
        console.warn('    → 0 чанків — пропускаємо оновлення');
        continue;
      }

      // Зберігаємо JSON
      const outputPath = join(LAWS_DIR, law.filename);
      writeFileSync(outputPath, JSON.stringify(lawData, null, 2), 'utf-8');
      console.log(`    → JSON оновлено: ${outputPath}`);

      // Генеруємо ембеддинги
      console.log('    → Генерація ембеддингів...');
      const чанкиДляВектора: LawChunk[] = lawData.chunks.map((чанк) => ({
        ...чанк,
        lawTitle: lawData.title,
        sourceUrl: lawData.source_url,
      }));

      const тексти = чанкиДляВектора.map(
        (ч) => `${ч.lawTitle}. ${ч.article}. ${ч.title ?? ''}. ${ч.text}`
      );
      const ембеддинги = await створитиЕмбеддинги(тексти, 'passage');

      // Upsert в LanceDB
      if (!dbInitialized) {
        await ініціалізуватиБД();
        dbInitialized = true;
      }
      await оновитиЧанки(чанкиДляВектора, ембеддинги);
      console.log(`    → LanceDB оновлено: ${чанкиДляВектора.length} чанків`);

      // Оновлюємо хеш
      hashes[law.sourceUrl] = {
        hash: newHash,
        lastChecked: today,
        chunksCount: lawData.chunks.length,
      };

      result.оновлено++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`    → Помилка оновлення: ${message}`);
    }
  }

  saveHashes(hashes);

  console.log('');
  console.log(
    `Перевірено ${result.перевірено} законів, змінено ${result.змінено}, оновлено ${result.оновлено}` +
      (result.пропущено > 0 ? `, пропущено ${result.пропущено} (недоступні)` : '')
  );
}

main().catch((err) => {
  console.error('Помилка перевірки оновлень:', err);
  process.exit(1);
});
