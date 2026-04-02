import { writeFileSync } from 'fs';
import { join, dirname, basename } from 'path';
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
  document_id?: string;
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
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&ge;/g, '\u2265')
    .replace(/&le;/g, '\u2264')
    .replace(/&times;/g, '\u00D7')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&laquo;/g, '\u00AB')
    .replace(/&raquo;/g, '\u00BB')
    .replace(/&copy;/g, '\u00A9')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

// Перевіряє чи параграф є редакційною приміткою (не основний текст)
export function isEditorialNote(text: string): boolean {
  return /^\{.*\}$/.test(text.trim());
}

// Видаляє інлайн редакційні примітки {…} з тексту
// Не підтримує вкладені дужки (на zakon.rada.gov.ua не зустрічаються)
export function stripEditorialNotes(text: string): string {
  return text.replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
}

// Генерує baseId з short_title
export function makeBaseId(shortTitle: string): string {
  return shortTitle
    .toLowerCase()
    .replace(/«|»/g, '')
    .replace(/[^а-яіїєґa-z0-9]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20)
    .replace(/-$/, '');
}

// Парсить закон зі "Стаття N" структурою
export function parseArticleBased(paragraphs: string[], baseId: string): LawChunkRaw[] {
  const chunks: LawChunkRaw[] = [];
  let currentArticleNum = '';
  let currentArticleTitle = '';
  let partBuffer: string[] = [];
  let partNum = 0;

  const ARTICLE_RE = /^Стаття\s+([\d][\d-]*)\.\s*(.*)/;
  const PART_RE = /^(\d{1,2})\.\s+(.+)/s;
  // Розділи типу "Прикінцеві положення", "Перехідні положення" — окремий псевдо-артикль
  // Може бути як "Прикінцеві положення", так і "Розділ VII ПРИКІНЦЕВІ ПОЛОЖЕННЯ"
  const SECTION_HEADER_RE = /^(?:Розділ\s+[IVXLC\d]+\s+)?((?:Прикінцеві|Перехідні|Прикінцеві та перехідні)\s+положення)\s*$/i;

  function flushExcludedArticle() {
    if (!currentArticleNum || currentArticleNum === 'pp') return;
    const articleTag = `st${currentArticleNum.replace(/[^0-9-]/g, '')}`;
    const id = `${baseId}-${articleTag}-ch0`;
    const text = `Стаття ${currentArticleNum} виключена.`;
    chunks.push({
      id,
      article: `Стаття ${currentArticleNum}`,
      part: '',
      text,
      keywords: ['виключена', 'виключено'],
    });
  }

  function flushChunk() {
    if (!currentArticleNum || partBuffer.length === 0) return;

    const text = partBuffer.join(' ').trim();
    if (text.length < 10) {
      partBuffer = [];
      return;
    }

    const partSuffix = partNum > 0 ? `-ch${partNum}` : `-ch0`;
    const isPseudoArticle = currentArticleNum === 'pp';
    const articleTag = isPseudoArticle ? 'pp' : `st${currentArticleNum.replace(/[^0-9-]/g, '')}`;
    const id = `${baseId}-${articleTag}${partSuffix}`;

    const cleanText = stripEditorialNotes(text);
    if (!cleanText) return;

    chunks.push({
      id,
      article: isPseudoArticle ? currentArticleTitle : `Стаття ${currentArticleNum}`,
      part: partNum > 0 ? `Частина ${partNum}` : '',
      ...(currentArticleTitle ? { title: currentArticleTitle } : {}),
      text: cleanText,
      keywords: extractKeywords(cleanText),
    });

    partBuffer = [];
  }

  for (const rawText of paragraphs) {
    const text = rawText.trim();
    if (!text) continue;

    // Повнорядкова примітка "{Статтю N виключено ...}" після "Стаття N." — дворядкова форма виключення
    if (isEditorialNote(text)) {
      const ARTICLE_EXCLUDED_STANDALONE_RE = /\{[^}]*статтю\s+([\d][\d-]*)[^}]*виключен[оіа][^}]*\}/i;
      const excludedMatch = ARTICLE_EXCLUDED_STANDALONE_RE.exec(text);
      if (excludedMatch && currentArticleNum === excludedMatch[1] && partBuffer.length === 0) {
        flushExcludedArticle();
        currentArticleNum = '';
      }
      continue;
    }

    // Секція "Прикінцеві положення" тощо — окремий псевдо-артикль
    const sectionHeaderMatch = SECTION_HEADER_RE.exec(text);
    if (sectionHeaderMatch) {
      flushChunk();
      currentArticleNum = 'pp';
      currentArticleTitle = sectionHeaderMatch[1];
      partBuffer = [];
      partNum = 0;
      continue;
    }

    const articleMatch = ARTICLE_RE.exec(text);
    if (articleMatch) {
      flushChunk();
      currentArticleNum = articleMatch[1];
      currentArticleTitle = articleMatch[2].trim();
      partBuffer = [];
      partNum = 0;
      // Виключена стаття: заголовок — редакційна примітка "{Статтю N виключено ...}"
      // або просто слово "Виключена"/"Виключено"
      // Важливо: перевіряємо саме "статтю ... виключено", а не "назву статті виключено"
      // (бо "назву виключено" означає що прибрали лише назву, а тіло статті залишилось)
      const titleWithoutNotes = stripEditorialNotes(currentArticleTitle);
      const ARTICLE_EXCLUDED_NOTE_RE = /\{[^}]*статтю\s+([\d][\d-]*)[^}]*виключен[оіа][^}]*\}/i;
      const excludedNoteMatch = ARTICLE_EXCLUDED_NOTE_RE.exec(currentArticleTitle);
      const isExcludedByNote = excludedNoteMatch !== null && excludedNoteMatch[1] === currentArticleNum && !titleWithoutNotes;
      const isExcludedByTitle = /^виключен[оіа]$/i.test(titleWithoutNotes);
      if (isExcludedByNote || isExcludedByTitle) {
        flushExcludedArticle();
        currentArticleNum = '';
      }
      continue;
    }

    if (!currentArticleNum) continue;

    const partMatch = PART_RE.exec(text);
    if (partMatch) {
      flushChunk();
      partNum = parseInt(partMatch[1]);
      partBuffer = [partMatch[2].trim()];
    } else {
      if (partBuffer.length === 0) {
        partNum = 0;
        partBuffer = [text];
      } else {
        partBuffer.push(text);
      }
    }
  }

  flushChunk();
  return chunks;
}

