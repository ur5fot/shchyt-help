// Тести для сервісу верифікації цитат
import { describe, it, expect } from 'vitest';
import {
  extractCitations,
  verifyCitations,
  removeCitationBlock,
  hasCitationBlock,
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

  it('витягує цитати коли блок ЦИТАТИ на початку відповіді (byte 0)', () => {
    const response = `ЦИТАТИ:
- Стаття 10 | "цитата на початку"`;

    const citations = extractCitations(response);
    expect(citations).toHaveLength(1);
    expect(citations[0].article).toBe('Стаття 10');
    expect(citations[0].quote).toBe('цитата на початку');
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

  it('витягує цитати коли ЦИТАТИ: без переносу рядка (inline format drift)', () => {
    const response = `Відповідь.\nЦИТАТИ: - Стаття 10 | "інлайн цитата"`;

    const citations = extractCitations(response);
    expect(citations).toHaveLength(1);
    expect(citations[0].article).toBe('Стаття 10');
    expect(citations[0].quote).toBe('інлайн цитата');
  });

  it('витягує цитати коли блок ЦИТАТИ має відступ', () => {
    const response = `Відповідь.

  ЦИТАТИ:
- Стаття 10 | "цитата з відступом"`;

    const citations = extractCitations(response);
    expect(citations).toHaveLength(1);
    expect(citations[0].article).toBe('Стаття 10');
  });

  it('повертає порожній масив коли ЦИТАТИ: в кінці без рядків', () => {
    const response = 'Відповідь.\nЦИТАТИ:';
    expect(extractCitations(response)).toEqual([]);
  });

  it('ігнорує прозове "Цитати:" і парсить тільки термінальний блок', () => {
    const response = `Нижче наведені основні Цитати: з відповідних законів.

Відповідь на питання щодо відпустки.

ЦИТАТИ:
- Стаття 10, Частина 2 | "Військовослужбовці мають право на щорічну відпустку"`;

    const citations = extractCitations(response);
    expect(citations).toHaveLength(1);
    expect(citations[0].article).toBe('Стаття 10, Частина 2');
  });

  it('витягує цитати при змішаному регістрі заголовка (case-insensitive)', () => {
    const response = `Відповідь.

Цитати:
- Стаття 10 | "цитата з малих літер"`;

    const citations = extractCitations(response);
    expect(citations).toHaveLength(1);
    expect(citations[0].article).toBe('Стаття 10');
    expect(citations[0].quote).toBe('цитата з малих літер');
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
        article: 'Стаття 10, Частина 2',
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

  it('відхиляє цитату з невірним номером статті', () => {
    const chunks = [
      createChunk({
        id: 'chunk-1',
        text: 'Військовослужбовці мають право на щорічну основну відпустку тривалістю 30 календарних днів.',
      }),
    ];
    const citations = [
      {
        article: 'Стаття 999',
        quote: 'Військовослужбовці мають право на щорічну основну відпустку',
        verified: false,
      },
    ];

    const result = verifyCitations(citations, chunks);
    expect(result[0].verified).toBe(false);
  });

  it('підтверджує цитату з римськими числами в розділі чанка', () => {
    const chunks = [
      createChunk({
        id: 'roman-1',
        article: 'Пункт 1',
        part: 'Розділ II',
        text: 'Посадові оклади виплачуються у розмірах визначених додатками.',
      }),
    ];
    const citations = [
      {
        article: 'Пункт 1, Розділ 2',
        quote: 'Посадові оклади виплачуються у розмірах визначених додатками',
        verified: false,
      },
    ];

    const result = verifyCitations(citations, chunks);
    expect(result[0].verified).toBe(true);
    expect(result[0].matchedChunkId).toBe('roman-1');
  });

  it('підтверджує цитату коли і цитата і чанк мають римські числа', () => {
    const chunks = [
      createChunk({
        id: 'roman-2',
        article: 'Пункт 3',
        part: 'Розділ IV',
        text: 'Надбавка за вислугу років встановлюється у відсотках до посадового окладу.',
      }),
    ];
    const citations = [
      {
        article: 'Пункт 3, Розділ IV',
        quote: 'Надбавка за вислугу років встановлюється у відсотках до посадового окладу',
        verified: false,
      },
    ];

    const result = verifyCitations(citations, chunks);
    expect(result[0].verified).toBe(true);
    expect(result[0].matchedChunkId).toBe('roman-2');
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
        article: 'Стаття 10',
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
        article: 'Стаття 10',
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

describe('hasCitationBlock', () => {
  it('повертає true коли блок ЦИТАТИ присутній', () => {
    expect(hasCitationBlock('Відповідь.\nЦИТАТИ:\n- Стаття 10 | "цитата"')).toBe(true);
  });

  it('повертає false коли блок ЦИТАТИ присутній з малформованими рядками (без "- ")', () => {
    expect(hasCitationBlock('Відповідь.\nЦИТАТИ:\nякийсь невірний формат')).toBe(false);
  });

  it('повертає true коли блок ЦИТАТИ на початку відповіді (byte 0)', () => {
    expect(hasCitationBlock('ЦИТАТИ:\n- Стаття 10 | "цитата"')).toBe(true);
  });

  it('повертає false коли блоку ЦИТАТИ немає', () => {
    expect(hasCitationBlock('Відповідь без цитат.')).toBe(false);
  });

  it('повертає false коли блок ЦИТАТИ порожній (без рядків цитат)', () => {
    expect(hasCitationBlock('Відповідь.\nЦИТАТИ:\n')).toBe(false);
  });

  it('повертає true коли блок ЦИТАТИ має відступ (leading whitespace)', () => {
    expect(hasCitationBlock('Відповідь.\n  ЦИТАТИ:\n- Стаття 10 | "цитата"')).toBe(true);
  });

  it('повертає true коли ЦИТАТИ: без переносу рядка після маркера (format drift)', () => {
    expect(hasCitationBlock('Відповідь.\nЦИТАТИ: - Стаття 10 | "цитата"')).toBe(true);
  });

  it('повертає false коли ЦИТАТИ: в кінці відповіді без нічого після', () => {
    expect(hasCitationBlock('Відповідь.\nЦИТАТИ:')).toBe(false);
  });

  it('повертає false коли "Цитати:" у прозі без реального блоку цитат', () => {
    expect(hasCitationBlock('Основні\nЦитати: тут є пояснення\nдалі текст відповіді')).toBe(false);
  });

  it('повертає true при змішаному регістрі заголовка (case-insensitive)', () => {
    expect(hasCitationBlock('Відповідь.\nЦитати:\n- Стаття 10 | "цитата"')).toBe(true);
    expect(hasCitationBlock('Відповідь.\nцитати:\n- Стаття 10 | "цитата"')).toBe(true);
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

  it('видаляє блок ЦИТАТИ на початку відповіді (byte 0)', () => {
    const response = `ЦИТАТИ:
- Стаття 10 | "цитата"`;

    const cleaned = removeCitationBlock(response);
    expect(cleaned).toBe('');
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

  it('видаляє ЦИТАТИ: без переносу рядка (inline format drift)', () => {
    const response = 'Відповідь.\nЦИТАТИ: - Стаття 10 | "цитата"';
    const cleaned = removeCitationBlock(response);
    expect(cleaned).toBe('Відповідь.');
  });

  it('видаляє термінальний ЦИТАТИ: без вмісту', () => {
    const response = 'Відповідь.\nЦИТАТИ:';
    const cleaned = removeCitationBlock(response);
    expect(cleaned).toBe('Відповідь.');
  });

  it('видаляє блок ЦИТАТИ з відступом', () => {
    const response = `Відповідь.

  ЦИТАТИ:
- Стаття 10 | "цитата"`;

    const cleaned = removeCitationBlock(response);
    expect(cleaned).toBe('Відповідь.');
  });

  it('видаляє блок при змішаному регістрі заголовка (case-insensitive)', () => {
    const response = `Відповідь.

Цитати:
- Стаття 10 | "цитата"`;

    const cleaned = removeCitationBlock(response);
    expect(cleaned).toBe('Відповідь.');
  });

  it('не видаляє прозове "Цитати:" без рядків цитат (захист від хибного спрацювання)', () => {
    const response = 'Основні\nЦитати: тут є пояснення\nдалі текст відповіді';
    expect(removeCitationBlock(response)).toBe(response);
  });

  it('видаляє тільки термінальний блок, не прозове "Цитати:"', () => {
    const response = `Основні Цитати: з відповідних законів наведені нижче.

Відповідь на питання.

ЦИТАТИ:
- Стаття 10 | "цитата"`;

    const cleaned = removeCitationBlock(response);
    expect(cleaned).toBe(`Основні Цитати: з відповідних законів наведені нижче.

Відповідь на питання.`);
  });
});
