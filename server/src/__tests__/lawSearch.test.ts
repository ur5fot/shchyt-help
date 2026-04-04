import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchLaws, нормалізувати, розширитиСинонімами, hybridSearchLaws } from '../services/lawSearch';
import type { LawChunk } from '../../../laws/index';
import { створитиЕмбеддинг } from '../services/embeddings';
import { пошукПоВектору } from '../services/vectorStore';
import { claudeRerank } from '../services/claudeReranker';
import { generateHypothesis } from '../services/hyde';

// Мокаємо модулі embeddings, vectorStore, reranker, claudeReranker, hyde та logger
vi.mock('../services/embeddings', () => ({
  створитиЕмбеддинг: vi.fn(),
}));

vi.mock('../services/vectorStore', () => ({
  пошукПоВектору: vi.fn(),
}));

vi.mock('../services/reranker', () => ({
  rerank: vi.fn(),
}));

vi.mock('../services/claudeReranker', () => ({
  claudeRerank: vi.fn(),
}));

vi.mock('../services/hyde', () => ({
  generateHypothesis: vi.fn(),
}));

vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockСтворитиЕмбеддинг = vi.mocked(створитиЕмбеддинг);
const mockПошукПоВектору = vi.mocked(пошукПоВектору);
const mockClaudeRerank = vi.mocked(claudeRerank);
const mockGenerateHypothesis = vi.mocked(generateHypothesis);

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

  it('збіг тільки у тексті (score=1) відфільтровується мінімальним порогом', () => {
    // "безоплатно" є тільки в тексті медичного чанку, не в keywords/title
    // score = 1 < МІНІМАЛЬНА_ОЦІНКА (3), тому результат відфільтровується
    const результати = searchLaws('безоплатно', тестовіЧанки);
    expect(результати).toEqual([]);
  });

  it('summary враховується при пошуку з вагою +2', () => {
    // Два ідентичних чанки, але один має summary з додатковим словом
    const чанкиЗРезюме: LawChunk[] = [
      {
        id: 'test-summary-1',
        article: 'Стаття 99',
        part: 'Частина 1',
        title: 'Пільги',
        summary: 'Встановлює знижки на комунальні послуги для ветеранів',
        text: 'Ветерани мають право на пільги.',
        keywords: ['пільги', 'ветеран'],
        lawTitle: 'Закон про ветеранів',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/test',
      },
      {
        id: 'test-summary-2',
        article: 'Стаття 100',
        part: 'Частина 1',
        title: 'Пільги',
        text: 'Ветерани мають право на пільги.',
        keywords: ['пільги', 'ветеран'],
        lawTitle: 'Закон про ветеранів',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/test',
      },
    ];
    // "знижки" є тільки в summary першого чанка
    const результати = searchLaws('пільги знижки', чанкиЗРезюме);
    expect(результати.length).toBe(2);
    const зРезюме = результати.find(r => r.chunk.id === 'test-summary-1')!;
    const безРезюме = результати.find(r => r.chunk.id === 'test-summary-2')!;
    expect(зРезюме.score).toBeGreaterThan(безРезюме.score);
  });
});

