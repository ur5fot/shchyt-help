import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface LawChunk {
  id: string;
  article: string;
  part: string;
  title?: string;
  summary?: string;
  text: string;
  keywords: string[];
  lawTitle: string;
  sourceUrl: string;
  documentId?: string;
}

interface LawChunkRaw {
  id: string;
  article: string;
  part: string;
  title?: string;
  summary?: string;
  text: string;
  keywords: string[];
}

interface LawFile {
  title: string;
  short_title: string;
  source_url: string;
  last_updated: string;
  document_id?: string;
  chunks: LawChunkRaw[];
}

export function loadAllLaws(): LawChunk[] {
  const files = readdirSync(__dirname).filter(f => f.endsWith('.json') && f !== 'package.json');

  const allChunks: LawChunk[] = [];

  for (const file of files) {
    let law: LawFile;
    try {
      const content = readFileSync(join(__dirname, file), 'utf-8');
      law = JSON.parse(content) as LawFile;
    } catch (err) {
      console.error(`Помилка завантаження файлу закону ${file}:`, err);
      continue;
    }

    if (!Array.isArray(law.chunks)) {
      console.error(`Файл ${file} не містить масиву chunks — пропущено`);
      continue;
    }

    for (const chunk of law.chunks) {
      allChunks.push({
        ...chunk,
        lawTitle: law.title,
        sourceUrl: law.source_url,
        documentId: law.document_id,
      });
    }
  }

  if (allChunks.length === 0) {
    throw new Error('Жодного чанку не завантажено — перевірте файли законів у директорії laws/');
  }

  return allChunks;
}
