// Сервіс верифікації цитат — перевіряє цитати AI проти наданих чанків законів

import type { LawChunk } from '../../../laws/index.js';

/** Розібрана цитата з відповіді AI */
export interface Citation {
  /** Посилання на статтю/пункт (напр. "Стаття 10, Частина 2") */
  article: string;
  /** Дослівна цитата з тексту */
  quote: string;
  /** Чи підтверджена цитата проти наданих чанків */
  verified: boolean;
}

/** Результат верифікації з додатковою інформацією */
export interface VerifiedCitation extends Citation {
  /** ID чанка, що підтвердив цитату (якщо знайдено) */
  matchedChunkId?: string;
}

/**
 * Знаходимо індекс останнього входження ЦИТАТИ: на початку рядка.
 * Повертає -1 якщо не знайдено.
 * Використовує останнє входження, щоб слово "Цитати:" в прозі відповіді
 * не було помилково прийнято за машинний блок цитат у кінці.
 */
function findLastCitationBlockStart(response: string): number {
  let lastIndex = -1;
  const regex = /(?:^|\n)\s*\*{0,2}ЦИТАТИ:\*{0,2}/gi;
  let match;
  while ((match = regex.exec(response)) !== null) {
    lastIndex = match.index;
  }
  return lastIndex;
}

/**
 * Витягує цитати з блоку ЦИТАТИ: у відповіді AI.
 * Повертає порожній масив якщо блоку немає.
 * Шукає останнє входження ЦИТАТИ: щоб уникнути хибного спрацювання на прозовому тексті.
 */
export function extractCitations(response: string): Citation[] {
  const blockStart = findLastCitationBlockStart(response);
  if (blockStart === -1) return [];

  const blockText = response.slice(blockStart);
  const contentMatch = blockText.match(/\s*\*{0,2}ЦИТАТИ:\*{0,2}\s*\n?([\s\S]*)$/i);
  if (!contentMatch) return [];

  const block = contentMatch[1];
  const citations: Citation[] = [];

  // Кожен рядок формату: - Стаття N, Частина N | "цитата"
  const lines = block.split('\n').filter((line) => line.trim().startsWith('- '));

  for (const line of lines) {
    const match = line.trim().match(/^-\s+(.+?)\s*\|\s*[«"\u201C\u201E](.+?)[»"\u201D\u201F]\s*$/);
    if (match) {
      citations.push({
        article: match[1].trim(),
        quote: match[2].trim(),
        verified: false,
      });
    }
  }

  return citations;
}

/**
 * Нормалізує текст для fuzzy порівняння:
 * - Прибирає зайві пробіли
 * - Нижній регістр
 * - Прибирає розділові знаки що можуть відрізнятися
 */
function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[«»""„"'ʼ']/g, '')
    .replace(/\s*[-–—]\s*/g, ' ')
    .trim();
}

/**
 * Перевіряє чи цитата приблизно міститься в тексті чанка.
 * Допускає невеликі відмінності (пробіли, розділові знаки, регістр).
 */
function fuzzyContains(chunkText: string, quote: string): boolean {
  const normalizedChunk = normalizeForComparison(chunkText);
  const normalizedQuote = normalizeForComparison(quote);

  // Точне входження після нормалізації
  if (normalizedChunk.includes(normalizedQuote)) return true;

  // Перевірка на часткове входження — якщо цитата довга,
  // шукаємо чи більша частина слів цитати присутня в чанку (bag-of-words)
  const quoteWords = normalizedQuote.split(' ').filter((w) => w.length > 2);
  if (quoteWords.length < 3) return false;

  // Мінімальний поріг — 80% слів мають бути присутні (порівнюємо цілі слова)
  const chunkWordSet = new Set(normalizedChunk.split(' '));
  const foundWords = quoteWords.filter((word) => chunkWordSet.has(word));
  const ratio = foundWords.length / quoteWords.length;

  return ratio >= 0.8;
}

/**
 * Конвертує римське число у арабське.
 * Підтримує числа I-XXXIX (достатньо для розділів законів).
 */
function romanToArabic(roman: string): number {
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };
  let result = 0;
  for (let i = 0; i < roman.length; i++) {
    const current = values[roman[i]];
    const next = values[roman[i + 1]];
    if (next && current < next) {
      result -= current;
    } else {
      result += current;
    }
  }
  return result;
}

/**
 * Витягує номери статей з тексту, зберігаючи складені номери (напр. "10-1").
 * Підтримує як арабські ("Стаття 10"), так і римські ("Розділ II") числа.
 * Повертає масив рядків типу ["10", "2"] або ["10-1", "3"].
 */
