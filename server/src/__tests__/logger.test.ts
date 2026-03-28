// Тести для структурованого логування
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокаємо logger
vi.mock('../logger.ts', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

// Мокаємо залежності chat роуту
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
import { logger } from '../logger.ts';
import { searchLaws } from '../services/lawSearch.ts';
import { buildPrompt } from '../services/promptBuilder.ts';
import { askClaude } from '../services/claude.ts';
import { _встановитиLanceDB } from '../routes/chat.ts';

const mockSearchLaws = vi.mocked(searchLaws);
const mockBuildPrompt = vi.mocked(buildPrompt);
const mockAskClaude = vi.mocked(askClaude);
const mockLogger = vi.mocked(logger);

describe('Структуроване логування', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    _встановитиLanceDB(false);
    mockSearchLaws.mockReturnValue([]);
    mockBuildPrompt.mockReturnValue('промпт');
    mockAskClaude.mockResolvedValue('Відповідь ⚠️ дисклеймер');
  });

  it('логує довжину запиту (не повний текст) при пошуку', async () => {
    await request(app)
      .post('/api/chat')
      .send({ message: 'тест' });

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ довжинаЗапиту: 4 }),
      'Пошук законів завершено'
    );
  });

  it('логує кількість знайдених чанків при пошуку', async () => {
    mockSearchLaws.mockReturnValue([
      {
        chunk: {
          id: 'c1',
          article: 'Стаття 1',
          part: '',
          title: 'Тест',
          text: 'текст',
          keywords: [],
          lawTitle: 'Закон',
          sourceUrl: 'https://example.com',
        },
        score: 5,
      },
    ]);

    await request(app)
      .post('/api/chat')
      .send({ message: 'тестове питання' });

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ кількістьЧанків: 1, довжинаЗапиту: expect.any(Number) }),
      'Пошук законів завершено'
    );
  });

  it('логує час відповіді при успішному запиті', async () => {
    await request(app)
      .post('/api/chat')
      .send({ message: 'питання' });

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ часВідповідіМс: expect.any(Number), кількістьДжерел: expect.any(Number) }),
      'Запит оброблено'
    );
  });

  it('логує помилку при збої Claude API', async () => {
    mockAskClaude.mockRejectedValue(new Error('Помилка API'));

    await request(app)
      .post('/api/chat')
      .send({ message: 'питання' });

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ помилка: expect.any(Error), часВідповідіМс: expect.any(Number) }),
      'Помилка при обробці запиту'
    );
  });

  it('не логує повний текст повідомлення користувача', async () => {
    const секретнеПовідомлення = 'Моє секретне питання про закони';

    await request(app)
      .post('/api/chat')
      .send({ message: секретнеПовідомлення });

    // Перевіряємо що жоден виклик logger.info не містить повного тексту повідомлення
    for (const виклик of mockLogger.info.mock.calls) {
      const jsonАрг = JSON.stringify(виклик);
      expect(jsonАрг).not.toContain(секретнеПовідомлення);
    }
  });
});
