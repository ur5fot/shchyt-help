import { describe, it, expect, vi } from 'vitest';

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

import { exportChatToPdf } from './pdfGenerator';

describe('exportChatToPdf', () => {
  it('повертає Uint8Array для порожнього списку повідомлень', async () => {
    const result = await exportChatToPdf([]);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('повертає Uint8Array для повідомлень з джерелами', async () => {
    const result = await exportChatToPdf([
      { role: 'user', text: 'Яка відпустка мені покладена?' },
      {
        role: 'assistant',
        text: 'Відповідь з **markdown**',
        sources: [
          { law: 'Про соцзахист', article: 'Стаття 10', documentId: 'social-protection' },
        ],
      },
    ]);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('створює PDF документ через PDFDocument.create', async () => {
    const { PDFDocument } = await import('pdf-lib');

    await exportChatToPdf([{ role: 'user', text: 'Тест' }]);

    expect(PDFDocument.create).toHaveBeenCalled();
  });
});