function extractArticleNumbers(text: string): string[] {
  const results: string[] = [];
  // Шукаємо арабські числа (з можливим суфіксом -N) та римські числа (великі та малі)
  const regex = /\d+(?:-\d+)*|(?<![А-ЯA-Zа-яa-zІіЇїЄєҐґ])[IVXLivxl]+(?![А-ЯA-Zа-яa-zІіЇїЄєҐґ])/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const token = match[0].toUpperCase();
    if (/^\d/.test(token)) {
      results.push(token);
    } else if (/^[IVXL]+$/.test(token)) {
      results.push(String(romanToArabic(token)));
    }
  }
  return results;
}

/**
 * Перевіряє чи посилання на статтю/частину цитати відповідає чанку.
 * Порівнює всі числові ідентифікатори (стаття, частина) — всі номери з цитати
 * повинні послідовно співпадати з номерами чанка.
 */
function articleMatches(citationArticle: string, chunk: LawChunk): boolean {
  const chunkArticleText = chunk.part ? `${chunk.article} ${chunk.part}` : chunk.article;

  const citationNumbers = extractArticleNumbers(citationArticle);
  const chunkNumbers = extractArticleNumbers(chunkArticleText);

  // Якщо немає чисел — не можемо підтвердити відповідність
  if (citationNumbers.length === 0 || chunkNumbers.length === 0) return false;

  // Всі номери з цитати повинні послідовно співпадати з номерами чанка
  // Напр. цитата "Стаття 10, Частина 2" → ["10", "2"] має співпадати з чанком ["10", "2"]
  // Цитата "Стаття 10" → ["10"] співпадає з чанком ["10", "2"] (стаття вірна, частина не вказана)
  for (let i = 0; i < citationNumbers.length; i++) {
    if (i >= chunkNumbers.length) return false;
    if (citationNumbers[i] !== chunkNumbers[i]) return false;
  }

  return true;
}

/**
 * Верифікує масив цитат проти наданих чанків.
 * Для кожної цитати шукає чанк де текст цитати присутній (fuzzy match)
 * та номер статті відповідає.
 */
export function verifyCitations(
  citations: Citation[],
  chunks: LawChunk[]
): VerifiedCitation[] {
  return citations.map((citation) => {
    const result: VerifiedCitation = { ...citation, verified: false };

    // Шукаємо чанк де текст цитати міститься і стаття відповідає
    for (const chunk of chunks) {
      if (articleMatches(citation.article, chunk) && fuzzyContains(chunk.text, citation.quote)) {
        result.verified = true;
        result.matchedChunkId = chunk.id;
        break;
      }
    }

    return result;
  });
}

/**
 * Перевіряє чи вміст після заголовка ЦИТАТИ: містить рядки у форматі цитат (починаються з "- ").
 * Захищає від хибного спрацювання на прозовому "Цитати:" в тексті відповіді.
 */
function hasCitationFormattedLines(blockContent: string): boolean {
  const lines = blockContent.split('\n').filter((l) => l.trim().length > 0);
  // Перевіряємо наявність рядків у повному форматі цитат: "- ... | «цитата»"
  // Просто "- " недостатньо — може бути звичайний маркований список у прозі
  return lines.some((l) => {
    const trimmed = l.trim();
    return trimmed.startsWith('- ') && /\|\s*[«"\u201C\u201E]/.test(trimmed);
  });
}

/**
 * Перевіряє чи у відповіді є блок ЦИТАТИ: з рядками цитат (формат "- ...").
 * Повертає false якщо "Цитати:" зустрічається в прозі без реальних рядків цитат.
 */
export function hasCitationBlock(response: string): boolean {
  const blockStart = findLastCitationBlockStart(response);
  if (blockStart === -1) return false;

  const blockText = response.slice(blockStart);
  const contentMatch = blockText.match(/\s*\*{0,2}ЦИТАТИ:\*{0,2}\s*\n?([\s\S]*)$/i);
  if (!contentMatch) return false;

  return hasCitationFormattedLines(contentMatch[1]);
}

/**
 * Видаляє блок ЦИТАТИ: з тексту відповіді.
 * Якщо блоку немає — повертає текст без змін.
 * Видаляє від останнього входження ЦИТАТИ: до кінця тексту.
 * Не видаляє прозове "Цитати:" без рядків цитат — захист від хибного спрацювання.
 */
export function removeCitationBlock(response: string): string {
  const blockStart = findLastCitationBlockStart(response);
  if (blockStart === -1) return response;

  const blockText = response.slice(blockStart);
  const contentMatch = blockText.match(/\s*\*{0,2}ЦИТАТИ:\*{0,2}\s*\n?([\s\S]*)$/i);
  if (!contentMatch) return response;

  const content = contentMatch[1];

  // Видаляємо якщо: є рядки цитат (формат "- ...") АБО блок порожній/термінальний
  // Не видаляємо якщо: після ЦИТАТИ: йде прозовий текст без рядків цитат (хибне спрацювання)
  if (content.trim().length > 0 && !hasCitationFormattedLines(content)) {
    return response;
  }

  return response.slice(0, blockStart).trimEnd();
}
