// Тести для обгортки Claude API
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокаємо Anthropic SDK до імпорту модуля
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
    __mockCreate: mockCreate,
  };
});

// Імпортуємо після моку
const { default: Anthropic } = await import('@anthropic-ai/sdk');
const mockCreate = (Anthropic as any).__mockCreate ??
  (Anthropic({} as any) as any).messages.create;

// Отримуємо мок функцію create
function getMockCreate() {
  const instance = (Anthropic as any).mock.results[0]?.value;
  return instance?.messages?.create as ReturnType<typeof vi.fn>;
}

describe('askClaude', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Встановлюємо змінну середовища
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
  });

  it('викликає API з правильними параметрами', async () => {
    const mockResponse = {
      content: [{ type: 'text', text: 'Відповідь асистента' }],
    };

    // Перемокуємо Anthropic для цього тесту
    const mockCreateFn = vi.fn().mockResolvedValue(mockResponse);
    (Anthropic as any).mockImplementationOnce(() => ({
      messages: { create: mockCreateFn },
    }));

    const { askClaude } = await import('../services/claude.ts');
    await askClaude('Тестовий промпт');

    expect(mockCreateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-20250514',
        max_tokens: expect.any(Number),
        system: expect.any(String),
        messages: [{ role: 'user', content: 'Тестовий промпт' }],
      })
    );
  });

  it('повертає текст відповіді', async () => {
    const очікуванаВідповідь = 'Це тестова відповідь від Claude';
    const mockCreateFn = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: очікуванаВідповідь }],
    });
    (Anthropic as any).mockImplementationOnce(() => ({
      messages: { create: mockCreateFn },
    }));

    const { askClaude } = await import('../services/claude.ts');
    const результат = await askClaude('Питання');

    expect(результат).toBe(очікуванаВідповідь);
  });

  it('передає system prompt у виклик API', async () => {
    const mockCreateFn = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'відповідь' }],
    });
    (Anthropic as any).mockImplementationOnce(() => ({
      messages: { create: mockCreateFn },
    }));

    const { askClaude } = await import('../services/claude.ts');
    await askClaude('Питання');

    const виклик = mockCreateFn.mock.calls[0][0];
    expect(виклик.system).toContain('військовослужбовців');
    expect(виклик.system).toContain('⚠️');
  });

  it('кидає помилку при відсутньому API ключі', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    // Скидаємо кеш модуля щоб перечитати env
    vi.resetModules();

    const { askClaude } = await import('../services/claude.ts');
    await expect(askClaude('Питання')).rejects.toThrow(/API ключ/);
  });

  it('пробрасує помилку API', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const mockCreateFn = vi.fn().mockRejectedValue(new Error('Помилка мережі'));
    (Anthropic as any).mockImplementationOnce(() => ({
      messages: { create: mockCreateFn },
    }));

    const { askClaude } = await import('../services/claude.ts');
    await expect(askClaude('Питання')).rejects.toThrow('Помилка мережі');
  });
});
