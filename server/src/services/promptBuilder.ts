import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { LawChunk } from '../../../laws/index';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Довідкові показники завантажуються один раз при старті — додаються до кожного промпту
let _довідковіПоказники: string | null = null;

function завантажитиПоказники(): string {
  if (_довідковіПоказники) return _довідковіПоказники;
  try {
    const шлях = join(__dirname, '../../../laws/dovidkovi-pokaznyky.json');
    const дані = JSON.parse(readFileSync(шлях, 'utf-8'));
    _довідковіПоказники = (дані.chunks || [])
      .map((ч: { article: string; text: string }) => `• ${ч.article}: ${ч.text}`)
      .join('\n');
  } catch {
    _довідковіПоказники = '';
  }
  return _довідковіПоказники;
}

/**
 * Складає промпт для Claude з контексту законів та питання користувача.
 * Кожен чанк форматується: назва закону → стаття (та частина, якщо є) → текст.
 * Чанки розділяються горизонтальною лінією.
 * Довідкові показники (прожитковий мінімум, оклади, бойові) додаються завжди.
 */
export function buildPrompt(питання: string, чанки: LawChunk[]): string {
  const показники = завантажитиПоказники();
  const блокПоказників = показники
    ? `\n\n---\n\n📊 Актуальні показники (2026 рік):\n${показники}`
    : '';

  if (чанки.length === 0) {
    return `Контекст із законодавства України: жодного релевантного фрагменту не знайдено.${блокПоказників}\n\n---\n\nПитання військовослужбовця: ${питання}`;
  }

  const контекст = чанки
    .map(чанк => {
      const статтяЧастина = чанк.part
        ? `${чанк.article}, ${чанк.part}`
        : чанк.article;

      const документ = чанк.documentId ? ` (${чанк.documentId})` : '';
      const редакція = чанк.lastUpdated ? ` [редакція від ${чанк.lastUpdated}]` : '';
      return `📎 ${чанк.lawTitle}${документ}${редакція}\n   ${статтяЧастина}\n   ${чанк.text}`;
    })
    .join('\n\n---\n\n');

  return `Контекст із законодавства України:\n\n${контекст}${блокПоказників}\n\n---\n\nПитання військовослужбовця: ${питання}`;
}