describe('searchLaws — мінімальний поріг релевантності', () => {
  it('результати з оцінкою нижче 3 не повертаються', () => {
    // "безоплатно" є тільки в тексті медичного чанку (score = 1), не в keywords/title
    const результати = searchLaws('безоплатно', тестовіЧанки);
    expect(результати).toEqual([]);
  });

  it('результати з оцінкою 3 і вище повертаються', () => {
    // "відпустка" є в keywords ст.2 (score >= 3)
    const результати = searchLaws('відпустка', тестовіЧанки);
    expect(результати.length).toBeGreaterThan(0);
    for (const р of результати) {
      expect(р.score).toBeGreaterThanOrEqual(3);
    }
  });

  it('маргінальний збіг тільки по тексту (score=1) відфільтровується', () => {
    // Створюємо чанк де слово є тільки в тексті
    const чанки: LawChunk[] = [
      {
        id: 'marginal-chunk',
        article: 'Стаття 99',
        part: 'Частина 1',
        title: 'Загальні положення',
        text: 'Цей документ стосується транспортного забезпечення.',
        keywords: ['логістика', 'постачання'],
        lawTitle: 'Тестовий закон',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/test',
      },
    ];
    // "транспортного" є тільки в тексті → score = 1 < 3
    const результати = searchLaws('транспортного', чанки);
    expect(результати).toEqual([]);
  });

  it('збіг по назві + тексту (score=3) проходить поріг', () => {
    // Створюємо чанк де слово є в title (+2) та text (+1) = 3
    const чанки: LawChunk[] = [
      {
        id: 'threshold-chunk',
        article: 'Стаття 100',
        part: 'Частина 1',
        title: 'Житлове забезпечення',
        text: 'Житлове забезпечення надається відповідно до закону.',
        keywords: ['квартира', 'гуртожиток'],
        lawTitle: 'Тестовий закон',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/test',
      },
    ];
    // "житлове" є в title (+2) та text (+1) = 3 → проходить поріг
    const результати = searchLaws('житлове', чанки);
    expect(результати.length).toBe(1);
    expect(результати[0].score).toBe(3);
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

  it('слова ≤2 символи ігноруються', () => {
    // "на" — 2 символи, має ігноруватися
    const результати = searchLaws('на', тестовіЧанки);
    expect(результати).toEqual([]);
  });

  it('слова з 3 символів (наприклад УБД) знаходяться в keywords', () => {
    // "УБД" — 3 символи, має знаходитися у keywords (МІН_ДОВЖИНА_СЛОВА = 3)
    const результати = searchLaws('УБД', тестовіЧанки);
    expect(результати.length).toBeGreaterThan(0);
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

  it('пунктуація не впливає на пошук', () => {
    const результати = searchLaws('відпустка?', тестовіЧанки);
    expect(результати.length).toBeGreaterThan(0);
    const відпустковий = результати.find(r => r.chunk.id === 'test-st2-ch1');
    expect(відпустковий).toBeDefined();
  });

  it('регістронезалежний пошук', () => {
    const результати1 = searchLaws('ВІДПУСТКА', тестовіЧанки);
    const результати2 = searchLaws('відпустка', тестовіЧанки);
    expect(результати1.length).toBe(результати2.length);
  });

  it('повертає не більше 25 результатів за замовчуванням', () => {
    // Створюємо 15 чанків з однаковим ключовим словом (більше ніж ліміт)
    const багатоЧанків: LawChunk[] = Array.from({ length: 15 }, (_, i) => ({
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
    expect(результати.length).toBeLessThanOrEqual(25);
  });
});

describe('нормалізувати — базове видалення закінчень', () => {
  it('видаляє закінчення -ати', () => {
    expect(нормалізувати('виплачувати')).toBe('виплачув');
  });

  it('видаляє закінчення -ння', () => {
    expect(нормалізувати('забезпечення')).toBe('забезпеч');
  });

  it('видаляє закінчення -ість', () => {
    expect(нормалізувати('інвалідність')).toBe('інвалідн');
  });

  it('видаляє закінчення -ів', () => {
    expect(нормалізувати('військовослужбовців')).toBe('військовослужбовц');
  });

  it('видаляє закінчення -ою', () => {
    expect(нормалізувати('відпусткою')).toBe('відпустк');
  });

  it('не видаляє закінчення якщо основа занадто коротка', () => {
    expect(нормалізувати('дія')).toBe('дія');
  });

  it('повертає оригінал якщо закінчення не знайдено', () => {
    expect(нормалізувати('убд')).toBe('убд');
  });

  it('видаляє закінчення -ування', () => {
    expect(нормалізувати('фінансування')).toBe('фінанс');
  });
});

describe('розширитиСинонімами — карта синонімів', () => {
  it('додає синоніми для "зарплата"', () => {
    const результат = розширитиСинонімами(['зарплата']);
    expect(результат).toContain('зарплата');
    expect(результат).toContain('грошове');
    expect(результат).toContain('оклад');
  });

  it('додає синоніми для "бойові"', () => {
    const результат = розширитиСинонімами(['бойові']);
    expect(результат).toContain('бойові');
    expect(результат).toContain('винагорода');
    expect(результат).toContain('додаткова');
  });

  it('не додає синоніми для невідомого слова', () => {
    const результат = розширитиСинонімами(['космос']);
    expect(результат).toEqual(['космос']);
  });

  it('не дублює слова', () => {
    const результат = розширитиСинонімами(['зарплата', 'оклад']);
    const унікальні = new Set(результат);
    expect(результат.length).toBe(унікальні.size);
  });

  it('додає синоніми для "мобілізація"', () => {
    const результат = розширитиСинонімами(['мобілізація']);
    expect(результат).toContain('призов');
    expect(результат).toContain('військовий');
  });

  it('додає синоніми для "закінчився"', () => {
    const результат = розширитиСинонімами(['закінчився']);
    expect(результат).toContain('контракт');
    expect(результат).toContain('строк');
    expect(результат).toContain('припинення');
    expect(результат).toContain('звільнення');
  });

  it('додає синоніми для "закінчення"', () => {
    const результат = розширитиСинонімами(['закінчення']);
    expect(результат).toContain('контракт');
    expect(результат).toContain('строк');
    expect(результат).toContain('припинення');
  });
});

describe('розширитиСинонімами — російсько-українські відповідності', () => {
  it('розширює "отпуск" українськими синонімами', () => {
    const результат = розширитиСинонімами(['отпуск']);
    expect(результат).toContain('відпустка');
    expect(результат).toContain('відпочинок');
  });

  it('розширює "увольнение" українськими синонімами', () => {
    const результат = розширитиСинонімами(['увольнение']);
    expect(результат).toContain('звільнення');
    expect(результат).toContain('демобілізація');
  });

  it('розширює "деньги" українськими синонімами', () => {
    const результат = розширитиСинонімами(['деньги']);
    expect(результат).toContain('грошове');
    expect(результат).toContain('забезпечення');
  });

  it('розширює "мобилизация" українськими синонімами', () => {
    const результат = розширитиСинонімами(['мобилизация']);
    expect(результат).toContain('мобілізація');
    expect(результат).toContain('призов');
  });
});

describe('searchLaws — пошук з нормалізацією та синонімами', () => {
  it('знаходить "грошове забезпечення" за запитом "зарплата"', () => {
    const результати = searchLaws('зарплата', тестовіЧанки);
    expect(результати.length).toBeGreaterThan(0);
    const грошовий = результати.find(r => r.chunk.id === 'test-st1-ch1');
    expect(грошовий).toBeDefined();
  });

  it('нормалізація допомагає знайти по основі слова', () => {
    const чанки: LawChunk[] = [
      {
        id: 'norm-chunk',
        article: 'Стаття 50',
        part: 'Частина 1',
        title: 'Фінансування операцій',
        text: 'Фінансування здійснюється за рахунок державного бюджету.',
        keywords: ['фінансування', 'бюджет'],
        lawTitle: 'Тестовий закон',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/test',
      },
    ];
    // "фінансів" — нормалізована основа від "фінансування"
    // Нормалізація "фінансів" видалить -ів → "фінанс", що має збігтися з "фінансування"
    const результати = searchLaws('фінансів', чанки);
    expect(результати.length).toBeGreaterThan(0);
  });

  it('синоніми знаходять "відпустку" за запитом "відпочинок"', () => {
    const результати = searchLaws('відпочинок', тестовіЧанки);
    // "відпочинок" є в keywords ст.2 напряму, а також є синонімом до "відпустка"
    expect(результати.length).toBeGreaterThan(0);
    const відпустковий = результати.find(r => r.chunk.id === 'test-st2-ch1');
    expect(відпустковий).toBeDefined();
  });

  it('синоніми знаходять "пільги" за запитом "компенсація"', () => {
    const результати = searchLaws('компенсація', тестовіЧанки);
    expect(результати.length).toBeGreaterThan(0);
    const пільговий = результати.find(r => r.chunk.id === 'test-st4-ch1');
    expect(пільговий).toBeDefined();
  });
});

describe('hybridSearchLaws — гібридний пошук', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // За замовчуванням claudeRerank повертає документи як є (pass-through)
    mockClaudeRerank.mockImplementation(async (_запит, документи, topK = 10) => {
      return документи.slice(0, topK).map((д, і) => ({
        id: д.id,
        score: документи.length - і,
      }));
    });
  });

  it('комбінує keyword та vector результати з правильними вагами', async () => {
    // Mock: vector пошук повертає чанк 3 (медицина) як найближчий
    mockСтворитиЕмбеддинг.mockResolvedValue(new Array(384).fill(0.1));
    mockПошукПоВектору.mockResolvedValue([
      {
        id: 'test-st3-ch1',
        article: 'Стаття 3',
        part: 'Частина 1',
        title: 'Медичне забезпечення',
        text: 'Медична допомога надається безоплатно у військових госпіталях.',
        keywords: ['медицина', 'лікування', 'госпіталь'],
        lawTitle: 'Закон про соцзахист',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
        _distance: 0.2, // similarity = 1 - 0.2 = 0.8
      },
      {
        id: 'test-st1-ch1',
        article: 'Стаття 1',
        part: 'Частина 1',
        title: 'Грошове забезпечення',
        text: 'Військовослужбовці мають право на грошове забезпечення та виплати.',
        keywords: ['грошове забезпечення', 'виплати', 'оклад'],
        lawTitle: 'Закон про соцзахист',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
        _distance: 0.8, // similarity = 1 - 0.8 = 0.2
      },
    ]);

    const результати = await hybridSearchLaws('лікування', тестовіЧанки);

    expect(результати.length).toBeGreaterThan(0);
    // claudeRerank викликається з кандидатами
    expect(mockClaudeRerank).toHaveBeenCalled();
  });

  it('fallback на keyword пошук якщо LanceDB недоступна', async () => {
    mockСтворитиЕмбеддинг.mockRejectedValue(new Error('Модель не завантажена'));

    const результати = await hybridSearchLaws('відпустка', тестовіЧанки);

    // Має повернути keyword результати (без vector та без re-ranking)
    expect(результати.length).toBeGreaterThan(0);
    const відпустковий = результати.find(r => r.chunk.id === 'test-st2-ch1');
    expect(відпустковий).toBeDefined();
    // Vector пошук не повинен викликатися після помилки ембеддингу
    expect(mockПошукПоВектору).not.toHaveBeenCalled();
    // Re-ranking також не викликається при keyword-only fallback
    expect(mockClaudeRerank).not.toHaveBeenCalled();
  });

  it('vector-only результати включаються навіть якщо keyword не знайшов', async () => {
    mockСтворитиЕмбеддинг.mockResolvedValue(new Array(384).fill(0.1));
    mockПошукПоВектору.mockResolvedValue([
      {
        id: 'test-st2-ch1',
        article: 'Стаття 2',
        part: 'Частина 1',
        title: 'Відпустки',
        text: 'Військовослужбовці мають право на щорічну відпустку тривалістю 30 днів.',
        keywords: ['відпустка', 'щорічна відпустка', 'відпочинок'],
        lawTitle: 'Закон про соцзахист',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
        _distance: 0.1, // similarity = 0.9
      },
    ]);

    // Запит без keyword збігів але з vector збігами
    const результати = await hybridSearchLaws('хочу поїхати додому на вихідні', тестовіЧанки);

    // Vector результат має пройти через гібридний пошук
    expect(результати.length).toBeGreaterThan(0);
    const відпустковий = результати.find(r => r.chunk.id === 'test-st2-ch1');
    expect(відпустковий).toBeDefined();
  });

  it('фільтрує результати нижче мінімальної гібридної оцінки', async () => {
    mockСтворитиЕмбеддинг.mockResolvedValue(new Array(384).fill(0.1));
    mockПошукПоВектору.mockResolvedValue([
      {
        id: 'test-st4-ch1',
        article: 'Стаття 4',
        part: '',
        title: 'Пільги',
        text: 'Ветерани бойових дій мають право на пільги.',
        keywords: ['пільги', 'ветеран'],
        lawTitle: 'Закон про ветеранів',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/3551-12',
        _distance: 1.8, // similarity = max(0, 1 - 1.8) = 0 — за межами
      },
    ]);

    // Запит без keyword збігів і з низьким vector score
    const результати = await hybridSearchLaws('космічна програма', тестовіЧанки);

    // Жоден результат не має пройти мінімальний поріг (0.6 * 0 = 0 < 0.15)
    const пільговий = результати.find(r => r.chunk.id === 'test-st4-ch1');
    expect(пільговий).toBeUndefined();
  });

  it('повертає не більше 25 результатів', async () => {
    mockСтворитиЕмбеддинг.mockResolvedValue(new Array(384).fill(0.1));
    mockПошукПоВектору.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: `chunk-${i}`,
        article: `Стаття ${i + 1}`,
        part: 'Частина 1',
        title: 'Тест',
        text: 'Тестовий текст',
        keywords: ['тест'],
        lawTitle: 'Тестовий закон',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/test',
        _distance: 0.1 + i * 0.05,
      }))
    );

    const багатоЧанків: LawChunk[] = Array.from({ length: 10 }, (_, i) => ({
      id: `chunk-${i}`,
      article: `Стаття ${i + 1}`,
      part: 'Частина 1',
      title: 'Тест',
      text: 'Тестовий текст для пошуку.',
      keywords: ['тест'],
      lawTitle: 'Тестовий закон',
      sourceUrl: 'https://zakon.rada.gov.ua/laws/show/test',
    }));

    const результати = await hybridSearchLaws('тест', багатоЧанків);
    expect(результати.length).toBeLessThanOrEqual(25);
  });

  it('результати відсортовані за спаданням гібридної оцінки', async () => {
    mockСтворитиЕмбеддинг.mockResolvedValue(new Array(384).fill(0.1));
    mockПошукПоВектору.mockResolvedValue([
      {
        id: 'test-st1-ch1',
        article: 'Стаття 1',
        part: 'Частина 1',
        title: 'Грошове забезпечення',
        text: 'Військовослужбовці мають право на грошове забезпечення та виплати.',
        keywords: ['грошове забезпечення', 'виплати', 'оклад'],
        lawTitle: 'Закон про соцзахист',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
        _distance: 0.3,
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
        _distance: 0.5,
      },
    ]);

    const результати = await hybridSearchLaws('виплати', тестовіЧанки);

    for (let i = 1; i < результати.length; i++) {
      expect(результати[i - 1].score).toBeGreaterThanOrEqual(результати[i].score);
    }
  });
});

