import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface LawChunk {
  id: string;
  article: string;
  part: string;
  title?: string;
  text: string;
  keywords: string[];
  lawTitle: string;
  sourceUrl: string;
}

interface LawChunkRaw {
  id: string;
  article: string;
  part: string;
  title?: string;
  text: string;
  keywords: string[];
}

interface LawFile {
  title: string;
  short_title: string;
  source_url: string;
  last_updated: string;
  chunks: LawChunkRaw[];
}

export function loadAllLaws(): LawChunk[] {
  const files = readdirSync(__dirname).filter(f => f.endsWith('.json'));

  const allChunks: LawChunk[] = [];

  for (const file of files) {
    const content = readFileSync(join(__dirname, file), 'utf-8');
    const law: LawFile = JSON.parse(content);

    for (const chunk of law.chunks) {
      allChunks.push({
        ...chunk,
        lawTitle: law.title,
        sourceUrl: law.source_url,
      });
    }
  }

  return allChunks;
}
