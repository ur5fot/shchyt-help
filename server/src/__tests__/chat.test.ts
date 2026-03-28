// Тести для роуту POST /api/chat
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокаємо залежності до імпорту застосунку
vi.mock('../services/lawSearch.ts', () => ({
  searchLaws: vi.fn(),
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

import request from 'supertest';
import { createApp } from '../app.ts';
import { searchLaws } from '../services/lawSearch.ts';
import { buildPrompt } from '../services/promptBuilder.ts';
import { askClaude } from '../services/claude.ts';
import { ДИСКЛЕЙМЕР } from '../constants.ts';

const mockSearchLaws = vi.mocked(searchLaws);
const mockBuildPrompt = vi.mocked(buildPrompt);
const mockAskClaude = vi.mocked(askClaude);

describe('POST /api/chat', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();

    // Стандартні відповіді моків
    mockSearchLaws.mockReturnValue([]);
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
});
