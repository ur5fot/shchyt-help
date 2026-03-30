/**
 * Генерація файлу хешів для відстеження змін законів на rada.gov.ua.
 *
 * Для кожного закону в laws/ завантажує HTML з source_url,
 * обчислює sha256 і зберігає в data/law-hashes.json.
 *
 * Використання: npm run init-hashes
 */

import { createHash } from 'crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAWS_DIR = join(__dirname, '..', 'laws');
const HASHES_PATH = join(__dirname, '..', 'data', 'law-hashes.json');
const ALLOWED_DOMAIN = 'zakon.rada.gov.ua';

export interface LawHashEntry {
  hash: string;
  lastChecked: string;
  chunksCount: number;
}

export type LawHashes = Record<string, LawHashEntry>;

/** Обчислює sha256 хеш рядка */
export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** Завантажує існуючий файл хешів або повертає порожній обʼєкт */
export function loadHashes(): LawHashes {
  if (!existsSync(HASHES_PATH)) return {};
  try {
    return JSON.parse(readFileSync(HASHES_PATH, 'utf-8')) as LawHashes;
  } catch {
    return {};
  }
}

/** Зберігає файл хешів */
export function saveHashes(hashes: LawHashes): void {
  const dir = dirname(HASHES_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(HASHES_PATH, JSON.stringify(hashes, null, 2), 'utf-8');
}

interface LawFileInfo {
  filename: string;
  sourceUrl: string;
  shortTitle: string;
  chunksCount: number;
}

/** Зчитує інформацію про всі закони з laws/ */
export function readLawFiles(): LawFileInfo[] {
  const files = readdirSync(LAWS_DIR).filter(
    (f) => f.endsWith('.json') && f !== 'package.json'
  );

  const result: LawFileInfo[] = [];
  for (const file of files) {
    try {
      const content = readFileSync(join(LAWS_DIR, file), 'utf-8');
      const law = JSON.parse(content);
      if (law.source_url) {
        result.push({
          filename: file,
          sourceUrl: law.source_url,
          shortTitle: law.short_title || law.title || file,
          chunksCount: Array.isArray(law.chunks) ? law.chunks.length : 0,
        });
      } else {
        console.warn(`Пропущено ${file}: відсутній source_url`);
      }
    } catch (err) {
      console.warn(`Пропущено ${file}: помилка читання`);
    }
  }
  return result;
}

/** Завантажує HTML за URL з таймаутом */
export async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      clearTimeout(timeout);
      console.warn(`  Помилка завантаження ${url}: ${response.status}`);
      return null;
    }
    const text = await response.text();
    clearTimeout(timeout);
    return text;
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`  Недоступно ${url}: ${message}`);
    return null;
  }
}

async function main(): Promise<void> {
  const laws = readLawFiles();
  console.log(`Знайдено ${laws.length} законів у laws/`);

  if (laws.length === 0) {
    console.error('Жодного закону не знайдено. Перевірте директорію laws/.');
    process.exit(1);
  }

  const hashes = loadHashes();
  const today = new Date().toISOString().slice(0, 10);
  let успішних = 0;
  let пропущених = 0;

  for (const law of laws) {
    process.stdout.write(`  ${law.shortTitle}... `);

    // Перевірка домену для безпеки
    try {
      const urlObj = new URL(law.sourceUrl);
      if (urlObj.hostname !== ALLOWED_DOMAIN) {
        console.warn(`пропущено (недозволений домен: ${urlObj.hostname})`);
        пропущених++;
        continue;
      }
    } catch {
      console.warn('пропущено (невалідний URL)');
      пропущених++;
      continue;
    }

    const html = await fetchHtml(law.sourceUrl);
    if (!html) {
      пропущених++;
      continue;
    }

    const hash = computeHash(html);
    hashes[law.sourceUrl] = {
      hash,
      lastChecked: today,
      chunksCount: law.chunksCount,
    };
    успішних++;
    console.log(`OK (${law.chunksCount} чанків)`);
  }

  saveHashes(hashes);
  console.log(
    `\nГотово: ${успішних} хешів збережено, ${пропущених} пропущено → ${HASHES_PATH}`
  );
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Помилка генерації хешів:', err);
    process.exit(1);
  });
}
