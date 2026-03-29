// Тести для сервісу верифікації цитат
import { describe, it, expect } from 'vitest';
import {
  extractCitations,
  verifyCitations,
  removeCitationBlock,
} from '../services/citationVerifier.js';
import type { LawChunk } from '../../../laws/index.js';

// Хелпер для створення тестових чанків
function createChunk(overrides: Partial<LawChunk> = {}): LawChunk {
  return {
    id: 'test-chunk-1',
    article: 'Стаття 10',
    part: 'Частина 2',
    text: 'Військовослужбовці мають право на щорічну основну відпустку тривалістю 30 календарних днів.',
    keywords: ['відпустка'],
    lawTitle: 'Про соціальний і правовий захист військовослужбовців',
    sourceUrl: 'https://example.com',
    ...overrides,
  };
}

describe('extractCitations', () => {
  it('витягує цитати з блоку ЦИТАТИ', () => {
    const response = `Відповідь на питання.

⚠️ Це не юридична консультація.

ЦИТАТИ:
- Стаття 10, Частина 2 | "Військовослужбовці мають право на щорічну відпустку"
- Пункт 5, Розділ 3 | "Грошове забезпечення виплачується щомісяця"`;

    const citations = extractCitations(response);
    expect(citations).toHaveLength(2);
    expect(citations[0]).toEqual({
      article: 'Стаття 10, Частина 2',
      quote: 'Військовослужбовці мають право на щорічну відпустку',
      verified: false,
    });
    expect(citations[1]).toEqual({
      article: 'Пункт 5, Розділ 3',
      quote: 'Грошове забезпечення виплачується щомісяця',
      verified: false,
    });
  });

  it('повертає порожній масив якщо блоку ЦИТАТИ немає', () => {
    const response = 'Просто відповідь без цитат.';
    expect(extractCitations(response)).toEqual([]);
  });

  it('обробляє різні типи лапок', () => {
    const response = `Відповідь.

ЦИТАТИ:
- Стаття 5 | «Цитата в українських лапках»
- Стаття 6 | "Цитата в звичайних лапках"`;

    const citations = extractCitations(response);
    expect(citations).toHaveLength(2);
    expect(citations[0].quote).toBe('Цитата в українських лапках');
    expect(citations[1].quote).toBe('Цитата в звичайних лапках');
  });

  it('ігнорує некоректні рядки в блоці ЦИТАТИ', () => {
    const response = `Відповідь.

ЦИТАТИ:
- Стаття 10 | "Правильна цитата"
Якийсь сміття
- Без лапок | без лапок`;

    const citations = extractCitations(response);
    expect(citations).toHaveLength(1);
    expect(citations[0].article).toBe('Стаття 10');
  });

  it('обробляє порожній блок ЦИТАТИ', () => {
    const response = `Відповідь.

ЦИТАТИ:
`;
    expect(extractCitations(response)).toEqual([]);
  });
});

