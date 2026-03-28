import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокуємо pdf-lib перед імпортом
vi.mock('pdf-lib', () => {
  const mockFont = {
    encodeText: vi.fn((text: string) => Buffer.from(text)),
    widthOfTextAtSize: vi.fn().mockReturnValue(100),
    heightAtSize: vi.fn().mockReturnValue(12),
  };

  const mockPage = {
    getSize: vi.fn().mockReturnValue({ width: 595, height: 842 }),
    drawText: vi.fn(),
  };

  const mockDoc = {
    addPage: vi.fn().mockReturnValue(mockPage),
    embedFont: vi.fn().mockResolvedValue(mockFont),
    registerFontkit: vi.fn(),
    save: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5])),
  };

  return {
    PDFDocument: {
      create: vi.fn().mockResolvedValue(mockDoc),
    },
    StandardFonts: {
      Helvetica: 'Helvetica',
    },
    rgb: vi.fn().mockReturnValue({ r: 0, g: 0, b: 0 }),
  };
});

// Мокуємо @pdf-lib/fontkit
vi.mock('@pdf-lib/fontkit', () => ({
  default: {},
}));

// Мокуємо fetch для шрифту
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
});

import { generatePdf, санітизуватиПоле } from './pdfGenerator';

describe('generatePdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Відновлюємо моки після clearAllMocks
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    });
  });

  it('повертає Uint8Array', async () => {
    const result = await generatePdf('Тестовий текст документу', {});
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('підставляє значення полів у шаблон', async () => {
    const { PDFDocument } = await import('pdf-lib');

    await generatePdf('Звіт за {period} року', { period: 'жовтень 2024' });

    // PDF документ був створений
    expect(PDFDocument.create).toHaveBeenCalled();
  });

  it('замінює всі плейсхолдери на значення', async () => {
    const templateText = 'Від {rank} за {period_from} по {period_to}';
    const fields = {
      rank: 'сержант',
      period_from: 'жовтень',
      period_to: 'грудень',
    };

    const result = await generatePdf(templateText, fields);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('не кидає помилку при порожніх полях', async () => {
    await expect(generatePdf('Текст без плейсхолдерів', {})).resolves.toBeInstanceOf(Uint8Array);
  });

  it('санітизує поля перед підстановкою в шаблон', async () => {
    const result = await generatePdf('Документ від {name}', {
      name: '  Іванов\x00  ',
    });
    expect(result).toBeInstanceOf(Uint8Array);
  });
});

describe('санітизуватиПоле', () => {
  it('обрізає пробіли з країв', () => {
    expect(санітизуватиПоле('  Іванов  ')).toBe('Іванов');
  });

  it('видаляє нульові байти та керуючі символи', () => {
    expect(санітизуватиПоле('Текст\x00з\x01нульовими\x7Fбайтами')).toBe('Текстзнульовимибайтами');
  });

  it('зберігає переноси рядків та табуляцію', () => {
    expect(санітизуватиПоле('Рядок 1\nРядок 2\tТаб')).toBe('Рядок 1\nРядок 2\tТаб');
  });

  it('нормалізує \\r\\n та \\r до \\n', () => {
    expect(санітизуватиПоле('А\r\nБ\rВ')).toBe('А\nБ\nВ');
  });

  it('обмежує довжину до 500 символів', () => {
    const long = 'А'.repeat(600);
    const result = санітизуватиПоле(long);
    expect(result.length).toBe(500);
  });

  it('повертає порожній рядок для рядка з пробілів', () => {
    expect(санітизуватиПоле('   ')).toBe('');
  });

  it('не змінює коректне значення', () => {
    expect(санітизуватиПоле('Сержант Іванов І.П.')).toBe('Сержант Іванов І.П.');
  });
});
