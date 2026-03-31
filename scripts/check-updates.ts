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

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  computeHash,
  loadHashes,
  saveHashes,
  readLawFiles,
  fetchHtml,
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
const ALLOWED_DOMAIN = 'zakon.rada.gov.ua';

interface CheckResult {
  перевірено: number;
  змінено: number;
  оновлено: number;
  пропущено: number;
  невдалих: number;
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

  const result: CheckResult = { перевірено: 0, змінено: 0, оновлено: 0, пропущено: 0, невдалих: 0 };
  let dbInitialized = false;

  for (const law of laws) {
    process.stdout.write(`  ${law.shortTitle}... `);

    // Пропускаємо внутрішні URL (не зовнішні ресурси)
    if (law.sourceUrl.startsWith('internal://')) {
      console.log('пропущено (внутрішній ресурс)');
      continue;
    }

    // Перевірка домену для безпеки
    try {
      const urlObj = new URL(law.sourceUrl);
      if (urlObj.hostname !== ALLOWED_DOMAIN) {
        console.warn(`пропущено (недозволений домен: ${urlObj.hostname})`);
        result.пропущено++;
        continue;
      }
    } catch {
      console.warn('пропущено (невалідний URL)');
      result.пропущено++;
      continue;
    }

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

    if (firstRun || !savedEntry) {
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
      let lawData = parseLawHtml(html, law.sourceUrl, law.shortTitle);

      // Fallback на /print версію якщо 0 чанків (як у parseLaw)
      if (lawData.chunks.length === 0) {
        const printUrlObj = new URL(law.sourceUrl);
        printUrlObj.pathname = printUrlObj.pathname.replace(/\/?$/, '/print');
        const printUrl = printUrlObj.toString();
        console.log(`    → 0 чанків, спроба /print: ${printUrl}`);
        const printHtml = await fetchHtml(printUrl);
        if (printHtml) {
          lawData = parseLawHtml(printHtml, law.sourceUrl, law.shortTitle);
        }
      }

      console.log(`    → Розпарсено ${lawData.chunks.length} чанків`);

      if (lawData.chunks.length === 0) {
        console.warn('    → 0 чанків — пропускаємо оновлення');
        result.невдалих++;
        continue;
      }

      // Зберігаємо document_id з існуючого файлу
      const outputPath = join(LAWS_DIR, law.filename);
      let existingDocumentId: string | undefined;
      try {
        const existing = JSON.parse(readFileSync(outputPath, 'utf-8'));
        existingDocumentId = existing.document_id;
      } catch {
        // Файл не існує або невалідний — пропускаємо
      }

      // Генеруємо ембеддинги
      console.log('    → Генерація ембеддингів...');
      const чанкиДляВектора: LawChunk[] = lawData.chunks.map((чанк) => ({
        ...чанк,
        lawTitle: lawData.title,
        sourceUrl: lawData.source_url,
        documentId: existingDocumentId,
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

      // Зберігаємо JSON з document_id (після LanceDB щоб не залишити неконсистентний стан)
      const lawDataWithId = existingDocumentId
        ? { ...lawData, document_id: existingDocumentId }
        : lawData;
      writeFileSync(outputPath, JSON.stringify(lawDataWithId, null, 2), 'utf-8');
      console.log(`    → JSON оновлено: ${outputPath}`);

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
      result.невдалих++;
    }
  }

  saveHashes(hashes);

  console.log('');
  console.log(
    `Перевірено ${result.перевірено} законів, змінено ${result.змінено}, оновлено ${result.оновлено}` +
      (result.пропущено > 0 ? `, пропущено ${result.пропущено} (недоступні)` : '') +
      (result.невдалих > 0 ? `, невдалих ${result.невдалих}` : '')
  );

  // Завершуємо процес явно — ONNX runtime тримає handles після --auto режиму
  process.exit(result.невдалих > 0 ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Помилка перевірки оновлень:', err);
    process.exit(1);
  });
}
