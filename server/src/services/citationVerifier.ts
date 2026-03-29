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
 * Витягує цитати з блоку ЦИТАТИ: у відповіді AI.
 * Повертає порожній масив якщо блоку немає.
 */
export function extractCitations(response: string): Citation[] {
  const citationBlockMatch = response.match(/\nЦИТАТИ:\s*\n([\s\S]*?)$/);
  if (!citationBlockMatch) return [];

  const block = citationBlockMatch[1];
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

  // Мінімальний поріг — 80% слів мають бути присутні
  const foundWords = quoteWords.filter((word) => normalizedChunk.includes(word));
  const ratio = foundWords.length / quoteWords.length;

  return ratio >= 0.8;
}

/**
 * Верифікує масив цитат проти наданих чанків.
 * Для кожної цитати шукає чанк де текст цитати присутній (fuzzy match).
 */
export function verifyCitations(
  citations: Citation[],
  chunks: LawChunk[]
): VerifiedCitation[] {
  return citations.map((citation) => {
    const result: VerifiedCitation = { ...citation, verified: false };

    // Шукаємо чанк де текст цитати міститься
    for (const chunk of chunks) {
      if (fuzzyContains(chunk.text, citation.quote)) {
        result.verified = true;
        result.matchedChunkId = chunk.id;
        break;
      }
    }

    return result;
  });
}

/**
 * Видаляє блок ЦИТАТИ: з тексту відповіді.
 * Якщо блоку немає — повертає текст без змін.
 */
export function removeCitationBlock(response: string): string {
  return response.replace(/\nЦИТАТИ:\s*\n[\s\S]*?$/, '').trimEnd();
}
