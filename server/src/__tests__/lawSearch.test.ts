import { describe, it, expect } from 'vitest';
import { searchLaws } from '../services/lawSearch';
import type { LawChunk } from '../../../laws/index';

// Тестові дані — набір чанків для ізольованого тестування
const тестовіЧанки: LawChunk[] = [
  {
    id: 'test-st1-ch1',
    article: 'Стаття 1',
    part: 'Частина 1',
    title: 'Грошове забезпечення',
    text: 'Військовослужбовці мають право на грошове забезпечення та виплати.',
    keywords: ['грошове забезпечення', 'виплати', 'оклад'],
    lawTitle: 'Закон про соцзахист',
    sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
  },
  {
    id: 'test-st2-ch1',
    article: 'Стаття 2',
    part: 'Частина 1',
    title: 'Відпустки',
    text: 'Військовослужбовці мають право на щорічну відпустку тривалістю 30 днів.',
    keywords: ['відпустка', 'щорічна відпустка', 'відпочинок'],
    lawTitle: 'Закон про соцзахист',
    sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
  },
  {
    id: 'test-st3-ch1',
    article: 'Стаття 3',
    part: 'Частина 1',
    title: 'Медичне забезпечення',
    text: 'Медична допомога надається безоплатно у військових госпіталях.',
    keywords: ['медицина', 'лікування', 'госпіталь'],
    lawTitle: 'Закон про соцзахист',
    sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
  },
  {
    id: 'test-st4-ch1',
    article: 'Стаття 4',
    part: '',
    title: 'Пільги',
    text: 'Ветерани бойових дій мають право на пільги при оплаті комунальних послуг.',
    keywords: ['пільги', 'ветеран', 'комунальні послуги', 'УБД'],
    lawTitle: 'Закон про ветеранів',
    sourceUrl: 'https://zakon.rada.gov.ua/laws/show/3551-12',
  },
];

describe('searchLaws — пошук по keywords', () => {
  it('знаходить чанк за ключовим словом із keywords', () => {
    const результати = searchLaws('виплати', тестовіЧанки);
    expect(результати.length).toBeGreaterThan(0);
    expect(результати[0].chunk.id).toBe('test-st1-ch1');
  });

  it('знаходить чанк за частковим збігом ключового слова', () => {
    const результати = searchLaws('грошове', тестовіЧанки);
    expect(результати.length).toBeGreaterThan(0);
    const ідентифікатори = результати.map(r => r.chunk.id);
    expect(ідентифікатори).toContain('test-st1-ch1');
  });

  it('ключові слова мають вагу +3', () => {
    const результати = searchLaws('відпустка', тестовіЧанки);
    // Чанк з keywords=['відпустка', ...] має отримати +3
    const відпустковий = результати.find(r => r.chunk.id === 'test-st2-ch1');
    expect(відпустковий).toBeDefined();
    expect(відпустковий!.score).toBeGreaterThanOrEqual(3);
  });
});

describe('searchLaws — пошук по тексту та назві', () => {
  it('знаходить чанк за збігом у тексті статті', () => {
    const результати = searchLaws('госпіталь', тестовіЧанки);
    expect(результати.length).toBeGreaterThan(0);
    // госпіталь є і в keywords і в тексті
    const медичний = результати.find(r => r.chunk.id === 'test-st3-ch1');
    expect(медичний).toBeDefined();
  });

  it('назва статті враховується при пошуку', () => {
    const результати = searchLaws('медичне забезпечення', тестовіЧанки);
    const медичний = результати.find(r => r.chunk.id === 'test-st3-ch1');
    expect(медичний).toBeDefined();
    // title містить "Медичне забезпечення" — має вагу +2
    expect(медичний!.score).toBeGreaterThanOrEqual(2);
  });

  it('збіг у тексті дає вагу +1', () => {
    // "безоплатно" є тільки в тексті медичного чанку, не в keywords/title
    const результати = searchLaws('безоплатно', тестовіЧанки);
    const медичний = результати.find(r => r.chunk.id === 'test-st3-ch1');
    expect(медичний).toBeDefined();
    // keywords не містить "безоплатно", тільки текст → мінімум +1
    expect(медичний!.score).toBeGreaterThanOrEqual(1);
  });
});

describe('searchLaws — edge cases', () => {
  it('порожній запит повертає порожній масив', () => {
    const результати = searchLaws('', тестовіЧанки);
    expect(результати).toEqual([]);
  });

  it('запит без збігів повертає порожній масив', () => {
    const результати = searchLaws('космічний корабель', тестовіЧанки);
    expect(результати).toEqual([]);
  });

  it('короткі слова ≤3 символи ігноруються', () => {
    // "на" — 2 символи, дуже поширене слово — не має давати збігів
    const результати = searchLaws('на', тестовіЧанки);
    expect(результати).toEqual([]);
  });

  it('слова з 3 символів також ігноруються', () => {
    const результати = searchLaws('УБД', тестовіЧанки);
    // "УБД" — рівно 3 символи, має ігноруватися
    expect(результати).toEqual([]);
  });

  it('порожній масив чанків повертає порожній масив', () => {
    const результати = searchLaws('відпустка', []);
    expect(результати).toEqual([]);
  });

  it('результати відсортовані за спаданням оцінки', () => {
    // "відпустка" є в keywords ст.2 (score +3) і в тексті ст.1 (score +1)
    const розширеніЧанки: LawChunk[] = [
      ...тестовіЧанки,
      {
        id: 'test-st5-ch1',
        article: 'Стаття 5',
        part: 'Частина 1',
        title: 'Загальні положення',
        text: 'Відпустка надається відповідно до наказу.',
        keywords: ['відпустка', 'наказ', 'рішення'],
        lawTitle: 'Закон про службу',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2232-12',
      },
    ];
    const результати = searchLaws('відпустка', розширеніЧанки);
    expect(результати.length).toBeGreaterThan(1);
    for (let i = 1; i < результати.length; i++) {
      expect(результати[i - 1].score).toBeGreaterThanOrEqual(результати[i].score);
    }
  });

  it('регістронезалежний пошук', () => {
    const результати1 = searchLaws('ВІДПУСТКА', тестовіЧанки);
    const результати2 = searchLaws('відпустка', тестовіЧанки);
    expect(результати1.length).toBe(результати2.length);
  });

  it('повертає не більше 5 результатів за замовчуванням', () => {
    // Створюємо 10 чанків з однаковим ключовим словом
    const багатоЧанків: LawChunk[] = Array.from({ length: 10 }, (_, i) => ({
      id: `chunk-${i}`,
      article: `Стаття ${i + 1}`,
      part: 'Частина 1',
      title: 'Відпустки',
      text: 'Відпустка надається відповідно до законодавства.',
      keywords: ['відпустка'],
      lawTitle: 'Тестовий закон',
      sourceUrl: 'https://zakon.rada.gov.ua/laws/show/test',
    }));
    const результати = searchLaws('відпустка', багатоЧанків);
    expect(результати.length).toBeLessThanOrEqual(5);
  });
});
