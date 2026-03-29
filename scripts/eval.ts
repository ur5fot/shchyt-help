/**
 * Скрипт оцінки якості пошуку (retrieval evaluation).
 * Завантажує golden test set та перевіряє чи searchLaws знаходить очікувані чанки.
 *
 * Використання: npm run eval
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadAllLaws } from '../laws/index';
import { searchLaws } from '../server/src/services/lawSearch';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface GoldenQuestion {
  id: string;
  question: string;
  expectedChunks: string[];
  expectedArticles: string[];
  category: string;
}

interface QuestionResult {
  id: string;
  question: string;
  category: string;
  found: boolean;
  expectedChunks: string[];
  foundChunks: string[];
}

function завантажитиGoldenSet(): GoldenQuestion[] {
  const шлях = join(__dirname, '..', 'eval', 'golden-set.json');
  const вміст = readFileSync(шлях, 'utf-8');
  return JSON.parse(вміст) as GoldenQuestion[];
}

function оцінитиKeywordПошук(
  питання: GoldenQuestion[],
  чанки: ReturnType<typeof loadAllLaws>
): QuestionResult[] {
  const результати: QuestionResult[] = [];

  for (const п of питання) {
    const знайдені = searchLaws(п.question, чанки);
    const знайденіІД = знайдені.map(р => р.chunk.id);
    const found = п.expectedChunks.some(id => знайденіІД.includes(id));

    результати.push({
      id: п.id,
      question: п.question,
      category: п.category,
      found,
      expectedChunks: п.expectedChunks,
      foundChunks: знайденіІД,
    });
  }

  return результати;
}

function вивестиЗвіт(результати: QuestionResult[]): void {
  const всього = результати.length;
  const знайдено = результати.filter(р => р.found).length;
  const recall = всього > 0 ? (знайдено / всього) * 100 : 0;

  console.log('\n========================================');
  console.log('  RETRIEVAL EVALUATION REPORT (keyword)');
  console.log('========================================\n');
  console.log(`Overall recall: ${знайдено}/${всього} (${recall.toFixed(1)}%)\n`);

  // По категоріях
  const категорії = new Map<string, { всього: number; знайдено: number }>();
  for (const р of результати) {
    const кат = категорії.get(р.category) ?? { всього: 0, знайдено: 0 };
    кат.всього++;
    if (р.found) кат.знайдено++;
    категорії.set(р.category, кат);
  }

  console.log('Recall по категоріях:');
  console.log('─'.repeat(50));

  const відсортовані = Array.from(категорії.entries()).sort((а, б) => а[0].localeCompare(б[0], 'uk'));
  for (const [назва, дані] of відсортовані) {
    const catRecall = дані.всього > 0 ? (дані.знайдено / дані.всього) * 100 : 0;
    const бар = catRecall === 100 ? '██████████' : '█'.repeat(Math.round(catRecall / 10)) + '░'.repeat(10 - Math.round(catRecall / 10));
    console.log(`  ${назва.padEnd(25)} ${дані.знайдено}/${дані.всього}  ${catRecall.toFixed(0).padStart(3)}%  ${бар}`);
  }

  // Пропущені питання
  const пропущені = результати.filter(р => !р.found);
  if (пропущені.length > 0) {
    console.log(`\nПропущені питання (${пропущені.length}):`);
    console.log('─'.repeat(50));
    for (const п of пропущені) {
      console.log(`  [${п.category}] ${п.id}`);
      console.log(`    Питання: ${п.question}`);
      console.log(`    Очікувані: ${п.expectedChunks.join(', ')}`);
      console.log(`    Знайдені top-8: ${п.foundChunks.slice(0, 3).join(', ')}${п.foundChunks.length > 3 ? '...' : ''}`);
      console.log();
    }
  }

  console.log('========================================\n');
}

async function main(): Promise<void> {
  console.log('Завантаження бази законів...');
  const чанки = loadAllLaws();
  console.log(`Завантажено ${чанки.length} чанків`);

  console.log('Завантаження golden test set...');
  const питання = завантажитиGoldenSet();
  console.log(`Завантажено ${питання.length} питань`);

  console.log('\nЗапуск keyword пошуку...');
  const результати = оцінитиKeywordПошук(питання, чанки);
  вивестиЗвіт(результати);
}

main().catch(err => {
  console.error('Помилка eval:', err);
  process.exit(1);
});
