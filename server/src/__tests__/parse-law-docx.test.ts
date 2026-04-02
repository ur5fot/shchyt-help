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

    it('пропускає редакційні примітки {…}', () => {
      const paragraphs = [
        'Стаття 5. Виключена',
        '{Статтю 5 виключено на підставі Закону N 1234}',
        'Стаття 6. Діюча стаття',
        '1. Текст діючої статті закону для перевірки парсингу.',
      ];

      const chunks = parseArticleBased(paragraphs, 'test');

      expect(chunks.every(c => !c.text.includes('{'))).toBe(true);
      expect(chunks.some(c => c.article === 'Стаття 6')).toBe(true);
    });

    it('повертає порожній масив якщо статей немає', () => {
      const paragraphs = ['Просто текст без статей.', 'Ще рядок.'];
      const chunks = parseArticleBased(paragraphs, 'test');
      expect(chunks).toEqual([]);
    });
  });

  describe('splitLargeChunks', () => {
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
    });

    it('розбиває великі чанки по підпунктах', () => {
      // Генеруємо великий текст з підпунктами
      const longText = 'Преамбула тексту. ' +
        '1) ' + 'А'.repeat(800) + ' ' +
        '2) ' + 'Б'.repeat(800) + ' ' +
        '3) ' + 'В'.repeat(800);

      const chunks = [{
        id: 'test-st1-ch1',
        article: 'Стаття 1',
        part: 'Частина 1',
        text: longText,
        keywords: ['тест'],
      }];

      const result = splitLargeChunks(chunks);
      expect(result.length).toBeGreaterThan(1);
      expect(result[0].id).toContain('-p1');
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