describe('verifyCitations', () => {
  it('підтверджує правильну цитату — verified=true', () => {
    const chunks = [
      createChunk({
        id: 'chunk-1',
        text: 'Військовослужбовці мають право на щорічну основну відпустку тривалістю 30 календарних днів.',
      }),
    ];
    const citations = [
      {
        article: 'Стаття 10, Частина 2',
        quote: 'Військовослужбовці мають право на щорічну основну відпустку тривалістю 30 календарних днів',
        verified: false,
      },
    ];

    const result = verifyCitations(citations, chunks);
    expect(result[0].verified).toBe(true);
    expect(result[0].matchedChunkId).toBe('chunk-1');
  });

  it('відхиляє вигадану статтю — verified=false', () => {
    const chunks = [
      createChunk({
        id: 'chunk-1',
        text: 'Текст про відпустки.',
      }),
    ];
    const citations = [
      {
        article: 'Стаття 999',
        quote: 'Повністю вигаданий текст якого немає в жодному чанку',
        verified: false,
      },
    ];

    const result = verifyCitations(citations, chunks);
    expect(result[0].verified).toBe(false);
    expect(result[0].matchedChunkId).toBeUndefined();
  });

  it('підтверджує цитату з дрібними відмінностями — fuzzy match', () => {
    const chunks = [
      createChunk({
        id: 'chunk-1',
        text: 'Військовослужбовці   мають  право на щорічну основну відпустку тривалістю 30 календарних днів.',
      }),
    ];
    const citations = [
      {
        article: 'Стаття 10',
        quote: 'Військовослужбовці мають право на щорічну основну відпустку тривалістю 30 календарних днів',
        verified: false,
      },
    ];

    const result = verifyCitations(citations, chunks);
    expect(result[0].verified).toBe(true);
  });

  it('підтверджує цитату незалежно від регістру', () => {
    const chunks = [
      createChunk({
        id: 'chunk-1',
        text: 'Грошове забезпечення виплачується щомісяця.',
      }),
    ];
    const citations = [
      {
        article: 'Пункт 1',
        quote: 'грошове забезпечення виплачується щомісяця',
        verified: false,
      },
    ];

    const result = verifyCitations(citations, chunks);
    expect(result[0].verified).toBe(true);
  });

  it('обробляє порожній масив цитат', () => {
    const result = verifyCitations([], [createChunk()]);
    expect(result).toEqual([]);
  });

  it('обробляє порожній масив чанків', () => {
    const citations = [
      { article: 'Стаття 1', quote: 'Якийсь текст', verified: false },
    ];
    const result = verifyCitations(citations, []);
    expect(result[0].verified).toBe(false);
  });

  it('знаходить цитату серед кількох чанків', () => {
    const chunks = [
      createChunk({ id: 'chunk-1', text: 'Перший чанк з іншим текстом.' }),
      createChunk({
        id: 'chunk-2',
        text: 'Другий чанк: військовослужбовець має право на додаткову відпустку.',
      }),
      createChunk({ id: 'chunk-3', text: 'Третій чанк з ще іншим текстом.' }),
    ];
    const citations = [
      {
        article: 'Стаття 7',
        quote: 'військовослужбовець має право на додаткову відпустку',
        verified: false,
      },
    ];

    const result = verifyCitations(citations, chunks);
    expect(result[0].verified).toBe(true);
    expect(result[0].matchedChunkId).toBe('chunk-2');
  });
});

describe('edge cases', () => {
  it('обробляє цитати з подвійними лапками різних типів у одному блоці', () => {
    const response = `Відповідь.

ЦИТАТИ:
- Стаття 10 | "звичайні лапки"
- Стаття 11 | «українські лапки»
- Стаття 12 | “розумні лапки”`;

    const citations = extractCitations(response);
    expect(citations).toHaveLength(3);
    expect(citations[0].quote).toBe('звичайні лапки');
    expect(citations[1].quote).toBe('українські лапки');
    expect(citations[2].quote).toBe('розумні лапки');
  });

  it('обробляє порожній рядок як вхід', () => {
    expect(extractCitations('')).toEqual([]);
    expect(removeCitationBlock('')).toBe('');
  });

  it('верифікація з цитатою що містить спецсимволи кирилиці (ʼ, -, —)', () => {
    const chunks = [
      createChunk({
        id: 'spec-1',
        text: "Військовослужбовець має право на зарахування до кадрів Збройних Сил Українʼи — згідно з наказом.",
      }),
    ];
    const citations = [
      {
        article: 'Стаття 1',
        quote: "Військовослужбовець має право на зарахування до кадрів Збройних Сил Українʼи згідно з наказом",
        verified: false,
      },
    ];

    const result = verifyCitations(citations, chunks);
    expect(result[0].verified).toBe(true);
  });

  it('відхиляє цитату з менше 80% співпадіння слів', () => {
    const chunks = [
      createChunk({
        id: 'low-match',
        text: 'Грошове забезпечення виплачується щомісяця у порядку встановленому законодавством України.',
      }),
    ];
    const citations = [
      {
        article: 'Стаття 1',
        quote: 'Відпустка надається щорічно у порядку черги встановленої командиром частини',
        verified: false,
      },
    ];

    const result = verifyCitations(citations, chunks);
    expect(result[0].verified).toBe(false);
  });

  it('верифікує кілька цитат з різних чанків одночасно', () => {
    const chunks = [
      createChunk({
        id: 'chunk-a',
        article: 'Стаття 5',
        text: 'Право на відпустку мають усі військовослужбовці.',
      }),
      createChunk({
        id: 'chunk-b',
        article: 'Стаття 10',
        text: 'Грошове забезпечення нараховується щомісяця.',
      }),
    ];
    const citations = [
      { article: 'Стаття 5', quote: 'Право на відпустку мають усі військовослужбовці', verified: false },
      { article: 'Стаття 10', quote: 'Грошове забезпечення нараховується щомісяця', verified: false },
      { article: 'Стаття 999', quote: 'Повністю вигадана цитата', verified: false },
    ];

    const result = verifyCitations(citations, chunks);
    expect(result[0].verified).toBe(true);
    expect(result[0].matchedChunkId).toBe('chunk-a');
    expect(result[1].verified).toBe(true);
    expect(result[1].matchedChunkId).toBe('chunk-b');
    expect(result[2].verified).toBe(false);
  });
});

