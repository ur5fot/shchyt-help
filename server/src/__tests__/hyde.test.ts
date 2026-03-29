// Тести для HyDE (Hypothetical Document Embeddings)
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

const { default: Anthropic } = await import('@anthropic-ai/sdk');

describe('generateHypothesis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
  });

  it('генерує hypothesis для нормального запиту', async () => {
    const гіпотеза = 'Згідно зі статтею 10 Закону про соціальний захист, військовослужбовцям надається щорічна відпустка.';
    const mockCreateFn = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: гіпотеза }],
    });
    (Anthropic as any).mockImplementationOnce(() => ({
      messages: { create: mockCreateFn },
    }));

    const { generateHypothesis } = await import('../services/hyde.ts');
    const результат = await generateHypothesis('Скільки днів відпустки мені належить як військовослужбовцю?');

    expect(результат).toBe(гіпотеза);
    expect(mockCreateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 200,
        system: expect.stringContaining('юрист'),
        messages: [{ role: 'user', content: expect.stringContaining('відпустки') }],
      }),
      expect.objectContaining({ timeout: 10_000 }),
    );
  });

  it('повертає null для короткого запиту (менше 15 символів)', async () => {
    const { generateHypothesis } = await import('../services/hyde.ts');
    const результат = await generateHypothesis('відпустка');

    expect(результат).toBeNull();
  });

  it('повертає null для запиту з одним словом', async () => {
    const { generateHypothesis } = await import('../services/hyde.ts');
    const результат = await generateHypothesis('мобілізаціямобілізація');

    expect(результат).toBeNull();
  });

  it('повертає null при помилці API (graceful fallback)', async () => {
    const mockCreateFn = vi.fn().mockRejectedValue(new Error('Timeout'));
    (Anthropic as any).mockImplementationOnce(() => ({
      messages: { create: mockCreateFn },
    }));

    const { generateHypothesis } = await import('../services/hyde.ts');
    const результат = await generateHypothesis('Які права має військовослужбовець при звільненні?');

    expect(результат).toBeNull();
  });

  it('повертає null при несподіваному типі відповіді', async () => {
    const mockCreateFn = vi.fn().mockResolvedValue({
      content: [{ type: 'image', source: {} }],
    });
    (Anthropic as any).mockImplementationOnce(() => ({
      messages: { create: mockCreateFn },
    }));

    const { generateHypothesis } = await import('../services/hyde.ts');
    const результат = await generateHypothesis('Що робити якщо затримують виплату грошового забезпечення?');

    expect(результат).toBeNull();
  });

  it('повертає null для порожнього запиту', async () => {
    const { generateHypothesis } = await import('../services/hyde.ts');
    const результат = await generateHypothesis('   ');

    expect(результат).toBeNull();
  });

  it('кидає помилку без API ключа (через getClient)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.resetModules();

    const { generateHypothesis } = await import('../services/hyde.ts');
    // Без ключа — graceful fallback повертає null (catch обробляє)
    const результат = await generateHypothesis('Як отримати статус учасника бойових дій?');
    expect(результат).toBeNull();
  });
});