describe('searchLaws — пріоритизація військових законів', () => {
  it('військовий закон отримує вищий score ніж цивільний при однаковому базовому збігу', () => {
    const чанки: LawChunk[] = [
      {
        id: 'civil-1', article: 'Стаття 6', part: '',
        text: 'Надається відпустка.',
        keywords: ['відпустка'], lawTitle: 'Про відпустки',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/504',
      },
      {
        id: 'mil-1', article: 'Стаття 10-1', part: '',
        text: 'Надається відпустка.',
        keywords: ['відпустка'], lawTitle: 'Закон про соціальний і правовий захист військовослужбовців',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
      },
    ];
    const результати = searchLaws('відпустка', чанки);
    expect(результати.length).toBe(2);
    // Військовий закон має бути першим завдяки бонусу
    expect(результати[0].chunk.id).toBe('mil-1');
    expect(результати[0].score).toBeGreaterThan(результати[1].score);
  });

  it('чанк без жодного збігу не отримує бонус (0 * 1.5 = 0)', () => {
    const чанки: LawChunk[] = [
      {
        id: 'mil-empty', article: 'Стаття 1', part: '', title: 'Загальні',
        text: 'Цей закон регулює відносини.',
        keywords: ['загальні'], lawTitle: 'Закон про військовий обовʼязок',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2232-12',
      },
    ];
    const результати = searchLaws('відпустка', чанки);
    expect(результати.length).toBe(0);
  });
});

