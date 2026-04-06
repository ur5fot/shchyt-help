// Тести для роуту POST /api/chat
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокаємо залежності до імпорту застосунку
vi.mock('../services/lawSearch.ts', () => ({
  searchLaws: vi.fn(),
  hybridSearchLaws: vi.fn(),
}));

vi.mock('../services/promptBuilder.ts', () => ({
  buildPrompt: vi.fn(),
}));

vi.mock('../services/claude.ts', () => ({
  askClaude: vi.fn(),
}));

vi.mock('../../../laws/index.ts', () => ({
  loadAllLaws: vi.fn().mockReturnValue([]),
}));

vi.mock('../services/vectorStore.ts', () => ({
  ініціалізуватиБД: vi.fn().mockResolvedValue({}),
  чиДоступнаБД: vi.fn().mockResolvedValue(false),
}));

import request from 'supertest';
import { createApp } from '../app.ts';
import { searchLaws, hybridSearchLaws } from '../services/lawSearch.ts';
import { buildPrompt } from '../services/promptBuilder.ts';
import { askClaude } from '../services/claude.ts';
import { ДИСКЛЕЙМЕР } from '../constants.ts';
import { _встановитиLanceDB } from '../routes/chat.ts';

const mockSearchLaws = vi.mocked(searchLaws);
const mockHybridSearchLaws = vi.mocked(hybridSearchLaws);
const mockBuildPrompt = vi.mocked(buildPrompt);
const mockAskClaude = vi.mocked(askClaude);

