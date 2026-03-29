// Тести для утиліт оцінки якості eval
import { describe, it, expect } from 'vitest';
import {
  нормалізуватиСтаттю,
  чиСтаттяОчікувана,
  чиФактЗгаданий,
  обчислитиRetrievalRecall,
  обчислитиПовніМетрики,
  валідуватиGoldenSet,
} from '../services/evalMetrics.js';
import type { RetrievalResult, FullEvalResult } from '../services/evalMetrics.js';

describe('нормалізуватиСтаттю', () => {
  it('переводить у нижній регістр', () => {
    expect(нормалізуватиСтаттю('Стаття 26')).toBe('стаття 26');
  });

  it('замінює "частина" на "ч."', () => {
    expect(нормалізуватиСтаттю('Частина 3')).toBe('ч.3');
  });

  it('нормалізує зайві пробіли', () => {
    expect(нормалізуватиСтаттю('  Стаття  26  ')).toBe('стаття 26');
  });

  it('працює з комбінацією стаття + частина', () => {
    expect(нормалізуватиСтаттю('Стаття 10, Частина 2')).toBe('стаття 10, ч.2');
  });
});

describe('чиСтаттяОчікувана', () => {
  it('знаходить точний збіг', () => {
    expect(чиСтаттяОчікувана('Стаття 26', ['Стаття 26'])).toBe(true);
  });

  it('знаходить збіг з різним регістром', () => {
    expect(чиСтаттяОчікувана('стаття 26', ['Стаття 26'])).toBe(true);
  });

  it('знаходить часткове входження', () => {
    expect(чиСтаттяОчікувана('Стаття 26, Частина 3', ['Стаття 26'])).toBe(true);
  });

  it('знаходить зворотне входження', () => {
    expect(чиСтаттяОчікувана('Стаття 26', ['Стаття 26, Частина 3'])).toBe(true);
  });

  it('повертає false якщо стаття не очікувана', () => {
    expect(чиСтаттяОчікувана('Стаття 99', ['Стаття 26', 'Пункт 5'])).toBe(false);
  });

  it('працює з кількома очікуваними', () => {
    expect(чиСтаттяОчікувана('Пункт 5', ['Стаття 26', 'Пункт 5'])).toBe(true);
  });

  it('повертає false для порожнього масиву', () => {
    expect(чиСтаттяОчікувана('Стаття 26', [])).toBe(false);
  });

  it('не плутає "Стаття 1" з "Стаття 10"', () => {
    expect(чиСтаттяОчікувана('Стаття 1', ['Стаття 10'])).toBe(false);
  });

  it('не плутає "Стаття 2" з "Стаття 26"', () => {
    expect(чиСтаттяОчікувана('Стаття 2', ['Стаття 26'])).toBe(false);
  });
});

describe('чиФактЗгаданий', () => {
  it('знаходить факт у відповіді', () => {
    expect(чиФактЗгаданий('Відпустка тривалістю 30 днів', '30 днів')).toBe(true);
  });

  it('нечутливий до регістру', () => {
    expect(чиФактЗгаданий('Відпустка ТРИВАЛІСТЮ 30 днів', 'тривалістю 30 днів')).toBe(true);
  });

  it('повертає false якщо факт відсутній', () => {
    expect(чиФактЗгаданий('Грошове забезпечення', '30 днів')).toBe(false);
  });

  it('працює з порожньою відповіддю', () => {
    expect(чиФактЗгаданий('', 'факт')).toBe(false);
  });
});

describe('обчислитиRetrievalRecall', () => {
  const створитиРезультат = (overrides: Partial<RetrievalResult> = {}): RetrievalResult => ({
    id: 'test',
    question: 'тест',
    category: 'тест',
    found: false,
    expectedChunks: [],
    foundChunks: [],
    ...overrides,
  });

  it('обчислює 100% recall коли всі знайдені', () => {
    const результати = [
      створитиРезультат({ found: true, category: 'а' }),
      створитиРезультат({ found: true, category: 'а' }),
    ];
    const { overall } = обчислитиRetrievalRecall(результати);
    expect(overall.recall).toBe(100);
    expect(overall.знайдено).toBe(2);
    expect(overall.всього).toBe(2);
  });

  it('обчислює 0% recall коли нічого не знайдено', () => {
    const результати = [
      створитиРезультат({ found: false }),
      створитиРезультат({ found: false }),
    ];
    const { overall } = обчислитиRetrievalRecall(результати);
    expect(overall.recall).toBe(0);
  });

  it('обчислює 50% recall', () => {
    const результати = [
      створитиРезультат({ found: true }),
      створитиРезультат({ found: false }),
    ];
    const { overall } = обчислитиRetrievalRecall(результати);
    expect(overall.recall).toBe(50);
  });

  it('рахує по категоріях', () => {
    const результати = [
      створитиРезультат({ found: true, category: 'відпустки' }),
      створитиРезультат({ found: false, category: 'відпустки' }),
      створитиРезультат({ found: true, category: 'грошове' }),
    ];
    const { поКатегоріях } = обчислитиRetrievalRecall(результати);
    expect(поКатегоріях.get('відпустки')?.recall).toBe(50);
    expect(поКатегоріях.get('грошове')?.recall).toBe(100);
  });

  it('повертає 0 для порожнього масиву', () => {
    const { overall } = обчислитиRetrievalRecall([]);
    expect(overall.recall).toBe(0);
    expect(overall.всього).toBe(0);
  });
});

