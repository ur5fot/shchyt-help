/**
 * Скрипт оцінки якості пошуку та відповідей AI (retrieval + end-to-end evaluation).
 * Завантажує golden test set та перевіряє:
 * - Retrieval recall: чи searchLaws знаходить очікувані чанки (завжди)
 * - Citation accuracy: чи AI цитує правильні статті (з прапорцем --full)
 * - Fact recall: чи відповідь містить очікувані факти (з прапорцем --full)
 *
 * Використання:
 *   npm run eval           — тільки retrieval (швидко, без API)
 *   npm run eval -- --full — повний eval з Claude API (повільно, коштує токени)
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadAllLaws } from '../laws/index';
import { searchLaws } from '../server/src/services/lawSearch';
import { buildPrompt } from '../server/src/services/promptBuilder';
import { askClaude } from '../server/src/services/claude';
import { extractCitations, verifyCitations } from '../server/src/services/citationVerifier';
import {
  type GoldenQuestion,
  type RetrievalResult,
  type FullEvalResult,
  чиФактЗгаданий,
  обчислитиRetrievalRecall,
  обчислитиПовніМетрики,
} from '../server/src/services/evalMetrics';

const __dirname = dirname(fileURLToPath(import.meta.url));

function завантажитиGoldenSet(): GoldenQuestion[] {
  const шлях = join(__dirname, '..', 'eval', 'golden-set.json');
  const вміст = readFileSync(шлях, 'utf-8');
  return JSON.parse(вміст) as GoldenQuestion[];
}

function оцінитиKeywordПошук(
  питання: GoldenQuestion[],
  чанки: ReturnType<typeof loadAllLaws>
): RetrievalResult[] {
  const результати: RetrievalResult[] = [];

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

function вивестиRetrievalЗвіт(результати: RetrievalResult[]): void {
  const { overall, поКатегоріях } = обчислитиRetrievalRecall(результати);

  console.log('\n========================================');
  console.log('  RETRIEVAL EVALUATION REPORT (keyword)');
  console.log('========================================\n');
  console.log(`Overall recall: ${overall.знайдено}/${overall.всього} (${overall.recall.toFixed(1)}%)\n`);

  console.log('Recall по категоріях:');
  console.log('─'.repeat(50));

  const відсортовані = Array.from(поКатегоріях.entries()).sort((а, б) => а[0].localeCompare(б[0], 'uk'));
  for (const [назва, дані] of відсортовані) {
    const бар = дані.recall === 100 ? '██████████' : '█'.repeat(Math.round(дані.recall / 10)) + '░'.repeat(10 - Math.round(дані.recall / 10));
    console.log(`  ${назва.padEnd(25)} ${дані.знайдено}/${дані.всього}  ${дані.recall.toFixed(0).padStart(3)}%  ${бар}`);
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

/**
 * Запускає повний eval з Claude API для одного питання.
 */
async function оцінитиПитанняЧерезAPI(
  питання: GoldenQuestion,
  чанки: ReturnType<typeof loadAllLaws>,
  retrievalFound: boolean
): Promise<FullEvalResult> {
  // Шукаємо чанки для промпту
  const знайдені = searchLaws(питання.question, чанки);
  const знайденіЧанки = знайдені.map(р => р.chunk);

  // Складаємо промпт і запитуємо Claude
  const промпт = buildPrompt(питання.question, знайденіЧанки);
  const відповідь = await askClaude(промпт);

  // Витягуємо та верифікуємо цитати
  const цитати = extractCitations(відповідь);
  const верифіковані = verifyCitations(цитати, знайденіЧанки);

  // Перевіряємо citation accuracy
  const citedArticles = верифіковані.map(ц => ц.article);
  const correctCitations = верифіковані.filter(ц => ц.verified).length;
  const hallucinatedCitations = верифіковані.filter(ц => !ц.verified).length;

  // Перевіряємо fact recall
  const expectedFacts = питання.expectedFacts ?? [];
  const foundFacts = expectedFacts.filter(ф => чиФактЗгаданий(відповідь, ф));
  const missedFacts = expectedFacts.filter(ф => !чиФактЗгаданий(відповідь, ф));

  return {
    id: питання.id,
    question: питання.question,
    category: питання.category,
    retrievalFound,
    expectedArticles: питання.expectedArticles,
    citedArticles,
    correctCitations,
    totalCitations: верифіковані.length,
    hallucinatedCitations,
    expectedFacts,
    foundFacts,
    missedFacts,
  };
}