describe('POST /api/chat', () => {
  // Створюємо новий app для кожного тесту щоб rate limiter не блокував запити
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();

    // За замовчуванням LanceDB недоступна — keyword пошук
    _встановитиLanceDB(false);

    // Стандартні відповіді моків
    mockSearchLaws.mockReturnValue([]);
    mockHybridSearchLaws.mockResolvedValue([]);
    mockBuildPrompt.mockReturnValue('складений промпт');
    mockAskClaude.mockResolvedValue(`Відповідь від Claude ${ДИСКЛЕЙМЕР}`);
  });

  it('повертає 200 та відповідь при валідному запиті', async () => {
    const відповідь = await request(app)
      .post('/api/chat')
      .send({ message: 'Які пільги має військовослужбовець?' })
      .set('Content-Type', 'application/json');

    expect(відповідь.status).toBe(200);
    expect(відповідь.body).toHaveProperty('answer');
    expect(відповідь.body).toHaveProperty('sources');
  });

  it('повертає answer з тексту Claude', async () => {
    mockAskClaude.mockResolvedValue(`Відповідь про пільги ${ДИСКЛЕЙМЕР}`);

    const відповідь = await request(app)
      .post('/api/chat')
      .send({ message: 'Питання про пільги' });

    expect(відповідь.body.answer).toBe(`Відповідь про пільги ${ДИСКЛЕЙМЕР}`);
  });

  it('повертає sources як масив', async () => {
    const відповідь = await request(app)
      .post('/api/chat')
      .send({ message: 'Питання' });

    expect(Array.isArray(відповідь.body.sources)).toBe(true);
  });

  it('формує sources з результатів пошуку', async () => {
    mockSearchLaws.mockReturnValue([
      {
        chunk: {
          id: 'chunk-1',
          article: 'Стаття 9',
          part: 'Частина 1',
          title: 'Грошове забезпечення',
          text: 'Текст статті',
          keywords: ['грошове забезпечення'],
          lawTitle: 'Про соціальний захист військовослужбовців',
          sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
        },
        score: 5,
      },
    ]);

    const відповідь = await request(app)
      .post('/api/chat')
      .send({ message: 'грошове забезпечення' });

    expect(відповідь.body.sources).toHaveLength(1);
    expect(відповідь.body.sources[0]).toMatchObject({
      law: 'Про соціальний захист військовослужбовців',
      article: 'Стаття 9, Частина 1',
      sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
    });
  });

  it('повертає 400 при порожньому повідомленні', async () => {
    const відповідь = await request(app)
      .post('/api/chat')
      .send({ message: '' });

    expect(відповідь.status).toBe(400);
  });

  it('повертає 400 при відсутньому полі message', async () => {
    const відповідь = await request(app)
      .post('/api/chat')
      .send({});

    expect(відповідь.status).toBe(400);
  });

  it('повертає 400 при повідомленні лише з пробілів', async () => {
    const відповідь = await request(app)
      .post('/api/chat')
      .send({ message: '   ' });

    expect(відповідь.status).toBe(400);
  });

  it('повертає 500 при помилці Claude', async () => {
    mockAskClaude.mockRejectedValue(new Error('Помилка API'));

    const відповідь = await request(app)
      .post('/api/chat')
      .send({ message: 'Питання' });

    expect(відповідь.status).toBe(500);
  });

  it('викликає searchLaws з повідомленням', async () => {
    await request(app)
      .post('/api/chat')
      .send({ message: 'відпустка військовослужбовця' });

    expect(mockSearchLaws).toHaveBeenCalledWith(
      'відпустка військовослужбовця',
      expect.any(Array)
    );
  });

  it('викликає buildPrompt з повідомленням та чанками', async () => {
    const mockЧанки = [
      {
        chunk: {
          id: 'c1',
          article: 'Стаття 1',
          part: '',
          text: 'текст',
          keywords: [],
          lawTitle: 'Закон',
          sourceUrl: 'https://example.com',
        },
        score: 3,
      },
    ];
    mockSearchLaws.mockReturnValue(mockЧанки);

    await request(app)
      .post('/api/chat')
      .send({ message: 'Питання' });

    expect(mockBuildPrompt).toHaveBeenCalledWith(
      'Питання',
      expect.arrayContaining([expect.objectContaining({ id: 'c1' })])
    );
  });

  it('додає дисклеймер якщо AI його пропустив', async () => {
    mockAskClaude.mockResolvedValue('Відповідь без попередження');

    const відповідь = await request(app)
      .post('/api/chat')
      .send({ message: 'Питання' });

    expect(відповідь.status).toBe(200);
    if (ДИСКЛЕЙМЕР) {
      expect(відповідь.body.answer).toContain(ДИСКЛЕЙМЕР);
    } else {
      // Коли дисклеймер вимкнений — відповідь залишається без змін
      expect(відповідь.body.answer).toBe('Відповідь без попередження');
    }
  });

  it('не дублює дисклеймер якщо AI його вже додав', async () => {
    const дисклеймерТест = ДИСКЛЕЙМЕР || '⚠️ Тестовий дисклеймер';
    const відповідьЗДисклеймером = `Відповідь.\n\n${дисклеймерТест}`;
    mockAskClaude.mockResolvedValue(відповідьЗДисклеймером);

    const відповідь = await request(app)
      .post('/api/chat')
      .send({ message: 'Питання' });

    // Дисклеймер не повинен дублюватися — відповідь залишається як є
    expect(відповідь.body.answer).toBe(відповідьЗДисклеймером);
  });

  it('повертає 503 з зрозумілим повідомленням при відсутньому API ключі', async () => {
    mockAskClaude.mockRejectedValue(new Error('API ключ ANTHROPIC_API_KEY не встановлений'));

    const відповідь = await request(app)
      .post('/api/chat')
      .send({ message: 'Питання' });

    expect(відповідь.status).toBe(503);
    expect(відповідь.body.error).toContain('API ключ не налаштований');
    expect(відповідь.body.error).toContain('.env');
  });

  it('повертає 504 якщо Claude не відповів вчасно', async () => {
    const { APIConnectionTimeoutError } = await import('@anthropic-ai/sdk');
    const timeoutError = new APIConnectionTimeoutError({ message: 'Request timed out.' });
    mockAskClaude.mockRejectedValue(timeoutError);

    const відповідь = await request(app)
      .post('/api/chat')
      .send({ message: 'Питання' });

    expect(відповідь.status).toBe(504);
    expect(відповідь.body.error).toContain('не відповів вчасно');
  });

  it('використовує hybridSearchLaws коли LanceDB доступна', async () => {
    _встановитиLanceDB(true);
    mockHybridSearchLaws.mockResolvedValue([]);

    await request(app)
      .post('/api/chat')
      .send({ message: 'відпустка' });

    expect(mockHybridSearchLaws).toHaveBeenCalledWith(
      'відпустка',
      expect.any(Array)
    );
    expect(mockSearchLaws).not.toHaveBeenCalled();
  });

  it('використовує searchLaws коли LanceDB недоступна', async () => {
    _встановитиLanceDB(false);

    await request(app)
      .post('/api/chat')
      .send({ message: 'відпустка' });

    expect(mockSearchLaws).toHaveBeenCalledWith(
      'відпустка',
      expect.any(Array)
    );
    expect(mockHybridSearchLaws).not.toHaveBeenCalled();
  });

  it('source без частини має лише назву статті', async () => {
    mockSearchLaws.mockReturnValue([
      {
        chunk: {
          id: 'chunk-2',
          article: 'Стаття 15',
          part: '',
          text: 'Текст',
          keywords: [],
          lawTitle: 'Закон про щось',
          sourceUrl: 'https://zakon.rada.gov.ua/laws/show/123',
        },
        score: 2,
      },
    ]);

    const відповідь = await request(app)
      .post('/api/chat')
      .send({ message: 'щось' });

    expect(відповідь.body.sources[0].article).toBe('Стаття 15');
  });

  it('відхиляє payload більше 10kb (JSON_ЛІМІТ)', async () => {
    // Генеруємо повідомлення більше 10kb (ASCII, 1 байт на символ)
    const великеПовідомлення = 'A'.repeat(12_000);

    const відповідь = await request(app)
      .post('/api/chat')
      .send({ message: великеПовідомлення })
      .set('Content-Type', 'application/json');

    // Express повертає 413 Payload Too Large коли тіло перевищує ліміт
    expect(відповідь.status).toBe(413);
  });

  describe('query expansion для follow-up питань', () => {
    it('витягує посилання на статті з останньої відповіді AI та додає до пошуку', async () => {
      const history = [
        { role: 'user' as const, content: 'Як звільнитися з контракту?' },
        { role: 'assistant' as const, content: 'Згідно стаття 26, частина 5, пункт 3 — ви маєте право на звільнення.' },
      ];

      mockSearchLaws.mockReturnValue([]);

      await request(app)
        .post('/api/chat')
        .send({ message: 'А якщо контракт до війни?', history });

      // Другий виклик — контекстний пошук з посиланнями на статті
      expect(mockSearchLaws).toHaveBeenCalledTimes(2);
      const контекстнийЗапит = mockSearchLaws.mock.calls[1][0];
      expect(контекстнийЗапит.toLowerCase()).toContain('стаття 26');
      expect(контекстнийЗапит.toLowerCase()).toContain('частина 5');
      expect(контекстнийЗапит.toLowerCase()).toContain('пункт 3');
    });

    it('витягує скорочені посилання (ст. 26) з відповіді AI', async () => {
      const history = [
        { role: 'user' as const, content: 'Питання' },
        { role: 'assistant' as const, content: 'Відповідно до ст. 9 та ст. 10 Закону.' },
      ];

      mockSearchLaws.mockReturnValue([]);

      await request(app)
        .post('/api/chat')
        .send({ message: 'Розкажіть детальніше', history });

      const контекстнийЗапит = mockSearchLaws.mock.calls[1][0];
      expect(контекстнийЗапит).toContain('ст. 9');
      expect(контекстнийЗапит).toContain('ст. 10');
    });

    it('витягує скорочені посилання п. та ч. з відповіді AI', async () => {
      const history = [
        { role: 'user' as const, content: 'Питання' },
        { role: 'assistant' as const, content: 'Відповідно до пп. «ж» п.3 ч.5 ст.26 Закону.' },
      ];

      mockSearchLaws.mockReturnValue([]);

      await request(app)
        .post('/api/chat')
        .send({ message: 'Розкажіть детальніше', history });

      const контекстнийЗапит = mockSearchLaws.mock.calls[1][0];
      expect(контекстнийЗапит).toContain('п.3');
      expect(контекстнийЗапит).toContain('ч.5');
      expect(контекстнийЗапит).toContain('ст.26');
    });

    it('витягує посилання на статті з дефісом (10-1, 3-1) з відповіді AI', async () => {
      const history = [
        { role: 'user' as const, content: 'Які відпустки є?' },
        { role: 'assistant' as const, content: 'Згідно стаття 10-1, частина 3-1, пункт 5-2, ст. 7-3 — є такі відпустки.' },
      ];

      mockSearchLaws.mockReturnValue([]);

      await request(app)
        .post('/api/chat')
        .send({ message: 'А під час воєнного стану?', history });

      const контекстнийЗапит = mockSearchLaws.mock.calls[1][0];
      expect(контекстнийЗапит.toLowerCase()).toContain('стаття 10-1');
      expect(контекстнийЗапит.toLowerCase()).toContain('частина 3-1');
      expect(контекстнийЗапит.toLowerCase()).toContain('пункт 5-2');
      expect(контекстнийЗапит).toContain('ст. 7-3');
    });

    it('працює без помилок коли у відповіді AI немає посилань на статті', async () => {
      const history = [
        { role: 'user' as const, content: 'Привіт' },
        { role: 'assistant' as const, content: 'Вітаю! Чим можу допомогти?' },
      ];

      mockSearchLaws.mockReturnValue([]);

      const відповідь = await request(app)
        .post('/api/chat')
        .send({ message: 'Що таке ВЛК?', history });

      expect(відповідь.status).toBe(200);
      // Другий виклик має бути без посилань на статті (graceful fallback)
      expect(mockSearchLaws).toHaveBeenCalledTimes(2);
    });

    it('обмежує загальну довжину контекстного запиту до 400 символів', async () => {
      const довгийТекст = 'A'.repeat(300);
      const history = [
        { role: 'user' as const, content: довгийТекст },
        { role: 'assistant' as const, content: 'Згідно стаття 26, стаття 10, стаття 15.' },
      ];

      mockSearchLaws.mockReturnValue([]);

      await request(app)
        .post('/api/chat')
        .send({ message: 'Деталі?', history });

      const контекстнийЗапит = mockSearchLaws.mock.calls[1][0];
      expect(контекстнийЗапит.length).toBeLessThanOrEqual(400);
    });

    it('дедуплікує однакові посилання на статті', async () => {
      const history = [
        { role: 'user' as const, content: 'Питання' },
        { role: 'assistant' as const, content: 'Стаття 26 передбачає... Також стаття 26 містить...' },
      ];

      mockSearchLaws.mockReturnValue([]);

      await request(app)
        .post('/api/chat')
        .send({ message: 'Далі?', history });

      const контекстнийЗапит = mockSearchLaws.mock.calls[1][0];
      // Має бути лише одне входження "стаття 26" (не дублюється)
      const matches = контекстнийЗапит.match(/стаття 26/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe('верифікація цитат', () => {
    const чанкЗТекстом = {
      id: 'chunk-v1',
      article: 'Стаття 10',
      part: 'Частина 2',
      title: 'Грошове забезпечення',
      text: 'Військовослужбовцям виплачується грошове забезпечення в розмірі, встановленому законодавством.',
      keywords: ['грошове забезпечення'],
      lawTitle: 'Про соціальний захист',
      sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
    };

    it('видаляє блок ЦИТАТИ з відповіді для користувача', async () => {
      mockSearchLaws.mockReturnValue([{ chunk: чанкЗТекстом, score: 5 }]);
      mockAskClaude.mockResolvedValue(
        `Відповідь про грошове забезпечення. ${ДИСКЛЕЙМЕР}\nЦИТАТИ:\n- Стаття 10, Частина 2 | "Військовослужбовцям виплачується грошове забезпечення"`
      );

      const відповідь = await request(app)
        .post('/api/chat')
        .send({ message: 'грошове забезпечення' });

      expect(відповідь.status).toBe(200);
      expect(відповідь.body.answer).not.toContain('ЦИТАТИ:');
      expect(відповідь.body.answer).toContain('Відповідь про грошове забезпечення');
    });

    it('залишає sources тільки для верифікованих цитат', async () => {
      const невірнийЧанк = {
        id: 'chunk-fake',
        article: 'Стаття 999',
        part: '',
        text: 'Якийсь інший текст.',
        keywords: [],
        lawTitle: 'Інший закон',
        sourceUrl: 'https://zakon.rada.gov.ua/laws/show/999',
      };

      mockSearchLaws.mockReturnValue([
        { chunk: чанкЗТекстом, score: 5 },
        { chunk: невірнийЧанк, score: 3 },
      ]);
      mockAskClaude.mockResolvedValue(
        `Відповідь. ${ДИСКЛЕЙМЕР}\nЦИТАТИ:\n- Стаття 10, Частина 2 | "Військовослужбовцям виплачується грошове забезпечення"`
      );

      const відповідь = await request(app)
        .post('/api/chat')
        .send({ message: 'грошове забезпечення' });

      expect(відповідь.body.sources).toHaveLength(1);
      expect(відповідь.body.sources[0].law).toBe('Про соціальний захист');
    });

    it('повертає всі sources якщо Claude не додав блок ЦИТАТИ (graceful)', async () => {
      mockSearchLaws.mockReturnValue([
        { chunk: чанкЗТекстом, score: 5 },
        {
          chunk: {
            id: 'chunk-2',
            article: 'Стаття 5',
            part: '',
            text: 'Інший текст',
            keywords: [],
            lawTitle: 'Інший закон',
            sourceUrl: 'https://zakon.rada.gov.ua/laws/show/555',
          },
          score: 3,
        },
      ]);
      mockAskClaude.mockResolvedValue(`Відповідь без блоку цитат. ${ДИСКЛЕЙМЕР}`);

      const відповідь = await request(app)
        .post('/api/chat')
        .send({ message: 'питання' });

      expect(відповідь.body.sources).toHaveLength(2);
    });

    it('повертає verifiedSources у відповіді при верифікованих цитатах', async () => {
      mockSearchLaws.mockReturnValue([{ chunk: чанкЗТекстом, score: 5 }]);
      mockAskClaude.mockResolvedValue(
        `Відповідь. ${ДИСКЛЕЙМЕР}\nЦИТАТИ:\n- Стаття 10, Частина 2 | "Військовослужбовцям виплачується грошове забезпечення"`
      );

      const відповідь = await request(app)
        .post('/api/chat')
        .send({ message: 'грошове забезпечення' });

      expect(відповідь.status).toBe(200);
      expect(відповідь.body.verifiedSources).toBe(1);
    });

    it('не фільтрує sources якщо цитати є але жодна не верифікована (graceful degradation)', async () => {
      mockSearchLaws.mockReturnValue([{ chunk: чанкЗТекстом, score: 5 }]);
      mockAskClaude.mockResolvedValue(
        `Відповідь. ${ДИСКЛЕЙМЕР}\nЦИТАТИ:\n- Стаття 999, Частина 1 | "Вигадана цитата якої немає в чанках"`
      );

      const відповідь = await request(app)
        .post('/api/chat')
        .send({ message: 'питання' });

      // Жодна цитата не верифікована — фільтрація не активується, всі sources повертаються
      // Це безпечніше ніж показувати 0 джерел коли пошук знайшов релевантні чанки
      expect(відповідь.body.sources).toHaveLength(1);
      expect(відповідь.body.verifiedSources).toBeUndefined();
    });

    it('не повертає verifiedSources якщо Claude не додав блок ЦИТАТИ', async () => {
      mockSearchLaws.mockReturnValue([{ chunk: чанкЗТекстом, score: 5 }]);
      mockAskClaude.mockResolvedValue(`Відповідь без цитат. ${ДИСКЛЕЙМЕР}`);

      const відповідь = await request(app)
        .post('/api/chat')
        .send({ message: 'питання' });

      expect(відповідь.body.verifiedSources).toBeUndefined();
    });

    it('не фільтрує sources при малформованому блоці ЦИТАТИ без рядків цитат (graceful degradation)', async () => {
      mockSearchLaws.mockReturnValue([{ chunk: чанкЗТекстом, score: 5 }]);
      // Блок ЦИТАТИ є, але рядки не починаються з "- " — не розпізнається як блок цитат
      mockAskClaude.mockResolvedValue(
        `Відповідь. ${ДИСКЛЕЙМЕР}\nЦИТАТИ:\nСтаття 10 Частина 2 — грошове забезпечення\nякийсь інший текст`
      );

      const відповідь = await request(app)
        .post('/api/chat')
        .send({ message: 'грошове забезпечення' });

      expect(відповідь.status).toBe(200);
      // Блок без рядків цитат не активує фільтрацію — всі sources повертаються (graceful degradation)
      expect(відповідь.body.sources).toHaveLength(1);
      expect(відповідь.body.verifiedSources).toBeUndefined();
    });

    it('повертає всі sources якщо жодна цитата не верифікована (graceful degradation замість порожніх джерел)', async () => {
      mockSearchLaws.mockReturnValue([{ chunk: чанкЗТекстом, score: 5 }]);
      mockAskClaude.mockResolvedValue(
        `Відповідь. ${ДИСКЛЕЙМЕР}\nЦИТАТИ:\n- Стаття 999, Частина 1 | "Вигадана цитата якої немає в чанках"`
      );

      const відповідь = await request(app)
        .post('/api/chat')
        .send({ message: 'питання' });

      expect(відповідь.status).toBe(200);
      // Жодна цитата не верифікована — показуємо всі знайдені джерела (безпечніше ніж 0 джерел)
      // Пошук знайшов релевантні чанки — вони корисні для користувача навіть без верифікації
      expect(відповідь.body.sources).toHaveLength(1);
      expect(відповідь.body.verifiedSources).toBeUndefined();
    });
  });
});
