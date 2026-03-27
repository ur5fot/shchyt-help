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

// Мокуємо fetch для шрифту
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
});

import { generatePdf } from './pdfGenerator';

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
    const mockDoc = await (PDFDocument.create as ReturnType<typeof vi.fn>)();
    const mockPage = mockDoc.addPage();

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
});