describe('hybridSearchLaws — re-ranking інтеграція', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-ranker змінює порядок результатів', async () => {
    mockСтворитиЕмбеддинг.mockResolvedValue(new Array(384).fill(0.1));
    mockПошукПоВектору.mockResolvedValue([
      {
        id: 'test-st1-ch1',
        article: 'Стаття 1', part: 'Частина 1', title: 'Грошове забезпечення',
        text: 'Військовослужбовці мають право на грошове забезпечення та виплати.',
        keywords: ['грошове забезпечення', 'виплати', 'оклад'],
        lawTitle: 'Закон про соцзахист',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
        _distance: 0.2,
      },
      {
        id: 'test-st3-ch1',
        article: 'Стаття 3', part: 'Частина 1', title: 'Медичне забезпечення',
        text: 'Медична допомога надається безоплатно у військових госпіталях.',
        keywords: ['медицина', 'лікування', 'госпіталь'],
        lawTitle: 'Закон про соцзахист',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
        _distance: 0.5,
      },
    ]);

    // Claude re-ranker ставить test-st3-ch1 на перше місце
    mockClaudeRerank.mockResolvedValue([
      { id: 'test-st3-ch1', score: 0.95 },
      { id: 'test-st1-ch1', score: 0.3 },
    ]);

    const результати = await hybridSearchLaws('лікування госпіталь', тестовіЧанки);

    expect(результати.length).toBeGreaterThan(0);
    expect(результати[0].chunk.id).toBe('test-st3-ch1');
    expect(результати[0].score).toBe(0.95);
  });

  it('claudeRerank викликається з текстами та summary документів', async () => {
    mockСтворитиЕмбеддинг.mockResolvedValue(new Array(384).fill(0.1));
    mockПошукПоВектору.mockResolvedValue([
      {
        id: 'test-st2-ch1',
        article: 'Стаття 2', part: 'Частина 1', title: 'Відпустки',
        text: 'Військовослужбовці мають право на щорічну відпустку тривалістю 30 днів.',
        keywords: ['відпустка', 'щорічна відпустка', 'відпочинок'],
        lawTitle: 'Закон про соцзахист',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
        _distance: 0.3,
      },
    ]);
    mockClaudeRerank.mockResolvedValue([{ id: 'test-st2-ch1', score: 0.8 }]);

    await hybridSearchLaws('відпустка', тестовіЧанки);

    expect(mockClaudeRerank).toHaveBeenCalledWith(
      'відпустка',
      expect.arrayContaining([
        expect.objectContaining({ id: 'test-st2-ch1', text: expect.any(String) }),
      ]),
      25
    );
  });

  it('graceful fallback якщо claudeRerank кидає помилку', async () => {
    mockСтворитиЕмбеддинг.mockResolvedValue(new Array(384).fill(0.1));
    mockПошукПоВектору.mockResolvedValue([
      {
        id: 'test-st2-ch1',
        article: 'Стаття 2', part: 'Частина 1', title: 'Відпустки',
        text: 'Військовослужбовці мають право на щорічну відпустку тривалістю 30 днів.',
        keywords: ['відпустка', 'щорічна відпустка', 'відпочинок'],
        lawTitle: 'Закон про соцзахист',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
        _distance: 0.3,
      },
    ]);
    mockClaudeRerank.mockRejectedValue(new Error('Claude re-ranker помилка'));

    const результати = await hybridSearchLaws('відпустка', тестовіЧанки);

    // Fallback — повертає гібридні результати без re-ranking
    expect(результати.length).toBeGreaterThan(0);
    const відпустковий = результати.find(r => r.chunk.id === 'test-st2-ch1');
    expect(відпустковий).toBeDefined();
  });

  it('не викликає claudeRerank якщо немає кандидатів', async () => {
    mockСтворитиЕмбеддинг.mockResolvedValue(new Array(384).fill(0.1));
    mockПошукПоВектору.mockResolvedValue([
      {
        id: 'test-st4-ch1',
        article: 'Стаття 4', part: '', title: 'Пільги',
        text: 'Ветерани бойових дій мають право на пільги.',
        keywords: ['пільги', 'ветеран'],
        lawTitle: 'Закон про ветеранів',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/3551-12',
        _distance: 1.8, // similarity ≈ 0
      },
    ]);

    const результати = await hybridSearchLaws('космічна програма', тестовіЧанки);

    // Жоден кандидат не пройшов мінімальний гібридний поріг
    expect(результати).toEqual([]);
    expect(mockClaudeRerank).not.toHaveBeenCalled();
  });

  it('обмежує результати до 10 після re-ranking', async () => {
    mockСтворитиЕмбеддинг.mockResolvedValue(new Array(384).fill(0.1));
    mockПошукПоВектору.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => ({
        id: `chunk-${i}`,
        article: `Стаття ${i + 1}`, part: 'Частина 1', title: 'Тест',
        text: 'Тестовий текст',
        keywords: ['тест'],
        lawTitle: 'Тестовий закон',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/test',
        _distance: 0.1 + i * 0.05,
      }))
    );

    // Claude re-ranker повертає topK результатів
    mockClaudeRerank.mockImplementation(async (_запит, документи, topK = 10) => {
      return документи.slice(0, topK).map((д, і) => ({
        id: д.id,
        score: 1 - і * 0.05,
      }));
    });

    const багатоЧанків: LawChunk[] = Array.from({ length: 15 }, (_, i) => ({
      id: `chunk-${i}`,
      article: `Стаття ${i + 1}`, part: 'Частина 1', title: 'Тест',
      text: 'Тестовий текст для пошуку.',
      keywords: ['тест'],
      lawTitle: 'Тестовий закон',
      sourceUrl: 'https://zakon.rada.gov.ua/laws/show/test',
    }));

    const результати = await hybridSearchLaws('тест', багатоЧанків);
    expect(результати.length).toBeLessThanOrEqual(25);
  });
});

