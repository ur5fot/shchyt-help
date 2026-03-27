// Обгортка навколо Anthropic SDK для спілкування з Claude
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from '../prompts/system.ts';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 2048;

/**
 * Відправляє промпт до Claude API та повертає текстову відповідь.
 * Кидає помилку якщо ANTHROPIC_API_KEY не встановлений або API повернув помилку.
 */
export async function askClaude(промпт: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('API ключ ANTHROPIC_API_KEY не встановлений');
  }

  const client = new Anthropic({ apiKey });

  const відповідь = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: промпт }],
  });

  const блок = відповідь.content[0];
  if (блок.type !== 'text') {
    throw new Error('Несподіваний тип відповіді від Claude');
  }

  return блок.text;
}