describe('обчислитиПовніМетрики', () => {
  const створитиПовнийРезультат = (overrides: Partial<FullEvalResult> = {}): FullEvalResult => ({
    id: 'test',
    question: 'тест',
    category: 'тест',
    retrievalFound: true,
    expectedArticles: [],
    citedArticles: [],
    correctCitations: 0,
    totalCitations: 0,
    hallucinatedCitations: 0,
    expectedFacts: [],
    foundFacts: [],
    missedFacts: [],
    ...overrides,
  });

  it('обчислює citation accuracy', () => {
    const результати = [
      створитиПовнийРезультат({ correctCitations: 3, totalCitations: 4, hallucinatedCitations: 1 }),
      створитиПовнийРезультат({ correctCitations: 2, totalCitations: 2, hallucinatedCitations: 0 }),
    ];
    const метрики = обчислитиПовніМетрики(результати);
    expect(метрики.citationAccuracy).toBeCloseTo(83.33, 1);
    expect(метрики.hallucinationRate).toBeCloseTo(16.67, 1);
    expect(метрики.всьогоЦитат).toBe(6);
    expect(метрики.правильнихЦитат).toBe(5);
    expect(метрики.галюцинованихЦитат).toBe(1);
  });

  it('обчислює fact recall', () => {
    const результати = [
      створитиПовнийРезультат({
        expectedFacts: ['факт1', 'факт2', 'факт3'],
        foundFacts: ['факт1', 'факт2'],
      }),
      створитиПовнийРезультат({
        expectedFacts: ['факт4'],
        foundFacts: ['факт4'],
      }),
    ];
    const метрики = обчислитиПовніМетрики(результати);
    expect(метрики.factRecall).toBe(75);
    expect(метрики.всьогоФактів).toBe(4);
    expect(метрики.знайденихФактів).toBe(3);
  });

  it('повертає 0 для порожнього масиву', () => {
    const метрики = обчислитиПовніМетрики([]);
    expect(метрики.citationAccuracy).toBe(0);
    expect(метрики.hallucinationRate).toBe(0);
    expect(метрики.factRecall).toBe(0);
  });

  it('повертає 0 коли немає цитат', () => {
    const результати = [створитиПовнийРезультат()];
    const метрики = обчислитиПовніМетрики(результати);
    expect(метрики.citationAccuracy).toBe(0);
  });
});

describe('валідуватиGoldenSet', () => {
  it('валідує коректний golden set', () => {
    const data = [
      {
        id: 'test-1',
        question: 'Питання?',
        expectedChunks: ['chunk-1'],
        expectedArticles: ['Стаття 1'],
        category: 'тест',
      },
    ];
    const result = валідуватиGoldenSet(data);
    expect(result.valid).toBe(true);
    expect(result.questions).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('відхиляє не-масив', () => {
    const result = валідуватиGoldenSet({ not: 'array' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Golden set має бути масивом');
  });

  it('відхиляє питання без id', () => {
    const data = [{ question: 'Питання?', expectedChunks: ['c'], expectedArticles: [], category: 'x' }];
    const result = валідуватиGoldenSet(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('відсутній id'))).toBe(true);
    expect(result.questions).toHaveLength(0);
  });

  it('відхиляє питання з порожнім expectedChunks', () => {
    const data = [{ id: 'x', question: 'Q?', expectedChunks: [], expectedArticles: [], category: 'y' }];
    const result = валідуватиGoldenSet(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('expectedChunks'))).toBe(true);
    expect(result.questions).toHaveLength(0);
  });

  it('приймає питання з expectedFacts', () => {
    const data = [
      {
        id: 'test-1',
        question: 'Питання?',
        expectedChunks: ['c1'],
        expectedArticles: ['Стаття 1'],
        category: 'тест',
        expectedFacts: ['факт1'],
      },
    ];
    const result = валідуватиGoldenSet(data);
    expect(result.valid).toBe(true);
    expect(result.questions[0].expectedFacts).toEqual(['факт1']);
  });
});
