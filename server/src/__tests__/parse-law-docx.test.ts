import { describe, it, expect, vi } from 'vitest';
import {
  parseArticleBased,
  splitLargeChunks,
  makeBaseId,
  stripEditorialNotes,
  isEditorialNote,
} from '../../../scripts/parse-law';

describe('експортовані функції parse-law.ts', () => {
  describe('makeBaseId', () => {
    it('генерує коректний baseId з української назви', () => {
      const id = makeBaseId('Про військовий обов\'язок і військову службу');
      // makeBaseId обрізає до 20 символів і видаляє кінцевий дефіс
      // 'про-військовий-обов-' → slice(0,20) → 'про-військовий-обов-' → replace кінцевий дефіс
      // Але апостроф стає дефісом, тому результат залежить від довжини
      expect(id.length).toBeLessThanOrEqual(20);
      expect(id).toMatch(/^про-військовий-обов/);
    });

    it('видаляє лапки «»', () => {
      const id = makeBaseId('«Тестовий закон»');
      expect(id).not.toContain('«');
      expect(id).not.toContain('»');
    });
  });

  describe('isEditorialNote', () => {
    it('розпізнає редакційну примітку', () => {
      expect(isEditorialNote('{Частину виключено}')).toBe(true);
    });

    it('не розпізнає звичайний текст', () => {
      expect(isEditorialNote('Звичайний текст')).toBe(false);
    });
  });

  describe('stripEditorialNotes', () => {
    it('видаляє інлайн примітки', () => {
      expect(stripEditorialNotes('Текст {примітка} продовження')).toBe('Текст продовження');
    });

    it('не змінює текст без приміток', () => {
      expect(stripEditorialNotes('Звичайний текст')).toBe('Звичайний текст');
    });
  });

  describe('parseArticleBased', () => {
    it('парсить прості статті з частинами', () => {
      const paragraphs = [
        'Стаття 1. Загальні положення',
        '1. Цей Закон регулює відносини у сфері тестування.',
        '2. Дія цього Закону поширюється на всіх.',
        'Стаття 2. Визначення термінів',
        '1. Терміни вживаються в такому значенні.',
      ];

      const chunks = parseArticleBased(paragraphs, 'test');

      expect(chunks.length).toBe(3);
      expect(chunks[0].article).toBe('Стаття 1');
      expect(chunks[0].part).toBe('Частина 1');
      expect(chunks[0].title).toBe('Загальні положення');
      expect(chunks[1].article).toBe('Стаття 1');
      expect(chunks[1].part).toBe('Частина 2');
      expect(chunks[2].article).toBe('Стаття 2');
    });

    it('парсить статті з дефісами (21-1, 21-2)', () => {
      const paragraphs = [
        'Стаття 21-1. Додаткові гарантії',
        '1. Військовослужбовцям надаються додаткові гарантії соціального захисту.',
        'Стаття 21-2. Особливі умови',
        '1. В умовах воєнного стану діють особливі правила щодо служби.',
      ];

      const chunks = parseArticleBased(paragraphs, 'test');

      expect(chunks.length).toBe(2);
      expect(chunks[0].article).toBe('Стаття 21-1');
      expect(chunks[0].id).toBe('test-st21-1-ch1');
      expect(chunks[1].article).toBe('Стаття 21-2');
      expect(chunks[1].id).toBe('test-st21-2-ch1');
    });

    it('обробляє Прикінцеві положення як псевдо-статтю', () => {
      const paragraphs = [
        'Стаття 1. Тест',
        '1. Тестовий текст для першої статті закону.',
        'Прикінцеві положення',
        '1. Цей Закон набирає чинності з дня його опублікування.',
        '2. Кабінету Міністрів привести свої акти у відповідність.',
      ];

      const chunks = parseArticleBased(paragraphs, 'test');

      expect(chunks.length).toBe(3);
      const ppChunks = chunks.filter(c => c.article === 'Прикінцеві положення');
      expect(ppChunks.length).toBe(2);
      expect(ppChunks[0].id).toContain('pp');
    });

    it('обробляє "Розділ VII ПРИКІНЦЕВІ ПОЛОЖЕННЯ" як секцію', () => {
      const paragraphs = [
        'Стаття 1. Тест',
        '1. Тестовий текст для першої статті закону.',
        'Розділ VII ПРИКІНЦЕВІ ПОЛОЖЕННЯ',
        '1. Цей Закон набирає чинності через місяць після опублікування.',
      ];

      const chunks = parseArticleBased(paragraphs, 'test');

      const ppChunks = chunks.filter(c => c.id.includes('pp'));
      expect(ppChunks.length).toBeGreaterThan(0);
    });

    it('пропускає редакційні примітки {…} але зберігає виключені статті', () => {
      const paragraphs = [
        'Стаття 5. Виключена',
        '{Статтю 5 виключено на підставі Закону N 1234}',
        'Стаття 6. Діюча стаття',
        '1. Текст діючої статті закону для перевірки парсингу.',
      ];

      const chunks = parseArticleBased(paragraphs, 'test');

      expect(chunks.every(c => !c.text.includes('{'))).toBe(true);
      expect(chunks.some(c => c.article === 'Стаття 6')).toBe(true);
      // Виключена стаття створює чанк з інформацією про виключення
      const excluded = chunks.find(c => c.article === 'Стаття 5');
      expect(excluded).toBeDefined();
      expect(excluded!.text).toContain('виключена');
    });

    it('створює чанк для статті виключеної через редакційну примітку в заголовку', () => {
      const paragraphs = [
        'Стаття 10. {Статтю 10 виключено на підставі Закону № 1234-IX від 01.01.2024}',
        'Стаття 11. Діюча стаття',
        '1. Текст діючої статті.',
      ];

      const chunks = parseArticleBased(paragraphs, 'test');

      const excluded = chunks.find(c => c.article === 'Стаття 10');
      expect(excluded).toBeDefined();
      expect(excluded!.text).toContain('виключена');
      expect(excluded!.id).toBe('test-st10-ch0');
      expect(chunks.some(c => c.article === 'Стаття 11')).toBe(true);
    });

    it('не виключає статтю коли inline примітка в заголовку стосується іншої статті', () => {
      const paragraphs = [
        'Стаття 15. {Статтю 10 виключено на підставі Закону № 1234-IX від 01.01.2024}',
        '1. Текст першої частини статті 15.',
      ];

      const chunks = parseArticleBased(paragraphs, 'test');

      // Стаття 15 НЕ повинна бути виключена — примітка стосується статті 10
      const article15 = chunks.filter(c => c.article === 'Стаття 15');
      expect(article15.length).toBeGreaterThan(0);
      expect(article15.some(c => c.text.includes('Текст першої частини'))).toBe(true);
    });

    it('не класифікує як виключену статтю з приміткою лише про назву', () => {
      const paragraphs = [
        'Стаття 15. {Назву статті 15 виключено на підставі Закону № 5678-IX}',
        '1. Текст першої частини статті 15 що залишилась.',
        '2. Текст другої частини.',
      ];

      const chunks = parseArticleBased(paragraphs, 'test');

      // Стаття 15 НЕ повинна бути позначена як виключена — виключено лише назву
      const article15 = chunks.filter(c => c.article === 'Стаття 15');
      expect(article15.length).toBeGreaterThan(0);
      expect(article15.some(c => c.text.includes('Текст першої частини'))).toBe(true);
    });

    it('створює чанк для дворядкової форми виключення статті', () => {
      const paragraphs = [
        'Стаття 20. ',
        '{Статтю 20 виключено на підставі Закону № 9999-IX від 01.06.2025}',
        'Стаття 21. Діюча стаття',
        '1. Текст діючої статті 21.',
      ];

      const chunks = parseArticleBased(paragraphs, 'test');

      // Виключена стаття 20 повинна створити маркерний чанк
      const excluded = chunks.find(c => c.article === 'Стаття 20');
      expect(excluded).toBeDefined();
      expect(excluded!.text).toContain('виключена');
      expect(excluded!.id).toBe('test-st20-ch0');
      // Стаття 21 повинна бути нормально розпарсена
      expect(chunks.some(c => c.article === 'Стаття 21')).toBe(true);
    });

    it('не виключає поточну статтю коли примітка стосується іншої статті', () => {
      const paragraphs = [
        'Стаття 5. Назва п\'ятої статті',
        '{Статтю 10 виключено на підставі Закону № 1234-IX від 01.01.2024}',
        '1. Текст першої частини статті 5.',
      ];

      const chunks = parseArticleBased(paragraphs, 'test');

      // Стаття 5 НЕ повинна бути виключена — примітка стосується статті 10
      const article5 = chunks.filter(c => c.article === 'Стаття 5');
      expect(article5.length).toBeGreaterThan(0);
      expect(article5.some(c => c.text.includes('Текст першої частини'))).toBe(true);
      // Стаття 10 не повинна з'явитися (це просто примітка, без заголовка)
      expect(chunks.every(c => c.article !== 'Стаття 10')).toBe(true);
    });

    it('не скидає контекст Прикінцевих положень при примітці про виключену статтю', () => {
      const paragraphs = [
        'Прикінцеві положення',
        '{Статтю 99 виключено на підставі Закону № 5555-IX від 01.01.2025}',
        '1. Текст першого пункту прикінцевих положень.',
        '2. Текст другого пункту.',
      ];

      const chunks = parseArticleBased(paragraphs, 'test');

      // Прикінцеві положення повинні зберегти свій контент
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.some(c => c.text.includes('прикінцевих положень'))).toBe(true);
    });

    it('повертає порожній масив якщо статей немає', () => {
      const paragraphs = ['Просто текст без статей.', 'Ще рядок.'];
      const chunks = parseArticleBased(paragraphs, 'test');
      expect(chunks).toEqual([]);
    });
  });

  describe('splitLargeChunks', () => {
    it('розбиває великі чанки по цифрових маркерах (пункти)', () => {
      const longText = 'Преамбула тексту. ' +
        '1) ' + 'А'.repeat(1500) + ' ' +
        '2) ' + 'Б'.repeat(1500) + ' ' +
        '3) ' + 'В'.repeat(1500);

      const chunks = [{
        id: 'test-st1-ch1',
        article: 'Стаття 1',
        part: 'Частина 1',
        text: longText,
        keywords: ['тест'],
      }];

      const result = splitLargeChunks(chunks);
      expect(result.length).toBe(3);
      expect(result[0].id).toBe('test-st1-ch1-1');
      expect(result[0].part).toBe('Частина 1, п.1');
      expect(result[1].id).toBe('test-st1-ch1-2');
      expect(result[1].part).toBe('Частина 1, п.2');
      expect(result[2].id).toBe('test-st1-ch1-3');
      expect(result[2].part).toBe('Частина 1, п.3');
    });

    it('дворівневий split: цифрові пункти → літерні підпункти', () => {
      // Пункт 1 великий з літерними підпунктами, пункт 2 малий
      const longText = 'Преамбула тексту. ' +
        '1) Перший пункт: ' + 'а) ' + 'А'.repeat(2000) + ' б) ' + 'Б'.repeat(2000) + ' в) ' + 'В'.repeat(1000) + ' ' +
        '2) ' + 'Д'.repeat(300);

      const chunks = [{
        id: 'test-st26-ch5',
        article: 'Стаття 26',
        part: 'Частина 5',
        text: longText,
        keywords: ['тест'],
      }];

      const result = splitLargeChunks(chunks);
      // Пункт 1 розбитий на літерні підпункти
      const p1subs = result.filter(c => c.part.includes('п.1'));
      expect(p1subs.length).toBe(3);
      expect(p1subs[0].id).toBe('test-st26-ch5-1-а');
      expect(p1subs[0].part).toBe('Частина 5, п.1, пп.а');
      expect(p1subs[1].id).toBe('test-st26-ch5-1-б');
      expect(p1subs[1].part).toBe('Частина 5, п.1, пп.б');
      expect(p1subs[2].id).toBe('test-st26-ch5-1-в');
      expect(p1subs[2].part).toBe('Частина 5, п.1, пп.в');

      // Пункт 2 малий — не розбивається далі
      const p2 = result.find(c => c.part === 'Частина 5, п.2');
      expect(p2).toBeDefined();
      expect(p2!.id).toBe('test-st26-ch5-2');
    });

    it('fallback: тільки літерні підпункти (без цифрових)', () => {
      const longText = 'Преамбула тексту. ' +
        'а) ' + 'А'.repeat(1500) + ' ' +
        'б) ' + 'Б'.repeat(1500) + ' ' +
        'в) ' + 'В'.repeat(1500);

      const chunks = [{
        id: 'test-st5-ch1',
        article: 'Стаття 5',
        part: 'Частина 1',
        text: longText,
        keywords: ['тест'],
      }];

      const result = splitLargeChunks(chunks);
      expect(result.length).toBe(3);
      expect(result[0].id).toBe('test-st5-ch1-а');
      expect(result[0].part).toBe('Частина 1, пп.а');
      expect(result[1].id).toBe('test-st5-ch1-б');
      expect(result[1].part).toBe('Частина 1, пп.б');
    });

    it('не розбиває маленькі чанки', () => {
      const chunks = [{
        id: 'test-st1-ch1',
        article: 'Стаття 1',
        part: 'Частина 1',
        text: 'Короткий текст.',
        keywords: ['текст'],
      }];

      const result = splitLargeChunks(chunks);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('test-st1-ch1');
    });

    it('один цифровий маркер з літерними підпунктами зберігає ієрархію', () => {
      const longText = 'Преамбула. ' +
        '1) Єдиний пункт: ' +
        'а) ' + 'А'.repeat(1500) + ' ' +
        'б) ' + 'Б'.repeat(1500) + ' ' +
        'в) ' + 'В'.repeat(1500);

      const chunks = [{
        id: 'test-st1-ch1',
        article: 'Стаття 1',
        part: 'Частина 1',
        text: longText,
        keywords: ['тест'],
      }];

      const result = splitLargeChunks(chunks);
      // Один цифровий маркер — зберігає п.1 в ієрархії
      expect(result.length).toBe(3);
      expect(result[0].part).toBe('Частина 1, п.1, пп.а');
      expect(result[1].part).toBe('Частина 1, п.1, пп.б');
    });

    it('не розбиває великий чанк без маркерів', () => {
      const chunks = [{
        id: 'test-st1-ch1',
        article: 'Стаття 1',
        part: 'Частина 1',
        text: 'Х'.repeat(5000),
        keywords: ['тест'],
      }];

      const result = splitLargeChunks(chunks);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('test-st1-ch1');
    });

    it('розбиває чанк що починається з цифрового маркера', () => {
      const longText =
        '1) ' + 'А'.repeat(1500) + ' ' +
        '2) ' + 'Б'.repeat(1500) + ' ' +
        '3) ' + 'В'.repeat(1500);

      const chunks = [{
        id: 'test-st1-ch1',
        article: 'Стаття 1',
        part: 'Частина 1',
        text: longText,
        keywords: ['тест'],
      }];

      const result = splitLargeChunks(chunks);
      expect(result.length).toBe(3);
      expect(result[0].id).toBe('test-st1-ch1-1');
      expect(result[0].part).toBe('Частина 1, п.1');
    });

    it('зберігає преамбулу в першому підчанку', () => {
      const longText = 'Важлива преамбула статті. ' +
        '1) ' + 'А'.repeat(1500) + ' ' +
        '2) ' + 'Б'.repeat(1500) + ' ' +
        '3) ' + 'В'.repeat(1500);

      const chunks = [{
        id: 'test-st1-ch1',
        article: 'Стаття 1',
        part: 'Частина 1',
        text: longText,
        keywords: ['тест'],
      }];

      const result = splitLargeChunks(chunks);
      expect(result[0].text).toContain('Важлива преамбула статті');
    });
  });
});

