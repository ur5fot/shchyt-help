// Спільні константи серверної частини

// Claude API
export const МОДЕЛІ_CLAUDE = {
  SONNET_4_6: 'claude-sonnet-4-6',
  OPUS_4_6: 'claude-opus-4-6',
} as const;

export type МодельClaude = (typeof МОДЕЛІ_CLAUDE)[keyof typeof МОДЕЛІ_CLAUDE];

// Перемикач активної Claude-моделі
export const МОДЕЛЬ_CLAUDE: МодельClaude = МОДЕЛІ_CLAUDE.OPUS_4_6;
export const МАКС_ТОКЕНІВ = 16000;
export const БЮДЖЕТ_ДУМАННЯ = 10000;
export const МАКС_ПОВТОРІВ_CLAUDE = 1;
export const ТАЙМАУТ_ЗАПИТУ_CLAUDE_МС = 120_000;
export const ТАЙМАУТ_СТИСНЕННЯ_CLAUDE_МС = 15_000;
export const ТАЙМАУТ_HYDE_МС = 10_000;

// Валідація запитів
export const МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ = 2000;

// Rate limiting
export const RATE_LIMIT_ВІКНО_МС = 60 * 1000;
export const RATE_LIMIT_МАКС_ЗАПИТІВ = 20;

// Дисклеймер — додається автоматично якщо AI його пропустив
export const ДИСКЛЕЙМЕР = '⚠️ Це не юридична консультація. Для прийняття рішень зверніться до військового адвоката.';

// Історія чату
export const МАКС_ПОВІДОМЛЕНЬ_БЕЗ_СТИСНЕННЯ = 10;
export const МАКС_ПОВІДОМЛЕНЬ_ІСТОРІЇ = 30;
export const МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ_ІСТОРІЇ = 4000;

// Гібридний пошук (keyword + vector)
export const ВАГА_КЛЮЧОВИХ_СЛІВ = 0.4;
export const ВАГА_ВЕКТОРА = 0.6;
export const МІНІМАЛЬНА_ГІБРИДНА_ОЦІНКА = 0.15;

// HyDE (Hypothetical Document Embeddings)
export const HYDE_УВІМКНЕНИЙ = true;

// Express
export const JSON_ЛІМІТ = '10kb';
export const ПОРТ = 3001;
