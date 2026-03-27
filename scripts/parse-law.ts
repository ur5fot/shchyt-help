import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Стоп-слова для фільтрації при генерації keywords
const STOP_WORDS = new Set([
  'та', 'або', 'але', 'що', 'як', 'це', 'для', 'від', 'до',
  'при', 'під', 'над', 'між', 'через', 'після', 'без', 'при',
  'де', 'коли', 'якщо', 'також', 'його', 'її', 'їх', 'цей',
  'ця', 'ці', 'той', 'ті', 'який', 'яка', 'які', 'яке',
  'інші', 'інший', 'якщо', 'лише', 'тільки', 'може', 'бути',
  'щодо', 'якої', 'яких', 'яким', 'якому', 'яким', 'цього',
  'цьому', 'цією', 'цими', 'того', 'тому', 'тією', 'тими',
  'нього', 'ньому', 'нього', 'яких', 'якому', 'свого', 'свої',
  'своє', 'своїм', 'своїх', 'разі', 'згідно', 'відповідно',
]);

export interface LawChunkRaw {
  id: string;
  article: string;
  part: string;
  title?: string;
  text: string;
  keywords: string[];
}

export interface LawFile {
  title: string;
  short_title: string;
  source_url: string;
  last_updated: string;
  chunks: LawChunkRaw[];
}

// Витягає keywords зі значущих слів тексту
export function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[.,;:!?()«»"'\/\-–—]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4 && !STOP_WORDS.has(w));

  const freq: Record<string, number> = {};
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

// Витягає текстовий вміст тегу (без вкладених тегів)
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Парсить HTML закону та повертає структуру LawFile
export function parseLawHtml(html: string, sourceUrl: string, shortTitle: string): LawFile {
  if (!html || html.trim().length === 0) {
    throw new Error('Порожня сторінка');
  }

  // Витягаємо заголовок закону
  const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/si);
  const title = titleMatch ? stripTags(titleMatch[1]) : shortTitle;

  // Знаходимо всі параграфи
  const pMatches = [...html.matchAll(/<p[^>]*>(.*?)<\/p>/gsi)];
  const paragraphs = pMatches.map(m => stripTags(m[1])).filter(t => t.length > 0);

  const chunks: LawChunkRaw[] = [];
  let currentArticleNum = '';
  let currentArticleTitle = '';
  let partBuffer: string[] = [];
  let partNum = 0;

  // Паттерн для статті: "Стаття 1.", "Стаття 10-1." тощо
  const ARTICLE_RE = /^Стаття\s+([\d][\d-]*)\.\s*(.*)/;
  // Паттерн для частини: "1. Текст"
  const PART_RE = /^(\d{1,2})\.\s+(.+)/s;

  const baseId = shortTitle
    .toLowerCase()
    .replace(/«|»/g, '')
    .replace(/[^а-яіїєґa-z0-9]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);

  function flushChunk() {
    if (!currentArticleNum || partBuffer.length === 0) return;

    const text = partBuffer.join(' ').trim();
    if (text.length < 10) {
      partBuffer = [];
      return;
    }

    const partSuffix = partNum > 0 ? `-ch${partNum}` : `-ch0`;
    const id = `${baseId}-st${currentArticleNum.replace(/[^0-9-]/g, '')}${partSuffix}`;

    chunks.push({
      id,
      article: `Стаття ${currentArticleNum}`,
      part: partNum > 0 ? `Частина ${partNum}` : '',
      ...(currentArticleTitle ? { title: currentArticleTitle } : {}),
      text,
      keywords: extractKeywords(text),
    });

    partBuffer = [];
  }

  for (const rawText of paragraphs) {
    const text = rawText.trim();
    if (!text) continue;

    const articleMatch = ARTICLE_RE.exec(text);
    if (articleMatch) {
      // Зберігаємо попередній буфер
      flushChunk();

      currentArticleNum = articleMatch[1];
      currentArticleTitle = articleMatch[2].trim();
      partBuffer = [];
      partNum = 0;
      continue;
    }

    if (!currentArticleNum) continue;

    const partMatch = PART_RE.exec(text);
    if (partMatch) {
      // Зберігаємо попередній буфер
      flushChunk();

      partNum = parseInt(partMatch[1]);
      partBuffer = [partMatch[2].trim()];
    } else {
      // Продовження поточної частини або ненумерований текст
      if (partBuffer.length === 0) {
        partNum = 0;
        partBuffer = [text];
      } else {
        partBuffer.push(text);
      }
    }
  }

  // Зберігаємо останній буфер
  flushChunk();

  return {
    title,
    short_title: shortTitle,
    source_url: sourceUrl,
    last_updated: new Date().toISOString().slice(0, 10),
    chunks,
  };
}

// Завантажує HTML закону за URL та парсить
export async function parseLaw(url: string, shortTitle: string): Promise<LawFile> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Помилка завантаження: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  return parseLawHtml(html, url, shortTitle);
}

// CLI точка входу
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Використання: tsx scripts/parse-law.ts <url> <short_title> [output_filename]');
    console.error('Приклад: tsx scripts/parse-law.ts https://zakon.rada.gov.ua/laws/show/2232-12 "Про військовий обов\'язок"');
    process.exit(1);
  }

  const [url, shortTitle, outputFilename] = args;

  console.log(`Завантаження: ${url}`);
  const law = await parseLaw(url, shortTitle);

  const filename = outputFilename || shortTitle
    .toLowerCase()
    .replace(/«|»/g, '')
    .replace(/[^а-яіїєґa-z0-9]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const outputPath = join(__dirname, '..', 'laws', `${filename}.json`);
  writeFileSync(outputPath, JSON.stringify(law, null, 2), 'utf-8');

  console.log(`Збережено ${law.chunks.length} чанків → ${outputPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}
