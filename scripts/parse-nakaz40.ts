/**
 * Парсер Наказу Головнокомандувача ЗСУ №40 від 31.01.2024
 * "Інструкція з діловодства у Збройних Силах України"
 *
 * Документ не з zakon.rada.gov.ua — парситься з PDF-тексту (pdftotext).
 * Структура: розділи (N.), підрозділи (N.M.), пункти (N.M.K.)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractKeywords, type LawChunkRaw, type LawFile } from './parse-law.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const МАКС_РОЗМІР_ЧАНКА = 2000;
const BASE_ID = 'nakaz40-dilovod';

// Розділи документа для анотації чанків
const SECTIONS: Record<string, string> = {
  '1': 'Загальні положення',
  '2': 'Документування управлінської діяльності',
  '3': 'Організація документообігу та виконання документів',
  '4': 'Систематизація та зберігання документів',
  '5': 'Зберігання документів у діловодстві',
  '6': 'Порядок підготовки справ до архівного зберігання',
  '7': 'Оперативне зберігання',
  '8': 'Організаційні питання щодо здавання документів до архіву',
  '9': 'Особливості здавання документів у разі розформування',
  '10': 'Порядок приймання-передачі документів у разі зміни командира',
  '11': 'Порядок приймання-передачі справ та посади',
  '12': 'Знищення документів',
  '13': 'Бойова готовність служби діловодства',
  '14': 'Порушення законодавства про Національний архівний фонд',
  '15': 'Особливості поводження з документами зі службовою інформацією',
  '16': 'Облік, зберігання печаток, штампів і бланків',
  '17': 'Картка обліку Бойового Прапора',
  '18': 'Особливості організації діловодства у штабі угруповання',
};

interface ParsedPunkt {
  number: string; // "1.1" або "2.3.4"
  text: string;
  section: string; // "1", "2" тощо
  subsection: string; // "2.1", "2.3" тощо
}

function parsePdfText(text: string): ParsedPunkt[] {
  // Передобробка: розбиваємо рядки, де номер нового пункту з'являється посеред тексту
  // Наприклад: "...документів. 1.13.4. Начальник..." → два окремих рядки
  // Фільтруємо дати (від 16.11. / станом 17.01.) та посилання на пункти (пунктом 2.7.8.)
  const processedText = text
    // Випадок 1: маркер пункту посеред рядка, після нього йде текст з великої літери
    .replace(
      /(\S+)\s+(\d{1,2}\.\d{1,2}(?:\.\d{1,3}){0,2})\.\s+(?=[А-ЯІЇЄҐA-Z])/g,
      (match, precedingWord, punktNum) => {
        if (/(?:від|до|з|після|на|по|станом)$/i.test(precedingWord)) return match;
        if (/(?:пункт(?:у|і|а|ом|ів|ами|ах)?|підпункт(?:у|і|а|ом|ів|ами|ах)?|п\.|пп\.)$/i.test(precedingWord)) return match;
        if (!SECTIONS[punktNum.split('.')[0]]) return match;
        return `${precedingWord}\n${punktNum}. `;
      }
    )
    // Випадок 2: маркер пункту в кінці рядка (текст пункту на наступному рядку)
    .replace(
      /(\S+)\s+(\d{1,2}\.\d{1,2}(?:\.\d{1,3}){0,2})\.\s*$/gm,
      (match, precedingWord, punktNum) => {
        if (/(?:від|до|з|після|на|по|станом)$/i.test(precedingWord)) return match;
        if (/(?:пункт(?:у|і|а|ом|ів|ами|ах)?|підпункт(?:у|і|а|ом|ів|ами|ах)?|п\.|пп\.)$/i.test(precedingWord)) return match;
        if (!SECTIONS[punktNum.split('.')[0]]) return match;
        return `${precedingWord}\n${punktNum}. `;
      }
    );
  const lines = processedText.split('\n');
  const punkts: ParsedPunkt[] = [];

  // Паттерн для пунктів: N.M. або N.M.K. або N.M.K.L. на початку рядка
  const PUNKT_RE = /^(\d{1,2}\.\d{1,2}(?:\.\d{1,3}){0,2})\.\s*(.*)/;
  // Паттерн для номерів сторінок (рядки що містять тільки число)
  const PAGE_NUM_RE = /^\s*\d{1,3}\s*$/;
  // Паттерн для заголовків розділів: "N. НАЗВА" (де назва з великих літер або довга)
  const SECTION_RE = /^(\d{1,2})\.\s+([А-ЯІЇЄҐ])/;

  let currentPunkt: ParsedPunkt | null = null;
  let textBuffer: string[] = [];
  // Попередній непорожній рядок для виявлення крос-рядкових посилань
  let previousLine = '';
  // Паттерн для слів-посилань на пункти (пункту, підпункту тощо)
  const REFERENCE_WORD_RE = /(?:пункт(?:у|і|а|ом|ів|ами|ах)?|підпункт(?:у|і|а|ом|ів|ами|ах)?|п\.|пп\.)\s*$/i;

  function flushPunkt() {
    if (currentPunkt && textBuffer.length > 0) {
      currentPunkt.text = textBuffer.join(' ').replace(/\s+/g, ' ').trim();
      if (currentPunkt.text.length >= 10) {
        punkts.push(currentPunkt);
      }
    }
    textBuffer = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Пропускаємо порожні рядки та номери сторінок
    if (!line || PAGE_NUM_RE.test(line)) continue;

    // Перевіряємо чи це заголовок розділу (N. Назва)
    // Заголовки розділів — не пункти, пропускаємо
    // Тільки коли НЕ всередині пункту, щоб не втратити рядки типу "5. Командир..."
    if (!currentPunkt) {
      const sectionMatch = SECTION_RE.exec(line);
      if (sectionMatch && !line.match(/^\d{1,2}\.\d/)) {
        // Це заголовок розділу, не пункт — пропускаємо текст заголовка
        previousLine = line;
        continue;
      }
    }

    // Перевіряємо чи це початок нового пункту
    const punktMatch = PUNKT_RE.exec(line);
    if (punktMatch) {
      // Пропускаємо дати: "27.10.2023" парситься як пункт 27.10 з текстом "2023..."
      const remainingText = punktMatch[2].trim();
      if (/^\d{4}\b/.test(remainingText)) {
        if (currentPunkt) {
          textBuffer.push(line);
        }
        previousLine = line;
        continue;
      }
      // Пропускаємо номери з неіснуючим розділом (дати типу "24.06." де 24 — не розділ)
      if (!SECTIONS[punktMatch[1].split('.')[0]]) {
        if (currentPunkt) {
          textBuffer.push(line);
        }
        previousLine = line;
        continue;
      }
      // Крос-рядкове посилання: попередній рядок закінчується "пункту", "підпункту" тощо
      // Це не новий пункт, а продовження тексту (типу "пункту\n2.7.8 цієї Інструкції")
      if (REFERENCE_WORD_RE.test(previousLine)) {
        if (currentPunkt) {
          textBuffer.push(line);
        }
        previousLine = line;
        continue;
      }

      flushPunkt();
      let number = punktMatch[1];

      // Перевіряємо чи текст починається з цифри, яка є частиною номера пункту
      // Це трапляється коли 4-рівневий номер (типу "2.8.11.1") не має завершальної крапки:
      // regex бачить "2.8.11." як номер, а "1 Порядок..." як текст
      let initialText = remainingText;
      const levels = number.split('.').length;
      const extraDigitMatch = remainingText.match(/^(\d{1,3})\s+([А-ЯІЇЄҐA-Z].*)/s);
      if (extraDigitMatch && levels < 4) {
        number = `${number}.${extraDigitMatch[1]}`;
        initialText = extraDigitMatch[2];
      }

      const parts = number.split('.');
      const section = parts[0];
      const subsection = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];

      currentPunkt = {
        number,
        text: '',
        section,
        subsection,
      };
      textBuffer = [initialText];
      previousLine = line;
      continue;
    }

    // Продовження поточного пункту
    if (currentPunkt) {
      textBuffer.push(line);
    }
    previousLine = line;
  }

  flushPunkt();
  return punkts;
}

function punktsToChunks(punkts: ParsedPunkt[]): LawChunkRaw[] {
  const chunks: LawChunkRaw[] = [];

  // Допоміжна функція: розбити текст на речення по крапках та крапках з комою
  function pushChunk(id: string, text: string, articleLabel: string, partLabel: string, title: string) {
    chunks.push({
      id,
      article: articleLabel,
      part: partLabel,
      title,
      text,
      keywords: extractKeywords(text),
    });
  }

  function splitBySentences(text: string, idBase: string, articleLabel: string, partLabel: string, title: string) {
    const sentences = text.split(/(?<=[.;])\s+/);
    let buffer: string[] = [];
    let bufferLen = 0;
    let partIdx = 0;

    function flushBuffer() {
      if (buffer.length === 0) return;
      partIdx++;
      const id = `${idBase}-s${partIdx}`;
      const segText = buffer.join(' ');
      pushChunk(id, segText, articleLabel, partLabel, title);
      buffer = [];
      bufferLen = 0;
    }

    for (const sent of sentences) {
      // Якщо одне "речення" саме по собі перевищує ліміт — дорозбиваємо по комах
      if (sent.length > МАКС_РОЗМІР_ЧАНКА) {
        flushBuffer();
        const subParts = sent.split(/(?<=,)\s+/);
        for (const part of subParts) {
          if (bufferLen + part.length > МАКС_РОЗМІР_ЧАНКА && buffer.length > 0) {
            flushBuffer();
          }
          buffer.push(part);
          bufferLen += part.length + 1;
        }
        continue;
      }

      if (bufferLen + sent.length > МАКС_РОЗМІР_ЧАНКА && buffer.length > 0) {
        flushBuffer();
      }
      buffer.push(sent);
      bufferLen += sent.length + 1;
    }

    if (buffer.length > 0) {
      partIdx++;
      const id = partIdx === 1 ? idBase : `${idBase}-s${partIdx}`;
      const segText = buffer.join(' ');
      pushChunk(id, segText, articleLabel, partLabel, title);
    }
  }

  for (const punkt of punkts) {
    const sectionName = SECTIONS[punkt.section] || '';
    const articleLabel = `Пункт ${punkt.number}`;
    const partLabel = sectionName ? `Розділ ${punkt.section}. ${sectionName}` : '';
    const idBase = `${BASE_ID}-p${punkt.number.replace(/\./g, '-')}`;
    const title = sectionName || '';

    // Якщо текст менший за ліміт — один чанк
    if (punkt.text.length <= МАКС_РОЗМІР_ЧАНКА) {
      chunks.push({
        id: idBase,
        article: articleLabel,
        part: partLabel,
        title,
        text: punkt.text,
        keywords: extractKeywords(punkt.text),
      });
      continue;
    }

    // Розбиваємо великий пункт по підпунктах або реченнях
    const subItemRe = /(?:^|\s)(\d+\)\s)/g;
    const boundaries: number[] = [];
    let m;
    while ((m = subItemRe.exec(punkt.text)) !== null) {
      boundaries.push(m.index === 0 ? 0 : m.index + 1);
    }

    if (boundaries.length > 1) {
      // Є підпункти — розбиваємо по них
      const preamble = punkt.text.slice(0, boundaries[0]).trim();

      for (let i = 0; i < boundaries.length; i++) {
        const start = boundaries[i];
        const end = i + 1 < boundaries.length ? boundaries[i + 1] : punkt.text.length;
        let segmentText = punkt.text.slice(start, end).trim();

        if (i === 0 && preamble) {
          segmentText = preamble + ' ' + segmentText;
        }

        if (segmentText.length < 10) continue;

        const segId = `${idBase}-s${i + 1}`;

        // Якщо сегмент все ще перевищує ліміт — дорозбиваємо по реченнях
        if (segmentText.length > МАКС_РОЗМІР_ЧАНКА) {
          splitBySentences(segmentText, segId, articleLabel, partLabel, title);
        } else {
          chunks.push({
            id: segId,
            article: articleLabel,
            part: partLabel,
            title,
            text: segmentText,
            keywords: extractKeywords(segmentText),
          });
        }
      }
    } else {
      // Розбиваємо по ~МАКС_РОЗМІР_ЧАНКА символів на реченнях
      splitBySentences(punkt.text, idBase, articleLabel, partLabel, title);
    }
  }

  return chunks;
}

function deduplicateIds(chunks: LawChunkRaw[]): LawChunkRaw[] {
  const idCounts: Record<string, number> = {};
  for (const chunk of chunks) {
    const origId = chunk.id;
    const count = idCounts[origId] || 0;
    if (count > 0) {
      chunk.id = `${origId}-d${count}`;
    }
    idCounts[origId] = count + 1;
  }
  return chunks;
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Використання: npx tsx scripts/parse-nakaz40.ts <шлях-до-txt>');
    console.error('Приклад: npx tsx scripts/parse-nakaz40.ts /tmp/nakaz40.txt');
    process.exit(1);
  }
  const text = readFileSync(inputPath, 'utf-8');

  console.log('Парсинг тексту Наказу №40...');
  const punkts = parsePdfText(text);
  console.log(`Знайдено ${punkts.length} пунктів`);

  let chunks = punktsToChunks(punkts);
  chunks = deduplicateIds(chunks);
  console.log(`Створено ${chunks.length} чанків`);

  // Статистика по розділах
  const sectionStats: Record<string, number> = {};
  for (const chunk of chunks) {
    const section = chunk.part || 'Без розділу';
    sectionStats[section] = (sectionStats[section] || 0) + 1;
  }
  console.log('\nЧанків по розділах:');
  for (const [section, count] of Object.entries(sectionStats)) {
    console.log(`  ${section}: ${count}`);
  }

  const law: LawFile = {
    title: 'Інструкція з діловодства у Збройних Силах України (Наказ Головнокомандувача ЗСУ №40 від 31.01.2024)',
    short_title: 'Наказ №40 Діловодство ЗСУ',
    source_url: 'https://turbota.mil.gov.ua/dopomoga-dilovodam/instrukcziya-z-dilovodstva-u-zbrojnyh-sylah-ukrayiny',
    last_updated: '2024-01-31',
    chunks,
  };

  // Також додаємо document_id для ідентифікації
  const output = {
    ...law,
    document_id: 'Наказ Головнокомандувача ЗСУ №40 від 31.01.2024',
  };

  const outputPath = join(__dirname, '..', 'laws', 'наказ-40-діловодство-зсу.json');
  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nJSON збережено → ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
