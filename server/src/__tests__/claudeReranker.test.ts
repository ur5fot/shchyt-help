// Тести для Claude re-ranker
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокаємо bge reranker
const mockBgeRerank = vi.fn();
vi.mock('../services/reranker.ts', () => ({
  rerank: mockBgeRerank,
}));

// Мокаємо Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
    __mockCreate: mockCreate,
  };
});

vi.mock('../logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const { default: Anthropic } = await import('@anthropic-ai/sdk');

describe('claudeReranker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
    mockBgeRerank.mockReset();
  });

  const створитиДокументи = (кількість: number) =>
    Array.from({ length: кількість }, (_, i) => ({
      id: `chunk-${i + 1}`,
      text: `Текст документа ${i + 1} про військове право`,
      summary: `Резюме документа ${i + 1}`,
    }));

  describe('claudeRerank', () => {
    it('повертає порожній масив для порожнього вводу', async () => {
      const { claudeRerank } = await import('../services/claudeReranker.ts');
      const результат = await claudeRerank('запит', []);
      expect(результат).toEqual([]);
    });

    it('ранжує документи через Claude і парсить JSON відповідь', async () => {
      const jsonВідповідь = '[{"n": 1, "s": 9}, {"n": 2, "s": 3}, {"n": 3, "s": 7}]';
      const mockCreateFn = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: jsonВідповідь }],
      });
      (Anthropic as any).mockImplementationOnce(() => ({
        messages: { create: mockCreateFn },
      }));

      const { claudeRerank } = await import('../services/claudeReranker.ts');
      const документи = створитиДокументи(3);
      const результат = await claudeRerank('грошове забезпечення', документи);

      // Має бути відсортовано за спаданням score
      expect(результат).toHaveLength(3);
      expect(результат[0]).toEqual({ id: 'chunk-1', score: 9 });
      expect(результат[1]).toEqual({ id: 'chunk-3', score: 7 });
      expect(результат[2]).toEqual({ id: 'chunk-2', score: 3 });
    });

    it('обрізає результати до topK', async () => {
      const jsonВідповідь = '[{"n": 1, "s": 9}, {"n": 2, "s": 7}, {"n": 3, "s": 5}, {"n": 4, "s": 3}, {"n": 5, "s": 1}]';
      const mockCreateFn = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: jsonВідповідь }],
      });
      (Anthropic as any).mockImplementationOnce(() => ({
        messages: { create: mockCreateFn },
      }));

      const { claudeRerank } = await import('../services/claudeReranker.ts');
      const документи = створитиДокументи(5);
      const результат = await claudeRerank('запит', документи, 2);

      expect(результат).toHaveLength(2);
      expect(результат[0].score).toBe(9);
      expect(результат[1].score).toBe(7);
    });

    it('використовує Sonnet модель', async () => {
      const mockCreateFn = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '[{"n": 1, "s": 5}]' }],
      });
      (Anthropic as any).mockImplementationOnce(() => ({
        messages: { create: mockCreateFn },
      }));

      const { claudeRerank } = await import('../services/claudeReranker.ts');
      await claudeRerank('запит', створитиДокументи(1));

      expect(mockCreateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-6',
        }),
        expect.objectContaining({ timeout: 15_000 }),
      );
    });

    it('fallback на bge-reranker при помилці Claude API', async () => {
      const mockCreateFn = vi.fn().mockRejectedValue(new Error('Timeout'));
      (Anthropic as any).mockImplementationOnce(() => ({
        messages: { create: mockCreateFn },
      }));
      mockBgeRerank.mockResolvedValue([
        { id: 'chunk-1', score: 0.8 },
        { id: 'chunk-2', score: 0.5 },
      ]);

      const { claudeRerank } = await import('../services/claudeReranker.ts');
      const документи = створитиДокументи(3);
      const результат = await claudeRerank('запит', документи, 2);

      expect(mockBgeRerank).toHaveBeenCalledWith(
        'запит',
        документи.map(д => ({ id: д.id, text: д.text })),
        2,
      );
      expect(результат).toEqual([
        { id: 'chunk-1', score: 0.8 },
        { id: 'chunk-2', score: 0.5 },
      ]);
    });

    it('fallback на bge-reranker при непарсабельній відповіді', async () => {
      const mockCreateFn = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Ось мої оцінки: документ 1 - добрий, документ 2 - поганий' }],
      });
      (Anthropic as any).mockImplementationOnce(() => ({
        messages: { create: mockCreateFn },
      }));
      mockBgeRerank.mockResolvedValue([{ id: 'chunk-1', score: 0.5 }]);

      const { claudeRerank } = await import('../services/claudeReranker.ts');
      const результат = await claudeRerank('запит', створитиДокументи(2));

      expect(mockBgeRerank).toHaveBeenCalled();
      expect(результат).toEqual([{ id: 'chunk-1', score: 0.5 }]);
    });

    it('fallback при несподіваному типі відповіді', async () => {
      const mockCreateFn = vi.fn().mockResolvedValue({
        content: [{ type: 'image', source: {} }],
      });
      (Anthropic as any).mockImplementationOnce(() => ({
        messages: { create: mockCreateFn },
      }));
      mockBgeRerank.mockResolvedValue([]);

      const { claudeRerank } = await import('../services/claudeReranker.ts');
      await claudeRerank('запит', створитиДокументи(1));

      expect(mockBgeRerank).toHaveBeenCalled();
    });

    it('парсить JSON обгорнутий у ```json ...```', async () => {
      const jsonВідповідь = '```json\n[{"n": 1, "s": 8}, {"n": 2, "s": 4}]\n```';
      const mockCreateFn = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: jsonВідповідь }],
      });
      (Anthropic as any).mockImplementationOnce(() => ({
        messages: { create: mockCreateFn },
      }));

      const { claudeRerank } = await import('../services/claudeReranker.ts');
      const результат = await claudeRerank('запит', створитиДокументи(2));

      expect(результат).toHaveLength(2);
      expect(результат[0]).toEqual({ id: 'chunk-1', score: 8 });
      expect(результат[1]).toEqual({ id: 'chunk-2', score: 4 });
    });

    it('пропускає невалідні елементи у відповіді', async () => {
      // n=99 — невалідний індекс, s=15 — невалідна оцінка
      const jsonВідповідь = '[{"n": 1, "s": 8}, {"n": 99, "s": 5}, {"n": 2, "s": 15}, {"n": 3, "s": 6}]';
      const mockCreateFn = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: jsonВідповідь }],
      });
      (Anthropic as any).mockImplementationOnce(() => ({
        messages: { create: mockCreateFn },
      }));

      const { claudeRerank } = await import('../services/claudeReranker.ts');
      const результат = await claudeRerank('запит', створитиДокументи(3));

      // Тільки n=1 (score 8) і n=3 (score 6) валідні
      expect(результат).toHaveLength(2);
      expect(результат[0]).toEqual({ id: 'chunk-1', score: 8 });
      expect(результат[1]).toEqual({ id: 'chunk-3', score: 6 });
    });
  });

  describe('_сформуватиПромпт', () => {
    it('включає summary та текст у промпт', async () => {
      const { _сформуватиПромпт } = await import('../services/claudeReranker.ts');
      const документи = [
        { id: 'ch-1', text: 'Повний текст закону', summary: 'Короткий зміст' },
        { id: 'ch-2', text: 'Інший текст', summary: undefined },
      ];

      const промпт = _сформуватиПромпт('мій запит', документи);

      expect(промпт).toContain('мій запит');
      expect(промпт).toContain('[1] Короткий зміст | Повний текст закону');
      expect(промпт).toContain('[2] Інший текст');
      // Без summary — не повинно бути " | "
      expect(промпт).not.toContain('[2]  | ');
    });

    it('обрізає текст до 200 символів', async () => {
      const { _сформуватиПромпт } = await import('../services/claudeReranker.ts');
      const довгийТекст = 'А'.repeat(500);
      const документи = [{ id: 'ch-1', text: довгийТекст }];

      const промпт = _сформуватиПромпт('запит', документи);

      // Текст має бути обрізаний до 200 символів
      expect(промпт).toContain('А'.repeat(200));
      expect(промпт).not.toContain('А'.repeat(201));
    });
  });

  describe('_розпарситиВідповідь', () => {
    it('повертає null для тексту без JSON', async () => {
      const { _розпарситиВідповідь } = await import('../services/claudeReranker.ts');
      const документи = створитиДокументи(2);

      expect(_розпарситиВідповідь('просто текст без JSON', документи, 10)).toBeNull();
    });

    it('повертає null для порожнього масиву після фільтрації', async () => {
      const { _розпарситиВідповідь } = await import('../services/claudeReranker.ts');
      const документи = створитиДокументи(2);

      // Всі елементи невалідні
      expect(_розпарситиВідповідь('[{"n": 99, "s": 5}]', документи, 10)).toBeNull();
    });

    it('повертає null для невалідного JSON', async () => {
      const { _розпарситиВідповідь } = await import('../services/claudeReranker.ts');
      const документи = створитиДокументи(2);

      expect(_розпарситиВідповідь('[{invalid json}]', документи, 10)).toBeNull();
    });
  });
});
