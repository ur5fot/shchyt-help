// Обгортка навколо Anthropic SDK для спілкування з Claude
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from '../prompts/system.ts';
import { МОДЕЛЬ_CLAUDE, МАКС_ТОКЕНІВ } from '../constants.ts';

/**
 * Відправляє промпт до Claude API та повертає текстову відповідь.
 * Кидає помилку якщо ANTHROPIC_API_KEY не встановлений або API повернув помилку.
 */
// Клієнт створюється один раз при першому виклику (lazy singleton)
let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('API ключ ANTHROPIC_API_KEY не встановлений');
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export async function askClaude(промпт: string): Promise<string> {
  const client = getClient();
  const відповідь = await client.messages.create({
    model: МОДЕЛЬ_CLAUDE,
    max_tokens: МАКС_ТОКЕНІВ,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: промпт }],
  });

  const блок = відповідь.content[0];
  if (!блок || блок.type !== 'text') {
    throw new Error('Несподіваний тип відповіді від Claude');
  }

  return блок.text;
}