// Парсить положення/постанову з "N. текст" структурою (пункти замість статей)
function parsePunktBased(paragraphs: string[], baseId: string): LawChunkRaw[] {
  const chunks: LawChunkRaw[] = [];
  let currentSection = '';
  let partBuffer: string[] = [];

  // Паттерн для розділу: "I. Загальна частина", "II. Контракт" тощо
  const SECTION_RE = /^([IVXLC]+)\.\s+(.*)/;
  // Паттерн для пункту: "1. Текст", "10-1. Текст"
  const PUNKT_RE = /^(\d[\d-]*)\.\s+(.+)/s;
  // Паттерн для табличних статей (ВЛК Розклад хвороб): "1 Стаття 1 Включено: ..."
  const TABLE_STATTYA_RE = /^(\d+)\s+Стаття\s+\d+\s+(.*)/s;

  let currentArticleLabel = ''; // "Пункт N" або "Стаття N (Розклад хвороб)"
  let currentIdPrefix = '';     // "p40" або "st12"

  function flushChunk() {
    if (!currentArticleLabel || partBuffer.length === 0) return;

    const text = partBuffer.join(' ').trim();
    if (text.length < 10) {
      partBuffer = [];
      return;
    }

    const sectionSuffix = currentSection ? `-r${currentSection.replace(/[^IVXLC0-9]/g, '')}` : '';
    const id = `${baseId}-${currentIdPrefix}${sectionSuffix}-ch0`;

    const cleanText = stripEditorialNotes(text);
    if (!cleanText) return;

    chunks.push({
      id,
      article: currentArticleLabel,
      part: currentSection ? `Розділ ${currentSection}` : '',
      text: cleanText,
      keywords: extractKeywords(cleanText),
    });

    partBuffer = [];
  }

  for (const rawText of paragraphs) {
    const text = rawText.trim();
    if (!text || isEditorialNote(text)) continue;

    const sectionMatch = SECTION_RE.exec(text);
    if (sectionMatch) {
      flushChunk();
      currentSection = sectionMatch[1];
      continue;
    }

    const punktMatch = PUNKT_RE.exec(text);
    if (punktMatch) {
      flushChunk();
      currentArticleLabel = `Пункт ${punktMatch[1]}`;
      currentIdPrefix = `p${punktMatch[1].replace(/[^0-9-]/g, '')}`;
      partBuffer = [punktMatch[2].trim()];
      continue;
    }

    // Табличні статті ВЛК: "1 Стаття 1 Включено: ..."
    const stattyaMatch = TABLE_STATTYA_RE.exec(text);
    if (stattyaMatch) {
      flushChunk();
      const num = stattyaMatch[1];
      currentArticleLabel = `Стаття ${num} (Розклад хвороб)`;
      currentIdPrefix = `st${num}`;
      partBuffer = [stattyaMatch[2].trim()];
      continue;
    }

    if (currentArticleLabel) {
      partBuffer.push(text);
    }
  }

  flushChunk();
  return chunks;
}

