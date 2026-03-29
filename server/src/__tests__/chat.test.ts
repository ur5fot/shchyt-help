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
  const app = createApp();

  beforeEach(() => {
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
    expect(відповідь.body.answer).toContain(ДИСКЛЕЙМЕР);
  });

  it('не дублює дисклеймер якщо AI його вже додав', async () => {
    const відповідьЗДисклеймером = `Відповідь.\n\n${ДИСКЛЕЙМЕР}`;
    mockAskClaude.mockResolvedValue(відповідьЗДисклеймером);

    const відповідь = await request(app)
      .post('/api/chat')
      .send({ message: 'Питання' });

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

    it('залишає всі sources якщо жодна цитата не верифікована (graceful)', async () => {
      mockSearchLaws.mockReturnValue([{ chunk: чанкЗТекстом, score: 5 }]);
      mockAskClaude.mockResolvedValue(
        `Відповідь. ${ДИСКЛЕЙМЕР}\nЦИТАТИ:\n- Стаття 999, Частина 1 | "Вигадана цитата якої немає в чанках"`
      );

      const відповідь = await request(app)
        .post('/api/chat')
        .send({ message: 'питання' });

      expect(відповідь.status).toBe(200);
      // Жодна цитата не верифікована — фільтрація не застосовується, всі sources залишаються
      expect(відповідь.body.sources).toHaveLength(1);
    });
  });
});
