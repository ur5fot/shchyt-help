// Обгортка навколо Anthropic SDK для спілкування з Claude
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from '../prompts/system.ts';
import { SUMMARIZE_PROMPT } from '../prompts/summarize.ts';
import {
  МОДЕЛЬ_CLAUDE,
  МАКС_ТОКЕНІВ,
  МАКС_ПОВТОРІВ_CLAUDE,
  ТАЙМАУТ_ЗАПИТУ_CLAUDE_МС,
  ТАЙМАУТ_СТИСНЕННЯ_CLAUDE_МС,
} from '../constants.ts';
import { logger } from '../logger.ts';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Клієнт створюється один раз при першому виклику (lazy singleton)
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
 * Відправляє промпт до Claude API та повертає текстову відповідь.
 * Підтримує історію повідомлень та резюме попереднього діалогу.
 */
export async function askClaude(
  промпт: string,
  історія?: HistoryMessage[],
  резюме?: string,
): Promise<string> {
  const client = getClient();

  let messages: Anthropic.MessageParam[];

  if (резюме) {
    messages = [
      { role: 'user', content: `Резюме попереднього діалогу:\n${резюме}` },
      { role: 'assistant', content: 'Зрозуміло, продовжуємо.' },
      ...(історія && історія.length > 0
        ? історія.map((msg) => ({ role: msg.role, content: msg.content }) as Anthropic.MessageParam)
        : []),
      { role: 'user', content: промпт },
    ];
  } else if (історія && історія.length > 0) {
    messages = [
      ...історія.map((msg) => ({ role: msg.role, content: msg.content }) as Anthropic.MessageParam),
      { role: 'user', content: промпт },
    ];
  } else {
    messages = [{ role: 'user', content: промпт }];
  }

  try {
    const відповідь = await client.messages.create(
      {
        model: МОДЕЛЬ_CLAUDE,
        max_tokens: МАКС_ТОКЕНІВ,
        system: SYSTEM_PROMPT,
        messages,
      },
      { timeout: ТАЙМАУТ_ЗАПИТУ_CLAUDE_МС },
    );

    const блок = відповідь.content[0];
    if (!блок || блок.type !== 'text') {
      throw new Error('Несподіваний тип відповіді від Claude');
    }

    return блок.text;
  } catch (помилка) {
    logger.error({ помилка }, 'Помилка виклику Claude API');
    throw помилка;
  }
}

/**
 * Стискає історію діалогу у коротке резюме через Claude.
 */
export async function summarizeHistory(messages: HistoryMessage[]): Promise<string> {
  const client = getClient();

  const діалог = messages
    .map((msg) => `${msg.role === 'user' ? 'Користувач' : 'Асистент'}: ${msg.content}`)
    .join('\n\n');

  try {
    const відповідь = await client.messages.create(
      {
        model: МОДЕЛЬ_CLAUDE,
        max_tokens: 512,
        system: SUMMARIZE_PROMPT,
        messages: [{ role: 'user', content: діалог }],
      },
      { timeout: ТАЙМАУТ_СТИСНЕННЯ_CLAUDE_МС },
    );

    const блок = відповідь.content[0];
    if (!блок || блок.type !== 'text') {
      throw new Error('Несподіваний тип відповіді від Claude при сумаризації');
    }

    logger.info({ кількістьПовідомлень: messages.length }, 'Історію чату стиснено');
    return блок.text;
  } catch (помилка) {
    logger.error({ помилка }, 'Помилка сумаризації історії');
    throw помилка;
  }
}
