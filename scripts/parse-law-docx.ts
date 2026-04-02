/**
 * Парсинг закону з .docx файлу
 *
 * Витягує plain text з .docx через PizZip, парсить статті через parseArticleBased(),
 * розбиває великі чанки, генерує keywords — формує LawFile JSON.
 *
 * Використання:
 *   npx tsx scripts/parse-law-docx.ts <шлях-до.docx> \
 *     --short-title "Назва" \
 *     --source-url "https://..." \
 *     --document-id "Закон №..." \
 *     --output "filename.json" \
 *     [--last-updated "2026-01-15"]
 */

import { writeFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { extractTextFromDocx } from './parse-nakaz40.js';
import {
  parseArticleBased,
  splitLargeChunks,
  makeBaseId,
  extractKeywords,
  type LawFile,
} from './parse-law.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Парсить .docx файл закону і повертає LawFile
 */
export function parseLawDocx(
  docxPath: string,
  options: {
    shortTitle: string;
    sourceUrl: string;
    documentId?: string;
    lastUpdated?: string;
  },
): LawFile {
  const text = extractTextFromDocx(docxPath);
  const paragraphs = text.split('\n').filter(line => line.trim().length > 0);

  const baseId = makeBaseId(options.shortTitle);
  let chunks = parseArticleBased(paragraphs, baseId);
  chunks = splitLargeChunks(chunks);

  // Дедуплікація ID
  const idCounts: Record<string, number> = {};
  for (const chunk of chunks) {
    const origId = chunk.id;
    const count = idCounts[origId] || 0;
    if (count > 0) {
      chunk.id = `${origId}-d${count}`;
    }
    idCounts[origId] = count + 1;
  }

  const title = `Закон України «${options.shortTitle}»`;

  return {
    title,
    short_title: options.shortTitle,
    source_url: options.sourceUrl,
    last_updated: options.lastUpdated || new Date().toISOString().slice(0, 10),
    ...(options.documentId ? { document_id: options.documentId } : {}),
    chunks,
  };
}

function parseArgs(args: string[]): {
  docxPath: string;
  shortTitle: string;
  sourceUrl: string;
  documentId?: string;
  output?: string;
  lastUpdated?: string;
} {
  if (args.length < 1) {
    console.error(
      'Використання: npx tsx scripts/parse-law-docx.ts <шлях-до.docx> --short-title "..." --source-url "..." [--document-id "..."] [--output "..."] [--last-updated "..."]',
    );
    process.exit(1);
  }

  const docxPath = args[0];
  let shortTitle = '';
  let sourceUrl = '';
  let documentId: string | undefined;
  let output: string | undefined;
  let lastUpdated: string | undefined;

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--short-title':
        shortTitle = args[++i];
        break;
      case '--source-url':
        sourceUrl = args[++i];
        break;
      case '--document-id':
        documentId = args[++i];
        break;
      case '--output':
        output = args[++i];
        break;
      case '--last-updated':
        lastUpdated = args[++i];
        break;
    }
  }

  if (!shortTitle || !sourceUrl) {
    console.error('Обов\'язкові параметри: --short-title та --source-url');
    process.exit(1);
  }

  return { docxPath, shortTitle, sourceUrl, documentId, output, lastUpdated };
}

async function main() {
  const args = process.argv.slice(2);
  const { docxPath, shortTitle, sourceUrl, documentId, output, lastUpdated } = parseArgs(args);

  console.log(`Парсинг .docx: ${docxPath}`);

  const law = parseLawDocx(docxPath, { shortTitle, sourceUrl, documentId, lastUpdated });

  const rawFilename = output || makeBaseId(shortTitle);
  const filename = basename(rawFilename).replace(/\.json$/, '');
  const outputPath = join(__dirname, '..', 'laws', `${filename}.json`);
  writeFileSync(outputPath, JSON.stringify(law, null, 2), 'utf-8');

  // Статистика
  const articles = new Set(law.chunks.map(c => c.article));
  console.log(`Збережено ${law.chunks.length} чанків (${articles.size} статей) → ${outputPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
