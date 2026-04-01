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
  const lines = text.split('\n');
  const punkts: ParsedPunkt[] = [];

  // Паттерн для пунктів: N.M. або N.M.K. на початку рядка
  const PUNKT_RE = /^(\d{1,2}\.\d{1,2}(?:\.\d{1,3})?)\.\s+(.*)/;
  // Паттерн для номерів сторінок (рядки що містять тільки число)
  const PAGE_NUM_RE = /^\s*\d{1,3}\s*$/;
  // Паттерн для заголовків розділів: "N. НАЗВА" (де назва з великих літер або довга)
  const SECTION_RE = /^(\d{1,2})\.\s+([А-ЯІЇЄҐ])/;

  let currentPunkt: ParsedPunkt | null = null;
  let textBuffer: string[] = [];

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
    const sectionMatch = SECTION_RE.exec(line);
    if (sectionMatch && !line.match(/^\d{1,2}\.\d/)) {
      // Це заголовок розділу, не пункт — пропускаємо текст заголовка
      continue;
    }

    // Перевіряємо чи це початок нового пункту
    const punktMatch = PUNKT_RE.exec(line);
    if (punktMatch) {
      flushPunkt();
      const number = punktMatch[1];
      const parts = number.split('.');
      const section = parts[0];
      const subsection = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];

      currentPunkt = {
        number,
        text: '',
        section,
        subsection,
      };
      textBuffer = [punktMatch[2].trim()];
      continue;
    }

    // Продовження поточного пункту
    if (currentPunkt) {
      textBuffer.push(line);
    }
  }

  flushPunkt();
  return punkts;
}

function punktsToChunks(punkts: ParsedPunkt[]): LawChunkRaw[] {
  const chunks: LawChunkRaw[] = [];

  // Допоміжна функція: розбити текст на речення по крапках та крапках з комою
  function splitBySentences(text: string, idBase: string, articleLabel: string, partLabel: string) {
    const sentences = text.split(/(?<=[.;])\s+/);
    let buffer: string[] = [];
    let bufferLen = 0;
    let partIdx = 0;

    for (const sent of sentences) {
      if (bufferLen + sent.length > МАКС_РОЗМІР_ЧАНКА && buffer.length > 0) {
        partIdx++;
        const id = `${idBase}-s${partIdx}`;
        const segText = buffer.join(' ');
        chunks.push({
          id,
          article: articleLabel,
          part: partLabel,
          text: segText,
          keywords: extractKeywords(segText),
        });
        buffer = [];
        bufferLen = 0;
      }
      buffer.push(sent);
      bufferLen += sent.length + 1;
    }

    if (buffer.length > 0) {
      partIdx++;
      const id = partIdx === 1 ? idBase : `${idBase}-s${partIdx}`;
      const segText = buffer.join(' ');
      chunks.push({
        id,
        article: articleLabel,
        part: partLabel,
        text: segText,
        keywords: extractKeywords(segText),
      });
    }
  }

  for (const punkt of punkts) {
    const sectionName = SECTIONS[punkt.section] || '';
    const articleLabel = `Пункт ${punkt.number}`;
    const partLabel = sectionName ? `Розділ ${punkt.section}. ${sectionName}` : '';
    const idBase = `${BASE_ID}-p${punkt.number.replace(/\./g, '-')}`;

    // Якщо текст менший за ліміт — один чанк
    if (punkt.text.length <= МАКС_РОЗМІР_ЧАНКА) {
      chunks.push({
        id: idBase,
        article: articleLabel,
        part: partLabel,
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
          splitBySentences(segmentText, segId, articleLabel, partLabel);
        } else {
          chunks.push({
            id: segId,
            article: articleLabel,
            part: partLabel,
            text: segmentText,
            keywords: extractKeywords(segmentText),
          });
        }
      }
    } else {
      // Розбиваємо по ~МАКС_РОЗМІР_ЧАНКА символів на реченнях
      splitBySentences(punkt.text, idBase, articleLabel, partLabel);
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
  const inputPath = process.argv[2] || '/tmp/nakaz40.txt';
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
