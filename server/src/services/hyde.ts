// HyDE (Hypothetical Document Embeddings) — генерація гіпотетичної відповіді
// для покращення векторного пошуку по розмитих запитах
import Anthropic from '@anthropic-ai/sdk';
import { МОДЕЛЬ_CLAUDE } from '../constants.ts';
import { logger } from '../logger.ts';

const HYDE_SYSTEM_PROMPT = `Ти — юрист з питань військового права України. Дай коротку відповідь (2-3 речення) на питання, згадай конкретні статті законів. Не додавай вступних фраз.`;

const HYDE_МАКС_ТОКЕНІВ = 200;
const МІН_ДОВЖИНА_ЗАПИТУ = 15;

// Lazy singleton клієнт (окремий від основного claude.ts)
let _client: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('API ключ ANTHROPIC_API_KEY не встановлений');
  }
  if (!_client) {
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/**
 * Перевіряє чи запит занадто короткий або тривіальний для HyDE.
 * Повертає true якщо HyDE варто пропустити.
 */
function запитЗанадтоКороткий(query: string): boolean {
  const очищений = query.trim();
  if (очищений.length < МІН_ДОВЖИНА_ЗАПИТУ) return true;

  // Якщо менше 2 унікальних слів — не генерувати
  const слова = new Set(очищений.toLowerCase().split(/\s+/).filter(Boolean));
  if (слова.size < 2) return true;

  return false;
}

/**
 * Генерує гіпотетичну відповідь на запит через Claude API.
 * Гіпотеза ближча до реальних чанків у просторі ембеддингів, ніж коротке питання.
 *
 * Повертає null якщо запит занадто короткий або якщо API виклик не вдався.
 */
export async function generateHypothesis(query: string): Promise<string | null> {
  if (запитЗанадтоКороткий(query)) {
    logger.debug({ query }, 'HyDE: запит занадто короткий, пропускаємо');
    return null;
  }

  const початок = Date.now();

  try {
    const client = getClient();
    const відповідь = await client.messages.create(
      {
        model: МОДЕЛЬ_CLAUDE,
        max_tokens: HYDE_МАКС_ТОКЕНІВ,
        system: HYDE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: query }],
      },
      { timeout: 10_000 },
    );

    const блок = відповідь.content[0];
    if (!блок || блок.type !== 'text') {
      logger.warn('HyDE: несподіваний тип відповіді від Claude');
      return null;
    }

    const час = Date.now() - початок;
    logger.info({ час }, 'HyDE: hypothesis згенеровано за %dмс', час);
    return блок.text;
  } catch (помилка) {
    const час = Date.now() - початок;
    logger.warn({ помилка, час }, 'HyDE: помилка API, продовжуємо без hypothesis');
    return null;
  }
}

// Для тестів — скидання singleton
export function _resetClient(): void {
  _client = null;
}