describe('hybridSearchLaws — HyDE інтеграція', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClaudeRerank.mockImplementation(async (_запит, документи, topK = 10) => {
      return документи.slice(0, topK).map((д, і) => ({
        id: д.id,
        score: документи.length - і,
      }));
    });
  });

  it('HyDE додає нові vector кандидати до результатів', async () => {
    // Оригінальний vector пошук знаходить чанк 1
    mockСтворитиЕмбеддинг.mockResolvedValue(new Array(384).fill(0.1));
    let vectorCallCount = 0;
    mockПошукПоВектору.mockImplementation(async () => {
      vectorCallCount++;
      if (vectorCallCount === 1) {
        // Оригінальний пошук — знаходить чанк 1
        return [{
          id: 'test-st1-ch1',
          article: 'Стаття 1', part: 'Частина 1', title: 'Грошове забезпечення',
          text: 'Військовослужбовці мають право на грошове забезпечення та виплати.',
          keywords: ['грошове забезпечення', 'виплати', 'оклад'],
          lawTitle: 'Закон про соцзахист',
          sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
          _distance: 0.3,
        }];
      }
      // HyDE пошук — знаходить чанк 3 (новий кандидат)
      return [{
        id: 'test-st3-ch1',
        article: 'Стаття 3', part: 'Частина 1', title: 'Медичне забезпечення',
        text: 'Медична допомога надається безоплатно у військових госпіталях.',
        keywords: ['медицина', 'лікування', 'госпіталь'],
        lawTitle: 'Закон про соцзахист',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
        _distance: 0.2,
      }];
    });

    // HyDE генерує hypothesis
    mockGenerateHypothesis.mockResolvedValue(
      'Відповідно до статті 9 Закону про соцзахист, грошове забезпечення включає посадовий оклад.'
    );

    await hybridSearchLaws('скільки платять солдату', тестовіЧанки);

    // generateHypothesis має бути викликано
    expect(mockGenerateHypothesis).toHaveBeenCalledWith('скільки платять солдату');
    // Має бути 2 виклики пошукПоВектору (оригінальний + HyDE)
    expect(mockПошукПоВектору).toHaveBeenCalledTimes(2);
    // Має бути 2 виклики створитиЕмбеддинг (оригінальний запит + hypothesis)
    expect(mockСтворитиЕмбеддинг).toHaveBeenCalledTimes(2);
  });

  it('HyDE зберігає кращу оцінку при дублікатах', async () => {
    mockСтворитиЕмбеддинг.mockResolvedValue(new Array(384).fill(0.1));
    let vectorCallCount = 0;
    mockПошукПоВектору.mockImplementation(async () => {
      vectorCallCount++;
      if (vectorCallCount === 1) {
        return [{
          id: 'test-st1-ch1',
          article: 'Стаття 1', part: 'Частина 1', title: 'Грошове забезпечення',
          text: 'Військовослужбовці мають право на грошове забезпечення та виплати.',
          keywords: ['грошове забезпечення', 'виплати', 'оклад'],
          lawTitle: 'Закон про соцзахист',
          sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
          _distance: 0.5, // similarity = 0.5
        }];
      }
      // HyDE знаходить той самий чанк з кращою оцінкою
      return [{
        id: 'test-st1-ch1',
        article: 'Стаття 1', part: 'Частина 1', title: 'Грошове забезпечення',
        text: 'Військовослужбовці мають право на грошове забезпечення та виплати.',
        keywords: ['грошове забезпечення', 'виплати', 'оклад'],
        lawTitle: 'Закон про соцзахист',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
        _distance: 0.1, // similarity = 0.9 — краща
        }];
    });

    mockGenerateHypothesis.mockResolvedValue('Грошове забезпечення визначається статтею 9.');

    const результати = await hybridSearchLaws('зарплата військового', тестовіЧанки);

    expect(результати.length).toBeGreaterThan(0);
    // Результат має використовувати кращу оцінку від HyDE
    const грошовий = результати.find(r => r.chunk.id === 'test-st1-ch1');
    expect(грошовий).toBeDefined();
  });

  it('HyDE graceful fallback — hypothesis null не ламає пошук', async () => {
    mockСтворитиЕмбеддинг.mockResolvedValue(new Array(384).fill(0.1));
    mockПошукПоВектору.mockResolvedValue([{
      id: 'test-st2-ch1',
      article: 'Стаття 2', part: 'Частина 1', title: 'Відпустки',
      text: 'Військовослужбовці мають право на щорічну відпустку тривалістю 30 днів.',
      keywords: ['відпустка', 'щорічна відпустка', 'відпочинок'],
      lawTitle: 'Закон про соцзахист',
      sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
      _distance: 0.3,
    }]);

    // HyDE повертає null (запит занадто короткий або API помилка)
    mockGenerateHypothesis.mockResolvedValue(null);

    const результати = await hybridSearchLaws('відпустка', тестовіЧанки);

    expect(результати.length).toBeGreaterThan(0);
    // Тільки 1 виклик vector пошуку (HyDE пропущено)
    expect(mockПошукПоВектору).toHaveBeenCalledTimes(1);
  });

  it('HyDE graceful fallback — помилка hypothesis не ламає пошук', async () => {
    mockСтворитиЕмбеддинг.mockResolvedValue(new Array(384).fill(0.1));
    mockПошукПоВектору.mockResolvedValue([{
      id: 'test-st2-ch1',
      article: 'Стаття 2', part: 'Частина 1', title: 'Відпустки',
      text: 'Військовослужбовці мають право на щорічну відпустку тривалістю 30 днів.',
      keywords: ['відпустка', 'щорічна відпустка', 'відпочинок'],
      lawTitle: 'Закон про соцзахист',
      sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
      _distance: 0.3,
    }]);

    // HyDE кидає помилку
    mockGenerateHypothesis.mockRejectedValue(new Error('API timeout'));

    const результати = await hybridSearchLaws('відпустка', тестовіЧанки);

    // Пошук все одно працює
    expect(результати.length).toBeGreaterThan(0);
    const відпустковий = результати.find(r => r.chunk.id === 'test-st2-ch1');
    expect(відпустковий).toBeDefined();
  });
});
