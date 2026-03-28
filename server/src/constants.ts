// Спільні константи серверної частини

// Claude API
export const МОДЕЛЬ_CLAUDE = 'claude-sonnet-4-20250514';
export const МАКС_ТОКЕНІВ = 2048;

// Валідація запитів
export const МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ = 2000;

// Rate limiting
export const RATE_LIMIT_ВІКНО_МС = 60 * 1000;
export const RATE_LIMIT_МАКС_ЗАПИТІВ = 20;

// Дисклеймер — додається автоматично якщо AI його пропустив
export const ДИСКЛЕЙМЕР = '⚠️ Це не юридична консультація. Для прийняття рішень зверніться до військового адвоката.';

// Історія чату
export const МАКС_ПОВІДОМЛЕНЬ_БЕЗ_СТИСНЕННЯ = 10;

// Гібридний пошук (keyword + vector)
export const ВАГА_КЛЮЧОВИХ_СЛІВ = 0.4;
export const ВАГА_ВЕКТОРА = 0.6;
export const МІНІМАЛЬНА_ГІБРИДНА_ОЦІНКА = 0.15;

// Express
export const JSON_ЛІМІТ = '10kb';
export const ПОРТ = 3001;
