import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';

const НАЗВА_МОДЕЛІ = 'Xenova/multilingual-e5-small';
const РОЗМІР_ВЕКТОРА = 384;

// Lazy singleton — модель завантажується один раз при першому виклику
let модельPromise: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Завантажує модель для генерації ембеддингів (lazy singleton).
 * Перший виклик завантажує модель з кешу або інтернету (2-5с),
 * наступні повертають вже завантажену модель миттєво.
 */
export function завантажитиМодель(): Promise<FeatureExtractionPipeline> {
  if (!модельPromise) {
    модельPromise = pipeline('feature-extraction', НАЗВА_МОДЕЛІ, {
      // Використовуємо квантизовану модель для швидшої роботи
      quantized: true,
    });
  }
  return модельPromise;
}

/**
 * Генерує ембеддинг для одного тексту.
 * @param текст — текст для ембеддингу
 * @param тип — 'query' для запитів користувача, 'passage' для тексту законів
 * @returns вектор розмірності 384
 */
export async function створитиЕмбеддинг(
  текст: string,
  тип: 'query' | 'passage'
): Promise<number[]> {
  const модель = await завантажитиМодель();
  const вхід = `${тип}: ${текст}`;

  const результат = await модель(вхід, {
    pooling: 'mean',
    normalize: true,
  });

  return Array.from(результат.data as Float32Array).slice(0, РОЗМІР_ВЕКТОРА);
}

/**
 * Генерує ембеддинги для масиву текстів (батч).
 * @param тексти — масив текстів
 * @param тип — 'query' або 'passage'
 * @returns масив векторів розмірності 384
 */
export async function створитиЕмбеддинги(
  тексти: string[],
  тип: 'query' | 'passage'
): Promise<number[][]> {
  const результати: number[][] = [];
  for (const текст of тексти) {
    const вектор = await створитиЕмбеддинг(текст, тип);
    результати.push(вектор);
  }
  return результати;
}

/**
 * Скидає кеш моделі (для тестів).
 */
export function _скинутиМодель(): void {
  модельPromise = null;
}

export { РОЗМІР_ВЕКТОРА };
