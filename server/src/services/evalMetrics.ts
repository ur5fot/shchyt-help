/**
 * Утиліти для оцінки якості eval: нормалізація статей, перевірка фактів, підрахунок метрик.
 * Виокремлено з scripts/eval.ts для тестування.
 */

export interface GoldenQuestion {
  id: string;
  question: string;
  expectedChunks: string[];
  expectedArticles: string[];
  category: string;
  expectedFacts?: string[];
}

export interface RetrievalResult {
  id: string;
  question: string;
  category: string;
  found: boolean;
  expectedChunks: string[];
  foundChunks: string[];
}

export interface FullEvalResult {
  id: string;
  question: string;
  category: string;
  retrievalFound: boolean;
  expectedArticles: string[];
  citedArticles: string[];
  correctCitations: number;
  totalCitations: number;
  hallucinatedCitations: number;
  expectedFacts: string[];
  foundFacts: string[];
  missedFacts: string[];
}

/**
 * Нормалізує назву статті для порівняння.
 */
export function нормалізуватиСтаттю(article: string): string {
  return article
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/частина\s+/g, 'ч.')
    .trim();
}

/**
 * Перевіряє чи цитована стаття AI збігається з однією з очікуваних.
 */
export function чиСтаттяОчікувана(citedArticle: string, expectedArticles: string[]): boolean {
  const нормЦитата = нормалізуватиСтаттю(citedArticle);
  return expectedArticles.some(очікувана => {
    const нормОчікувана = нормалізуватиСтаттю(очікувана);
    // Точний збіг або один є початком іншого з роздільником (кома, пробіл після номера)
    if (нормЦитата === нормОчікувана) return true;
    // "стаття 26, ч.3" містить "стаття 26" — але не "стаття 2" у "стаття 26"
    if (нормЦитата.startsWith(нормОчікувана + ',') || нормЦитата.startsWith(нормОчікувана + ' ч.')) return true;
    if (нормОчікувана.startsWith(нормЦитата + ',') || нормОчікувана.startsWith(нормЦитата + ' ч.')) return true;
    return false;
  });
}

/**
 * Перевіряє чи факт згадується у відповіді (нечутливо до регістру).
 */
export function чиФактЗгаданий(відповідь: string, факт: string): boolean {
  const нормВідповідь = відповідь.toLowerCase();
  const нормФакт = факт.toLowerCase();
  return нормВідповідь.includes(нормФакт);
}

/**
 * Обчислює retrieval recall для набору результатів.
 */
export function обчислитиRetrievalRecall(результати: RetrievalResult[]): {
  overall: { знайдено: number; всього: number; recall: number };
  поКатегоріях: Map<string, { знайдено: number; всього: number; recall: number }>;
} {
  const всього = результати.length;
  const знайдено = результати.filter(р => р.found).length;
  const recall = всього > 0 ? (знайдено / всього) * 100 : 0;

  const категорії = new Map<string, { знайдено: number; всього: number; recall: number }>();
  for (const р of результати) {
    const кат = категорії.get(р.category) ?? { знайдено: 0, всього: 0, recall: 0 };
    кат.всього++;
    if (р.found) кат.знайдено++;
    кат.recall = кат.всього > 0 ? (кат.знайдено / кат.всього) * 100 : 0;
    категорії.set(р.category, кат);
  }

  return { overall: { знайдено, всього, recall }, поКатегоріях: категорії };
}

/**
 * Обчислює метрики цитат та фактів для повного eval.
 */
