import { pipeline, type TextClassificationPipeline } from '@xenova/transformers';
import { logger } from '../logger';

// Cross-encoder модель для re-ranking
// bge-reranker-base — English-primary, але працює достатньо для українського RAG
const НАЗВА_МОДЕЛІ = 'Xenova/bge-reranker-base';

// Lazy singleton — модель завантажується один раз при першому виклику
let модельPromise: Promise<TextClassificationPipeline> | null = null;
let модельНедоступна = false;

export interface RerankDocument {
  id: string;
  text: string;
}

export interface RerankResult {
  id: string;
  score: number;
}

/**
 * Завантажує cross-encoder модель для re-ranking (lazy singleton).
 * Якщо модель вже завантажена — повертає її миттєво.
 * Якщо попередня спроба завантаження провалилась — повертає null.
 */
export function завантажитиReranker(): Promise<TextClassificationPipeline | null> {
  if (модельНедоступна) {
    return Promise.resolve(null);
  }

  if (!модельPromise) {
    модельPromise = pipeline('text-classification', НАЗВА_МОДЕЛІ, {
      quantized: true,
    }).catch((помилка) => {
      logger.error({ помилка, модель: НАЗВА_МОДЕЛІ }, 'Не вдалося завантажити re-ranker модель');
      модельНедоступна = true;
      модельPromise = null;
      return null;
    }) as Promise<TextClassificationPipeline | null>;
  }
  return модельPromise as Promise<TextClassificationPipeline | null>;
}

/**
 * Re-ranking документів через cross-encoder.
 * Cross-encoder бачить запит І документ разом, що дає кращу оцінку релевантності.
 *
 * @param запит — запит користувача
 * @param документи — масив документів з id та text
 * @param topK — максимальна кількість результатів (за замовчуванням 8)
 * @returns відсортований масив з id та score, або оригінальний порядок при помилці
 */
export async function rerank(
  запит: string,
  документи: RerankDocument[],
  topK: number = 8
): Promise<RerankResult[]> {
  if (документи.length === 0) {
    return [];
  }

  // Якщо документів менше або рівно topK — все одно ранжуємо для кращого порядку
  const модель = await завантажитиReranker();

  if (!модель) {
    // Graceful fallback — повертаємо документи в оригінальному порядку, обрізаємо до topK
    logger.warn('Re-ranker недоступний — повертаємо оригінальний порядок');
    return документи.slice(0, topK).map((д, індекс) => ({
      id: д.id,
      score: документи.length - індекс, // зберігаємо відносний порядок
    }));
  }

  try {
    // Cross-encoder оцінює пари [запит, документ]
    // TextClassificationPipeline не підтримує text_pair напряму,
    // тому використовуємо tokenizer і model з pipeline окремо
    const tokenizer = (модель as unknown as { tokenizer: { (...args: unknown[]): unknown } }).tokenizer;
    const model = (модель as unknown as { model: { (...args: unknown[]): Promise<{ logits: { data: number[] } }> } }).model;
    const оцінки: RerankResult[] = [];

    for (const док of документи) {
      const inputs = tokenizer(запит, {
        text_pair: док.text,
        padding: true,
        truncation: true,
      });
      const output = await model(inputs);
      // bge-reranker повертає logit — перетворюємо через sigmoid на [0, 1]
      const logit = output.logits.data[0];
      const score = 1 / (1 + Math.exp(-logit));
      оцінки.push({ id: док.id, score });
    }

    // Сортуємо за спаданням score
    оцінки.sort((а, б) => б.score - а.score);

    return оцінки.slice(0, topK);
  } catch (помилка) {
    logger.error({ помилка }, 'Помилка під час re-ranking — повертаємо оригінальний порядок');
    return документи.slice(0, topK).map((д, індекс) => ({
      id: д.id,
      score: документи.length - індекс,
    }));
  }
}

/**
 * Скидає кеш моделі (для тестів).
 */
export function _скинутиReranker(): void {
  модельPromise = null;
  модельНедоступна = false;
}