function вивестиПовнийЗвіт(результати: FullEvalResult[]): void {
  const метрики = обчислитиПовніМетрики(результати);

  console.log('\n========================================');
  console.log('  FULL EVALUATION REPORT (Claude API)');
  console.log('========================================\n');

  const зЦитатами = результати.filter(р => р.totalCitations > 0);
  const зФактами = результати.filter(р => р.expectedFacts.length > 0);

  console.log('Citation metrics:');
  console.log('─'.repeat(50));
  console.log(`  Питань з цитатами: ${зЦитатами.length}/${результати.length}`);
  console.log(`  Citation accuracy:   ${метрики.правильнихЦитат}/${метрики.всьогоЦитат} (${метрики.citationAccuracy.toFixed(1)}%)`);
  console.log(`  Hallucination rate:  ${метрики.галюцинованихЦитат}/${метрики.всьогоЦитат} (${метрики.hallucinationRate.toFixed(1)}%)`);

  console.log('\nFact recall:');
  console.log('─'.repeat(50));
  console.log(`  Питань з очікуваними фактами: ${зФактами.length}`);
  console.log(`  Fact recall: ${метрики.знайденихФактів}/${метрики.всьогоФактів} (${метрики.factRecall.toFixed(1)}%)`);

  // Деталі галюцінацій
  const зГалюцинаціями = результати.filter(р => р.hallucinatedCitations > 0);
  if (зГалюцинаціями.length > 0) {
    console.log(`\nПитання з галюцинованими цитатами (${зГалюцинаціями.length}):`);
    console.log('─'.repeat(50));
    for (const р of зГалюцинаціями) {
      console.log(`  [${р.category}] ${р.id}`);
      console.log(`    Питання: ${р.question}`);
      console.log(`    Галюциновані: ${р.hallucinatedCitations}/${р.totalCitations}`);
      console.log();
    }
  }

  // Деталі пропущених фактів
  const зПропущенимиФактами = зФактами.filter(р => р.missedFacts.length > 0);
  if (зПропущенимиФактами.length > 0) {
    console.log(`\nПитання з пропущеними фактами (${зПропущенимиФактами.length}):`);
    console.log('─'.repeat(50));
    for (const р of зПропущенимиФактами) {
      console.log(`  [${р.category}] ${р.id}`);
      console.log(`    Пропущені: ${р.missedFacts.join(', ')}`);
      console.log();
    }
  }

  console.log('========================================\n');
}

async function main(): Promise<void> {
  const fullMode = process.argv.includes('--full');

  console.log('Завантаження бази законів...');
  const чанки = loadAllLaws();
  console.log(`Завантажено ${чанки.length} чанків`);

  console.log('Завантаження golden test set...');
  const питання = завантажитиGoldenSet();
  console.log(`Завантажено ${питання.length} питань`);

  // Завжди запускаємо keyword retrieval
  console.log('\nЗапуск keyword пошуку...');
  const retrievalРезультати = оцінитиKeywordПошук(питання, чанки);
  вивестиRetrievalЗвіт(retrievalРезультати);

  // Повний eval з Claude API (тільки з --full)
  if (fullMode) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('Помилка: ANTHROPIC_API_KEY не встановлений. Додайте його в .env файл.');
      process.exit(1);
    }

    console.log('Запуск повного eval через Claude API...');
    console.log(`(${питання.length} питань, це може зайняти кілька хвилин)\n`);

    // Створюємо мапу retrieval результатів
    const retrievalМапа = new Map(retrievalРезультати.map(р => [р.id, р.found]));

    const повніРезультати: FullEvalResult[] = [];
    for (let i = 0; i < питання.length; i++) {
      const п = питання[i];
      const retrievalFound = retrievalМапа.get(п.id) ?? false;

      process.stdout.write(`  [${i + 1}/${питання.length}] ${п.id}...`);

      try {
        const результат = await оцінитиПитанняЧерезAPI(п, чанки, retrievalFound);
        повніРезультати.push(результат);

        const статус = результат.hallucinatedCitations > 0 ? ' ⚠ галюцинації' : ' ✓';
        console.log(статус);
      } catch (помилка) {
        console.log(' ✗ помилка');
        console.error(`    ${помилка instanceof Error ? помилка.message : String(помилка)}`);
        // Продовжуємо з рештою питань
      }
    }

    if (повніРезультати.length > 0) {
      вивестиПовнийЗвіт(повніРезультати);
    }
  }
}

main().catch(err => {
  console.error('Помилка eval:', err);
  process.exit(1);
});