describe('інтеграційний тест: повний цикл парсинг → верифікація → очищення', () => {
  it('парсить, верифікує та очищує відповідь AI', () => {
    const чанки = [
      createChunk({
        id: 'int-1',
        article: 'Стаття 10',
        part: 'Частина 2',
        text: 'Військовослужбовці мають право на щорічну основну відпустку тривалістю 30 календарних днів.',
      }),
      createChunk({
        id: 'int-2',
        article: 'Стаття 15',
        part: 'Частина 1',
        text: 'Грошове забезпечення виплачується не пізніше ніж через 10 днів після закінчення місяця.',
      }),
    ];

    const відповідьAI = `Військовослужбовці мають право на 30 днів відпустки (Стаття 10). Грошове забезпечення виплачується щомісяця (Стаття 15).

⚠️ Це не юридична консультація. Для прийняття рішень зверніться до військового адвоката.

ЦИТАТИ:
- Стаття 10, Частина 2 | "Військовослужбовці мають право на щорічну основну відпустку тривалістю 30 календарних днів"
- Стаття 15, Частина 1 | "Грошове забезпечення виплачується не пізніше ніж через 10 днів"
- Стаття 999 | "Вигадана стаття яку Claude вигадав з навчальних даних"`;

    // Крок 1: витягуємо цитати
    const цитати = extractCitations(відповідьAI);
    expect(цитати).toHaveLength(3);

    // Крок 2: верифікуємо проти чанків
    const верифіковані = verifyCitations(цитати, чанки);
    expect(верифіковані[0].verified).toBe(true);
    expect(верифіковані[0].matchedChunkId).toBe('int-1');
    expect(верифіковані[1].verified).toBe(true);
    expect(верифіковані[1].matchedChunkId).toBe('int-2');
    expect(верифіковані[2].verified).toBe(false);

    // Крок 3: очищуємо відповідь
    const очищена = removeCitationBlock(відповідьAI);
    expect(очищена).not.toContain('ЦИТАТИ:');
    expect(очищена).not.toContain('Стаття 999');
    expect(очищена).toContain('Військовослужбовці мають право на 30 днів відпустки');
    expect(очищена).toContain('⚠️ Це не юридична консультація');
  });

  it('graceful: працює коректно коли блоку ЦИТАТИ немає', () => {
    const відповідь = 'Відповідь без блоку цитат. ⚠️ Це не юридична консультація.';

    const цитати = extractCitations(відповідь);
    expect(цитати).toEqual([]);

    const верифіковані = verifyCitations(цитати, [createChunk()]);
    expect(верифіковані).toEqual([]);

    const очищена = removeCitationBlock(відповідь);
    expect(очищена).toBe(відповідь);
  });
});

describe('removeCitationBlock', () => {
  it('видаляє блок ЦИТАТИ з відповіді', () => {
    const response = `Відповідь на питання.

⚠️ Це не юридична консультація.

ЦИТАТИ:
- Стаття 10 | "цитата"`;

    const cleaned = removeCitationBlock(response);
    expect(cleaned).toBe(`Відповідь на питання.

⚠️ Це не юридична консультація.`);
  });

  it('не змінює відповідь без блоку ЦИТАТИ', () => {
    const response = 'Відповідь без цитат.';
    expect(removeCitationBlock(response)).toBe('Відповідь без цитат.');
  });

  it('видаляє блок ЦИТАТИ з кількома рядками', () => {
    const response = `Текст відповіді.

ЦИТАТИ:
- Стаття 1 | "перша"
- Стаття 2 | "друга"
- Стаття 3 | "третя"`;

    const cleaned = removeCitationBlock(response);
    expect(cleaned).toBe('Текст відповіді.');
  });
});