// Розбиває великі чанки, що містять вбудовані "N Стаття N" записи (таблиці ВЛК)
function splitEmbeddedStattyaChunks(chunks: LawChunkRaw[], baseId: string): LawChunkRaw[] {
  const STATTYA_NUM_RE = /^(\d+)\s+Стаття\s+\d+\s+(.*)/s;
  const SPLIT_RE = /\b\d+\s+Стаття\s+\d+\s+/;
  const SIZE_THRESHOLD = МАКС_РОЗМІР_ЧАНКА;

  const result: LawChunkRaw[] = [];
  for (const chunk of chunks) {
    if (!SPLIT_RE.test(chunk.text)) {
      result.push(chunk);
      continue;
    }

    // Малі чанки з одним "N Стаття N" на початку — лише оновлюємо метадані
    if (chunk.text.length < SIZE_THRESHOLD) {
      const sm = STATTYA_NUM_RE.exec(chunk.text);
      if (sm) {
        const num = sm[1];
        const sectionSuffix = chunk.part ? `-r${chunk.part.replace(/[^IVXLC0-9]/g, '')}` : '';
        result.push({
          id: `${baseId}-st${num}${sectionSuffix}-ch0`,
          article: `Стаття ${num} (Розклад хвороб)`,
          part: chunk.part,
          text: chunk.text,
          keywords: chunk.keywords,
        });
      } else {
        result.push(chunk);
      }
      continue;
    }

    // Знаходимо позиції "N Стаття N" у тексті
    const boundaries: number[] = [];
    const globalRe = /\b(\d+)\s+Стаття\s+\d+\s+/g;
    let m;
    while ((m = globalRe.exec(chunk.text)) !== null) {
      boundaries.push(m.index);
    }

    if (boundaries.length === 0) {
      result.push(chunk);
      continue;
    }

    // Текст до першої статті — залишається як оригінальний чанк
    const prefixText = stripEditorialNotes(chunk.text.slice(0, boundaries[0]).trim());
    if (prefixText.length >= 10) {
      result.push({
        ...chunk,
        text: prefixText,
        keywords: extractKeywords(prefixText),
      });
    }

    // Кожна "N Стаття N" стає окремим чанком
    for (let i = 0; i < boundaries.length; i++) {
      const start = boundaries[i];
      const end = i + 1 < boundaries.length ? boundaries[i + 1] : chunk.text.length;
      const segmentText = stripEditorialNotes(chunk.text.slice(start, end).trim());

      const sm = STATTYA_NUM_RE.exec(segmentText);
      if (sm && segmentText.length >= 10) {
        const num = sm[1];
        const sectionSuffix = chunk.part ? `-r${chunk.part.replace(/[^IVXLC0-9]/g, '')}` : '';
        result.push({
          id: `${baseId}-st${num}${sectionSuffix}-ch0`,
          article: `Стаття ${num} (Розклад хвороб)`,
          part: chunk.part,
          text: segmentText,
          keywords: extractKeywords(segmentText),
        });
      } else if (segmentText.length >= 10) {
        result.push({
          ...chunk,
          text: segmentText,
          keywords: extractKeywords(segmentText),
        });
      }
    }
  }
  return result;
}

// Максимальний розмір чанка — більші розбиваються по підпунктах
const МАКС_РОЗМІР_ЧАНКА = 2000;

