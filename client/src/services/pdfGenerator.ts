import { PDFDocument, rgb } from 'pdf-lib';

// Максимальна довжина одного поля (символів)
const МАКС_ДОВЖИНА_ПОЛЯ = 500;

// Санітизація значення поля перед підстановкою в PDF-шаблон
export function санітизуватиПоле(value: string): string {
  let result = value.trim();
  // Видаляємо нульові байти та керуючі символи (крім \n та \t)
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Нормалізуємо переноси рядків: \r\n та \r → \n
  result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Обмежуємо довжину
  if (result.length > МАКС_ДОВЖИНА_ПОЛЯ) {
    result = result.slice(0, МАКС_ДОВЖИНА_ПОЛЯ);
  }
  return result;
}

// Санітизує всі значення полів
function санітизуватиПоля(fields: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = санітизуватиПоле(value);
  }
  return result;
}

// Шрифт з підтримкою кирилиці зберігається локально — без зовнішніх запитів
const FONT_URL = '/fonts/ubuntu.ttf';

// Кеш шрифту щоб не завантажувати двічі — зберігаємо Promise, щоб уникнути race condition
let fontPromise: Promise<ArrayBuffer> | null = null;

async function loadFont(): Promise<ArrayBuffer> {
  if (!fontPromise) {
    fontPromise = fetch(FONT_URL)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Не вдалося завантажити шрифт: ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .catch(err => {
        fontPromise = null; // скидаємо при будь-якій помилці, щоб дозволити повторну спробу
        throw err;
      });
  }
  return fontPromise;
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

// Розбиває текст на рядки з урахуванням реальної ширини шрифту (для кирилиці)
function wrapLines(text: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (font.widthOfTextAtSize(paragraph, fontSize) <= maxWidth) {
      lines.push(paragraph);
    } else {
      const words = paragraph.split(' ');
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
          if (current) lines.push(current);
          // Якщо одне слово ширше за рядок — розбиваємо посимвольно
          if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
            let part = '';
            for (const char of word) {
              const candidate2 = part + char;
              if (font.widthOfTextAtSize(candidate2, fontSize) > maxWidth) {
                if (part) lines.push(part);
                part = char;
              } else {
                part = candidate2;
              }
            }
            current = part;
          } else {
            current = word;
          }
        } else {
          current = candidate;
        }
      }
      if (current) lines.push(current);
    }
  }
  return lines;
}

export async function generatePdf(
  templateText: string,
  fields: Record<string, string>
): Promise<Uint8Array> {
  const safeFields = санітизуватиПоля(fields);
  const filledText = applyFields(templateText, safeFields);

  const doc = await PDFDocument.create();

  // Завантажуємо шрифт з підтримкою кирилиці (зберігається локально у public/fonts)
  const fontBytes = await loadFont();
  const font = await doc.embedFont(fontBytes);

  let currentPage = doc.addPage([595, 842]); // A4
  const { height } = currentPage.getSize();

  const marginLeft = 60;
  const marginTop = 60;
  const fontSize = 11;
  const lineHeight = 16;

  const contentWidth = currentPage.getSize().width - marginLeft * 2;
  const lines = wrapLines(filledText, font, fontSize, contentWidth);
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
