import type { LawChunk } from '../../../laws/index';

export interface SearchResult {
  chunk: LawChunk;
  score: number;
}

// Мінімальна довжина слова для пошуку — слова ≤3 символи ігноруються
const МІН_ДОВЖИНА_СЛОВА = 4;

// Вагові коефіцієнти пошуку
const ВАГА_KEYWORD = 3;
const ВАГА_НАЗВИ = 2;
const ВАГА_ТЕКСТУ = 1;

// Максимальна кількість результатів
const МАКС_РЕЗУЛЬТАТІВ = 5;

/**
 * Пошук релевантних чанків законів за запитом користувача.
 * Використовує вагові коефіцієнти: keywords (+3), назва статті (+2), текст (+1).
 * Повертає відсортований масив результатів (не більше 5).
 */
export function searchLaws(запит: string, чанки: LawChunk[]): SearchResult[] {
  if (!запит || запит.trim().length === 0) {
    return [];
  }

  // Розбиваємо запит на слова та фільтруємо короткі
  const слова = запит
    .toLowerCase()
    .split(/\s+/)
    .filter(с => с.length >= МІН_ДОВЖИНА_СЛОВА);

  if (слова.length === 0) {
    return [];
  }

  const результати: SearchResult[] = [];

  for (const чанк of чанки) {
    let оцінка = 0;

    const keywordsНижній = чанк.keywords.map(k => k.toLowerCase());
    const текстНижній = чанк.text.toLowerCase();
    const назваНижня = (чанк.title ?? '').toLowerCase();

    for (const слово of слова) {
      // Перевіряємо keywords (вага +3 за кожен збіг)
      if (keywordsНижній.some(k => k.includes(слово))) {
        оцінка += ВАГА_KEYWORD;
      }

      // Перевіряємо назву статті (вага +2)
      if (назваНижня.includes(слово)) {
        оцінка += ВАГА_НАЗВИ;
      }

      // Перевіряємо текст статті (вага +1)
      if (текстНижній.includes(слово)) {
        оцінка += ВАГА_ТЕКСТУ;
      }
    }

    if (оцінка > 0) {
      результати.push({ chunk: чанк, score: оцінка });
    }
  }

  // Сортуємо за спаданням оцінки та обмежуємо кількість
  результати.sort((а, б) => б.score - а.score);
  return результати.slice(0, МАКС_РЕЗУЛЬТАТІВ);
}