// Розбиває великі чанки по підпунктах
export function splitLargeChunks(chunks: LawChunkRaw[]): LawChunkRaw[] {
  const result: LawChunkRaw[] = [];

  for (const chunk of chunks) {
    if (chunk.text.length <= МАКС_РОЗМІР_ЧАНКА) {
      result.push(chunk);
      continue;
    }

    // Шукаємо підпункти: "а) ...", "ґ) ...", "1) ...", "21.1. ..."
    // Літерні підпункти (а-я, і, ї, є, ґ) — стандарт українського законодавства
    const subItemRe = /\s(\d+\.\d+\.|\d+\)\s|([а-яіїєґ])\)\s)/g;
    const boundaries: { pos: number; label: string }[] = [];
    let m;
    while ((m = subItemRe.exec(chunk.text)) !== null) {
      // Літерний підпункт → зберігаємо літеру; цифровий → номер
      const label = m[2] || m[1].replace(/[.)\s]/g, '');
      boundaries.push({ pos: m.index + 1, label });
    }

    // Якщо немає підпунктів або лише один — залишаємо як є
    if (boundaries.length <= 1) {
      result.push(chunk);
      continue;
    }

    // Текст до першого підпункту (преамбула)
    const preamble = chunk.text.slice(0, boundaries[0].pos).trim();

    for (let i = 0; i < boundaries.length; i++) {
      const start = boundaries[i].pos;
      const end = i + 1 < boundaries.length ? boundaries[i + 1].pos : chunk.text.length;
      let segmentText = chunk.text.slice(start, end).trim();

      // Додаємо преамбулу до першого підпункту для контексту
      if (i === 0 && preamble) {
        segmentText = preamble + ' ' + segmentText;
      }

      if (segmentText.length < 10) continue;

      const label = boundaries[i].label;
      result.push({
        ...chunk,
        id: `${chunk.id}-${label}`,
        part: chunk.part ? `${chunk.part}, пп.${label}` : `пп.${label}`,
        text: segmentText,
        keywords: extractKeywords(segmentText),
      });
    }
  }

  return result;
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

  const baseId = makeBaseId(shortTitle);

  // Спочатку пробуємо парсити як закон зі статтями
  let chunks = parseArticleBased(paragraphs, baseId);

  // Якщо статей не знайшли — пробуємо як положення/постанову з пунктами
  if (chunks.length === 0) {
    chunks = parsePunktBased(paragraphs, baseId);
  }

  // Розбиваємо великі чанки з вбудованими табличними статтями
  chunks = splitEmbeddedStattyaChunks(chunks, baseId);

  // Розбиваємо великі чанки по підпунктах
  chunks = splitLargeChunks(chunks);

  // Дедуплікація ID (постанови з додатками мають однакові номери пунктів)
  const idCounts: Record<string, number> = {};
  for (const chunk of chunks) {
    const origId = chunk.id;
    const count = idCounts[origId] || 0;
    if (count > 0) {
      chunk.id = `${origId}-d${count}`;
    }
    idCounts[origId] = count + 1;
  }

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
  const law = parseLawHtml(html, url, shortTitle);

  // Якщо 0 чанків — спробувати /print версію (повний текст без JS)
  if (law.chunks.length === 0) {
    const printUrlObj = new URL(url);
    printUrlObj.pathname = printUrlObj.pathname.replace(/\/?$/, '/print');
    const printUrl = printUrlObj.toString();
    console.log(`Основна сторінка дала 0 чанків, спроба: ${printUrl}`);

    const printResponse = await fetch(printUrl);
    if (printResponse.ok) {
      const printHtml = await printResponse.text();
      return parseLawHtml(printHtml, url, shortTitle);
    }
  }

  return law;
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

  const rawFilename = outputFilename || shortTitle
    .toLowerCase()
    .replace(/«|»/g, '')
    .replace(/[^а-яіїєґa-z0-9]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // basename запобігає path traversal (наприклад, "../../etc/foo")
  const filename = basename(rawFilename);
  const outputPath = join(__dirname, '..', 'laws', `${filename}.json`);
  writeFileSync(outputPath, JSON.stringify(law, null, 2), 'utf-8');

  console.log(`Збережено ${law.chunks.length} чанків → ${outputPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