describe('parseLawDocx (інтеграція)', () => {
  // Тести parseLawDocx через мок extractTextFromDocx
  it('parseLawDocx формує правильну структуру LawFile', async () => {
    // Мокаємо extractTextFromDocx
    vi.doMock('../../../scripts/parse-nakaz40', () => ({
      extractTextFromDocx: () => [
        'Стаття 1. Загальні положення',
        '1. Цей Закон регулює відносини у сфері військового обов\'язку.',
        '2. Дія поширюється на всіх громадян України без виключення.',
        'Стаття 2. Військова служба',
        '1. Військова служба є державною службою особливого характеру.',
        'Стаття 2-1. Додаткові вимоги',
        '1. Додаткові вимоги встановлюються Кабінетом Міністрів України.',
      ].join('\n'),
    }));

    const { parseLawDocx } = await import('../../../scripts/parse-law-docx');

    const law = parseLawDocx('/fake/path.docx', {
      shortTitle: 'Про тестовий закон',
      sourceUrl: 'https://zakon.rada.gov.ua/laws/show/test',
      documentId: 'Закон №TEST від 01.01.2020',
      lastUpdated: '2026-01-15',
    });

    expect(law.title).toBe('Закон України «Про тестовий закон»');
    expect(law.short_title).toBe('Про тестовий закон');
    expect(law.source_url).toBe('https://zakon.rada.gov.ua/laws/show/test');
    expect(law.last_updated).toBe('2026-01-15');
    expect(law.document_id).toBe('Закон №TEST від 01.01.2020');

    expect(law.chunks.length).toBe(4); // 2 частини ст.1 + ст.2 + ст.2-1
    expect(law.chunks.every(c => c.id && c.article && c.text && c.keywords.length > 0)).toBe(true);

    // Перевіряємо статтю з дефісом
    const hyphenArticle = law.chunks.find(c => c.article === 'Стаття 2-1');
    expect(hyphenArticle).toBeDefined();
    expect(hyphenArticle!.id).toContain('st2-1');

    vi.restoreAllMocks();
  });
});
