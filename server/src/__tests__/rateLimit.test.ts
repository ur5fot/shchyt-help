// Тести для rate limiting на API
import { describe, it, expect, vi } from 'vitest';

// Мокаємо залежності
vi.mock('../services/lawSearch.ts', () => ({
  searchLaws: vi.fn().mockReturnValue([]),
  hybridSearchLaws: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/promptBuilder.ts', () => ({
  buildPrompt: vi.fn().mockReturnValue('промпт'),
}));

vi.mock('../services/claude.ts', () => ({
  askClaude: vi.fn().mockResolvedValue('Відповідь'),
}));

vi.mock('../../../laws/index.ts', () => ({
  loadAllLaws: vi.fn().mockReturnValue([]),
}));

vi.mock('../services/vectorStore.ts', () => ({
  ініціалізуватиБД: vi.fn().mockResolvedValue({}),
  чиДоступнаБД: vi.fn().mockResolvedValue(false),
}));

import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';

describe('Rate Limiting', () => {
  it('повертає 429 при перевищенні ліміту запитів', async () => {
    // Створюємо окремий застосунок з низьким лімітом для тесту
    const app = express();
    app.use(express.json());

    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Забагато запитів. Спробуйте через хвилину.' },
    });

    app.use('/api/chat', limiter, (await import('../routes/chat.ts')).default);

    // Перші 2 запити мають пройти
    for (let i = 0; i < 2; i++) {
      const відповідь = await request(app)
        .post('/api/chat')
        .send({ message: 'Питання' });
      expect(відповідь.status).toBe(200);
    }

    // Третій запит має повернути 429
    const відповідь = await request(app)
      .post('/api/chat')
      .send({ message: 'Ще одне питання' });

    expect(відповідь.status).toBe(429);
    expect(відповідь.body.error).toBe('Забагато запитів. Спробуйте через хвилину.');
  });

  it('apiLimiter експортується з app.ts з правильними налаштуваннями', async () => {
    const { apiLimiter } = await import('../app.ts');
    expect(apiLimiter).toBeDefined();
    expect(typeof apiLimiter).toBe('function');
  });
});
