/**
 * Скрипт генерації LLM-резюме для чанків законів.
 * Для кожного чанка без summary генерує 1-2 речення через Claude API (Sonnet).
 *
 * Використання:
 *   npm run generate-summaries                    — згенерувати для всіх
 *   npm run generate-summaries -- --dry-run       — показати що буде, без API calls
 *   npm run generate-summaries -- --file <name>   — обробити один JSON файл
 *   npm run generate-summaries -- --batch-size 10 — паралельних запитів (default 5)
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAWS_DIR = join(__dirname, '..', 'laws');

const МОДЕЛЬ = 'claude-sonnet-4-6';
const МАКС_ТОКЕНІВ = 100;
const МАКС_ЗАПИТІВ_НА_СЕК = 4;

interface LawChunkRaw {
  id: string;
  article: string;
  part: string;
  title?: string;
  summary?: string;
  text: string;
  keywords: string[];
}

interface LawFile {
  title: string;
  short_title: string;
  source_url: string;
  last_updated: string;
  document_id?: string;
  chunks: LawChunkRaw[];
}

const SYSTEM_PROMPT = `Ти — юрист з військового права України. Напиши 1-2 речення що описують ЗМІСТ фрагменту закону.
Обов'язково вкажи:
- Що саме регулює цей фрагмент (право, обов'язок, процедура, обмеження)
- Кого стосується (контрактник, мобілізований, офіцер, сім'я)
- Ключові умови або обмеження (воєнний стан, мирний час, строки)
Не цитуй текст — опиши своїми словами. Максимум 2 речення.`;

export function buildUserPrompt(chunk: LawChunkRaw, lawTitle: string): string {
  const частина = chunk.part ? `, ${chunk.part}` : '';
  return `Закон: ${lawTitle}\nСтаття: ${chunk.article}${частина}\nТекст: ${chunk.text}`;
}

export function parseSummaryResponse(response: string): string {
  return response.trim().replace(/\n+/g, ' ');
}

function readLawFiles(targetFile?: string): { filename: string; law: LawFile }[] {
  const files = readdirSync(LAWS_DIR).filter(
    (f) => f.endsWith('.json') && f !== 'package.json',
  );

  const результат: { filename: string; law: LawFile }[] = [];

  for (const file of files) {
    if (targetFile && file !== targetFile) continue;
    try {
      const content = readFileSync(join(LAWS_DIR, file), 'utf-8');
      результат.push({ filename: file, law: JSON.parse(content) as LawFile });
    } catch (err) {
      console.error(`Помилка читання ${file}:`, err);
    }
  }

  return результат;
}

// Rate limiter — не більше МАКС_ЗАПИТІВ_НА_СЕК на секунду
class RateLimiter {
  private timestamps: number[] = [];

  async wait(): Promise<void> {
    const зараз = Date.now();
    this.timestamps = this.timestamps.filter((t) => зараз - t < 1000);

    if (this.timestamps.length >= МАКС_ЗАПИТІВ_НА_СЕК) {
      const найстаріший = this.timestamps[0];
      const чекати = 1000 - (зараз - найстаріший) + 10;
      if (чекати > 0) {
        await new Promise((resolve) => setTimeout(resolve, чекати));
      }
      const тепер = Date.now();
      this.timestamps = this.timestamps.filter((t) => тепер - t < 1000);
    }

    this.timestamps.push(Date.now());
  }
}

export interface Args {
  dryRun: boolean;
  file?: string;
  batchSize: number;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, batchSize: 5 };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') {
      args.dryRun = true;
    } else if (argv[i] === '--file' && argv[i + 1]) {
      args.file = argv[i + 1];
      i++;
    } else if (argv[i] === '--batch-size' && argv[i + 1]) {
      args.batchSize = parseInt(argv[i + 1], 10) || 5;
      i++;
    }
  }

  return args;
}

async function generateSummary(
  client: Anthropic,
  chunk: LawChunkRaw,
  lawTitle: string,
  rateLimiter: RateLimiter,
): Promise<string> {
  await rateLimiter.wait();

  const відповідь = await client.messages.create({
    model: МОДЕЛЬ,
    max_tokens: МАКС_ТОКЕНІВ,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(chunk, lawTitle) }],
  });

  const блок = відповідь.content[0];
  if (!блок || блок.type !== 'text') {
    throw new Error(`Несподіваний тип відповіді для чанка ${chunk.id}`);
  }

  return parseSummaryResponse(блок.text);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const lawFiles = readLawFiles(args.file);
  if (lawFiles.length === 0) {
    console.error(args.file ? `Файл ${args.file} не знайдено в laws/` : 'Жодного JSON файлу не знайдено');
    process.exit(1);
  }

  // Підрахувати чанки без summary
  let загальноЧанків = 0;
  let безРезюме = 0;

  for (const { law } of lawFiles) {
    for (const chunk of law.chunks) {
      загальноЧанків++;
      if (!chunk.summary) безРезюме++;
    }
  }

  console.log(`Файлів: ${lawFiles.length}, чанків: ${загальноЧанків}, без резюме: ${безРезюме}`);

  if (безРезюме === 0) {
    console.log('Всі чанки вже мають summary — нічого робити');
    return;
  }

  if (args.dryRun) {
    console.log('\n[DRY RUN] Що буде зроблено:');
    for (const { filename, law } of lawFiles) {
      const без = law.chunks.filter((c) => !c.summary).length;
      if (без > 0) {
        console.log(`  ${filename}: ${без} чанків без summary (з ${law.chunks.length})`);
      }
    }
    console.log(`\nЗагалом: ${безРезюме} API запитів до Claude (${МОДЕЛЬ})`);
    const вартість = (безРезюме * 350 * 0.003) / 1000 + (безРезюме * 50 * 0.015) / 1000;
    console.log(`Приблизна вартість: ~$${вартість.toFixed(2)}`);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY не встановлений');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const rateLimiter = new RateLimiter();
  const початок = Date.now();
  let оброблено = 0;

  for (const { filename, law } of lawFiles) {
    const чанкиБезРезюме = law.chunks
      .map((chunk, i) => ({ chunk, originalIndex: i }))
      .filter(({ chunk }) => !chunk.summary);

    if (чанкиБезРезюме.length === 0) continue;

    console.log(`\n${filename} (${чанкиБезРезюме.length} чанків):`);

    for (let i = 0; i < чанкиБезРезюме.length; i += args.batchSize) {
      const batch = чанкиБезРезюме.slice(i, i + args.batchSize);

      const promises = batch.map(async ({ chunk, originalIndex }) => {
        try {
          const summary = await generateSummary(client, chunk, law.title, rateLimiter);
          law.chunks[originalIndex].summary = summary;
          оброблено++;

          const час = ((Date.now() - початок) / 1000).toFixed(1);
          process.stdout.write(`\r  ${оброблено}/${безРезюме} чанків (${час}с)`);
        } catch (err) {
          console.error(`\nПомилка для чанка ${chunk.id}:`, err);
        }
      });

      await Promise.all(promises);
    }

    // Зберегти файл після обробки всіх чанків
    console.log(`\n  Збереження ${filename}...`);
    writeFileSync(join(LAWS_DIR, filename), JSON.stringify(law, null, 2) + '\n', 'utf-8');
  }

  const час = ((Date.now() - початок) / 1000).toFixed(1);
  console.log(`\nГотово! Згенеровано ${оброблено} резюме за ${час}с`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Помилка:', err);
    process.exit(1);
  });
}
