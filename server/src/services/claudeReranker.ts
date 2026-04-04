// Claude re-ranker — використовує Claude Sonnet для оцінки релевантності чанків
// Розуміє українську юридичну термінологію краще за bge-reranker-base
import Anthropic from '@anthropic-ai/sdk';
import { МОДЕЛІ_CLAUDE, МАКС_ПОВТОРІВ_CLAUDE } from '../constants.ts';
import { rerank, type RerankDocument, type RerankResult } from './reranker.ts';
import { logger } from '../logger.ts';

export interface ClaudeRerankDocument extends RerankDocument {
  summary?: string;
}

const ТАЙМАУТ_RERANK_МС = 15_000;
const МАКС_СИМВОЛІВ_ТЕКСТУ = 200;

// Lazy singleton клієнт (окремий від основного claude.ts)
let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('API ключ ANTHROPIC_API_KEY не встановлений');
    }
    _client = new Anthropic({ apiKey, maxRetries: МАКС_ПОВТОРІВ_CLAUDE });
  }
  return _client;
}

/**
 * Формує компактний промпт для Claude re-ranking.
 * Кожен документ: [N] summary | перші 200 символів тексту
 */
function сформуватиПромпт(запит: string, документи: ClaudeRerankDocument[]): string {
  const фрагменти = документи
    .map((д, і) => {
      const текст = д.text.slice(0, МАКС_СИМВОЛІВ_ТЕКСТУ);
      const резюме = д.summary ?? '';
      return резюме
        ? `[${і + 1}] ${резюме} | ${текст}`
        : `[${і + 1}] ${текст}`;
    })
    .join('\n');

  return `Оціни релевантність кожного фрагменту закону до запиту користувача.
Для кожного фрагменту дай оцінку від 0 до 10, де:
- 10 = прямо відповідає на запит
- 7-9 = містить важливу інформацію для відповіді
- 4-6 = частково релевантний
- 1-3 = мало релевантний
- 0 = нерелевантний

Запит: "${запит}"

Фрагменти:
${фрагменти}

Відповідай ТІЛЬКИ у форматі JSON масиву:
[{"n": 1, "s": 10}, {"n": 2, "s": 7}, ...]
Без пояснень, тільки JSON.`;
}

/**
 * Парсить відповідь Claude — витягує масив оцінок.
 * Повертає null якщо відповідь не парситься.
 */
function розпарситиВідповідь(
  текст: string,
  документи: ClaudeRerankDocument[],
  topK: number
): RerankResult[] | null {
  try {
    // Витягуємо JSON масив з відповіді (може бути обгорнутий у ```json ... ```)
    const jsonMatch = текст.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (!jsonMatch) return null;

    const масив: { n: number; s: number }[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(масив)) return null;

    const результати: RerankResult[] = [];
    const побачені = new Set<string>();

    for (const елемент of масив) {
      const індекс = елемент.n - 1; // n — 1-based
      const оцінка = елемент.s;

      if (
        typeof індекс !== 'number' || typeof оцінка !== 'number' ||
        Number.isNaN(індекс) || Number.isNaN(оцінка) ||
        індекс < 0 || індекс >= документи.length ||
        оцінка < 0 || оцінка > 10
      ) {
        continue; // пропускаємо невалідні елементи
      }

      const id = документи[індекс].id;
      if (побачені.has(id)) continue; // дедуплікація
      побачені.add(id);

      результати.push({
        id,
        score: оцінка,
      });
    }

    if (результати.length === 0) return null;

    // Сортуємо за спаданням оцінки
    результати.sort((а, б) => б.score - а.score);

    return результати.slice(0, topK);
  } catch {
    return null;
  }
}

/**
 * Re-ranking документів через Claude Sonnet.
 * Claude розуміє контекст і юридичну термінологію, що дає кращу оцінку релевантності.
 *
 * При помилці — fallback на bge-reranker.
 *
 * @param запит — запит користувача
 * @param документи — масив документів з id, text та опціональним summary
 * @param topK — максимальна кількість результатів (за замовчуванням 25)
 */
export async function claudeRerank(
  запит: string,
  документи: ClaudeRerankDocument[],
  topK: number = 25
): Promise<RerankResult[]> {
  if (документи.length === 0) {
    return [];
  }

  const початок = Date.now();

  try {
    const client = getClient();
    const промпт = сформуватиПромпт(запит, документи);

    const відповідь = await client.messages.create(
      {
        model: МОДЕЛІ_CLAUDE.SONNET_4_6,
        max_tokens: 2048,
        messages: [{ role: 'user', content: промпт }],
      },
      { timeout: ТАЙМАУТ_RERANK_МС },
    );

    const блок = відповідь.content[0];
    if (!блок || блок.type !== 'text') {
      throw new Error('Несподіваний тип відповіді від Claude');
    }

    const результати = розпарситиВідповідь(блок.text, документи, topK);
    const часМс = Date.now() - початок;

    if (!результати) {
      logger.warn({ відповідь: блок.text.slice(0, 200), часМс }, 'Claude re-ranker: не вдалося розпарсити відповідь — fallback на bge');
      return await bgeFallback(запит, документи, topK);
    }

    logger.info(
      { кандидатів: документи.length, результатів: результати.length, часМс },
      'Claude re-ranking: %d кандидатів → %d результатів за %dмс',
      документи.length,
      результати.length,
      часМс,
    );

    return результати;
  } catch (помилка) {
    const часМс = Date.now() - початок;
    logger.warn({ помилка, часМс }, 'Claude re-ranker: помилка API — fallback на bge');
    return await bgeFallback(запит, документи, topK);
  }
}

/**
 * Fallback на bge-reranker при помилці Claude.
 */
async function bgeFallback(
  запит: string,
  документи: ClaudeRerankDocument[],
  topK: number
): Promise<RerankResult[]> {
  return rerank(
    запит,
    документи.map(д => ({ id: д.id, text: д.text })),
    topK,
  );
}

// Експортуємо для тестів
export { сформуватиПромпт as _сформуватиПромпт, розпарситиВідповідь as _розпарситиВідповідь };
