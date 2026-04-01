import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

// Шаблони для тестування
const TEMPLATE_IDS = [
  'raport-nevyplata',
  'raport-vidpustka',
  'raport-zvilnennya',
  'raport-rotatsia',
  'raport-vlk',
  'skarga',
];

const templatesDir = path.resolve(__dirname, '../../public/templates/docx');

function loadTemplate(id: string): Buffer {
  return fs.readFileSync(path.join(templatesDir, `${id}.docx`));
}

describe('docxGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('generateDocx повертає Blob з правильним типом', async () => {
    const buf = loadTemplate('raport-nevyplata');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () =>
          Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
      }),
    );

    const { generateDocx } = await import('./docxGenerator');
    const blob = await generateDocx('raport-nevyplata');

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(blob.size).toBeGreaterThan(0);
  });

  it('підставляє {ДАТА} у шаблон', async () => {
    const buf = loadTemplate('raport-nevyplata');
    const zip = new PizZip(buf);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: (part: { value: string }) => `{${part.value}}`,
    });
    doc.render({ ДАТА: '31.03.2026' });

    const content = doc.getZip().file('word/document.xml')?.asText() ?? '';

    expect(content).not.toContain('{ДАТА}');
    expect(content).toContain('31.03.2026');
  });

  it('зберігає плейсхолдери для ручного заповнення після рендерингу', async () => {
    const buf = loadTemplate('raport-nevyplata');
    const zip = new PizZip(buf);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: (part: { value: string }) => `{${part.value}}`,
    });
    doc.render({ ДАТА: '31.03.2026' });

    const content = doc.getZip().file('word/document.xml')?.asText() ?? '';

    expect(content).toContain('{ПІБ}');
    expect(content).toContain('{ЗВАННЯ}');
    expect(content).toContain('{ПІДРОЗДІЛ}');
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

    await expect(generateDocx('неіснуючий')).rejects.toThrow('Не вдалося завантажити шаблон');
  });

  it('передає правильний URL у fetch', async () => {
    const buf = loadTemplate('raport-nevyplata');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () =>
        Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { generateDocx } = await import('./docxGenerator');
    await generateDocx('raport-nevyplata');

    expect(mockFetch).toHaveBeenCalledWith('/templates/docx/raport-nevyplata.docx');
  });
});

describe('валідація .docx шаблонів', () => {
  it.each(TEMPLATE_IDS)('шаблон %s існує і відкривається через PizZip/docxtemplater', (id) => {
    const filePath = path.join(templatesDir, `${id}.docx`);
    expect(fs.existsSync(filePath)).toBe(true);

    const buf = fs.readFileSync(filePath);
    const zip = new PizZip(buf);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: (part: { value: string }) => `{${part.value}}`,
    });

    // Рендеринг не має кидати помилку
    expect(() => doc.render({ ДАТА: '01.01.2026' })).not.toThrow();

    const content = doc.getZip().file('word/document.xml')?.asText() ?? '';

    // Має містити заголовок рапорту або скарги
    const hasTitle = content.includes('РАПОРТ') || content.includes('СКАРГА');
    expect(hasTitle).toBe(true);

    // Має містити підказку
    expect(content).toContain('ПІДКАЗКА');

    // Дата підставлена
    expect(content).toContain('01.01.2026');
    expect(content).not.toContain('{ДАТА}');
  });

  it('всі 6 шаблонів присутні', () => {
    const files = fs.readdirSync(templatesDir).filter((f) => f.endsWith('.docx'));
    for (const id of TEMPLATE_IDS) {
      expect(files).toContain(`${id}.docx`);
    }
  });

  it('шаблон має оновлений блок підпису з посадою та в/ч', () => {
    const buf = loadTemplate('raport-nevyplata');
    const zip = new PizZip(buf);
    const content = zip.file('word/document.xml')?.asText() ?? '';

    expect(content).toContain('{ПОСАДА}');
    expect(content).toContain('{В/Ч}');
    expect(content).toMatch(/\{Ім.*ПРІЗВИЩЕ\}/);
  });

  it.each(['raport-nevyplata', 'raport-vidpustka', 'raport-zvilnennya', 'raport-rotatsia', 'raport-vlk'])(
    'рапорт %s має додатки та клопотання',
    (id) => {
      const buf = loadTemplate(id);
      const zip = new PizZip(buf);
      const content = zip.file('word/document.xml')?.asText() ?? '';

      expect(content).toContain('Додатки:');
      expect(content).toContain('Клопочу по суті рапорту');
    },
  );

  it('skarga має додатки але не має клопотань', () => {
    const buf = loadTemplate('skarga');
    const zip = new PizZip(buf);
    const content = zip.file('word/document.xml')?.asText() ?? '';

    expect(content).toContain('Додатки:');
    expect(content).not.toContain('Клопочу по суті рапорту');
  });

  it('raport-zvilnennya має облікові документи, додатки та клопотання', () => {
    const buf = loadTemplate('raport-zvilnennya');
    const zip = new PizZip(buf);
    const content = zip.file('word/document.xml')?.asText() ?? '';

    // Облікові документи
    expect(content).toContain('{НАЗВА_ТЦК}');
    expect(content).toContain('{МІСТО}');

    // Додатки
    expect(content).toContain('Додатки:');
    expect(content).toContain('Копія паспорта');
    expect(content).toContain('Копія військового квитка');

    // Клопотання (2 рівні)
    expect(content).toContain('Клопочу по суті рапорту');
    expect(content).toContain('{ПОСАДА_БЕЗПОСЕРЕДНЬОГО_КОМАНДИРА}');
    expect(content).toContain('{В/Ч_БРИГАДИ}');
  });
});