export function обчислитиПовніМетрики(результати: FullEvalResult[]): {
  citationAccuracy: number;
  hallucinationRate: number;
  factRecall: number;
  всьогоЦитат: number;
  правильнихЦитат: number;
  всьогоЦитатДляГалюцинацій: number;
  галюцинованихЦитат: number;
  всьогоФактів: number;
  знайденихФактів: number;
} {
  // Citation accuracy рахується тільки для питань з очікуваними статтями —
  // питання без expectedArticles (напр. гарячі лінії) не мають еталону для порівняння
  const зОчікуванимиСтаттями = результати.filter(р => р.expectedArticles.length > 0);
  const всьогоЦитат = зОчікуванимиСтаттями.reduce((с, р) => с + р.totalCitations, 0);
  const правильнихЦитат = зОчікуванимиСтаттями.reduce((с, р) => с + р.correctCitations, 0);
  // Hallucination rate рахується по всіх питаннях — галюцінації можливі завжди
  const всьогоЦитатДляГалюцинацій = результати.reduce((с, р) => с + р.totalCitations, 0);
  const галюцинованихЦитат = результати.reduce((с, р) => с + р.hallucinatedCitations, 0);

  const зФактами = результати.filter(р => р.expectedFacts.length > 0);
  const всьогоФактів = зФактами.reduce((с, р) => с + р.expectedFacts.length, 0);
  const знайденихФактів = зФактами.reduce((с, р) => с + р.foundFacts.length, 0);

  return {
    citationAccuracy: всьогоЦитат > 0 ? (правильнихЦитат / всьогоЦитат) * 100 : 0,
    hallucinationRate: всьогоЦитатДляГалюцинацій > 0 ? (галюцинованихЦитат / всьогоЦитатДляГалюцинацій) * 100 : 0,
    factRecall: всьогоФактів > 0 ? (знайденихФактів / всьогоФактів) * 100 : 0,
    всьогоЦитат,
    правильнихЦитат,
    всьогоЦитатДляГалюцинацій,
    галюцинованихЦитат,
    всьогоФактів,
    знайденихФактів,
  };
}

function масивРядків(arr: unknown[]): boolean {
  return arr.every(el => typeof el === 'string');
}

/**
 * Парсить та валідує golden set JSON.
 */
export function валідуватиGoldenSet(data: unknown): {
  valid: boolean;
  questions: GoldenQuestion[];
  errors: string[];
} {
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    return { valid: false, questions: [], errors: ['Golden set має бути масивом'] };
  }

  const questions: GoldenQuestion[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < data.length; i++) {
    const item = data[i];

    if (typeof item !== 'object' || item === null) {
      errors.push(`Питання [${i}]: має бути об'єктом`);
      continue;
    }

    const obj = item as Record<string, unknown>;
    const id = obj.id;
    const label = typeof id === 'string' ? id : '?';
    const errorsBefore = errors.length;

    if (typeof obj.id !== 'string' || !obj.id) {
      errors.push(`Питання [${i}]: відсутній або невалідний id`);
    } else if (seenIds.has(obj.id)) {
      errors.push(`Питання [${i}] (${label}): дублікат id`);
    } else {
      seenIds.add(obj.id);
    }
    if (typeof obj.question !== 'string' || !obj.question) errors.push(`Питання [${i}]: відсутній або невалідний question`);
    if (!Array.isArray(obj.expectedChunks) || obj.expectedChunks.length === 0) {
      errors.push(`Питання [${i}] (${label}): expectedChunks має бути непорожнім масивом`);
    } else if (!масивРядків(obj.expectedChunks)) {
      errors.push(`Питання [${i}] (${label}): всі елементи expectedChunks мають бути рядками`);
    }
    if (!Array.isArray(obj.expectedArticles)) {
      errors.push(`Питання [${i}] (${label}): expectedArticles має бути масивом`);
    } else if (!масивРядків(obj.expectedArticles)) {
      errors.push(`Питання [${i}] (${label}): всі елементи expectedArticles мають бути рядками`);
    }
    if (typeof obj.category !== 'string' || !obj.category) errors.push(`Питання [${i}] (${label}): відсутній або невалідний category`);
    if (obj.expectedFacts !== undefined) {
      if (!Array.isArray(obj.expectedFacts)) {
        errors.push(`Питання [${i}] (${label}): expectedFacts має бути масивом`);
      } else if (!масивРядків(obj.expectedFacts)) {
        errors.push(`Питання [${i}] (${label}): всі елементи expectedFacts мають бути рядками`);
      }
    }

    if (errors.length === errorsBefore) {
      questions.push(obj as unknown as GoldenQuestion);
    }
  }

  return { valid: errors.length === 0, questions, errors };
}
