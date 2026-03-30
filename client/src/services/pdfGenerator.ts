import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

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
    // Екрануємо спецсимволи RegExp у ключі та використовуємо функцію-замінник для $ у value
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\{${escaped}\\}`, 'g'), () => value);
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
  doc.registerFontkit(fontkit);

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

interface ChatMessageForPdf {
  role: 'user' | 'assistant';
  text: string;
  sources?: { law: string; article: string; documentId?: string }[];
}

function drawBlock(
  lines: string[], doc: PDFDocument, pg: { current: PDFPage; y: number },
  font: PDFFont, fs: number, lh: number, ml: number, mt: number, clr?: ReturnType<typeof rgb>,
) {
  for (const line of lines) {
    if (pg.y < mt + lh) { pg.current = doc.addPage([595, 842]); pg.y = pg.current.getSize().height - mt; }
    pg.current.drawText(line, { x: ml, y: pg.y, size: fs, font, color: clr ?? rgb(0, 0, 0) });
    pg.y -= lh;
  }
}

function stripMd(text: string): string {
  return text.replace(/\*\*/g, '').replace(/^#{1,6}\s+/gm, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^[-*]\s/gm, '  - ');
}

export async function exportChatToPdf(messages: ChatMessageForPdf[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = await loadFont();
  const font = await doc.embedFont(fontBytes);
  const p1 = doc.addPage([595, 842]);
  const { height, width } = p1.getSize();
  const ml = 50, mt = 50, fs = 10, lh = 14, cw = width - ml * 2;
  const pg = { current: p1, y: height - mt };
  const grey = rgb(0.6, 0.6, 0.6);

  drawBlock(wrapLines('SHCHYT — Консультацiя з прав вiйськовослужбовцiв\nДата: ' + new Date().toLocaleDateString('uk-UA'), font, 12, cw), doc, pg, font, 12, 18, ml, mt);
  pg.y -= 10;
  drawBlock(wrapLines('-'.repeat(80), font, fs, cw), doc, pg, font, fs, lh, ml, mt, grey);
  pg.y -= 6;

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'user') {
      drawBlock(wrapLines('ПИТАННЯ:', font, fs, cw), doc, pg, font, fs, lh, ml, mt);
      drawBlock(wrapLines(m.text, font, fs, cw), doc, pg, font, fs, lh, ml + 10, mt);
      pg.y -= 4;
    } else {
      drawBlock(wrapLines('ВIДПОВIДЬ:', font, fs, cw), doc, pg, font, fs, lh, ml, mt);
      drawBlock(wrapLines(stripMd(m.text), font, fs, cw), doc, pg, font, fs, lh, ml + 10, mt);
      if (m.sources?.length) {
        pg.y -= 4;
        drawBlock(wrapLines('Джерела:', font, 9, cw), doc, pg, font, 9, 12, ml + 10, mt, rgb(0.4, 0.4, 0.4));
        for (const s of m.sources) {
          const t = '- ' + s.article + ' — ' + s.law + (s.documentId ? ' (' + s.documentId + ')' : '');
          drawBlock(wrapLines(t, font, 8, cw - 10), doc, pg, font, 8, 11, ml + 20, mt, rgb(0.4, 0.4, 0.4));
        }
      }
      if (i < messages.length - 1) {
        pg.y -= 8;
        drawBlock(wrapLines('-'.repeat(80), font, fs, cw), doc, pg, font, fs, lh, ml, mt, grey);
        pg.y -= 6;
      }
    }
  }
  pg.y -= 16;
  drawBlock(wrapLines('Це не юридична консультацiя. Для прийняття рiшень звернiться до вiйськового адвоката.', font, 8, cw), doc, pg, font, 8, 11, ml, mt, rgb(0.5, 0.5, 0.5));
  return doc.save();
}
