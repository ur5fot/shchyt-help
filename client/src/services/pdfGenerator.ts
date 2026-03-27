import { PDFDocument, rgb } from 'pdf-lib';

// Шрифт з підтримкою кирилиці зберігається локально — без зовнішніх запитів
const FONT_URL = '/fonts/ubuntu.ttf';

// Кеш шрифту щоб не завантажувати двічі
let fontBytesCache: ArrayBuffer | null = null;

async function loadFont(): Promise<ArrayBuffer> {
  if (fontBytesCache) return fontBytesCache;
  const response = await fetch(FONT_URL);
  if (!response.ok) {
    throw new Error(`Не вдалося завантажити шрифт: ${response.status}`);
  }
  fontBytesCache = await response.arrayBuffer();
  return fontBytesCache;
}

// Підставляє значення полів у текст шаблону
function applyFields(template: string, fields: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(fields)) {
    // Використовуємо функцію-замінник, щоб уникнути спецсимволів $ у value
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), () => value);
  }
  return result;
}

// Розбиває текст на рядки з урахуванням ширини сторінки
// Спрощений алгоритм: розбиваємо по символу \n та довгим рядкам
function wrapLines(text: string, maxCharsPerLine = 80): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.length <= maxCharsPerLine) {
      lines.push(paragraph);
    } else {
      const words = paragraph.split(' ');
      let current = '';
      for (const word of words) {
        if ((current + ' ' + word).trim().length > maxCharsPerLine) {
          lines.push(current.trim());
          current = word;
        } else {
          current = (current + ' ' + word).trim();
        }
      }
      if (current) lines.push(current.trim());
    }
  }
  return lines;
}

export async function generatePdf(
  templateText: string,
  fields: Record<string, string>
): Promise<Uint8Array> {
  const filledText = applyFields(templateText, fields);

  const doc = await PDFDocument.create();

  // Завантажуємо шрифт з підтримкою кирилиці (потрібне інтернет-з'єднання)
  const fontBytes = await loadFont();
  const font = await doc.embedFont(fontBytes);

  let currentPage = doc.addPage([595, 842]); // A4
  const { height } = currentPage.getSize();

  const marginLeft = 60;
  const marginTop = 60;
  const fontSize = 11;
  const lineHeight = 16;

  const lines = wrapLines(filledText, 75);
  let y = height - marginTop;

  for (const line of lines) {
    if (y < marginTop + lineHeight) {
      // Нова сторінка якщо не вистачає місця
      currentPage = doc.addPage([595, 842]);
      y = currentPage.getSize().height - marginTop;
    }
    currentPage.drawText(line, {
      x: marginLeft,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight;
  }

  return doc.save();
}
