import * as lancedb from '@lancedb/lancedb';
import type { Table } from '@lancedb/lancedb';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { LawChunk } from '../../../laws/index';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Шлях до директорії з БД (відносно кореня проекту)
const ШЛЯХ_ДО_БД = join(__dirname, '..', '..', '..', 'data', 'lancedb');
const НАЗВА_ТАБЛИЦІ = 'law_chunks';

export interface VectorSearchResult {
  id: string;
  article: string;
  part: string;
  title: string | null;
  text: string;
  keywords: string[];
  lawTitle: string;
  sourceUrl: string;
  _distance: number;
}

// Singleton з'єднання з БД
let зєднання: lancedb.Connection | null = null;
let таблиця: Table | null = null;

/**
 * Ініціалізує з'єднання з LanceDB. Створює директорію якщо потрібно.
 * @param шлях — опціональний шлях до БД (для тестів)
 */
export async function ініціалізуватиБД(шлях?: string): Promise<lancedb.Connection> {
  if (зєднання) return зєднання;
  зєднання = await lancedb.connect(шлях ?? ШЛЯХ_ДО_БД);
  return зєднання;
}

/**
 * Створює таблицю з чанками законів та їх ембеддингами.
 * Якщо таблиця існує — перезаписує її.
 */
export async function створитиТаблицю(
  чанки: LawChunk[],
  ембеддинги: number[][]
): Promise<Table> {
  const бд = await ініціалізуватиБД();

  if (чанки.length !== ембеддинги.length) {
    throw new Error(
      `Кількість чанків (${чанки.length}) не збігається з кількістю ембеддингів (${ембеддинги.length})`
    );
  }

  const дані = чанки.map((чанк, і) => ({
    id: чанк.id,
    article: чанк.article,
    part: чанк.part,
    title: чанк.title ?? '',
    text: чанк.text,
    keywords: чанк.keywords.join(','),
    lawTitle: чанк.lawTitle,
    sourceUrl: чанк.sourceUrl,
    vector: ембеддинги[і],
  }));

  таблиця = await бд.createTable(НАЗВА_ТАБЛИЦІ, дані, {
    mode: 'overwrite',
  });

  return таблиця;
}

/**
 * Відкриває існуючу таблицю. Повертає null якщо таблиця не існує.
 */
async function відкритиТаблицю(): Promise<Table | null> {
  if (таблиця) return таблиця;

  try {
    const бд = await ініціалізуватиБД();
    const імена = await бд.tableNames();
    if (!імена.includes(НАЗВА_ТАБЛИЦІ)) return null;
    таблиця = await бд.openTable(НАЗВА_ТАБЛИЦІ);
    return таблиця;
  } catch {
    return null;
  }
}

/**
 * Пошук найближчих чанків за вектором (cosine similarity).
 * @param queryVector — вектор запиту
 * @param topK — кількість результатів (за замовчуванням 10)
 */
export async function пошукПоВектору(
  queryVector: number[],
  topK: number = 10
): Promise<VectorSearchResult[]> {
  const табл = await відкритиТаблицю();
  if (!табл) {
    throw new Error('Таблиця LanceDB не ініціалізована. Запустіть npm run init-vector-db');
  }

  const результати = await табл
    .vectorSearch(queryVector)
    .distanceType('cosine')
    .limit(topK)
    .toArray();

  return результати.map((рядок) => ({
    id: рядок.id as string,
    article: рядок.article as string,
    part: рядок.part as string,
    title: (рядок.title as string) || null,
    text: рядок.text as string,
    keywords: (рядок.keywords as string).split(','),
    lawTitle: рядок.lawTitle as string,
    sourceUrl: рядок.sourceUrl as string,
    _distance: рядок._distance as number,
  }));
}

/**
 * Оновлює чанки в таблиці (upsert — оновлює існуючі, додає нові).
 */
export async function оновитиЧанки(
  чанки: LawChunk[],
  ембеддинги: number[][]
): Promise<void> {
  const табл = await відкритиТаблицю();
  if (!табл) {
    // Якщо таблиці немає — створюємо нову
    await створитиТаблицю(чанки, ембеддинги);
    return;
  }

  if (чанки.length !== ембеддинги.length) {
    throw new Error(
      `Кількість чанків (${чанки.length}) не збігається з кількістю ембеддингів (${ембеддинги.length})`
    );
  }

  const дані = чанки.map((чанк, і) => ({
    id: чанк.id,
    article: чанк.article,
    part: чанк.part,
    title: чанк.title ?? '',
    text: чанк.text,
    keywords: чанк.keywords.join(','),
    lawTitle: чанк.lawTitle,
    sourceUrl: чанк.sourceUrl,
    vector: ембеддинги[і],
  }));

  await табл
    .mergeInsert('id')
    .whenMatchedUpdateAll()
    .whenNotMatchedInsertAll()
    .execute(дані);
}

/**
 * Перевіряє чи LanceDB таблиця доступна для пошуку.
 * Повертає true якщо БД підключена і таблиця існує.
 */
export async function чиДоступнаБД(): Promise<boolean> {
  try {
    const табл = await відкритиТаблицю();
    return табл !== null;
  } catch {
    return false;
  }
}

/**
 * Скидає singleton (для тестів).
 */
export function _скинутиЗєднання(): void {
  if (таблиця && таблиця.isOpen()) {
    таблиця.close();
  }
  таблиця = null;
  зєднання = null;
}
