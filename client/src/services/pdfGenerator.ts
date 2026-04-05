import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

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

function convertMdTable(text: string): string {
  // Знаходимо Markdown таблиці і конвертуємо у читабельний формат
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    // Виявляємо рядок-роздільник таблиці |---|---|
    if (/^\|[-:\s|]+\|$/.test(line)) {
      i++; // пропускаємо роздільник
      continue;
    }
    // Рядок таблиці: | col1 | col2 |
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
      // Перший рядок таблиці (заголовок) — жирний
      if (i + 1 < lines.length && /^\|[-:\s|]+\|$/.test(lines[i + 1].trim())) {
        result.push(cells.join(' — '));
      } else {
        result.push('  ' + cells.join(' — '));
      }
    } else {
      result.push(lines[i]);
    }
    i++;
  }
  return result.join('\n');
}

function stripMd(text: string): string {
  const withTables = convertMdTable(text);
  return withTables.replace(/\*\*/g, '').replace(/^#{1,6}\s+/gm, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^[-*]\s/gm, '  - ');
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
          const docInfo = s.documentId ? ' (' + s.documentId + ')' : '';
          const updInfo = (s as { lastUpdated?: string }).lastUpdated ? ' [ред. ' + (s as { lastUpdated?: string }).lastUpdated + ']' : '';
          const t = '- ' + s.article + ' — ' + s.law + docInfo + updInfo;
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
