import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Завантажуємо тестовий .docx шаблон
const testDocxPath = path.resolve(__dirname, '../../../templates/docx/test-template.docx');
const testDocxBuffer = fs.readFileSync(testDocxPath);

describe('docxGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('generateDocx повертає Blob з правильним типом', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(testDocxBuffer.buffer.slice(
          testDocxBuffer.byteOffset,
          testDocxBuffer.byteOffset + testDocxBuffer.byteLength,
        )),
      }),
    );

    const { generateDocx } = await import('./docxGenerator');
    const blob = await generateDocx('test-template');

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(blob.size).toBeGreaterThan(0);
  });

  it('підставляє {ДАТА} у шаблон', async () => {
    // Перевіряємо підстановку напряму через PizZip + Docxtemplater (без fetch/blob)
    const PizZip = (await import('pizzip')).default;
    const Docxtemplater = (await import('docxtemplater')).default;

    const zip = new PizZip(testDocxBuffer);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    doc.render({ ДАТА: '31.03.2026' });

    const content = doc.getZip().file('word/document.xml')?.asText() ?? '';

    expect(content).not.toContain('{ДАТА}');
    expect(content).toContain('31.03.2026');
  });

  it('кидає помилку при відсутньому шаблоні (HTTP 404)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    );

    const { generateDocx } = await import('./docxGenerator');

    await expect(generateDocx('неіснуючий')).rejects.toThrow(
      'Не вдалося завантажити шаблон',
    );
  });

  it('передає правильний URL у fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(testDocxBuffer.buffer.slice(
        testDocxBuffer.byteOffset,
        testDocxBuffer.byteOffset + testDocxBuffer.byteLength,
      )),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { generateDocx } = await import('./docxGenerator');
    await generateDocx('raport-nevyplata');

    expect(mockFetch).toHaveBeenCalledWith('/templates/docx/raport-nevyplata.docx');
  });
});
